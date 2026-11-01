import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";

// Named to run after m1-exit, which needs the instance fresh.
// The organization button's menu floats over the page, outside the sidebar
// that used to clip it, and works from the keyboard (EDI-4). The consent
// page's organization picker fills the card, and so does its list.

const LONG_NAME = "The Extraordinarily Long Named Organization of Northern Engineering Excellence";
const LONG_SLUG = "long-organization-slug";

async function signUpWithTwoOrganizations(page: Page, baseURL: string, email: string, first: string) {
  const headers = { origin: baseURL };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Orla Menu", email, password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  for (const data of [
    { name: first, slug: first.toLowerCase() },
    { name: LONG_NAME, slug: `${LONG_SLUG}-${first.toLowerCase()}` },
  ]) {
    const created = await page.request.post("/api/v1/organizations", { headers, data });
    expect(created.ok(), await created.text()).toBe(true);
  }
}

const box = async (locator: Locator) => (await locator.boundingBox())!;

// Whether the element is what the browser hits at its own center: neither
// clipped away by an overflow box nor covered.
const hitAtCenter = (locator: Locator) =>
  locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const hit = element.ownerDocument.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit !== null && (hit === element || element.contains(hit));
  });

test("the organization menu shows whole outside the sidebar, in light and dark, and its rows take clicks there", async ({ page, baseURL }) => {
  await signUpWithTwoOrganizations(page, baseURL!, "orla-menu@example.com", "Northwind");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/northwind");

  const rail = page.getByRole("navigation", { name: "Organization" }).first();
  const button = rail.getByRole("button", { name: /^Organization: Northwind/ });
  const menu = page.getByRole("menu", { name: "Switch organization" });
  const slug = menu.getByText(`${LONG_SLUG}-northwind`);
  const backgrounds: string[] = [];

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await button.click();
    await expect(menu).toBeVisible();
    // Rendered outside the sidebar, not inside it.
    await expect(rail.getByRole("menu")).toHaveCount(0);
    const railBox = await box(rail);
    const menuBox = await box(menu);
    expect(menuBox.x + menuBox.width).toBeGreaterThan(railBox.x + railBox.width);
    expect(menuBox.y).toBeGreaterThan((await box(button)).y);
    // Every row shows whole, the slug past the sidebar's edge included.
    const slugBox = await box(slug);
    expect(slugBox.x + slugBox.width).toBeGreaterThan(railBox.x + railBox.width);
    expect(await hitAtCenter(slug)).toBe(true);
    for (const item of await menu.getByRole("menuitem").all()) expect(await hitAtCenter(item)).toBe(true);
    backgrounds.push(await menu.evaluate((element) => element.ownerDocument.defaultView!.getComputedStyle(element).backgroundColor));
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  }
  // The menu follows the theme.
  expect(backgrounds[0]).not.toBe(backgrounds[1]);

  // A click on the slug, beyond the sidebar, lands on the row and switches.
  await page.emulateMedia({ colorScheme: "light" });
  await button.click();
  await slug.click();
  await expect(page).toHaveURL(new RegExp(`/${LONG_SLUG}-northwind$`));
  await expect(menu).toBeHidden();
});

