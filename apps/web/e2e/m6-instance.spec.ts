import { expect, test } from "./fixtures.js";

test("Milestone 6: the instance admin sees a newer release and can turn the check off", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  // The instance admin is whoever signed up first: Amirali, from the M1 test,
  // or Amirali now when this test runs on its own against a fresh instance.
  const admin = { email: "amirali@example.com", password: "correct-horse-battery" };
  const signIn = await page.request.post("/api/auth/sign-in/email", { headers, data: admin });
  if (!signIn.ok()) {
    const signUp = await page.request.post("/api/auth/sign-up/email", { headers, data: { ...admin, name: "Amirali Beigi" } });
    expect(signUp.ok(), await signUp.text()).toBe(true);
  }
  expect((await page.request.get("/api/v1/instance/status")).ok()).toBe(true);

  await page.request.post("/api/v1/organizations", { headers, data: { name: "Updates", slug: "updates" } });
  await page.goto("/updates/instance");
  const updates = page.getByRole("region", { name: "Updates" });

  await updates.getByRole("button", { name: "Check now" }).click();
  await expect(updates.getByText(/Edict 99\.0\.0 is out/)).toBeVisible();
  await expect(updates.getByRole("link", { name: "Release notes" })).toHaveAttribute(
    "href",
    "https://github.com/edicthq/edict/releases/tag/v99.0.0",
  );

  await updates.getByRole("checkbox", { name: /Check for new releases/ }).uncheck();
  await expect(updates.getByText("Off. Edict does not look for new releases.")).toBeVisible();
  await expect(updates.getByRole("button", { name: "Check now" })).toHaveCount(0);
});

test("Milestone 6: the instance admin sees the exact telemetry payload and turns it on", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const admin = { email: "amirali@example.com", password: "correct-horse-battery" };
  const signIn = await page.request.post("/api/auth/sign-in/email", { headers, data: admin });
  if (!signIn.ok()) {
    const signUp = await page.request.post("/api/auth/sign-up/email", { headers, data: { ...admin, name: "Amirali Beigi" } });
    expect(signUp.ok(), await signUp.text()).toBe(true);
  }
  await page.request.post("/api/v1/organizations", { headers, data: { name: "Telemetry", slug: "telemetry" } });
  const { version } = (await (await page.request.get("/api/v1/instance/status")).json()) as { version: string };

  await page.goto("/telemetry/instance");
  const section = page.getByRole("region", { name: "Telemetry" });
  const payload = JSON.parse((await section.getByLabel("Telemetry payload").textContent()) ?? "");
  expect(Object.keys(payload).sort()).toEqual(["users", "version"]);
  expect(payload.version).toBe(version);

  const toggle = section.getByRole("checkbox", { name: /Share usage numbers/ });
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await page.reload();
  await expect(page.getByRole("region", { name: "Telemetry" }).getByRole("checkbox", { name: /Share usage numbers/ })).toBeChecked();
});
