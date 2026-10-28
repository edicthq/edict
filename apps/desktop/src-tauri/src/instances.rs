// The instances the app has saved, and which one the main window shows
// (ADR 0028). Plain data with no Tauri in it, so every rule here has a test.
// The shell (lib.rs) keeps one `Saved` behind a lock and writes it to the
// store after each change.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use url::Url;

use crate::normalize;

/// A saved instance: its origin, the name the person sees, and when it was
/// last in front (milliseconds since the epoch).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub url: String,
    pub name: String,
    #[serde(default)]
    pub last_used_at: u64,
}

/// Every saved instance, in the order they were added, and the active one's
/// url.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct Saved {
    pub instances: Vec<Instance>,
    pub active: Option<String>,
}

// Longest name the switcher keeps, in characters.
const NAME_LIMIT: usize = 60;

/// An instance's name until someone renames it: its host, with the port when
/// it is not the scheme's default.
pub fn default_name(url: &Url) -> String {
    let host = url.host_str().unwrap_or_default();
    match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.to_string(),
    }
}

fn same_origin(saved: &str, url: &Url) -> bool {
    Url::parse(saved).is_ok_and(|saved| saved.origin() == url.origin())
}

impl Saved {
    fn position(&self, url: &Url) -> Option<usize> {
        self.instances.iter().position(|instance| same_origin(&instance.url, url))
    }

    pub fn find(&self, url: &Url) -> Option<&Instance> {
        self.position(url).map(|index| &self.instances[index])
    }

    pub fn active_instance(&self) -> Option<&Instance> {
        let active = self.active.as_deref()?;
        self.instances.iter().find(|instance| instance.url == active)
    }

    pub fn active_url(&self) -> Option<Url> {
        Url::parse(&self.active_instance()?.url).ok()
    }

    /// The order they were added in, so ⌘1 to ⌘9 keep naming the same
    /// instance however often someone switches.
    pub fn ordered(&self) -> Vec<Instance> {
        self.instances.clone()
    }

    /// The instance used last, which takes over when the active one goes.
    /// Among ties, the one added last.
    pub fn most_recent(&self) -> Option<&Instance> {
        self.instances.iter().rev().max_by_key(|instance| instance.last_used_at)
    }

    /// Saves an instance, or finds it when its origin is already saved, and
    /// makes it the active one. Returns the saved entry.
    pub fn add(&mut self, url: &Url, now: u64) -> Instance {
        let index = match self.position(url) {
            Some(index) => index,
            None => {
                self.instances.push(Instance {
                    url: url.origin().ascii_serialization() + "/",
                    name: default_name(url),
                    last_used_at: now,
                });
                self.instances.len() - 1
            }
        };
        self.touch(index, now);
        self.instances[index].clone()
    }

    /// Makes a saved instance the active one. False when it is not saved.
    pub fn activate(&mut self, url: &Url, now: u64) -> bool {
        match self.position(url) {
            Some(index) => {
                self.touch(index, now);
                true
            }
            None => false,
        }
    }

    fn touch(&mut self, index: usize, now: u64) {
        // Always ahead of every other instance, so a clock set back cannot
        // leave the active one anywhere but first.
        let newest = self
            .instances
            .iter()
            .enumerate()
            .filter(|(other, _)| *other != index)
            .map(|(_, other)| other.last_used_at)
            .max()
            .unwrap_or(0);
        let instance = &mut self.instances[index];
        instance.last_used_at = if now > newest { now } else { newest + 1 };
        self.active = Some(instance.url.clone());
    }

    /// Forgets an instance. When it was the active one, the most recently
    /// used of the rest becomes active, or none when it was the last.
    pub fn remove(&mut self, url: &Url) -> bool {
        let Some(index) = self.position(url) else {
            return false;
        };
        let removed = self.instances.remove(index);
        if self.active.as_deref() == Some(removed.url.as_str()) {
            self.active = self.most_recent().map(|instance| instance.url.clone());
        }
        true
    }

