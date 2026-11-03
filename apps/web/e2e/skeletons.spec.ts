import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";

// Pages stand in as skeletons while they load: nothing for the first
// 150 ms, then blocks that fade in and pulse, then a crossfade into the rows;
// under reduced motion they appear and leave at once and stand still. Screen
// readers hear a status, and no "Loading…" text is left.

interface Timeline {
  added: number[];
  shown: { at: number; how: string }[];
  leavingAdded: number;
  leavingRemoved: number;
}

// Records, in the page, when a skeleton is added, when it shows and when the
// copy that fades out over the content comes and goes. Browser code, as a
// string: the e2e types have no DOM.
const watcher = `(() => {
  const timeline = { added: [], shown: [], leavingAdded: 0, leavingRemoved: 0 };
  window.__skeletons = timeline;
  const seen = new WeakSet();
  const status = ".skeleton[role=status]";
  new MutationObserver((records) => {
    const now = performance.now();
    for (const record of records) {
      if (record.type === "attributes" && record.target.matches(status) && record.target.dataset.shown) {
        timeline.shown.push({ at: now, how: record.target.dataset.shown });
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches("[data-skeleton-leaving]")) timeline.leavingAdded ||= now;
        for (const el of [node, ...node.querySelectorAll(status)]) {
          if (el.matches(status) && !seen.has(el)) {
            seen.add(el);
            timeline.added.push(now);
          }
        }
      }
      for (const node of record.removedNodes) {
        if (node instanceof HTMLElement && node.matches("[data-skeleton-leaving]")) timeline.leavingRemoved ||= now;
      }
    }
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-shown"] });
})()`;

const watchSkeletons = (page: Page) => page.evaluate(watcher);

const timeline = (page: Page) => page.evaluate(() => (globalThis as unknown as { __skeletons: Timeline }).__skeletons);

// Holds My issues' requests until released, so its skeleton stays up; once
// released, they and any later ones go through.
async function holdMyWork(page: Page) {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/organizations/*/my-work**", async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

async function setUp(page: Page, baseURL: string, who: string, slug: string) {
  const headers = { origin: baseURL };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: who, email: `${who.toLowerCase()}@example.com`, password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: `${who} Co`, slug } })).json();
  const v1 = `/api/v1/organizations/${org.organization.id}`;
  const team = await (await page.request.post(`${v1}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })).json();
  for (const title of ["Ship the skeletons", "Measure the rows"]) {
    const created = await page.request.post(`${v1}/teams/${team.id}/issues`, {
      headers,
      data: { title, assigneeId: org.member.id },
    });
    expect(created.ok(), await created.text()).toBe(true);
  }
}

// Opens Teams, waits until no skeleton has been on screen for a while, then
// goes to My issues with its request held.
async function openMyIssuesHeld(page: Page, slug: string) {
  await page.goto(`/${slug}`);
  await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
  await page.waitForTimeout(300);
  const release = await holdMyWork(page);
  await watchSkeletons(page);
  await page.getByRole("navigation", { name: "Organization" }).getByRole("link", { name: "My issues" }).click();
  return release;
}

const skeleton = (page: Page) => page.locator(".skeleton[role=status]").filter({ hasText: "Loading your work" });

test("a skeleton waits 150 ms, fades in, pulses and crossfades into the rows, in light and dark", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await setUp(page, baseURL!, "Sana", "skeleton-co");
  const blockColor: Record<string, string> = {};

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: scheme });
    const release = await openMyIssuesHeld(page, "skeleton-co");
    const status = skeleton(page);

    // It is there at once for screen readers, but shows only after the delay.
    await expect(status).toBeAttached();
    await expect(status.locator(".sr-only")).toHaveText("Loading your work");
    await expect(status).toHaveAttribute("data-shown", "fade");
    const { added, shown } = await timeline(page);
    expect(added.length).toBeGreaterThan(0);
    expect(shown[0]!.how).toBe("fade");
    expect(shown[0]!.at - added[0]!).toBeGreaterThanOrEqual(145);
    await expect(status).toHaveCSS("opacity", "1");

    // Its blocks pulse, in the theme's color.
    const block = status.locator(".skeleton-block").first();
    await expect(block).toHaveCSS("animation-name", "skeleton-pulse");
    const firstBlock = `document.querySelector(".skeleton[role=status] .skeleton-block")`;
    expect(await page.evaluate(`${firstBlock}.getAnimations().some((a) => a.playState === "running")`)).toBe(true);
    blockColor[scheme] = String(await page.evaluate(`getComputedStyle(${firstBlock}).backgroundColor`));
    expect(blockColor[scheme]).not.toMatch(/^(transparent|rgba\(0, 0, 0, 0\))$/);
    const firstRow = await status.locator(".skeleton-block").first().evaluate((el) => el.parentElement!.getBoundingClientRect().top);

    // The rows arrive under a copy of the skeleton that fades out, then goes.
    release();
    const row = page.getByRole("link", { name: /Ship the skeletons|Measure the rows/ }).first();
    await expect(row).toBeVisible();
    await expect(status).toHaveCount(0);
    await expect.poll(async () => (await timeline(page)).leavingAdded).toBeGreaterThan(0);
    await expect.poll(async () => (await timeline(page)).leavingRemoved).toBeGreaterThan(0);
    await expect(page.locator("[data-skeleton-leaving]")).toHaveCount(0);
    // The first row lands where the skeleton's first row was.
    const rowTop = await row.evaluate((el) => el.getBoundingClientRect().top);
    expect(Math.abs(rowTop - firstRow)).toBeLessThanOrEqual(1);
    await expect(page.getByText("Loading…")).toHaveCount(0);
  }
  expect(blockColor.light).not.toBe(blockColor.dark);
});

test("under reduced motion a skeleton still waits, then appears and leaves at once and stands still", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await setUp(page, baseURL!, "Rumi", "skeleton-still");
  const release = await openMyIssuesHeld(page, "skeleton-still");
  const status = skeleton(page);

  await expect(status).toHaveAttribute("data-shown", "whole");
  const { added, shown } = await timeline(page);
  expect(shown[0]!.at - added[0]!).toBeGreaterThanOrEqual(145);
  await expect(status.locator(".skeleton-block").first()).toHaveCSS("animation-name", "none");

  release();
  await expect(page.getByRole("link", { name: /Ship the skeletons/ })).toBeVisible();
  await expect(status).toHaveCount(0);
  await page.waitForTimeout(100);
  expect((await timeline(page)).leavingAdded).toBe(0);
});

test("a load that ends inside 150 ms never shows its skeleton", async ({ page, baseURL }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await setUp(page, baseURL!, "Kian", "skeleton-fast");
  await page.goto("/skeleton-fast");
  await expect(page.getByRole("heading", { level: 1, name: "Teams" })).toBeVisible();
  await expect(page.locator(".skeleton")).toHaveCount(0);
  await page.waitForTimeout(300);
  // Fulfilled at once from a canned answer, well inside the delay.
  await page.route("**/api/v1/organizations/*/my-work**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
  );
  await watchSkeletons(page);
  await page.getByRole("navigation", { name: "Organization" }).getByRole("link", { name: "My issues" }).click();
  await expect(page.getByText("All clear")).toBeVisible();
  await page.waitForTimeout(300);
  const { shown, leavingAdded } = await timeline(page);
  expect(shown).toEqual([]);
  expect(leavingAdded).toBe(0);
});
