import { expect, test } from "./fixtures.js";

// Named to run after m1-exit, which needs the instance fresh.
// The web app as the desktop shell shows it, with the shell's globals stood in
// for (apps/desktop, ADR 0004): a top bar with tabs, back and forward, and on
// Windows and Linux the window's own buttons.
test("the desktop app's tabs open, follow the page, switch, close and stay", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Tess Tabs", email: "tess-tabs@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  await page.request.post("/api/v1/organizations", { headers, data: { name: "Tabs", slug: "tabs-co" } });

  await page.addInitScript(() => {
    const calls: unknown[] = [];
    Object.assign(globalThis, {
      __calls: calls,
      __TAURI__: {
        core: { invoke: async (command: string, args?: unknown) => void calls.push([command, args ?? null]) },
        event: { listen: async () => () => {} },
      },
      __EDICT_DESKTOP__: Object.freeze({ platform: "windows", titleBar: "custom", version: "0.0.1" }),
    });
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/tabs-co/inbox");

  const tabs = page.getByRole("tablist", { name: "Tabs" }).getByRole("tab");
  await expect(tabs).toHaveCount(1);
  await expect(tabs.first()).toHaveText("Inbox");

  // A new tab opens on My issues, beside the first, and in front.
  await page.keyboard.press("ControlOrMeta+t");
  await expect(tabs).toHaveCount(2);
  await expect(page).toHaveURL(/\/tabs-co\/my-issues$/);
  await expect(tabs.nth(1)).toHaveText("My issues");
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

  // The tab in front follows the page.
  await page.getByRole("navigation", { name: "Organization" }).getByRole("link", { name: "Projects" }).click();
  await expect(tabs.nth(1)).toHaveText("Projects");

  // Switching brings the other tab's page back.
  await tabs.first().click();
  await expect(page).toHaveURL(/\/tabs-co\/inbox$/);
  await page.keyboard.press("Control+Tab");
  await expect(page).toHaveURL(/\/tabs-co\/projects$/);

  // Tabs survive a reload.
  await page.reload();
  await expect(tabs).toHaveCount(2);
  await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");

  // Dragging a tab moves it in the strip, without switching to it twice.
  const from = (await tabs.nth(1).boundingBox())!;
  const to = (await tabs.first().boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 8, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(tabs.first()).toHaveText("Projects");
  await expect(tabs.nth(1)).toHaveText("Inbox");
  await expect(tabs.first()).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/\/tabs-co\/projects$/);

  // Closing the tab in front brings its neighbour forward; the last tab
  // closes the window instead.
  await page.keyboard.press("ControlOrMeta+w");
  await expect(tabs).toHaveCount(1);
  await expect(page).toHaveURL(/\/tabs-co\/inbox$/);
  await page.keyboard.press("ControlOrMeta+w");
  await expect(tabs).toHaveCount(1);

  // The window's own buttons, and ⌃1 for the first instance, go to the shell.
  await page.getByRole("button", { name: "Minimize" }).click();
  await page.keyboard.press("Control+Digit1");
  const calls = await page.evaluate(() => (globalThis as unknown as { __calls: [string, unknown][] }).__calls);
  expect(calls.map(([command]) => command)).toEqual(
    expect.arrayContaining(["plugin:window|close", "plugin:window|minimize", "switch_instance_at"]),
  );
  expect(calls.find(([command]) => command === "switch_instance_at")?.[1]).toEqual({ index: 0 });
});
