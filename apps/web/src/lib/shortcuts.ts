import { useSyncExternalStore } from "react";

// The app-wide shortcuts a person can rebind in Preferences, kept in this
// browser like the theme. The list's own keys (J and K, X, S, P, A, D, Enter,
// Esc, Backspace) work as one set and stay as they are.
//
// A binding is its parts joined with "+": "mod" (⌘ on a Mac, Ctrl elsewhere),
// "ctrl" (the Mac's Control), "alt", "shift", then the key, like "mod+b" or
// "c". Keys come from the physical key, so ⌥ on a Mac still names the letter.

export const shortcutActions = [
  { id: "toggleSidebar", label: "Show or hide the sidebar", default: "mod+b" },
  { id: "openPalette", label: "Open the command menu", default: "mod+k", whileTyping: true },
  { id: "newIssue", label: "New issue", default: "c" },
  { id: "toggleView", label: "Switch between list and board", default: "v" },
  { id: "focusSearch", label: "Search the team's issues", default: "/" },
  { id: "toggleTheme", label: "Toggle theme", default: "t" },
  { id: "cycleAccent", label: "Cycle agent color", default: "g" },
] as const;

export type ShortcutAction = (typeof shortcutActions)[number]["id"];
export type Bindings = Record<ShortcutAction, string>;

// Keys the app keeps for itself, so no shortcut can take them.
const reserved: Record<string, string> = {
  j: "the next issue",
  k: "the previous issue",
  x: "selecting an issue",
  s: "setting status",
  p: "setting priority",
  a: "setting the assignee",
  d: "setting the delegate",
  enter: "opening an issue",
  escape: "closing",
  backspace: "deleting",
  delete: "deleting",
  tab: "moving focus",
  "mod+z": "undo",
  "mod+c": "copy",
  "mod+v": "paste",
  "mod+x": "cut",
  "mod+a": "select all",
  "mod+[": "back",
  "mod+]": "forward",
  "mod+,": "settings",
  "mod+n": "a new issue in the desktop app",
  "mod+t": "a new tab in the desktop app",
  "mod+shift+[": "the previous tab",
  "mod+shift+]": "the next tab",
  "ctrl+tab": "the next tab",
  "mod+tab": "the next tab",
  "mod+q": "quitting",
  "mod+w": "closing the tab or window",
  "mod+r": "reloading",
  "mod+enter": "sending",
};

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const codeKeys: Record<string, string> = {
  BracketLeft: "[",
  BracketRight: "]",
  Slash: "/",
  Backslash: "\\",
  Comma: ",",
  Period: ".",
  Semicolon: ";",
  Quote: "'",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Space: "space",
  Enter: "enter",
  NumpadEnter: "enter",
  Escape: "escape",
  Backspace: "backspace",
  Delete: "delete",
  Tab: "tab",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

// The key a press names, or null for a modifier on its own.
function keyOf(event: KeyboardEvent): string | null {
  const { code } = event;
  if (code.startsWith("Key")) return code.slice(3).toLowerCase();
  if (code.startsWith("Digit")) return code.slice(5);
  if (codeKeys[code]) return codeKeys[code];
  if (/^F\d{1,2}$/.test(code)) return code.toLowerCase();
  return null;
}

// The binding a key press spells, like "mod+b", or null for a lone modifier.
export function bindingOf(event: KeyboardEvent): string | null {
  const key = keyOf(event);
  if (!key) return null;
  const parts: string[] = [];
  if (isMac ? event.metaKey : event.ctrlKey) parts.push("mod");
  if (isMac && event.ctrlKey) parts.push("ctrl");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

const symbols: Record<string, string> = isMac
  ? { mod: "⌘", ctrl: "⌃", alt: "⌥", shift: "⇧" }
  : { mod: "Ctrl", ctrl: "Ctrl", alt: "Alt", shift: "Shift" };
const keyNames: Record<string, string> = {
  space: "Space",
  enter: "↵",
  escape: "Esc",
  backspace: "⌫",
  delete: "Del",
  tab: "Tab",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
};

// How a binding reads on a key hint: "⌘B" on a Mac, "Ctrl+B" elsewhere.
export function formatShortcut(binding: string): string {
  const parts = binding.split("+");
  const key = parts.pop() ?? "";
  const label = keyNames[key] ?? key.toUpperCase();
  const mods = parts.map((part) => symbols[part] ?? part);
  return isMac ? [...mods, label].join("") : [...mods, label].join("+");
}

const KEY = "edict.shortcuts";
const listeners = new Set<() => void>();
const defaults = Object.fromEntries(shortcutActions.map((action) => [action.id, action.default])) as Bindings;

function read(): Bindings {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Record<string, unknown>>;
    const bindings = { ...defaults };
    for (const action of shortcutActions) {
      const value = saved[action.id];
      if (typeof value === "string" && value) bindings[action.id] = value;
    }
    return bindings;
  } catch {
    return { ...defaults };
  }
}

let bindings = read();

function write(next: Bindings) {
  bindings = next;
  const changed = Object.fromEntries(shortcutActions.filter((a) => next[a.id] !== a.default).map((a) => [a.id, next[a.id]]));
  try {
    localStorage.setItem(KEY, JSON.stringify(changed));
  } catch {
    // Private windows may refuse storage; the binding still holds until reload.
  }
  for (const listener of listeners) listener();
}

export function getBindings(): Bindings {
  return bindings;
}

export function useShortcuts(): Bindings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => bindings,
  );
}

// Why a binding can't be used for this action, or null when it can.
export function shortcutConflict(action: ShortcutAction, binding: string): string | null {
  const keeper = reserved[binding];
  if (keeper) return `${formatShortcut(binding)} is kept for ${keeper}.`;
  const other = shortcutActions.find((a) => a.id !== action && bindings[a.id] === binding);
  if (other) return `${formatShortcut(binding)} already does "${other.label}".`;
  return null;
}

export function setShortcut(action: ShortcutAction, binding: string) {
  write({ ...bindings, [action]: binding });
}

export function resetShortcut(action?: ShortcutAction) {
  write(action ? { ...bindings, [action]: defaults[action] } : { ...defaults });
}

export function isDefaultShortcut(action: ShortcutAction): boolean {
  return bindings[action] === defaults[action];
}

// Whether a key press runs this action. A plain key never fires while the
// person types; a shortcut with ⌘ or Ctrl does only for actions that say so,
// like the command menu, so ⌘B still makes text bold in an editor.
export function matchesShortcut(event: KeyboardEvent, action: ShortcutAction, typing: boolean): boolean {
  if (event.repeat) return false;
  const binding = bindingOf(event);
  if (!binding || binding !== bindings[action]) return false;
  if (!typing) return true;
  const spec = shortcutActions.find((a) => a.id === action);
  return Boolean(spec && "whileTyping" in spec && spec.whileTyping && binding.includes("mod"));
}
