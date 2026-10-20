import { expect, test } from "./fixtures.js";

// The new-issue dialog: anchored high, Enter in the title moves on instead of
// creating, and an issue can be delegated as it is created.
test("a new issue is delegated as it is created, and Enter alone creates nothing", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Cam Create", email: "cam-create@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Create", slug: "create-co" } })).json();
  const orgId = org.organization.id as string;
  const team = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })
  ).json()) as { id: string };
  const agent = await page.request.post(`/api/v1/organizations/${orgId}/agents`, {
    headers,
    data: { name: "Builder", teamIds: [team.id] },
  });
  expect(agent.ok(), await agent.text()).toBe(true);

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/create-co/teams/${team.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Engineering" })).toBeVisible();
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "New issue" });
  await expect(dialog).toBeVisible();
  const top = (await dialog.boundingBox())!.y / page.viewportSize()!.height;
  expect(top).toBeLessThan(0.2);

  await dialog.getByLabel("Title").fill("Ship the switcher");
  await dialog.getByLabel("Title").press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Description")).toBeFocused();

  await dialog.getByRole("button", { name: /Delegate|No delegate/ }).click();
  await page.getByRole("option", { name: /Builder/ }).click();
  await expect(dialog.getByText(/runner · picks up work when it next runs/)).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog).toBeHidden();

  const issue = await (await page.request.get(`/api/v1/organizations/${orgId}/issues/ENG-1`, { headers })).json();
  expect(issue.title).toBe("Ship the switcher");
  expect(issue.delegateId).not.toBeNull();
});