    /// Renames an instance. A blank name brings back the host name.
    pub fn rename(&mut self, url: &Url, name: &str) -> bool {
        let Some(index) = self.position(url) else {
            return false;
        };
        let trimmed: String = name.split_whitespace().collect::<Vec<_>>().join(" ");
        self.instances[index].name = if trimmed.is_empty() {
            Url::parse(&self.instances[index].url).map(|url| default_name(&url)).unwrap_or_default()
        } else {
            trimmed.chars().take(NAME_LIMIT).collect()
        };
        true
    }

    /// The list as the switcher shows it.
    pub fn listing(&self) -> Saved {
        Saved { instances: self.ordered(), active: self.active.clone() }
    }

    /// Reads what the store holds. Entries that do not parse are dropped and
    /// duplicates of an origin keep the first. An app from before ADR 0028
    /// kept one `server`: it becomes the first saved instance, named after its
    /// host. The flag says the store needs writing back.
    pub fn load(instances: Option<&Value>, active: Option<&Value>, legacy: Option<&Value>, now: u64) -> (Saved, bool) {
        let mut saved = Saved::default();
        let Some(instances) = instances else {
            let Some(server) = legacy.and_then(Value::as_str).and_then(|server| normalize(server).ok()) else {
                return (saved, legacy.is_some());
            };
            saved.add(&server, now);
            return (saved, true);
        };
        let entries = instances.as_array().cloned().unwrap_or_default();
        let mut changed = legacy.is_some();
        for entry in entries {
            let parsed = serde_json::from_value::<Instance>(entry)
                .ok()
                .and_then(|instance| normalize(&instance.url).ok().map(|url| (instance, url)));
            let Some((instance, url)) = parsed else {
                changed = true;
                continue;
            };
            if saved.position(&url).is_some() {
                changed = true;
                continue;
            }
            let name = instance.name.trim();
            saved.instances.push(Instance {
                url: url.to_string(),
                name: if name.is_empty() { default_name(&url) } else { name.to_string() },
                last_used_at: instance.last_used_at,
            });
        }
        let wanted = active.and_then(Value::as_str).and_then(|active| normalize(active).ok());
        saved.active = wanted
            .and_then(|url| saved.find(&url).map(|instance| instance.url.clone()))
            .or_else(|| saved.most_recent().map(|instance| instance.url.clone()));
        if saved.active.as_deref() != active.and_then(Value::as_str) {
            changed = true;
        }
        (saved, changed)
    }
}

