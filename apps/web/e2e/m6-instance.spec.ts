import type { Page } from "@playwright/test";
import { expect, test, type Instance } from "./fixtures.js";

// Signs Amirali in as an instance admin. Amirali is the M1 test's first user,
// and so the admin, but a failure elsewhere restarts the worker on a fresh
// instance where someone else may have signed up first; then the database
// makes Amirali an admin.
async function signInAsInstanceAdmin(page: Page, instance: Instance) {
  const headers = { origin: instance.url };
  const admin = { email: "amirali@example.com", password: "correct-horse-battery" };
  const signIn = () => page.request.post("/api/auth/sign-in/email", { headers, data: admin });
  if (!(await signIn()).ok()) {
    const signUp = await page.request.post("/api/auth/sign-up/email", { headers, data: { ...admin, name: "Amirali Beigi" } });
    expect(signUp.ok(), await signUp.text()).toBe(true);
  }
  if ((await page.request.get("/api/v1/instance/status")).status() === 403) {
    await instance.sql(`UPDATE "user" SET role = 'admin' WHERE email = '${admin.email}'`);
    expect((await signIn()).ok()).toBe(true);
  }
  expect((await page.request.get("/api/v1/instance/status")).ok()).toBe(true);
  return headers;
}

test("Milestone 6: the instance admin sees a newer release and can turn the check off", async ({ page, instance }) => {
  const headers = await signInAsInstanceAdmin(page, instance);

  await page.request.post("/api/v1/organizations", { headers, data: { name: "Updates", slug: "updates" } });
  await page.goto("/updates/instance");
  const updates = page.getByRole("region", { name: "Updates" });

  await updates.getByRole("button", { name: "Check now" }).click();
  await expect(updates.getByText(/Edict 99\.0\.0 is out/)).toBeVisible();
  await expect(updates.getByRole("link", { name: "Release notes" })).toHaveAttribute(
    "href",
    "https://github.com/edicthq/edict/releases/tag/v99.0.0",
  );

  await updates.getByRole("switch", { name: /Check for new releases/ }).uncheck();
  await expect(updates.getByText("Off. Edict does not look for new releases.")).toBeVisible();
  await expect(updates.getByRole("button", { name: "Check now" })).toHaveCount(0);
});

test("Milestone 6: the instance admin sees the exact telemetry payload and turns it on", async ({ page, instance }) => {
  const headers = await signInAsInstanceAdmin(page, instance);
  await page.request.post("/api/v1/organizations", { headers, data: { name: "Telemetry", slug: "telemetry" } });
  const { version } = (await (await page.request.get("/api/v1/instance/status")).json()) as { version: string };

  await page.goto("/telemetry/instance");
  const section = page.getByRole("region", { name: "Telemetry" });
  const payload = JSON.parse((await section.getByRole("figure", { name: "The payload, as sent" }).locator("pre").textContent()) ?? "");
  expect(Object.keys(payload).sort()).toEqual(["users", "version"]);
  expect(payload.version).toBe(version);

  const toggle = section.getByRole("switch", { name: /Share usage numbers/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.reload();
  await expect(page.getByRole("region", { name: "Telemetry" }).getByRole("switch", { name: /Share usage numbers/ })).toBeChecked();
});
