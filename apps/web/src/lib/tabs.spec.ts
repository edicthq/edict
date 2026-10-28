import { beforeEach, describe, expect, it } from "vitest";
import { activateTab, closeTab, followPath, initTabs, moveTab, openTab, resetTabsForTest, stepTab } from "./tabs.js";

describe("tabs", () => {
  beforeEach(() => {
    resetTabsForTest();
    try {
      localStorage.removeItem("edict.tabs");
    } catch {
      // No storage in this runner; the tabs live in memory.
    }
  });

  it("start with one tab on the page shown, which follows the page", () => {
    const state = initTabs("/acme/inbox");
    expect(state.tabs.map((t) => t.path)).toEqual(["/acme/inbox"]);
    followPath("/acme/projects");
    expect(initTabs("/ignored").tabs[0]!.path).toBe("/acme/projects");
  });

  it("open beside the tab in front, step around and close to a neighbour", () => {
    const first = initTabs("/a").tabs[0]!;
    const second = openTab("/b");
    activateTab(first.id);
    const third = openTab("/c");
    expect(initTabs("/").tabs.map((t) => t.path)).toEqual(["/a", "/c", "/b"]);
    expect(stepTab(1)?.id).toBe(second.id);
    expect(stepTab(1)?.id).toBe(first.id);
    expect(stepTab(-1)?.id).toBe(second.id);
    // Closing the tab in front brings the one to its right forward, else the one before.
    expect(closeTab(second.id)?.id).toBe(third.id);
    moveTab(third.id, 0);
    expect(initTabs("/").tabs.map((t) => t.path)).toEqual(["/c", "/a"]);
  });

  it("never close the last tab", () => {
    const only = initTabs("/a").tabs[0]!;
    expect(closeTab(only.id)).toBeNull();
    expect(initTabs("/").tabs).toHaveLength(1);
  });
});
