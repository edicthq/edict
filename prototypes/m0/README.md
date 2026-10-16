# M0 prototype (throwaway)

Answered: which visual direction does Edict take? **C2, Agent-native, conventional**, with a violet accent users can change. Its tokens are in [`docs/design/tokens.md`](../../docs/design/tokens.md). The page opens on C2, and A and C stay in the switcher for reference. All directions render the same three screens from the same in-memory seed data. Nothing persists, so reload to reset.

Run it with `open prototypes/m0/index.html`. It needs no server and no build. Fonts load from Google Fonts.

URL params: `?d=C2|A|C&theme=light|dark&accent=violet|blue|teal|pink|lime&view=list|board&issue=ENG-142`. `accent` applies to C2 only.

## Keys

| Key | Does |
|---|---|
| `j` / `k`, arrows | Move. With the peek open, the peek follows |
| `h` / `l` | Move between board columns |
| `Enter` / `Esc` | Open / close the issue peek |
| `⌘K` | Command palette. Arrows move, `Enter` runs, `Backspace` on an empty query goes back |
| `s` / `a` / `d` | Status, assignee, delegate for the focused issue |
| `c` | Create issue |
| `v` | List / board |
| `⌘Z` | Undo the last change |
| `t` / `g` | Theme / next accent color (C2). Both are also under Appearance in the sidebar and in `⌘K` |
| `\` | Next direction (prototype only) |

## The agent run

Ferro (a runner agent) starts working on ENG-142 2.5 seconds after load. It posts progress updates, closes sub-issue ENG-143, links PR #318 and moves the issue to In Review after about 26 seconds. Choose "Replay agent run" in the peek or the palette to watch it again. Delegating any other issue to a runner agent with `d` starts a shorter run.

**Claude Code (Amirali)** is an OAuth-connected agent (see the "Agents are members" section of the plan). Delegating `d` to it queues the issue and shows "Waiting for Claude Code to pick it up" in the row's second line, its rail card and the agent lane; no run starts until you ask the agent. Delegating to Ferro or Sable still starts the scripted run, since they are runner agents. Wherever you pick a delegate, each agent reads "connected by Amirali · picks up work when asked" or "runner · starts right away".

An issue with no agent shows the lane's empty state: "Ask any agent connected to Edict: *work on ENG-129*", a copy button for that phrase and a "Connect your agent" link (stub). ENG-141 (Ferro) and OPS-31 (Sable) post slow background updates — one pass each, then their runs go quiet.

## Directions

- **A, Calm precision.** IBM Plex Sans and Plex Mono on warm neutrals. Vermilion is the only accent, and it only means "now": the cursor, focus, and live agent work. Agents differ from humans by shape (square, not round). The peek splits the screen, and a modeline at the bottom shows keys and live runs.
- **C, Agent-native.** Instrument Sans for humans, Martian Mono for agents. Phosphor lime is the only chromatic color and belongs to agents, along with a hatch texture and pulses on live work. Agents sit in the rail as teammates with presence, delegated rows carry the agent's latest words, and every peek has an agent lane.

- **C2, Agent-native, conventional.** C's structure (agents in the rail, the agent's latest words on rows, the agent lane) restyled for business users: one sans, monospace only for code, rounded-square agent avatars, no hatch, sentence case, soft badges with amber for "needs input" and red for "blocked", colored label dots. Violet is the default accent. Users can switch to blue, teal, pink or lime under Appearance in the sidebar or with "Change accent color…" in `⌘K`.

`screenshots/` has both directions side by side in light and dark for each screen (`compare-*`), C2 in each agent color (`c2-*`), the chosen design (`chosen-*`), and the connected-agent queue in light and dark, plus the empty lane and the delegate picker (`c2-connected-*`).
