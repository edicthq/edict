import { beforeEach, describe, expect, it } from "vitest";
import {
  bindingOf,
  formatShortcut,
  getBindings,
  matchesShortcut,
  resetShortcut,
  setShortcut,
  shortcutConflict,
} from "./shortcuts.js";

// "mod" is ⌘ on a Mac and Ctrl elsewhere, wherever the tests run.
const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
type Mods = Partial<Pick<KeyboardEvent, "altKey" | "shiftKey" | "repeat">> & { mod?: boolean };
const press = (code: string, { mod = false, ...rest }: Mods = {}) =>
  ({
    code,
    metaKey: mac && mod,
    ctrlKey: !mac && mod,
    altKey: false,
    shiftKey: false,
    repeat: false,
    ...rest,
  }) as KeyboardEvent;

describe("shortcuts", () => {
  beforeEach(() => resetShortcut());

  it("spells a key press from the physical key, modifiers first", () => {
    expect(bindingOf(press("KeyB", { mod: true }))).toBe("mod+b");
    expect(bindingOf(press("KeyK", { mod: true, shiftKey: true }))).toBe("mod+shift+k");
    expect(bindingOf(press("Slash"))).toBe("/");
    expect(bindingOf(press("Digit1", { altKey: true }))).toBe("alt+1");
    expect(bindingOf(press("ShiftLeft", { shiftKey: true }))).toBeNull();
  });

  it("reads as the platform writes it", () => {
    expect(formatShortcut("mod+b")).toBe(mac ? "⌘B" : "Ctrl+B");
    expect(formatShortcut("mod+shift+k")).toBe(mac ? "⌘⇧K" : "Ctrl+Shift+K");
    expect(formatShortcut("c")).toBe("C");
  });

  it("starts with ⌘B or Ctrl+B for the sidebar and takes a new binding", () => {
    expect(getBindings().toggleSidebar).toBe("mod+b");
    setShortcut("toggleSidebar", "mod+\\");
    expect(matchesShortcut(press("Backslash", { mod: true }), "toggleSidebar", false)).toBe(true);
    expect(matchesShortcut(press("KeyB", { mod: true }), "toggleSidebar", false)).toBe(false);
    resetShortcut("toggleSidebar");
    expect(getBindings().toggleSidebar).toBe("mod+b");
  });

  it("leaves typing alone, except a ⌘ shortcut that asks to run there", () => {
    expect(matchesShortcut(press("KeyC"), "newIssue", true)).toBe(false);
    expect(matchesShortcut(press("KeyB", { mod: true }), "toggleSidebar", true)).toBe(false);
    expect(matchesShortcut(press("KeyK", { mod: true }), "openPalette", true)).toBe(true);
    expect(matchesShortcut(press("KeyK", { mod: true, repeat: true }), "openPalette", false)).toBe(false);
  });

  it("refuses keys the app keeps and keys another shortcut has", () => {
    expect(shortcutConflict("newIssue", "j")).toMatch(/kept for the next issue/);
    expect(shortcutConflict("newIssue", "mod+z")).toMatch(/kept for undo/);
    expect(shortcutConflict("newIssue", "t")).toMatch(/already does "Toggle theme"/);
    expect(shortcutConflict("newIssue", "n")).toBeNull();
    expect(shortcutConflict("newIssue", "c")).toBeNull();
  });
});
