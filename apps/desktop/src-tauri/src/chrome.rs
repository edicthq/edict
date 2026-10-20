// The window chrome. On macOS the traffic lights sit over the page in a 48px
// top strip; on Windows and Linux there is no native frame and the page draws
// its own controls. Every page, an instance's included, learns which from
// `window.__EDICT_DESKTOP__`, set before any of its scripts run.

use serde_json::json;
use tauri::window::Color;
use tauri::{Manager, Theme, WebviewWindow, WebviewWindowBuilder, Wry};

#[cfg(target_os = "macos")]
pub const PLATFORM: &str = "macos";
#[cfg(windows)]
pub const PLATFORM: &str = "windows";
#[cfg(not(any(target_os = "macos", windows)))]
pub const PLATFORM: &str = "linux";

/// "overlay": the system's buttons over the page. "custom": the page draws
/// minimize, maximize and close.
pub const TITLE_BAR: &str = if cfg!(target_os = "macos") { "overlay" } else { "custom" };

/// Where the traffic lights go, from the window's top left corner, so they
/// sit in the middle of the pages' 48px top strip.
#[cfg(target_os = "macos")]
pub const TRAFFIC_LIGHTS: (f64, f64) = (16.0, 26.0);

/// The script that tells a page it runs in the desktop app.
pub fn desktop_script(platform: &str, title_bar: &str, version: &str) -> String {
    let desktop = json!({ "platform": platform, "titleBar": title_bar, "version": version });
    format!("window.__EDICT_DESKTOP__ = Object.freeze({desktop});")
}

/// The `bg` token (`surface` for the switcher) for the system theme, so the
/// window never flashes white before a page paints.
pub fn background(theme: Theme, surface: bool) -> Color {
    match (theme, surface) {
        (Theme::Dark, false) => Color(0x0d, 0x0e, 0x11, 0xff),
        (Theme::Dark, true) => Color(0x13, 0x16, 0x19, 0xff),
        (_, false) => Color(0xf8, 0xf9, 0xfb, 0xff),
        (_, true) => Color(0xfe, 0xfe, 0xff, 0xff),
    }
}

/// Paints the window for its current theme.
pub fn paint(window: &WebviewWindow, surface: bool) {
    let theme = window.theme().unwrap_or(Theme::Light);
    let _ = window.set_background_color(Some(background(theme, surface)));
}

/// The chrome every window of the app gets.
pub fn styled<'a, M: Manager<Wry>>(
    builder: WebviewWindowBuilder<'a, Wry, M>,
    version: &str,
) -> WebviewWindowBuilder<'a, Wry, M> {
    let builder = builder.initialization_script(desktop_script(PLATFORM, TITLE_BAR, version));
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .traffic_light_position(tauri::LogicalPosition::new(TRAFFIC_LIGHTS.0, TRAFFIC_LIGHTS.1));
    #[cfg(not(target_os = "macos"))]
    let builder = builder.decorations(false);
    builder
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_script_names_the_platform_title_bar_and_version() {
        assert_eq!(
            desktop_script("macos", "overlay", "0.0.1"),
            r#"window.__EDICT_DESKTOP__ = Object.freeze({"platform":"macos","titleBar":"overlay","version":"0.0.1"});"#
        );
    }

    #[test]
    fn the_script_escapes_what_it_is_given() {
        let script = desktop_script("linux", "custom", "1.0\"});alert(1);//");
        assert!(script.contains(r#""version":"1.0\"});alert(1);//""#));
    }

    #[test]
    fn the_background_follows_the_theme() {
        assert_eq!(background(Theme::Light, false), Color(0xf8, 0xf9, 0xfb, 0xff));
        assert_eq!(background(Theme::Dark, false), Color(0x0d, 0x0e, 0x11, 0xff));
        assert_eq!(background(Theme::Dark, true), Color(0x13, 0x16, 0x19, 0xff));
    }
}
