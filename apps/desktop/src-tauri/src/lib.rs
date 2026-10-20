// Edict's desktop app (ADR 0004): a Tauri shell that loads the web UI from an
// instance, so the UI always matches the instance. It keeps several instances
// and shows one at a time, with a switcher to change (ADR 0028). On top it
// adds a global quick-create hotkey, OS notifications, edict:// deep links
// (ADR 0027), a tray icon and signed updates.
//
// An instance's pages reach the shell through Tauri's global API, but only
// that instance's origin, and only for events, notifications, opening the
// switcher and its own window's controls: the capability is granted at
// runtime for each saved instance. The
// commands that read or change the saved instances belong to the app's own
// bundled pages (capabilities/), never to an instance's.

mod chrome;
mod instances;

use std::sync::Mutex;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::image::Image;
use tauri::ipc::CapabilityBuilder;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, Manager, RunEvent, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_store::StoreExt;
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_window_state::StateFlags;

pub use instances::{default_name, window_title, Instance, Saved};

const SETTINGS: &str = "settings.json";
const INSTANCES_KEY: &str = "instances";
const ACTIVE_KEY: &str = "active";
// Where an app from before ADR 0028 kept its one instance.
const LEGACY_SERVER_KEY: &str = "server";
const MAIN: &str = "main";
const SWITCHER: &str = "switcher";
const TRAY: &str = "main";
// The global hotkey that opens a new issue from anywhere.
const QUICK_CREATE: &str = "CommandOrControl+Shift+E";
// Opens the switcher while the app is in front. A menu accelerator, not a
// global shortcut.
const SWITCH: &str = "CmdOrCtrl+Shift+O";
// Menu item ids for the saved instances start with this, then the url.
const INSTANCE_ITEM: &str = "instance:";

// The saved instances and the active one.
struct Shell(Mutex<Saved>);

/// Turns what someone typed into an instance's origin: https unless they wrote
/// http, and no path, since Edict serves its UI from the root.
pub fn normalize(input: &str) -> Result<Url, String> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Enter the address of your Edict instance.".into());
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
/// instance's root with the link in ?open=, which the web app follows once it
/// knows the organization. Anything but edict:// is refused.
pub fn deep_link_page(server: &Url, link: &Url) -> Option<Url> {
    if link.scheme() != "edict" {
        return None;
    }
    let mut page = server.clone();
    page.query_pairs_mut().clear().append_pair("open", link.as_str());
    Some(page)
}

/// A menu label shows `&` as written instead of taking it as a mnemonic.
pub fn menu_label(name: &str) -> String {
    name.replace('&', "&&")
}

// Whether the instance answers like Edict: its public settings at /api/v1/instance.
async fn check_server(server: &Url) -> Result<(), String> {
    let host = default_name(server);
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
        return Err(format!("{host} answered {}. Is it an Edict instance?", res.status().as_u16()));
    }
    let body: serde_json::Value = res
        .json()
        .await
        .map_err(|_| format!("{host} does not look like an Edict instance."))?;
    if body.get("signUpMode").is_none() {
        return Err(format!("{host} does not look like an Edict instance."));
    }
    Ok(())
}

// Lets an instance's pages listen for the shell's events, send notifications,
// open the switcher, and drag, minimize, maximize, close and badge the window
// they are in. Nothing that reads data, and only from that instance's origin.
fn allow_server(app: &AppHandle, server: &Url) {
    let origin = server.origin().ascii_serialization();
    let capability = CapabilityBuilder::new(format!("instance-{origin}"))
        .remote(format!("{origin}/*"))
        .window(MAIN)
        .permission("core:event:default")
        .permission("notification:default")
        .permission("allow-open-switcher")
        .permission("core:window:allow-start-dragging")
        .permission("core:window:allow-internal-toggle-maximize")
        .permission("core:window:allow-minimize")
        .permission("core:window:allow-toggle-maximize")
        .permission("core:window:allow-close")
        .permission("core:window:allow-set-badge-count");
    // Adding the same instance twice in one run is refused, and harmless.
    let _ = app.add_capability(capability);
}

