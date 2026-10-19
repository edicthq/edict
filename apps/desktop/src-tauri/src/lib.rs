// Edict's desktop app (ADR 0004): a Tauri shell that loads the web UI from the
// server the person points it at, so the UI always matches the server. On top
// it adds a global quick-create hotkey, OS notifications, edict:// deep links
// (ADR 0027), a tray icon and signed updates.
//
// The server's pages reach the shell through Tauri's global API, but only the
// server's own origin, and only for events and notifications: the capability
// is granted at runtime once the person has chosen the server.

use std::sync::Mutex;
use std::time::Duration;

use tauri::image::Image;
use tauri::ipc::CapabilityBuilder;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::UpdaterExt;

const SETTINGS: &str = "settings.json";
const SERVER_KEY: &str = "server";
const MAIN: &str = "main";
// The global hotkey that opens a new issue from anywhere.
const QUICK_CREATE: &str = "CommandOrControl+Shift+E";

// The server the main window shows, once someone has chosen one.
struct Server(Mutex<Option<Url>>);

/// Turns what someone typed into a server's origin: https unless they wrote
/// http, and no path, since Edict serves its UI from the root.
pub fn normalize(input: &str) -> Result<Url, String> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Enter the address of your Edict server.".into());
    }
    let with_scheme = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("https://{trimmed}")
    };
    let url = Url::parse(&with_scheme).map_err(|_| format!("{trimmed} is not a web address."))?;
    if url.scheme() != "https" && url.scheme() != "http" {
        return Err("Use an http or https address.".into());
    }
    if url.host_str().is_none() {
        return Err(format!("{trimmed} has no host name."));
    }
    let mut origin = url;
    origin.set_path("/");
    origin.set_query(None);
    origin.set_fragment(None);
    let _ = origin.set_username("");
    let _ = origin.set_password(None);
    Ok(origin)
}

/// The page to open for a deep link, before the web app takes over: the
/// server's root with the link in ?open=, which the web app follows once it
/// knows the organization. Anything but edict:// is refused.
pub fn deep_link_page(server: &Url, link: &Url) -> Option<Url> {
    if link.scheme() != "edict" {
        return None;
    }
    let mut page = server.clone();
    page.query_pairs_mut().clear().append_pair("open", link.as_str());
    Some(page)
}

// Whether the server answers like Edict: its public settings at /api/v1/instance.
async fn check_server(server: &Url) -> Result<(), String> {
    let host = server.host_str().unwrap_or_default().to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|error| error.to_string())?;
    let res = client
        .get(server.join("api/v1/instance").map_err(|error| error.to_string())?)
        .send()
        .await
        .map_err(|_| format!("Could not reach {host}. Check the address and your connection."))?;
    if !res.status().is_success() {
        return Err(format!("{host} answered {}. Is it an Edict server?", res.status().as_u16()));
    }
    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|_| format!("{host} does not look like an Edict server."))?;
    if body.get("signUpMode").is_none() {
        return Err(format!("{host} does not look like an Edict server."));
    }
    Ok(())
}

// Lets the server's pages listen for the shell's events and send
// notifications. Nothing else, and no other origin.
fn allow_server(app: &AppHandle, server: &Url) {
    let origin = server.origin().ascii_serialization();
    let capability = CapabilityBuilder::new(format!("server-{origin}"))
        .remote(format!("{origin}/*"))
        .window(MAIN)
        .permission("core:event:default")
        .permission("notification:default");
    // Adding the same server twice in one run is refused, and harmless.
    let _ = app.add_capability(capability);
}

fn stored_server(app: &AppHandle) -> Option<Url> {
    let store = app.store(SETTINGS).ok()?;
    let value = store.get(SERVER_KEY)?;
    Url::parse(value.as_str()?).ok()
}

// The bundled page that asks for the server.
fn connect_page() -> Url {
    let base = if cfg!(windows) { "http://tauri.localhost/" } else { "tauri://localhost/" };
    Url::parse(base).expect("a valid URL").join("index.html").expect("a valid URL")
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[tauri::command]
async fn connect(app: AppHandle, address: String) -> Result<String, String> {
    let server = normalize(&address)?;
    check_server(&server).await?;
    let store = app.store(SETTINGS).map_err(|error| error.to_string())?;
    store.set(SERVER_KEY, server.as_str());
    store.save().map_err(|error| error.to_string())?;
    allow_server(&app, &server);
    *app.state::<Server>().0.lock().expect("server lock") = Some(server.clone());
    if let Some(window) = app.get_webview_window(MAIN) {
        window.navigate(server.clone()).map_err(|error| error.to_string())?;
    }
    Ok(server.to_string())
}

fn change_server(app: &AppHandle) {
    if let Ok(store) = app.store(SETTINGS) {
        store.delete(SERVER_KEY);
        let _ = store.save();
    }
    *app.state::<Server>().0.lock().expect("server lock") = None;
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.navigate(connect_page());
    }
    show_main(app);
}

fn quick_create(app: &AppHandle) {
    show_main(app);
    let _ = app.emit_to(MAIN, "quick-create", ());
}

// A deep link while the window is up goes to the web app as an event.
fn open_link(app: &AppHandle, link: &Url) {
    if link.scheme() != "edict" {
        return;
    }
    show_main(app);
    let _ = app.emit_to(MAIN, "open-link", link.as_str());
}

