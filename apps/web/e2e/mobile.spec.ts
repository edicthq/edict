import { expect, test } from "./fixtures.js";

test("on a phone, rows take two lines, the toolbar folds into View, the rail is a drawer and New issue floats", async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Pia Moss", email: "pia@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Phoneco", slug: "phoneco" } })).json();
  const base = `/api/v1/organizations/${org.organization.id}`;
  const team = await (await page.request.post(`${base}/teams`, { headers, data: { name: "Mobile", key: "MOB" } })).json();
  await page.request.post(`${base}/teams/${team.id}/issues`, {
    headers,
    data: { title: "A long title that has to wrap onto a second line on a phone instead of being cut" },
  });

  await page.goto(`/phoneco/teams/${team.id}`);
  const row = page.getByRole("button", { name: /MOB-1/ });
  await expect(row).toBeVisible();
  // The age goes, and the title wraps instead of truncating.
  await expect(row.locator("time")).toBeHidden();
  const title = row.getByText(/A long title/);
  expect((await title.boundingBox())!.height).toBeGreaterThan(30);

  // One View button instead of the toolbar.
  await expect(page.getByRole("toolbar", { name: "View options" })).toBeHidden();
  await page.getByRole("button", { name: "View", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "View" });
  await expect(sheet.getByRole("toolbar", { name: "View options" })).toBeVisible();
  await sheet.getByRole("button", { name: "Board" }).click();
  await expect(page).toHaveURL(/view=board/);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();

  // The menu opens the rail as a drawer, which closes on navigation.
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("navigation", { name: "Organization" });
  await expect(drawer).toBeVisible();
  await drawer.getByRole("link", { name: "My issues" }).click();
  await expect(page).toHaveURL(/\/phoneco\/my-issues/);
  await expect(drawer).toBeHidden();

  // New issue floats over the lists and opens the create dialog.
  await page.getByRole("button", { name: "New issue" }).click();
  await expect(page).toHaveURL(new RegExp(`/phoneco/teams/${team.id}`));
  await expect(page.getByRole("dialog").getByText("New issue", { exact: true })).toBeVisible();
});