fn version(app: &AppHandle) -> String {
    app.package_info().version.to_string()
}

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_millis() as u64)
        .unwrap_or(0)
}

fn load_saved(app: &AppHandle) -> Saved {
    let Ok(store) = app.store(SETTINGS) else {
        return Saved::default();
    };
    let (saved, changed) = Saved::load(
        store.get(INSTANCES_KEY).as_ref(),
        store.get(ACTIVE_KEY).as_ref(),
        store.get(LEGACY_SERVER_KEY).as_ref(),
        now(),
    );
    if changed {
        let _ = persist(app, &saved);
    }
    saved
}

fn persist(app: &AppHandle, saved: &Saved) -> Result<(), String> {
    let store = app.store(SETTINGS).map_err(|error| error.to_string())?;
    store.set(INSTANCES_KEY, serde_json::to_value(&saved.instances).map_err(|error| error.to_string())?);
    match &saved.active {
        Some(active) => store.set(ACTIVE_KEY, active.as_str()),
        None => {
            store.delete(ACTIVE_KEY);
        }
    }
    store.delete(LEGACY_SERVER_KEY);
    store.save().map_err(|error| error.to_string())
}

fn saved(app: &AppHandle) -> Saved {
    app.state::<Shell>().0.lock().expect("instances lock").clone()
}

// Changes the saved instances, writes them to the store and brings the menus
// and the title up to date. Returns what `change` returned and the new list.
fn update<T>(app: &AppHandle, change: impl FnOnce(&mut Saved) -> T) -> Result<(T, Saved), String> {
    let (result, saved) = {
        let shell = app.state::<Shell>();
        let mut guard = shell.0.lock().expect("instances lock");
        let result = change(&mut guard);
        (result, guard.clone())
    };
    persist(app, &saved)?;
    refresh(app, &saved);
    Ok((result, saved))
}

// The bundled page that asks for the first instance.
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

// Loads the active instance in the main window, or the connect page when no
// instance is saved.
fn load_active(app: &AppHandle, saved: &Saved) {
    let page = saved.active_url().unwrap_or_else(connect_page);
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.navigate(page);
    }
}

fn close_switcher(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(SWITCHER) {
        let _ = window.close();
    }
}

