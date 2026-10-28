---
status: accepted
---

# The desktop app keeps several instances and shows one at a time

Edict is self-hosted, so one person can use several instances: their company's, a client's, their own. Each instance serves its own web app, but the desktop app is one app ([ADR 0004](./0004-tauri-shell-loads-server-ui.md)), so it has to reach all of them. The plan had put this after v1. It moved into v1, decided with the project owner on 2026-10-20.

**One window, a quick switcher.** The app saves a list of instances and the main window shows one of them. A switcher, a small window of the app's own, lists the saved instances and adds new ones. It opens with ⌘⇧O (Ctrl+Shift+O), from the Instance menu, from the tray, and from the workspace menu of the web app inside the app. Picking an instance loads it in the main window. Each instance is its own origin, so each keeps its own session and switching back needs no new sign-in. The Instance menu and the tray list the saved instances, with ⌘1 to ⌘9 for the first nine.

**What an instance's page may do.** As before, an instance's page can listen to the shell's events and send notifications, granted at run time for that instance's origin only. It gains one command, `open_switcher`, which opens the switcher and returns nothing. An instance's page never learns which other instances are saved.

**Links.** An `edict://` link names an issue or a project, not an instance, so it opens on the instance in front, as [ADR 0027](./0027-edict-links-open-the-desktop-app.md) has it. When that instance has no such issue, the not-found page in the app offers the switcher.

**Names.** A saved instance is named after its host until the person renames it in the switcher.

## Considered options

- **One window per instance.** Several instances side by side, and every open one can notify. It costs a webview per instance, and the hotkey, links and tray would each have to pick a window.
- **Instance hosts in links** (`edict://edict.acme.com/issue/ENG-123`). Links would open on the right instance, but every MCP resource URI would change, and agents would write an instance's host into pull requests and chats.

## Consequences

- Only the instance in front sends notifications. The others stay quiet until someone switches to them.
- An app updated from before this change keeps its one instance as the first in the list.
