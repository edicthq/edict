import { expect, test } from "./fixtures.js";

test("Milestone 5: Projects cross-team tracking, progress metrics, and My Issues", async ({
  page,
  baseURL,
}) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Nadia Cole", email: "nadia@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);

  const org = await (
    await page.request.post("/api/v1/organizations", {
      headers,
      data: { name: "Projectco", slug: "projectco" },
    })
  ).json();
  const orgId = org.organization.id as string;

  const engTeam = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, {
      headers,
      data: { name: "Engineering", key: "ENG" },
    })
  ).json()) as { id: string };

  const desTeam = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, {
      headers,
      data: { name: "Design", key: "DES" },
    })
  ).json()) as { id: string };

  // 1. Visit projects page
  await page.goto("/projectco/projects");
  await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
  await expect(page.getByText("No projects yet")).toBeVisible();

  // 2. Create a new project via UI
  await page.getByRole("button", { name: "New project" }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByPlaceholder("Mobile App Redesign").fill("Core Redesign");
  await page.getByRole("dialog", { name: "Create project" }).getByRole("button", { name: "Create project" }).click();

  // 3. Verify redirected to detail page
  await expect(page).toHaveURL(/\/projectco\/projects\/core-redesign/);
  await expect(page.getByRole("heading", { name: "Core Redesign" })).toBeVisible();
  await expect(page.getByText("0% completed")).toBeVisible();
  await expect(page.getByText("No issues in this project yet")).toBeVisible();

  // Get project ID
  const projectsRes = await (
    await page.request.get(`/api/v1/organizations/${orgId}/projects`, { headers })
  ).json();
  const projectId = projectsRes[0].id as string;

  // 4. Create cross-team issues linked to project via API
  const engIssue = await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams/${engTeam.id}/issues`, {
      headers,
      data: {
        title: "Build backend API",
        projectId,
        estimate: 5,
      },
    })
  ).json();

  const desIssue = await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams/${desTeam.id}/issues`, {
      headers,
      data: {
        title: "Create mobile prototypes",
        projectId,
        estimate: 3,
      },
    })
  ).json();

  // 5. Reload project detail page and verify cross-team issues appear
  await page.reload();
  await expect(page.getByText("Build backend API")).toBeVisible();
  await expect(page.getByText("Create mobile prototypes")).toBeVisible();
  await expect(page.getByText("0 of 2 issues")).toBeVisible();
  await expect(page.getByText("0 of 8 points")).toBeVisible();

  // 6. Navigation rail check
  const nav = page.getByRole("navigation", { name: "Organization" });
  await expect(nav.getByRole("link", { name: "Projects" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "My issues" })).toBeVisible();

  // 7. Visit My Issues page
  await nav.getByRole("link", { name: "My issues" }).click();
  await expect(page).toHaveURL(/\/projectco\/my-issues/);
  await expect(page.getByRole("heading", { name: "My issues" })).toBeVisible();
});