test("the organization menu works from the keyboard and closes on a click outside", async ({ page, baseURL }) => {
  await signUpWithTwoOrganizations(page, baseURL!, "kit-keys@example.com", "Keyco");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/keyco");

  const rail = page.getByRole("navigation", { name: "Organization" }).first();
  const button = rail.getByRole("button", { name: /^Organization: Keyco/ });
  const menu = page.getByRole("menu", { name: "Switch organization" });
  // The organization on screen first, marked, then the others.
  const here = menu.getByRole("menuitem", { name: /^Keyco/ });
  const other = menu.getByRole("menuitem", { name: new RegExp(LONG_NAME) });
  const create = menu.getByRole("menuitem", { name: "New organization" });

  // Enter opens it on the first row; arrows move and wrap.
  await button.focus();
  await page.keyboard.press("Enter");
  await expect(menu).toBeVisible();
  await expect(button).toHaveAttribute("aria-expanded", "true");
  await expect(here).toBeFocused();
  await expect(here).toHaveAttribute("aria-current", "page");
  await page.keyboard.press("ArrowDown");
  await expect(other).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(create).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(here).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(create).toBeFocused();

  // Escape closes and gives focus back to the button.
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(button).toBeFocused();
  await expect(button).toHaveAttribute("aria-expanded", "false");

  // ArrowUp on the button opens it on the last row.
  await page.keyboard.press("ArrowUp");
  await expect(create).toBeFocused();
  await page.keyboard.press("Escape");

  // A click outside closes it.
  await button.click();
  await expect(menu).toBeVisible();
  await page.mouse.click(900, 500);
  await expect(menu).toBeHidden();

  // ArrowDown opens it, and Enter opens the focused organization.
  await button.focus();
  await page.keyboard.press("ArrowDown");
  await expect(here).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(other).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(`/${LONG_SLUG}-keyco$`));
  await expect(menu).toBeHidden();
});

test("the organization menu stays on screen on a phone and offers Switch instance in the desktop app", async ({ page, baseURL }) => {
  await signUpWithTwoOrganizations(page, baseURL!, "pip-phone@example.com", "Pocketco");
  await page.addInitScript(() => {
    Object.assign(globalThis, {
      __TAURI__: { core: { invoke: async () => undefined }, event: { listen: async () => () => {} } },
      __EDICT_DESKTOP__: Object.freeze({ platform: "windows", titleBar: "custom", version: "0.0.1" }),
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pocketco");

  await page.getByRole("button", { name: /^Organization: Pocketco/ }).click();
  const menu = page.getByRole("menu", { name: "Switch organization" });
  await expect(menu).toBeVisible();
  const menuBox = await box(menu);
  expect(menuBox.x).toBeGreaterThanOrEqual(0);
  expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(390);
  await expect(menu.getByRole("menuitem")).toHaveText([/^Pocketco/, new RegExp(LONG_NAME), "New organization", /^Switch instance…/]);
  for (const item of await menu.getByRole("menuitem").all()) expect(await hitAtCenter(item)).toBe(true);
});

test("the consent page's organization picker and its list fill the card, and a long name truncates", async ({ page, baseURL }) => {
  await signUpWithTwoOrganizations(page, baseURL!, "cora-consent@example.com", "Consentco");
  await page.setViewportSize({ width: 1280, height: 800 });
  // An unknown client still shows the page; only Allow would fail.
  await page.goto("/oauth/consent?client_id=unknown-client");
  await expect(page.getByRole("heading", { name: /^Connect .* to Edict$/ })).toBeVisible();

  // The card's rows share its 16px padding on each side.
  const card = page.getByRole("list", { name: "What it can do" });
  const picker = page.getByRole("button", { name: /^Organization: / });
  await expect(page.getByText("Organization", { exact: true })).toBeVisible();

  // Pick the long name, then measure.
  await picker.click();
  await page.getByRole("option", { name: LONG_NAME }).click();
  await expect(picker).toHaveAccessibleName(`Organization: ${LONG_NAME}`);

  const cardBox = await box(card);
  const pickerBox = await box(picker);
  expect(Math.abs(pickerBox.width - (cardBox.width - 32))).toBeLessThanOrEqual(1);
  expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  const truncated = (locator: Locator) => locator.evaluate((element) => element.scrollWidth > element.clientWidth);
  expect(await truncated(picker.getByText(LONG_NAME))).toBe(true);

  // The list is as wide as the picker, right under it, and its long row
  // truncates too.
  await picker.click();
  const list = page.getByRole("listbox", { name: "Organization" });
  await expect(list).toBeVisible();
  const panelBox = await box(list.locator(".."));
  expect(Math.abs(panelBox.width - pickerBox.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(panelBox.x - pickerBox.x)).toBeLessThanOrEqual(1);
  expect(await truncated(list.getByRole("option", { name: LONG_NAME }).getByText(LONG_NAME))).toBe(true);
});
