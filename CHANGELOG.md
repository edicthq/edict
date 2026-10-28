# Changelog

Each release's notes, newest first. Cutting a release writes its section from the commit subjects since the last release unless one is already written by hand, and the release workflow publishes the section headed with the tag's version as the GitHub Release notes; see [`docs/releasing.md`](docs/releasing.md).

## 0.1.0 (2026-10-28)

- Markdown projects, one Tabs component, and an agent lane that shows any agent's progress
- The e2e specs follow the agent lane's copy, ?issue= links and the inbox tabs
- Board cards put the select box over the priority icon, headers keep their height, and the avatar pair stops overlapping
- The inbox draws agents as agents and drops the repeated team key
- An agent's connection line in the rail stays on one line
- Project progress tiles name statuses in sentence case, with their icons
- A disabled primary button is a quiet surface, not a faded ink block
- ADR 0028: the desktop app keeps several instances and shows one at a time
- The peek closes on a click outside it, and its title grows instead of scrolling in WebKit
- In the desktop app the page knows the shell: window commands, the instance switcher, the dock badge and app shortcuts
- The polish page frame: a calmer rail with one-line agents and expandable teams, a 48px page bar, a hairline toolbar and a live-agent pill
- A closed issue reads as done for its delegate instead of waiting for it
- The desktop app keeps several instances and switches between them (ADR 0028)
- The desktop app draws its own title bar and opens without a flash
- Saved instances keep the order they were added in, so ⌘1 to ⌘9 keep their instance, and the title strip clears the traffic lights
- The switcher's list is a div with the listbox role, which lint accepts
- In the desktop app, an issue that is not found offers to look on another instance
- One issue row for the team list, My issues and projects, with the agent line wherever the issue shows
- The peek folds empty sub-issues, relations, links and files into one row of quiet actions
- The new-issue dialog opens high, delegates to an agent as it creates, and Enter in the title moves on instead of creating
- The agents page is a roster of state, queue and current issue, with a panel for one agent's work, powers and access
- A progress line keeps underscores inside words like open_switcher
- Connect an agent shows the steps for Claude Code, T3 Code, Codex, Cursor and OpenCode, and the clients you have connected
- Settings split into your preferences and the organization's, with a subnav to members, agents and the instance
- The empty palette leads with New issue and the issues you opened last, then Go to
- The project page bar sets status, lead and target date through app menus and a calendar, and paused projects stop borrowing the amber that means an agent is waiting
- The Teams page is a roster of each team's open, in-progress and delegated issues, its members and its agents, from a new team-overview endpoint
- On a phone, issue rows take two lines, the team toolbar folds into one View sheet, the rail opens as a drawer from a compact top bar, and New issue floats over the lists
- tokens.md records the calm-desk direction: the page frame, one issue row, the rail, the rosters, the phone layout and the don'ts
- The e2e suite passes in one run: the new-issue spec sorts after the fresh-instance spec, m4 waits for the create form to unmount before pressing T, and two specs typecheck
- Inline code is a chip on hover, in the agent wash inside agent updates, and code everywhere uses the code font at 0.88em, which two undefined classes had dropped
- The agent panel stays current: realtime is the one path, panels poll only while the socket is down, a heartbeat replaces dead sockets, and Working goes quiet after 30 minutes without a word from the agent
- The Agents page leads with Connect an agent; New agent moves under Runners with what a runner is, and with no agents the page says they appear when you connect a client
- The realtime e2e only waits for pongs while a socket is up, so a ping sent as the test drops the socket no longer stalls it
- Motion and depth: enter and exit tokens, menus, dialogs, the palette and toasts pop in and fade out, the peek slides both ways, rows fade their hover and ease in when they arrive, sign-in pages are centered under a soft light, dark mode gets a raised layer and alpha hairlines, and fields focus with a soft halo
- Settings pages share one frame and the app's own controls: Members and the instance sit beside Preferences as cards of rows, roles and every other choice open the app's menu, checkboxes, radios and switches are drawn in the tokens, the trash and Connect read as one centered column, and the team page's members and settings become cards
- A project lists its issues by status category, open work first, with Done and Canceled folded while anything is open; on a phone its status, lead and date chips move to a row under the bar
- On a phone the agents roster is the agent, its state and what it works on; with no organization webhook the page shows one quiet action that opens the form; the agent panel slides out as it closes
- The rail marks a team's Members page instead of its Issues, rail items are 30 high and fade their hover, the phone's drawer slides in, board cards take a hover edge and a quiet focus ring, and tokens.md describes functional motion, the raised layer, alpha hairlines and the drawn controls
- A connected agent is named after its client without the parenthesis Claude Code adds: "Claude Code (edict)" connects as Claude Code (Amirali), and every server name is the same client, for reconnecting and for pausing
- The consent page shows the client as the agent it becomes beside Edict's mark, what it can and cannot do in a card, Allow and Deny as two equal buttons, and who is signed in; buttons keep one height per size
- Connect an agent reads in the order you do it: the MCP URL, your client picked from tiles, its steps in one card, then your agents, which appear live once approved; runners and an agent's limits are quiet notes at the end, and signing in uses claude mcp login
- ADR 0029: agents report their work without spending tokens on it. Progress updates get a source, the delegate's moves write activity, Claude Code hooks post with a hook key, and post_progress becomes optional
- Agent progress costs no tokens: the delegate's status moves, links and comments write activity updates, Claude Code's HTTP hooks post to /agent-hooks/claude-code with a hook key, tools/list drops from 8,637 to 4,937 characters, and the Connect page creates a hook key and shows the hooks to paste
- A quiet git commit still reports to its issue: the hook falls back to the -m subject when git prints no summary
- Hooks take the commit Claude Code reports in gitOperation, so a summary line that git printed mid-line still names the commit
- Only a command line that runs git commit reports one, and a commit without a sha is reported only when git printed nothing, as -q does
- A quiet commit chained after other commands still reports by its -m subject
- EDI-53: the agent line on rows reads the first paragraph of the latest update, without the list that follows or a leading list marker
- EDI-52: inbox times are ink-2 at a fixed width beside a dot that keeps its place, so both line up, and a phone gives each row two lines
- EDI-51, EDI-54: rail pages take the selected-row fill, the Agents page lights only the open agent, idle reads Idle; the not-found link is centered, Teams avatars no longer overlap, the chosen client tile is quiet, a phone hides key hints and wraps commands, and Esc is spelled one way
- A closed issue lets its session go: closing it no longer reads as picking it up, and later commits and turns stop reporting on it
- A link or comment from the delegate on a closed issue reads as done, not as working again
- m3-exit reports hooks on an open issue, since a closed one takes no reports
- Password fields have a button that shows what was typed, on sign in, sign up and choosing a new password
- Depth: the page is a panel inset on the window, the rail folds away with [ or its button, rows and board cards drop the agent's words for a state badge when it asks for a look, list groups sit on a faint band, and agent names are ink beside their avatars
- Releases are one click: Cut a release works out the next version, writes its changelog section from the commit subjects, commits and tags it on main and starts the Release workflow; the desktop app also checks for updates every six hours while open, one check and one restart dialog at a time
- Status icons take a color per stage: yellow for the first in-progress stage, green for later ones like In Review, indigo for done, gray for the rest
- The select box on a hovered row or card takes the priority icon's place exactly, instead of sitting beside it against the identifier, and a list's group heading lines its icon up with the rows' first column
- One content edge, 24px into the page: rows, group headings, underline tabs and the project page's labels and cards start where the title and toolbar do, project groups take the list's band, and a board's column headings line up with its cards
- Keyboard shortcuts in Preferences: the sidebar, command menu, new issue, list or board, search, theme and agent color can each take new keys, kept in this browser; the sidebar moves from [ to ⌘B, hints show the keys a person bound, and keys the list keeps or another shortcut has are refused
- A group's rows start 4px under its band, so a hovered row no longer runs into the heading, and a team's archived issues start on the page's edge
- OpenCode connects to a local Edict's MCP server, with the API key from EDICT_API_KEY
- A button's height and type size come from its size, not its variant, so Cancel beside Create team, or Members beside New issue, are the same height; secondary buttons are 32 high like primary ones
- Desktop tabs and one top bar: the app opens pages in tabs (⌘T, ⌘W, ⌃Tab, ⌘-click, drag to reorder, kept per instance) in a 44px bar where the traffic lights, back and forward and the tabs share one line, and the traffic lights are put back after AppKit moves them; Windows and Linux get their window buttons flush in the bar's corner, no stray native menu bar, and ⌃1…⌃9 through the page; CI builds the desktop shell on Linux, Windows and macOS
- The telemetry collector's tests hear a connection end while it closes, so dropping the test database after pool.end() no longer fails the run

## 0.0.1

The first public build of Edict: an issue tracker where AI agents are members of the team. It runs as one image plus Postgres.

- **Work.** Organizations, teams and projects. Issues with statuses in five fixed categories, labels, priority, estimates, due dates, sub-issues, relations, links and attachments. Identifiers like `ENG-123` keep resolving after moves and renames.
- **Agents.** Connect any MCP client by pasting `<your URL>/mcp` and approving it, or create an agent with API keys for an agent runner. Delegate issues to agents, watch their progress updates live, grant powers per agent and pause any agent in one click.
- **The feel.** List and board views with filter, group and sort, saved views, the command palette, a keyboard shortcut for every action, the peek panel, bulk edits, light and dark themes and five accent colors.
- **Workflow.** My issues, an inbox, project progress across teams, team templates and a full organization export.
- **Safety nets.** Undo for anything you just did, a 30-day trash, an archive for closed issues, and a merge view when someone else changed what you were editing.
- **API.** `/api/v1` with an OpenAPI document, the typed client [`@edicthq/client`](https://www.npmjs.com/package/@edicthq/client) (MIT), and signed webhooks with a delivery log.
- **Running it.** The image for amd64 and arm64, `docker compose pull && docker compose up -d` to upgrade, and an Instance page that says when a newer release is out. Telemetry stays off unless the instance admin turns it on, and then sends only the version and a user-count range.

The desktop app, a beta that is not yet signed for macOS or Windows, ships with the first release that has its updater key.
