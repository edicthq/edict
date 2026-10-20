# Design tokens

The chosen visual direction is **C2, "Agent-native, conventional"**, picked in M0 on 2026-10-17. Of the two directions in the plan, Agent-native won. It was then made more conventional so business teams find it familiar, and the agent color went from lime to violet. The prototype on the `m0-prototype` branch (`prototypes/m0/`) shows these tokens on the issue list, board, peek and command palette.

These tokens move into `packages/ui` before any product UI is built. OKLCH is the source of truth. Hex values are sRGB fallbacks.

## The rules

1. **The accent means "agent".** Agent avatars, live agent work, the agent lane and agent badges use it, and nothing else does. Human actions, links, focus, selection and static state never use it.
2. **Humans act in ink.** The one filled button on a screen is ink on a light surface (inverted in dark), never the accent.
3. **Status and priority stay neutral.** Their icons carry the meaning through shape, not color. Done is ink, not green.
4. **Amber and red are only for an agent waiting on a human.** Amber means "needs input", red means "blocked". They appear nowhere else.
5. **One sans for everything.** Monospace is only for code and paths, never for UI copy or agent messages.
6. **Hairlines separate surfaces.** Shadows are only for things floating above the page: the peek, the palette, toasts.
7. **Motion only means "an agent is working now".** Nothing loops unless an agent run is live.

## Color

### Neutrals

| Role | Use | Light | Dark |
|---|---|---|---|
| `bg` | Page background | `oklch(0.982 0.003 255)` `#f8f9fb` | `oklch(0.165 0.006 260)` `#0d0e11` |
| `rail` | Sidebar | `oklch(0.965 0.004 255)` `#f2f4f6` | `oklch(0.145 0.006 260)` `#090a0d` |
| `surface` | Cards, peek, palette, inputs | `oklch(0.998 0.001 255)` `#fefeff` | `oklch(0.198 0.008 260)` `#131619` |
| `hover` | Hover, selected row, code background, segmented control | `oklch(0.948 0.005 255)` `#eceef1` | `oklch(0.235 0.009 260)` `#1c1e22` |
| `line` | Hairline borders, dividers | `oklch(0.91 0.006 255)` `#dfe1e5` | `oklch(0.262 0.009 260)` `#222529` |
| `line-strong` | Control borders, label outlines, inactive delegate bar | `oklch(0.85 0.008 255)` `#caced3` | `oklch(0.33 0.011 260)` `#32363b` |
| `ink` | Primary text, filled human buttons, focus ring, done icons | `oklch(0.22 0.016 260)` `#161b22` | `oklch(0.95 0.004 255)` `#edeff1` |
| `ink-2` | Secondary text, identifiers, timestamps, placeholders | `oklch(0.47 0.014 260)` `#565b63` | `oklch(0.74 0.009 255)` `#a7abb0` |
| `ink-3` | Icons only (backlog/todo status, empty priority). Never text | `oklch(0.65 0.01 260)` `#8c8f95` | `oklch(0.56 0.009 255)` `#71757a` |
| `on-human` | Text on `ink` fills | `oklch(0.985 0.003 255)` | `oklch(0.17 0.008 260)` |
| `scrim` | Behind the palette and modals | `oklch(0.25 0.02 260 / 0.2)` | `oklch(0 0 0 / 0.45)` |

### Agent waiting on a human

| Role | Use | Light | Dark |
|---|---|---|---|
| `warn` | "Needs input" badge text and lane rule | `oklch(0.52 0.13 65)` `#965800` | `oklch(0.83 0.13 80)` `#f3bd5c` |
| `warn-wash` | "Needs input" badge background | `oklch(0.82 0.14 80 / 0.25)` | `oklch(0.8 0.14 80 / 0.14)` |
| `danger` | "Blocked" badge text and lane rule | `oklch(0.52 0.19 27)` `#be2323` | `oklch(0.76 0.14 25)` `#fe8b83` |
| `danger-wash` | "Blocked" badge background | `oklch(0.62 0.2 27 / 0.1)` | `oklch(0.7 0.17 25 / 0.15)` |

### Accent (the agent color)

