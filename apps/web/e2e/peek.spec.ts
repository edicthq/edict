import { expect, test } from "./fixtures.js";

// The peek as people use it: a click outside closes it, a click on another
// row switches to that issue, and a long title grows the field instead of
// scrolling it, in WebKit too, which has no field-sizing.
test("the peek closes on a click outside, switches on a row and fits its title", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Pat Peek", email: "pat-peek@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Peek", slug: "peek-co" } })).json();
  const orgId = org.organization.id as string;
  const team = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })
  ).json()) as { id: string };
  const long = "Desktop app keeps several Edict instances and switches between them in one window with a quick switcher";
  for (const title of [long, "Short one"]) {
    const created = await page.request.post(`/api/v1/organizations/${orgId}/teams/${team.id}/issues`, { headers, data: { title } });
    expect(created.ok(), await created.text()).toBe(true);
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/peek-co/teams/${team.id}`);
  await page.getByRole("button", { name: /ENG-1/ }).click();
  const first = page.getByRole("complementary", { name: /ENG-1/ });
  await expect(first).toBeVisible();

  // The title wraps onto several lines and shows all of them.
  const title = first.getByRole("textbox", { name: "Title" });
  await expect(title).toHaveValue(long);
  const fits = await title.evaluate((field) => field.scrollHeight <= field.clientHeight + 1 && field.clientHeight > 40);
  expect(fits).toBe(true);

  // Another row switches the peek to that issue.
  await page.getByRole("button", { name: /ENG-2/ }).click({ position: { x: 20, y: 10 } });
  await expect(page.getByRole("complementary", { name: /ENG-2/ })).toBeVisible();

  // A click on the page outside the peek, the strip of list it leaves, closes it.
  await page.getByRole("main").click({ position: { x: 24, y: 400 } });
  await expect(page.getByRole("complementary", { name: /ENG-/ })).toBeHidden();
  await expect(page).not.toHaveURL(/issue=/);
});