async fn check_for_update(app: AppHandle, asked: bool) {
    let say = |message: String| {
        if asked {
            app.dialog().message(message).title("Edict").show(|_| {});
        }
    };
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => return say(format!("Could not check for updates: {error}")),
    };
    match updater.check().await {
        Ok(Some(update)) => {
            let version = update.version.clone();
            if let Err(error) = update.download_and_install(|_, _| {}, || {}).await {
                return say(format!("Could not install Edict {version}: {error}"));
            }
            let handle = app.clone();
            app.dialog()
                .message(format!("Edict {version} is installed. Restart to use it?"))
                .title("Update ready")
                .buttons(MessageDialogButtons::OkCancelCustom("Restart".into(), "Later".into()))
                .show(move |restart| {
                    if restart {
                        handle.restart();
                    }
                });
        }
        Ok(None) => say("This is the latest Edict.".into()),
        Err(error) => say(format!("Could not check for updates: {error}")),
    }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Edict", true, None::<&str>)?;
    let new_issue = MenuItem::with_id(app, "new-issue", "New issue", true, Some(QUICK_CREATE))?;
    let server = MenuItem::with_id(app, "server", "Change server…", true, None::<&str>)?;
    let updates = MenuItem::with_id(app, "updates", "Check for updates…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Edict", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &new_issue, &separator, &server, &updates, &separator, &quit])?;
    // A black template image on macOS, which the system tints; the app icon
    // elsewhere.
    let icon = if cfg!(target_os = "macos") {
        Image::from_bytes(include_bytes!("../icons/tray-template@2x.png"))?
    } else {
        Image::from_bytes(include_bytes!("../icons/32x32.png"))?
    };
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Edict")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "new-issue" => quick_create(app),
            "server" => change_server(app),
            "updates" => {
                tauri::async_runtime::spawn(check_for_update(app.clone(), true));
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        // First, so a second launch hands its deep link to this one.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| show_main(app)))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Server(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![connect])
        .setup(|app| {
            let handle = app.handle().clone();
            let server = stored_server(&handle);
            // Launched by a deep link: open it once the page knows the organization.
            let first_link = handle
                .deep_link()
                .get_current()
                .ok()
                .flatten()
                .and_then(|links| links.into_iter().next());
            let url = match &server {
                Some(server) => {
                    allow_server(&handle, server);
                    let page = first_link
                        .as_ref()
                        .and_then(|link| deep_link_page(server, link))
                        .unwrap_or_else(|| server.clone());
                    WebviewUrl::External(page)
                }
                None => WebviewUrl::App("index.html".into()),
            };
            *handle.state::<Server>().0.lock().expect("server lock") = server;

            let opener = handle.clone();
            WebviewWindowBuilder::new(app, MAIN, url)
                .title("Edict")
                .inner_size(1280.0, 820.0)
                .min_inner_size(720.0, 520.0)
                // Links that open a new window, like a pull request on an
                // issue, go to the browser.
                .on_new_window(move |url, _features| {
                    let _ = opener.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                })
                .build()?;

            build_tray(&handle)?;

            let shortcuts = tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        quick_create(app);
                    }
                })
                .build();
            handle.plugin(shortcuts)?;
            // Another app may hold the hotkey; the tray still offers New issue.
            if let Err(error) = handle.global_shortcut().register(QUICK_CREATE) {
                eprintln!("could not register {QUICK_CREATE}: {error}");
            }

            // Linux and Windows learn the scheme at run time, not from the bundle.
            #[cfg(any(windows, target_os = "linux"))]
            let _ = handle.deep_link().register_all();
            let links = handle.clone();
            handle.deep_link().on_open_url(move |event| {
                for link in event.urls() {
                    open_link(&links, &link);
                }
            });

            if !cfg!(debug_assertions) {
                tauri::async_runtime::spawn(check_for_update(handle.clone(), false));
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to start Edict")
        .run(|app, event| match event {
            // Closing the window keeps the tray and the hotkey; Quit ends the app.
            RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. } if label == MAIN => {
                api.prevent_close();
                if let Some(window) = app.get_webview_window(MAIN) {
                    let _ = window.hide();
                }
            }
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => show_main(app),
            _ => {}
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_makes_an_origin() {
        assert_eq!(normalize("edict.example.com").unwrap().as_str(), "https://edict.example.com/");
        assert_eq!(normalize("  https://edict.example.com/acme/issues?x=1 ").unwrap().as_str(), "https://edict.example.com/");
        assert_eq!(normalize("http://localhost:3000/").unwrap().as_str(), "http://localhost:3000/");
        assert_eq!(normalize("https://me:secret@edict.example.com").unwrap().as_str(), "https://edict.example.com/");
    }

    #[test]
    fn normalize_refuses_what_is_not_a_server() {
        assert!(normalize("").is_err());
        assert!(normalize("ftp://edict.example.com").is_err());
        assert!(normalize("file:///etc/passwd").is_err());
    }

    #[test]
    fn deep_links_open_through_the_server_root() {
        let server = Url::parse("https://edict.example.com/").unwrap();
        let link = Url::parse("edict://issue/ENG-123").unwrap();
        assert_eq!(
            deep_link_page(&server, &link).unwrap().as_str(),
            "https://edict.example.com/?open=edict%3A%2F%2Fissue%2FENG-123"
        );
        assert!(deep_link_page(&server, &Url::parse("https://evil.example.com/").unwrap()).is_none());
    }
}