The accent is a hue `H`, a chroma `C` and a light-theme lightness `L`. Every agent role derives from those three numbers, so swapping the accent means changing one attribute (`data-accent` on the root). A swatch carrying its own `data-accent` previews itself with the same rules.

| Role | Use | Light | Dark |
|---|---|---|---|
| `agent` | Agent avatar fill, live dot, live row bar, pulse ring | `oklch(L C H)` | `oklch(0.64 0.85C H)` |
| `on-agent` | Initials on the agent avatar | `oklch(0.99 0.01 H)` | `oklch(0.17 0.02 H)` |
| `agent-ink` | Agent names, "Working" badge text, "N live runs" | `oklch(L−0.06 C H)` | `oklch(0.8 0.6C H)` |
| `agent-wash` | "Working" badge background, inline code in agent messages, flash after an agent change | `agent` at 9% | `agent` at 15% |
| `agent-edge` | Outline of live agent cards and the lane's border | `agent` at 45% | `agent` at 55% |
| `lane` | Agent lane background | `oklch(0.978 0.008 H)` | `oklch(0.185 0.016 H)` |

Presets. **Violet is the default.**

| Accent | H | C | L | `agent` light | `agent` dark |
|---|---|---|---|---|---|
| Violet | 293 | 0.22 | 0.56 | `#7f4ce6` | `#9370f1` |
| Blue | 257 | 0.19 | 0.56 | `#1170e0` | `#458bec` |
| Teal | 195 | 0.12 | 0.52 | `#007879` | `#229f9f` |
| Pink | 350 | 0.20 | 0.56 | `#c32e85` | `#d4599b` |
| Lime | 128 | 0.20 | n/a | `#abe841` | `#b1ef4a` |

Lime does not follow the formula. It keeps a bright fill with dark text on it: light `agent` `oklch(0.86 0.2 128)`, `on-agent` `oklch(0.25 0.06 130)`, `agent-ink` `oklch(0.47 0.13 135)`; dark `agent` `oklch(0.88 0.2 128)`, `on-agent` `oklch(0.22 0.05 130)`, `agent-ink` `oklch(0.87 0.19 128)`.

Users can choose an accent. Whether the choice is stored per user, as an organization default, or both is still open, and the setting is not in the plan's v1 scope yet. New presets need a hue at least 15° from amber (65–80) and red (25–27), since those mean "waiting on you".

### Label dots

Labels keep a hue from their definition. The dot is `oklch(0.66 0.1 h)` in light and `oklch(0.72 0.09 h)` in dark. Label text stays `ink-2`. These colors are decorative and never become buttons or states.

### Measured contrast

| Pair | Light | Dark |
|---|---|---|
| `ink-2` on `bg` | 6.5 | 8.4 |
| `agent-ink` on `surface` (violet) | 6.7 | 9.4 |
| `on-agent` on `agent` (violet / blue / teal / pink) | 5.0 / 4.6 / 5.1 / 5.0 | 5.3 / 5.6 / 6.0 / 5.2 |
| `warn` on `bg` | 5.4 | 11.3 |
| `danger` on `bg` | 5.8 | 8.5 |
| `ink-3` on `bg` | 3.1, so icons only | 4.1 |

## Type

**Instrument Sans** (variable, 400–700) for all UI and all text, human or agent. Self-host the `.woff2` in `packages/ui`, because self-hosted instances must not call Google Fonts. Code font: `ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace`.

| Token | Size / line height | Weight | Tracking | Use |
|---|---|---|---|---|
| `text-meta` | 11 / 1.3 | 400–500 | 0 | Badges, timestamps, counts, kbd |
| `text-sm` | 12 / 1.45 | 400–600 | 0 | Identifiers, secondary text, section labels, label pills, agent line on rows |
| `text-ui` | 13 / 1.45 | 400–600 | 0 | Default UI, agent progress messages, comments in the lane |
| `text-body` | 14 / 1.6 | 400 | 0 | Row titles (−0.005em), descriptions, comments. Measure capped at 68ch |
| `text-lg` | 16 / 1.4 | 600 | −0.01em | Palette input, headings inside markdown |
| `text-xl` | 20 / 1.2 | 600 | −0.015em | Create-issue title field |
| `text-2xl` | 24 / 1.15 | 600 | −0.022em | Issue title in the peek, page title |

