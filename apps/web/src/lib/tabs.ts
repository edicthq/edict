import { useSyncExternalStore } from "react";

// The desktop app's tabs. Each tab is a page of this instance, and the tab in
// front follows wherever the person goes. They are kept in this browser
// storage, which belongs to the instance's origin, so every instance the app
// switches between (ADR 0028) keeps its own tabs.

export interface Tab {
  id: string;
  // Path and query, like /edict/teams/…?view=board.
  path: string;
  // The page's title, read from its page bar.
  title: string;
}

export interface TabsState {
  tabs: Tab[];
  active: string;
}

const KEY = "edict.tabs";
const listeners = new Set<() => void>();
let counter = 0;

const newId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

function read(): TabsState | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as TabsState | null;
    if (!saved || !Array.isArray(saved.tabs) || saved.tabs.length === 0) return null;
    const tabs = saved.tabs.filter((t) => typeof t?.id === "string" && typeof t.path === "string" && t.path.startsWith("/"));
    if (tabs.length === 0) return null;
    const active = tabs.some((t) => t.id === saved.active) ? saved.active : tabs[0]!.id;
    return { tabs: tabs.map((t) => ({ id: t.id, path: t.path, title: String(t.title ?? "") })), active };
  } catch {
    return null;
  }
}

let state: TabsState | null = null;

function write(next: TabsState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage may be full or refused; the tabs still hold until reload.
  }
  for (const listener of listeners) listener();
}

// The tabs, starting from the saved ones or a single tab on `path`.
export function initTabs(path: string): TabsState {
  if (state) return state;
  const saved = read();
  // Opening the app on a page none of the tabs has, like an edict:// link,
  // puts that page in the tab in front.
  if (saved) {
    const shown = saved.tabs.find((t) => t.id === saved.active)!;
    state = shown.path === path ? saved : { ...saved, tabs: saved.tabs.map((t) => (t.id === saved.active ? { ...t, path } : t)) };
  } else {
    const id = newId();
    state = { tabs: [{ id, path, title: "" }], active: id };
  }
  return state;
}

export function useTabs(): TabsState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}

function current(): TabsState {
  if (!state) throw new Error("Tabs read before initTabs");
  return state;
}

// The tab in front moved to another page.
export function followPath(path: string) {
  const s = current();
  const active = s.tabs.find((t) => t.id === s.active);
  if (!active || active.path === path) return;
  write({ ...s, tabs: s.tabs.map((t) => (t.id === s.active ? { ...t, path } : t)) });
}

export function setActiveTitle(title: string) {
  const s = current();
  const active = s.tabs.find((t) => t.id === s.active);
  if (!active || active.title === title) return;
  write({ ...s, tabs: s.tabs.map((t) => (t.id === s.active ? { ...t, title } : t)) });
}

// A new tab on `path`, beside the one in front, and in front itself.
export function openTab(path: string): Tab {
  const s = current();
  const tab = { id: newId(), path, title: "" };
  const index = s.tabs.findIndex((t) => t.id === s.active);
  const tabs = [...s.tabs];
  tabs.splice(index + 1, 0, tab);
  write({ tabs, active: tab.id });
  return tab;
}

// Brings a tab to the front and returns it.
export function activateTab(id: string): Tab | null {
  const s = current();
  const tab = s.tabs.find((t) => t.id === id);
  if (!tab) return null;
  if (s.active !== id) write({ ...s, active: id });
  return tab;
}

// Closes a tab. Returns the tab now in front if that changed, or null. The
// last tab never closes: the window does instead.
export function closeTab(id: string): Tab | null {
  const s = current();
  if (s.tabs.length <= 1) return null;
  const index = s.tabs.findIndex((t) => t.id === id);
  if (index < 0) return null;
  const tabs = s.tabs.filter((t) => t.id !== id);
  if (s.active !== id) {
    write({ ...s, tabs });
    return null;
  }
  // Like a browser: the tab to its right comes forward, else the one before.
  const next = tabs[Math.min(index, tabs.length - 1)]!;
  write({ tabs, active: next.id });
  return next;
}

// Brings forward the tab `by` steps from the one in front, wrapping around,
// and returns it.
export function stepTab(by: 1 | -1): Tab | null {
  const s = current();
  if (s.tabs.length < 2) return null;
  const index = s.tabs.findIndex((t) => t.id === s.active);
  const tab = s.tabs[(index + by + s.tabs.length) % s.tabs.length];
  return tab ? activateTab(tab.id) : null;
}

// Moves a tab to another place in the strip.
export function moveTab(id: string, to: number) {
  const s = current();
  const from = s.tabs.findIndex((t) => t.id === id);
  if (from < 0 || from === to) return;
  const tabs = [...s.tabs];
  const [tab] = tabs.splice(from, 1);
  tabs.splice(Math.max(0, Math.min(to, tabs.length)), 0, tab!);
  write({ ...s, tabs });
}

// For tests: forget the tabs held in memory.
export function resetTabsForTest() {
  state = null;
}
