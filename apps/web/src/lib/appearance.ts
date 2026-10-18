import { useSyncExternalStore } from "react";

// Theme and accent, kept in this browser. Where they are stored for a person
// or an organization is still open (docs/design/tokens.md); until then the
// rail's Appearance section saves them here. index.html applies them before
// the first paint.

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
  accent: Accent;
}

const KEY = "edict.appearance";
const listeners = new Set<() => void>();

function read(): Appearance {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Appearance>;
    return {
      theme: themes.includes(saved.theme as Theme) ? (saved.theme as Theme) : "system",
      accent: accents.includes(saved.accent as Accent) ? (saved.accent as Accent) : "violet",
    };
  } catch {
    return { theme: "system", accent: "violet" };
  }
}

let current = read();

function apply({ theme, accent }: Appearance) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = theme;
  root.dataset.accent = accent;
}

export function setAppearance(next: Partial<Appearance>) {
  current = { ...current, ...next };
  localStorage.setItem(KEY, JSON.stringify(current));
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

export function getOrgDefaultAccent(orgId: string): Accent {
  try {
    const val = localStorage.getItem(`edict.orgAccent.${orgId}`);
    return accents.includes(val as Accent) ? (val as Accent) : "violet";
  } catch {
    return "violet";
  }
}

export function setOrgDefaultAccent(orgId: string, accent: Accent) {
  localStorage.setItem(`edict.orgAccent.${orgId}`, accent);
  for (const listener of listeners) listener();
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