Section labels are sentence case at `text-sm` 600 in `ink-2`, never uppercase. Numbers that change (counts, run timers) use `tabular-nums`. Inline code in UI is the code font at 0.88em, weight 500, on `hover` with radius `xs`.

## Space

4px base. Gaps come from this scale and nothing else.

| Token | Value | Typical use |
|---|---|---|
| `space-1` | 4 | Icon to text inside a badge, between kbd keys |
| `space-2` | 8 | Inside rows and chips, avatar to name |
| `space-3` | 12 | Grid gap in rows, board column gap, rail padding |
| `space-4` | 16 | Panel padding, lane padding |
| `space-5` | 20 | Rail section gap, toast offset |
| `space-6` | 24 | Peek padding, header padding |
| `space-8` | 32 | Between peek sections (description, sub-issues, relations, discussion) |

| Size | Value |
|---|---|
| Rail width | 240 |
| List row | 40 high (8 vertical padding). The agent line adds 20 |
| Group header | 34 |
| Peek | up to 1000 wide, 8 from the viewport edges. Agent lane 360 |
| Board column | 256 |
| Avatar | 22 (lists), 18 (chips, palette), 32 (lane header) |
| Hit area | at least 24×24, 32 for primary controls |

## Radius

| Token | Value | Use |
|---|---|---|
| `radius-xs` | 4 | Inline only: code, kbd, team key |
| `radius-sm` | 6 | Controls: buttons, inputs, rows, menu items, segmented control |
| `radius-md` | 10 | Surfaces: cards, agent cards, the peek, the palette, toasts |
| `radius-full` | 999 | Pills, badges, label chips, human avatars, swatches |

Agent avatars are rounded squares at 28% of their size (5 at 18, 6 at 22, 9 at 32). Human avatars are circles. The two shapes and the accent fill tell agents and humans apart even for someone who can't see the color.

## Elevation

Hairlines (`line`) by default. Only floating layers get a shadow:

- Light: `0 1px 2px oklch(0.2 0.02 260 / 0.06), 0 20px 48px -16px oklch(0.2 0.02 260 / 0.28)`
- Dark: `0 0 0 1px oklch(1 0 0 / 0.05), 0 20px 56px -16px oklch(0 0 0 / 0.75)`

## Motion

Easing for everything: `cubic-bezier(0.2, 0, 0, 1)`. Transitions name their properties, never `all`.

| Token | Value | Use |
|---|---|---|
| `duration-fast` | 140ms | Hover, scrim fade, toggles |
| `duration-base` | 220ms | Peek slide-in (16px from the right plus fade), palette rise (6px plus fade), toasts |
| `duration-flash` | 1.6s | `agent-wash` fading out of a row an agent just changed |
| `pulse-live` | 2s loop | Ring growing from the avatar of an agent with a live run, 1 → 1.35 scale while fading |
| `blink-live` | 1.6s loop | Dot in the "Working" badge |
| `thinking` | 1.2s loop, 150ms stagger | Three dots under the last update while the agent works |
| `stream` | about 110 characters a second | A new progress update types itself in, with a caret in `agent` |

Animations run once when an element appears, not on every re-render. With `prefers-reduced-motion: reduce`, loops stop, updates appear whole, and slides become plain fades.

## Components these tokens imply

- **Agent avatar**: rounded square, `agent` fill, `on-agent` initials, the `pulse-live` ring while a run is live.
- **State badge**: `text-meta` 500, `radius-full`, 20 high, sentence case. Working: `agent-wash` and `agent-ink` with a blinking dot. Needs input: `warn-wash` and `warn`. Blocked: `danger-wash` and `danger`. Done and Delegated: `hover` and `ink-2`.
- **Delegated row**: a 3px bar on the leading edge (`line-strong`, or `agent` while live) and a second line with the agent's name in `agent-ink`, the badge, the run timer and the first line of the latest update in `ink-2`.
- **Agent lane**: `lane` background, `agent-edge` border while live, updates on a 2px `agent-edge` rule (`warn` or `danger` when waiting on a human), links as outlined chips.
- **Focus**: 2px `ink` outline, 2px offset, on `:focus-visible` only. The list cursor is the same ring inside the row on a `hover` background.

