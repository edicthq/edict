---
status: accepted
---

# edict:// links open the desktop app

The plan gives the desktop app `edict://` deep links, and the MCP server already names its resources with that scheme: `edict://issue/ENG-123` and `edict://project/<slug>`. The desktop app registers the same scheme, so a resource link an agent writes in a pull request, a chat or a terminal opens that issue in the app. Decided with the project owner on 2026-10-19.

**What a link opens.** The desktop app shows one server ([ADR 0004](./0004-tauri-shell-loads-server-ui.md)), so a link names an issue or project on that server. The web app opens it in the organization on screen, or the one it would open first, since an identifier's team key belongs to an organization. Anything but `issue` and `project` is ignored.

**How it gets there.** A running app hands the link to the page as an event. An app launched by the link opens the server with `?open=<link>`, which the web app keeps until it knows the organization. Only the bundled connect page can call the shell's commands; the server's page can only listen to its events and send notifications.

## Considered options

- **A scheme of the desktop app's own, such as `edict-app://`.** Keeps the two apart, but agents would have to write a second form of every link, and the MCP resource links would stay unclickable.

## Consequences

- A person in several organizations on one server opens a link in the organization on screen. If its team key is not there, the issue page says it was not found.
- Without the desktop app, `edict://` links do nothing in a browser.