// Opens the switcher centred over the main window, or focuses it when it is
// open. With `add`, the address field takes the focus.
fn show_switcher(app: &AppHandle, add: bool) {
    if let Some(window) = app.get_webview_window(SWITCHER) {
        if add {
            let _ = window.eval("window.edictSwitcher && window.edictSwitcher.focusAdd()");
        }
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let (width, height) = (440.0, 480.0);
    let page = if add { "switcher.html#add" } else { "switcher.html" };
    let builder = WebviewWindowBuilder::new(app, SWITCHER, WebviewUrl::App(page.into()));
    let mut builder = chrome::styled(builder, &version(app))
        .title("Instances")
        .inner_size(width, height)
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .visible(false);
    let over_main = app.get_webview_window(MAIN).and_then(|main| {
        if !main.is_visible().unwrap_or(false) || main.is_minimized().unwrap_or(false) {
            return None;
        }
        let scale = main.scale_factor().ok()?;
        let position = main.outer_position().ok()?.to_logical::<f64>(scale);
        let size = main.outer_size().ok()?.to_logical::<f64>(scale);
        Some((position.x + (size.width - width) / 2.0, position.y + (size.height - height) / 2.0))
    });
    builder = match over_main {
        Some((x, y)) => builder.position(x, y),
        None => builder.center(),
    };
    match builder.build() {
        Ok(window) => {
            // The window menu belongs to the main window on Windows and Linux.
            #[cfg(not(target_os = "macos"))]
            let _ = window.remove_menu();
            chrome::paint(&window, true);
            let _ = window.show();
            let _ = window.set_focus();
        }
        Err(error) => eprintln!("could not open the switcher: {error}"),
    }
}

// Opens a saved instance in the main window and closes the switcher.
fn switch_to(app: &AppHandle, url: &Url) -> Result<Saved, String> {
    let before = saved(app).active;
    let (found, saved) = update(app, |saved| saved.activate(url, now()))?;
    if !found {
        return Err("That instance is not saved any more.".into());
    }
    if saved.active != before {
        if let Some(active) = saved.active_url() {
            allow_server(app, &active);
        }
        load_active(app, &saved);
    }
    close_switcher(app);
    show_main(app);
    Ok(saved.listing())
}

// Forgets an instance. When it was in front, the main window moves to the
// next one, or to the connect page when none is left.
fn forget(app: &AppHandle, url: &Url) -> Result<Saved, String> {
    let before = saved(app).active;
    let (found, saved) = update(app, |saved| saved.remove(url))?;
    if !found {
        return Err("That instance is not saved any more.".into());
    }
    if saved.active != before {
        load_active(app, &saved);
    }
    if saved.instances.is_empty() {
        close_switcher(app);
        show_main(app);
    }
    Ok(saved.listing())
}

// Asks before forgetting the instance in front, from the Instance menu.
fn confirm_forget_active(app: &AppHandle) {
    let Some(active) = saved(app).active_instance().cloned() else {
        return;
    };
    let Ok(url) = Url::parse(&active.url) else {
        return;
    };
    let handle = app.clone();
    app.dialog()
        .message(format!(
            "The app forgets {}. Your account on it stays, and you can add it again any time.",
            active.name
        ))
        .title(format!("Remove {}?", active.name))
        .buttons(MessageDialogButtons::OkCancelCustom("Remove".into(), "Cancel".into()))
        .show(move |remove| {
            if remove {
                if let Err(error) = forget(&handle, &url) {
                    eprintln!("could not remove {url}: {error}");
                }
            }
        });
}

#[tauri::command]
fn list_instances(app: AppHandle) -> Saved {
    saved(&app).listing()
}

#[tauri::command]
async fn add_instance(app: AppHandle, address: String) -> Result<Saved, String> {
    let url = normalize(&address)?;
    check_server(&url).await?;
    allow_server(&app, &url);
    let before = saved(&app).active;
    let (_, saved) = update(&app, |saved| saved.add(&url, now()))?;
    if saved.active != before {
        load_active(&app, &saved);
    }
    close_switcher(&app);
    show_main(&app);
    Ok(saved.listing())
}

#[tauri::command]
fn switch_instance(app: AppHandle, url: String) -> Result<Saved, String> {
    switch_to(&app, &normalize(&url)?)
}

#[tauri::command]
fn remove_instance(app: AppHandle, url: String) -> Result<Saved, String> {
    forget(&app, &normalize(&url)?)
}

#[tauri::command]
fn rename_instance(app: AppHandle, url: String, name: String) -> Result<Saved, String> {
    let url = normalize(&url)?;
    let (found, saved) = update(&app, |saved| saved.rename(&url, &name))?;
    if !found {
        return Err("That instance is not saved any more.".into());
    }
    Ok(saved.listing())
}

// The one command an instance's page may call. It learns nothing back.
#[tauri::command]
async fn open_switcher(app: AppHandle) {
    show_switcher(&app, false);
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

// One check item per saved instance, most recently used first, with
// ⌘1…⌘9 on the first nine when `accelerators`.
fn instance_items(app: &AppHandle, saved: &Saved, accelerators: bool) -> tauri::Result<Vec<CheckMenuItem<tauri::Wry>>> {
    saved
        .ordered()
        .iter()
        .enumerate()
        .map(|(index, instance)| {
            let accelerator = (accelerators && index < 9).then(|| format!("CmdOrCtrl+{}", index + 1));
            CheckMenuItem::with_id(
                app,
                format!("{INSTANCE_ITEM}{}", instance.url),
                menu_label(&instance.name),
                true,
                saved.active.as_deref() == Some(instance.url.as_str()),
                accelerator.as_deref(),
            )
        })
        .collect()
}

fn instance_menu(app: &AppHandle, saved: &Saved) -> tauri::Result<Submenu<tauri::Wry>> {
    let menu = Submenu::new(app, "Instance", true)?;
    for item in instance_items(app, saved, true)? {
        menu.append(&item)?;
    }
    if !saved.instances.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    menu.append(&MenuItem::with_id(app, "switcher", "Switch instance…", true, Some(SWITCH))?)?;
    menu.append(&MenuItem::with_id(app, "add-instance", "Add an instance…", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(
        app,
        "remove-instance",
        "Remove this instance",
        saved.active.is_some(),
        None::<&str>,
    )?)?;
    Ok(menu)
}

// The menu bar: the app menu, Edit (copy and paste in the page go through
// it on macOS), View, Instance and Window.
#[cfg(target_os = "macos")]
fn menu_bar(app: &AppHandle, saved: &Saved) -> tauri::Result<Menu<tauri::Wry>> {
    let separator = || PredefinedMenuItem::separator(app);
    let edict = Submenu::with_items(
        app,
        "Edict",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About Edict"), None)?,
            &MenuItem::with_id(app, "updates", "Check for updates…", true, None::<&str>)?,
            &separator()?,
            &PredefinedMenuItem::services(app, None)?,
            &separator()?,
            &PredefinedMenuItem::hide(app, Some("Hide Edict"))?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &separator()?,
            &PredefinedMenuItem::quit(app, Some("Quit Edict"))?,
        ],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &separator()?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let view = Submenu::with_items(app, "View", true, &[&PredefinedMenuItem::fullscreen(app, None)?])?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, None)?,
            &separator()?,
            &PredefinedMenuItem::close_window(app, None)?,
        ],
    )?;
    Menu::with_items(app, &[&edict, &edit, &view, &instance_menu(app, saved)?, &window])
}

