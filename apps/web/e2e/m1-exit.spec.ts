import { expect, test } from "./fixtures.js";

// The M1 exit criterion (docs/PLAN.md): on a fresh instance, sign up, create an
// organization and a team, invite someone, and they join.
test("a fresh instance: set up, create an organization and a team, invite someone who joins", async ({ page, browser, baseURL }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Set up Edict" })).toBeVisible();
  await page.getByLabel("Name").fill("Amirali Beigi");
  await page.getByLabel("Email").fill("amirali@example.com");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("heading", { name: "Create an organization" })).toBeVisible();
  await page.getByLabel("Name").fill("Edict Labs");
  await expect(page.getByLabel("URL")).toHaveValue("edict-labs");
  await page.getByRole("button", { name: "Create organization" }).click();

  await expect(page).toHaveURL(/\/edict-labs$/);
  await page.getByRole("main").getByRole("button", { name: "Create team" }).click();
  const teamDialog = page.getByRole("dialog", { name: "Create team" });
  await teamDialog.getByLabel("Name").fill("Engineering");
  await expect(teamDialog.getByLabel("Key")).toHaveValue("ENG");
  await teamDialog.getByRole("button", { name: "Create team" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Engineering" })).toBeVisible();

  await page.getByRole("link", { name: "Manage" }).click();
  await page.getByRole("button", { name: "Invite people" }).click();
  const inviteDialog = page.getByRole("dialog", { name: /Invite people/ });
  await inviteDialog.getByLabel("Email").fill("mia@example.com");
  await inviteDialog.getByLabel("Engineering").check();
  await inviteDialog.getByRole("button", { name: "Create invite" }).click();
  const inviteUrl = await inviteDialog.getByLabel("Invite link").inputValue();
  expect(inviteUrl.startsWith(`${baseURL}/invite/`)).toBe(true);

  // Mia, in her own browser.
  const mia = await (await browser.newContext({ baseURL })).newPage();
  await mia.goto(inviteUrl);
  await expect(mia.getByRole("heading", { name: "Join Edict Labs" })).toBeVisible();
  await mia.getByRole("button", { name: "Create an account to join" }).click();
  await expect(mia.getByLabel("Email")).toHaveValue("mia@example.com");
  await mia.getByLabel("Name").fill("Mia Chen");
  await mia.getByLabel("Password").fill("correct-horse-battery");
  await mia.getByRole("button", { name: "Create account" }).click();
  await mia.getByRole("button", { name: "Join Edict Labs" }).click();

  await expect(mia).toHaveURL(/\/edict-labs$/);
  await expect(mia.getByRole("navigation", { name: "Organization" }).first().getByRole("link", { name: /Engineering/ })).toBeVisible();

  // Back to the owner: Mia is a member now.
  await page.reload();
  await expect(page.getByRole("main").getByText("Mia Chen", { exact: true })).toBeVisible();
});

test("signing in with a wrong password says so beside the form", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("nobody@example.com");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert")).toHaveText(/don't match/);
});