## Direction: calm desk, live agents

The polish pass before v1.0 settled how screens are put together, on top of these tokens. It was approved on 2026-10-20. Humans get a quiet, dense workspace in ink. The only color and motion on screen come from agents doing work.

### One page frame

- Every page starts with a 48px page bar on a hairline: the title, led by a team key or a breadcrumb (Projects › name), then a status such as a live "Claude is working" pill, then the page's actions. At most one ink button.
- The bar stays put while the page scrolls. In the desktop app it is also the handle to drag the window by.
- A page with view options puts them in a toolbar under the bar, at least 44 high. No page has a big title above its content.
- Fields that belong to the page, like a project's status, lead and target date, sit in the bar as chips that open app menus.

### One issue row

- An issue looks the same wherever it is listed: a team's list, My issues, a project, the inbox. In order: priority, identifier, status, title, labels, the people on it and how long ago it changed.
- An issue delegated to an agent gets a second line: the agent's name in `agent-ink`, its state badge and the first line of its latest update. A 3px bar on the leading edge turns `agent` only while the run is live.
- The assignee's circle and the delegate's square sit side by side, never overlapping.

### A calmer rail

- From the top: the workspace button with New issue beside it, the search field, then Inbox, My issues and Projects.
- Agents follow, one line each, with their state badge and the issue a working agent is on.
- Then teams, each opening to Issues and Board. Connect an agent, Members, Trash, Settings and the person's own name sit at the bottom.

### Agents at a glance

- The agents page is a roster: each agent's state, queue, current issue and last activity on one row. Picking a row opens a side panel with its work, powers and access, and editing happens there.
- The Teams page is a roster too: each team's open, in-progress and delegated issues, its members and its agents.

### Show, don't announce

- An empty section folds into one quiet add-action. A heading appears once the section has content.
- Settings are split into your own preferences and the organization's, with a subnav.
- ⌘K opens on what you are likely to do next: New issue, the issues you opened last, then Go to.

### On a phone

- Below 640px a row takes two lines: the status and a title that wraps, then priority, identifier, two labels as plain dots and the people. The agent line follows, and the age goes.
- Below 768px the rail opens as a drawer from a 48px top bar holding the workspace, search, the inbox with its unread count, and the menu.
- A page's toolbar folds into one View sheet, and New issue is a 52px ink button floating over the lists.

### Don'ts

- No accent on human actions, links, selection or focus. Ink only.
- No amber or red outside an agent waiting on a human. A paused project is neutral.
- No UPPERCASE labels, and no `ink-3` text.
- No native selects or date inputs. Use the app's menus and its calendar.
- No shadows on cards in the page.
- No overlapping avatar pairs.
- No section whose only content is "No X."

## Logo

The mark is an E whose middle arm is a rounded square, the shape of an agent's avatar: humans and agents in one letter. It was picked in M6 on 2026-10-19, from five directions and two rounds.

- **Grid.** 16 × 16 with 2px strokes, the square 4 × 4 at the agent avatar's 28% corner. Every edge sits on a whole pixel at 16 and 32, so use those sizes (or multiples of 16) where you can.
- **Color.** One color: `ink`, inverted in dark. Never the accent, so it reads the same whatever accent someone picks.
- **Wordmark.** "Edict" in Instrument Sans 600 at −0.01em, the mark 8 to its left, about one and a quarter times the cap height.
- **App icon.** The mark in dark-theme `ink` on a light-theme `ink` tile, on the macOS grid (an 824px tile in 1024). Windows and Linux use the same image.
- **Avatars.** Full bleed `ink` with the mark at about 40% of the height, since GitHub, GHCR and npm crop to their own shapes.
- **Tray.** A black template image on macOS, which the system tints.

`assets/brand` holds the SVG sources. `node assets/brand/render.mjs` renders the PNGs, the favicon ICO and the touch icon from them. The Tauri shell generates its platform icons from `app-icon-1024.png` with `tauri icon`.