// The main window's menu on Windows and Linux, where the webview handles
// copy and paste itself.
#[cfg(not(target_os = "macos"))]
fn menu_bar(app: &AppHandle, saved: &Saved) -> tauri::Result<Menu<tauri::Wry>> {
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[
            &MenuItem::with_id(app, "new-issue", "New issue", true, Some(QUICK_CREATE))?,
            &MenuItem::with_id(app, "updates", "Check for updates…", true, None::<&str>)?,
            &PredefinedMenuItem::separator(app)?,
            &MenuItem::with_id(app, "quit", "Quit Edict", true, None::<&str>)?,
        ],
    )?;
    Menu::with_items(app, &[&file, &instance_menu(app, saved)?])
}

fn tray_menu(app: &AppHandle, saved: &Saved) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;
    menu.append(&MenuItem::with_id(app, "open", "Open Edict", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "new-issue", "New issue", true, Some(QUICK_CREATE))?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    for item in instance_items(app, saved, false)? {
        menu.append(&item)?;
    }
    menu.append(&MenuItem::with_id(app, "switcher", "Switch instance…", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "updates", "Check for updates…", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit Edict", true, None::<&str>)?)?;
    Ok(menu)
}

fn set_menus(app: &AppHandle, saved: &Saved) -> tauri::Result<()> {
    let bar = menu_bar(app, saved)?;
    #[cfg(target_os = "macos")]
    app.set_menu(bar)?;
    #[cfg(not(target_os = "macos"))]
    if let Some(window) = app.get_webview_window(MAIN) {
        window.set_menu(bar)?;
    }
    if let Some(tray) = app.tray_by_id(TRAY) {
        tray.set_menu(Some(tray_menu(app, saved)?))?;
    }
    Ok(())
}

// Rebuilds the menus and retitles the main window after the list or the
// active instance changes.
fn refresh(app: &AppHandle, saved: &Saved) {
    if let Err(error) = set_menus(app, saved) {
        eprintln!("could not rebuild the menus: {error}");
    }
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.set_title(&window_title(saved));
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    match id {
        "open" => show_main(app),
        "new-issue" => quick_create(app),
        "switcher" => show_switcher(app, false),
        "add-instance" => show_switcher(app, true),
        "remove-instance" => confirm_forget_active(app),
        "updates" => {
            tauri::async_runtime::spawn(check_for_update(app.clone(), true));
        }
        "quit" => app.exit(0),
        other => {
            let Some(url) = other.strip_prefix(INSTANCE_ITEM).and_then(|url| Url::parse(url).ok()) else {
                return;
            };
            if switch_to(app, &url).is_err() {
                // A check item ticks itself when clicked; put the marks back.
                refresh(app, &saved(app));
            }
        }
    }
}

fn build_tray(app: &AppHandle, saved: &Saved) -> tauri::Result<()> {
    // A black template image on macOS, which the system tints; the app icon
    // elsewhere.
    let icon = if cfg!(target_os = "macos") {
        Image::from_bytes(include_bytes!("../icons/tray-template@2x.png"))?
    } else {
        Image::from_bytes(include_bytes!("../icons/32x32.png"))?
    };
    // Its clicks reach the app-wide menu handler in `run`.
    TrayIconBuilder::with_id(TRAY)
        .icon(icon)
        .icon_as_template(cfg!(target_os = "macos"))
        .tooltip("Edict")
        .menu(&tray_menu(app, saved)?)
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
        // The main window keeps its size and place across launches. Never
        // its visibility: a window closed to the tray must come back.
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::all() - StateFlags::VISIBLE - StateFlags::DECORATIONS)
                .with_denylist(&[SWITCHER])
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            list_instances,
            add_instance,
            switch_instance,
            remove_instance,
            rename_instance,
            open_switcher
        ])
        // Every menu: the menu bar, the window menu and the tray's. Each item
        // is handled once here.
        .on_menu_event(|app, event| {
            let app = app.clone();
            let id = event.id.as_ref().to_string();
            // After the menu has closed, since handling it rebuilds the menus.
            tauri::async_runtime::spawn(async move { on_menu(&app, &id) });
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let saved = load_saved(&handle);
            // Switching moves the main window to another origin, so every
            // saved instance gets its capability now.
            for instance in &saved.instances {
                if let Ok(url) = Url::parse(&instance.url) {
                    allow_server(&handle, &url);
                }
            }
            // Launched by a deep link: open it once the page knows the organization.
            let first_link = handle
                .deep_link()
                .get_current()
                .ok()
                .flatten()
                .and_then(|links| links.into_iter().next());
            let url = match saved.active_url() {
                Some(active) => {
                    let page = first_link
                        .as_ref()
                        .and_then(|link| deep_link_page(&active, link))
                        .unwrap_or(active);
                    WebviewUrl::External(page)
                }
                None => WebviewUrl::App("index.html".into()),
            };
            app.manage(Shell(Mutex::new(saved.clone())));

            let opener = handle.clone();
            let main = chrome::styled(WebviewWindowBuilder::new(app, MAIN, url), &version(&handle))
                .title(window_title(&saved))
                .inner_size(1280.0, 820.0)
                .min_inner_size(720.0, 520.0)
                // Links that open a new window, like a pull request on an
                // issue, go to the browser.
                .on_new_window(move |url, _features| {
                    let _ = opener.opener().open_url(url.as_str(), None::<&str>);
                    NewWindowResponse::Deny
                })
                // Shown once painted for the theme, so it never flashes white.
                .visible(false)
                .build()?;
            chrome::paint(&main, false);
            main.show()?;

            build_tray(&handle, &saved)?;
            set_menus(&handle, &saved)?;

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
            // The switcher is a quick look: clicking away closes it.
            RunEvent::WindowEvent { label, event: WindowEvent::Focused(false), .. } if label == SWITCHER => {
                close_switcher(app);
            }
            RunEvent::WindowEvent { label, event: WindowEvent::ThemeChanged(_), .. } => {
                if let Some(window) = app.get_webview_window(&label) {
                    chrome::paint(&window, label == SWITCHER);
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

    #[test]
    fn menu_labels_show_ampersands_as_written() {
        assert_eq!(menu_label("R&D"), "R&&D");
        assert_eq!(menu_label("Acme"), "Acme");
    }
}
