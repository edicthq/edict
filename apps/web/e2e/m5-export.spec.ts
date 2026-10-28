import { stat } from "node:fs/promises";
import { expect, test } from "./fixtures.js";

test("Milestone 5: an owner downloads the organization export from settings", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Eda Reyes", email: "eda@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);

  const org = (await (
    await page.request.post("/api/v1/organizations", {
      headers,
      data: { name: "Edictco", slug: "edictco" },
    })
  ).json()) as { organization: { id: string } };
  const orgId = org.organization.id;

  const engTeam = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, {
      headers,
      data: { name: "Engineering", key: "ENG" },
    })
  ).json()) as { id: string };
  await page.request.post(`/api/v1/organizations/${orgId}/teams/${engTeam.id}/issues`, {
    headers,
    data: { title: "First" },
  });

  await page.goto("/edictco/settings/organization");
  const button = page.getByRole("button", { name: "Download export" });
  await expect(button).toBeVisible();

  const download = page.waitForEvent("download");
  await button.click();
  const file = await download;
  await expect(page.getByText("Export downloaded")).toBeVisible();

  // The response names the file, so the browser saves the org's own name.
  expect(file.suggestedFilename()).toBe("edictco-edict-export.zip");
  const path = await file.path();
  expect((await stat(path!)).size).toBeGreaterThan(200);
});
