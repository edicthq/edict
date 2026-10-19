import { useSyncExternalStore } from "react";

// Theme and accent. A person's choices are kept in this browser; the accent
// they have not chosen comes from their organization's default, which the
// server keeps (Organization.defaultAccent) and the org layout passes in.
// index.html applies the last ones seen before the first paint.

export const themes = ["system", "light", "dark"] as const;
export type Theme = (typeof themes)[number];

export const accents = ["violet", "blue", "teal", "pink", "lime"] as const;
export type Accent = (typeof accents)[number];

export const accentNames: Record<Accent, string> = {
  violet: "Violet",
  blue: "Blue",
  teal: "Teal",
  pink: "Pink",
  lime: "Lime",
};

interface Appearance {
  theme: Theme;
  // The accent in use: the person's own, else the organization's default.
  accent: Accent;
  // The one the person picked, if they did.
  chosenAccent: Accent | null;
}

interface Saved {
  theme?: Theme;
  accent?: Accent | null;
  // The last organization default seen, only so the first paint is right.
  orgAccent?: Accent;
}

const KEY = "edict.appearance";
const listeners = new Set<() => void>();

function read(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Saved;
    return {
      theme: themes.includes(saved.theme as Theme) ? saved.theme : "system",
      accent: accents.includes(saved.accent as Accent) ? saved.accent : null,
      orgAccent: accents.includes(saved.orgAccent as Accent) ? saved.orgAccent : undefined,
    };
  } catch {
    return { theme: "system", accent: null };
  }
}

let saved = read();
let orgAccent: Accent = saved.orgAccent ?? "violet";
let current = resolve();

function resolve(): Appearance {
  return { theme: saved.theme ?? "system", accent: saved.accent ?? orgAccent, chosenAccent: saved.accent ?? null };
}

function store() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...saved, orgAccent }));
  } catch {
    // A browser that keeps nothing still shows the right colors now.
  }
}

function apply({ theme, accent }: Appearance) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
  root.dataset.accent = accent;
}

// Sets the person's theme or accent; an accent of null goes back to the
// organization's default.
export function setAppearance(next: { theme?: Theme; accent?: Accent | null }) {
  saved = { ...saved, ...next };
  store();
  update();
}

// The organization's default accent, from the server.
export function setOrganizationAccent(accent: Accent) {
  if (accent === orgAccent) return;
  orgAccent = accent;
  store();
  update();
}

function update() {
  current = resolve();
  // Switch without animating every color on the page.
  const root = document.documentElement;
  root.classList.add("no-transition");
  apply(current);
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("no-transition")));
  for (const listener of listeners) listener();
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
  );
}

export function cycleTheme() {
  const isDark = current.theme === "dark" || (current.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const nextTheme: Theme = isDark ? "light" : "dark";
  setAppearance({ theme: nextTheme });
}

export function cycleAccent() {
  const idx = accents.indexOf(current.accent);
  const nextAccent = accents[(idx + 1) % accents.length]!;
  setAppearance({ accent: nextAccent });
}

export function isTyping(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    document.querySelector("dialog[open]") !== null
  );
}
