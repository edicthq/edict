# The desktop app is a Tauri shell that loads the server's UI

The desktop app uses Tauri 2, not Electron, to keep the download small. It loads the web UI from whichever server the user points it at, instead of bundling its own copy. Self-hosted instances run many different versions, and a bundled UI talking to an older or newer server would need version negotiation everywhere. Loading the server's UI means the two always match. Native features (hotkey, notifications, deep links, tray) reach the remote page through Tauri's remote-origin capabilities.

## Consequences

- No UI when the server is unreachable.
- The app renders in WebKit on macOS and Linux, so the web app is tested in WebKit from day one.
