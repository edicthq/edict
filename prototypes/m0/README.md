# M0 prototype (throwaway)

Answers one question: does Edict take direction **A "Calm precision"** or **C "Agent-native"**? Both directions render the same three screens from the same in-memory seed data. Nothing persists, so reload to reset.

Run it with `open prototypes/m0/index.html`. It needs no server and no build. Fonts load from Google Fonts.

URL params: `?d=A|C&theme=light|dark&view=list|board&issue=ENG-142`.

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
| `t` / `\` | Theme / direction (prototype only) |

## The agent run

Ferro starts working on ENG-142 2.5 seconds after load. It posts progress updates, closes sub-issue ENG-143, links PR #318 and moves the issue to In Review after about 26 seconds. Choose "Replay agent run" in the peek or the palette to watch it again. Delegating any other issue with `d` starts a shorter run. ENG-141 (Ferro) and OPS-31 (Sable) post slow background updates the whole time.

## Directions

- **A, Calm precision.** IBM Plex Sans and Plex Mono on warm neutrals. Vermilion is the only accent, and it only means "now": the cursor, focus, and live agent work. Agents differ from humans by shape (square, not round). The peek splits the screen, and a modeline at the bottom shows keys and live runs.
- **C, Agent-native.** Instrument Sans for humans, Martian Mono for agents. Phosphor lime is the only chromatic color and belongs to agents, along with a hatch texture and pulses on live work. Agents sit in the rail as teammates with presence, delegated rows carry the agent's latest words, and every peek has an agent lane.

`screenshots/` has both directions side by side in light and dark for each screen.