/// The main window's title: the app, then the instance in front.
pub fn window_title(saved: &Saved) -> String {
    match saved.active_instance() {
        Some(instance) => format!("Edict — {}", instance.name),
        None => "Edict".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn url(text: &str) -> Url {
        normalize(text).unwrap()
    }

    #[test]
    fn a_new_instance_is_named_after_its_host() {
        assert_eq!(default_name(&url("edict.acme.com")), "edict.acme.com");
        assert_eq!(default_name(&url("https://edict.acme.com:443")), "edict.acme.com");
        assert_eq!(default_name(&url("http://localhost:5173")), "localhost:5173");
        assert_eq!(default_name(&url("http://192.168.1.4:80")), "192.168.1.4");
    }

    #[test]
    fn adding_saves_the_instance_and_makes_it_active() {
        let mut saved = Saved::default();
        let added = saved.add(&url("edict.acme.com"), 10);
        assert_eq!(added, Instance { url: "https://edict.acme.com/".into(), name: "edict.acme.com".into(), last_used_at: 10 });
        assert_eq!(saved.active.as_deref(), Some("https://edict.acme.com/"));
        saved.add(&url("http://localhost:3000"), 20);
        assert_eq!(saved.instances.len(), 2);
        assert_eq!(saved.active.as_deref(), Some("http://localhost:3000/"));
    }

    #[test]
    fn adding_an_origin_again_keeps_one_entry_and_its_name() {
        let mut saved = Saved::default();
        saved.add(&url("edict.acme.com"), 10);
        saved.rename(&url("edict.acme.com"), "Acme");
        saved.add(&url("localhost:3000"), 20);
        let again = saved.add(&url("https://edict.acme.com/acme/issues?x=1"), 30);
        assert_eq!(saved.instances.len(), 2);
        assert_eq!(again.name, "Acme");
        assert_eq!(again.last_used_at, 30);
        assert_eq!(saved.active.as_deref(), Some("https://edict.acme.com/"));
    }

    #[test]
    fn http_and_https_on_one_host_are_different_instances() {
        let mut saved = Saved::default();
        saved.add(&url("http://edict.acme.com"), 10);
        saved.add(&url("https://edict.acme.com"), 20);
        assert_eq!(saved.instances.len(), 2);
    }

    #[test]
    fn switching_keeps_the_order_so_shortcuts_keep_their_instance() {
        let mut saved = Saved::default();
        saved.add(&url("a.example.com"), 10);
        saved.add(&url("b.example.com"), 20);
        saved.add(&url("c.example.com"), 30);
        assert!(saved.activate(&url("a.example.com"), 40));
        let order: Vec<_> = saved.ordered().into_iter().map(|instance| instance.name).collect();
        assert_eq!(order, ["a.example.com", "b.example.com", "c.example.com"]);
        assert_eq!(saved.most_recent().unwrap().name, "a.example.com");
    }

    #[test]
    fn instances_never_used_keep_the_order_they_were_added_in() {
        let (saved, _) = Saved::load(
            Some(&json!([
                { "url": "https://a.example.com/", "name": "A" },
                { "url": "https://b.example.com/", "name": "B" },
            ])),
            None,
            None,
            0,
        );
        let order: Vec<_> = saved.ordered().into_iter().map(|instance| instance.name).collect();
        assert_eq!(order, ["A", "B"]);
    }

    #[test]
    fn switching_moves_forward_even_when_the_clock_does_not() {
        let mut saved = Saved::default();
        saved.add(&url("a.example.com"), 50);
        saved.add(&url("b.example.com"), 50);
        assert_eq!(saved.most_recent().unwrap().name, "b.example.com");
        saved.activate(&url("a.example.com"), 10);
        assert_eq!(saved.most_recent().unwrap().name, "a.example.com");
    }

    #[test]
    fn activating_an_unsaved_instance_changes_nothing() {
        let mut saved = Saved::default();
        saved.add(&url("a.example.com"), 10);
        let before = saved.clone();
        assert!(!saved.activate(&url("b.example.com"), 20));
        assert_eq!(saved, before);
    }

    #[test]
    fn removing_the_active_instance_activates_the_most_recent_other() {
        let mut saved = Saved::default();
        saved.add(&url("a.example.com"), 10);
        saved.add(&url("b.example.com"), 20);
        saved.add(&url("c.example.com"), 30);
        saved.activate(&url("a.example.com"), 40);
        assert!(saved.remove(&url("a.example.com")));
        assert_eq!(saved.active.as_deref(), Some("https://c.example.com/"));
        assert!(saved.remove(&url("b.example.com")));
        assert_eq!(saved.active.as_deref(), Some("https://c.example.com/"));
        assert!(saved.remove(&url("c.example.com")));
        assert_eq!(saved.active, None);
        assert!(!saved.remove(&url("c.example.com")));
    }

    #[test]
    fn renaming_trims_and_a_blank_name_brings_back_the_host() {
        let mut saved = Saved::default();
        saved.add(&url("http://localhost:5173"), 10);
        assert!(saved.rename(&url("http://localhost:5173"), "  Acme   staging "));
        assert_eq!(saved.instances[0].name, "Acme staging");
        saved.rename(&url("http://localhost:5173"), &"x".repeat(100));
        assert_eq!(saved.instances[0].name.chars().count(), NAME_LIMIT);
        saved.rename(&url("http://localhost:5173"), "   ");
        assert_eq!(saved.instances[0].name, "localhost:5173");
        assert!(!saved.rename(&url("elsewhere.example.com"), "Nope"));
    }

    #[test]
    fn the_old_single_server_becomes_the_first_instance() {
        let (saved, changed) = Saved::load(None, None, Some(&json!("https://edict.acme.com/")), 99);
        assert!(changed);
        assert_eq!(
            saved.instances,
            [Instance { url: "https://edict.acme.com/".into(), name: "edict.acme.com".into(), last_used_at: 99 }]
        );
        assert_eq!(saved.active.as_deref(), Some("https://edict.acme.com/"));
    }

    #[test]
    fn an_unreadable_old_server_is_dropped() {
        let (saved, changed) = Saved::load(None, None, Some(&json!(42)), 99);
        assert!(changed);
        assert_eq!(saved, Saved::default());
        assert_eq!(Saved::load(None, None, None, 99), (Saved::default(), false));
    }

    #[test]
    fn a_saved_list_wins_over_the_old_server() {
        let (saved, changed) = Saved::load(
            Some(&json!([{ "url": "http://localhost:3000/", "name": "Dev", "lastUsedAt": 5 }])),
            Some(&json!("http://localhost:3000/")),
            Some(&json!("https://edict.acme.com/")),
            99,
        );
        assert!(changed, "the old key still needs deleting");
        assert_eq!(saved.instances.len(), 1);
        assert_eq!(saved.instances[0].name, "Dev");
    }

    #[test]
    fn loading_drops_broken_and_duplicate_entries() {
        let (saved, changed) = Saved::load(
            Some(&json!([
                { "url": "https://a.example.com/", "name": "A", "lastUsedAt": 1 },
                { "url": "ftp://b.example.com/", "name": "B" },
                { "name": "no url" },
                { "url": "https://a.example.com/acme", "name": "A again" },
                { "url": "https://c.example.com", "name": " " },
            ])),
            Some(&json!("https://a.example.com/")),
            None,
            0,
        );
        assert!(changed);
        let names: Vec<_> = saved.instances.iter().map(|instance| instance.name.as_str()).collect();
        assert_eq!(names, ["A", "c.example.com"]);
        assert_eq!(saved.instances[1].url, "https://c.example.com/");
    }

    #[test]
    fn a_missing_active_falls_back_to_the_most_recent() {
        let list = json!([
            { "url": "https://a.example.com/", "name": "A", "lastUsedAt": 1 },
            { "url": "https://b.example.com/", "name": "B", "lastUsedAt": 2 },
        ]);
        let (saved, changed) = Saved::load(Some(&list), Some(&json!("https://gone.example.com/")), None, 0);
        assert!(changed);
        assert_eq!(saved.active.as_deref(), Some("https://b.example.com/"));
        let (saved, changed) = Saved::load(Some(&list), Some(&json!("https://a.example.com/")), None, 0);
        assert!(!changed);
        assert_eq!(saved.active.as_deref(), Some("https://a.example.com/"));
    }

    #[test]
    fn the_listing_is_ordered_and_serializes_for_the_switcher() {
        let mut saved = Saved::default();
        saved.add(&url("a.example.com"), 10);
        saved.add(&url("b.example.com"), 20);
        assert_eq!(
            serde_json::to_value(saved.listing()).unwrap(),
            json!({
                "instances": [
                    { "url": "https://a.example.com/", "name": "a.example.com", "lastUsedAt": 10 },
                    { "url": "https://b.example.com/", "name": "b.example.com", "lastUsedAt": 20 },
                ],
                "active": "https://b.example.com/",
            })
        );
    }

    #[test]
    fn the_window_title_names_the_active_instance() {
        let mut saved = Saved::default();
        assert_eq!(window_title(&saved), "Edict");
        saved.add(&url("edict.acme.com"), 10);
        saved.rename(&url("edict.acme.com"), "Acme");
        assert_eq!(window_title(&saved), "Edict — Acme");
    }
}
