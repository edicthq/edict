import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures.js";

// Runs after m1-exit.spec.ts on the same instance (files run in name order, one
// worker), which has set the instance up. This user signs up through the API.
async function orgWithTeam(request: APIRequestContext, baseURL: string) {
  const headers = { origin: baseURL };
  const signUp = await request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Lena Park", email: "lena@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok()).toBe(true);
  const org = await (await request.post("/api/v1/organizations", { headers, data: { name: "Acme", slug: "acme" } })).json();
  const orgId = org.organization.id as string;
  const team = await (
    await request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })
  ).json();
  return { orgId, team: team as { id: string; version: number } };
}

test("create an issue, change its status in the peek, see it on the board, and follow an old identifier", async ({
  page,
  baseURL,
}) => {
  const { orgId, team } = await orgWithTeam(page.request, baseURL!);
  await page.goto(`/acme/teams/${team.id}`);
  await expect(page.getByText("No issues yet")).toBeVisible();

  // Create from the keyboard.
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "New issue" });
  await dialog.getByLabel("Title").fill("Keep old identifiers resolving");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog).toBeHidden();
  const todo = page.getByRole("region", { name: "Todo" });
  await expect(todo.getByRole("button", { name: /ENG-1 Keep old identifiers resolving/ })).toBeVisible();

  // Open the peek, change the status with S, write a description.
  await todo.getByRole("button", { name: /ENG-1/ }).click();
  const peek = page.getByRole("complementary", { name: /ENG-1 Keep old identifiers resolving/ });
  await expect(peek).toBeVisible();
  await page.keyboard.press("s");
  await page.getByRole("combobox", { name: "Change status" }).fill("in prog");
  await page.keyboard.press("Enter");
  await expect(peek.getByRole("button", { name: /Status: In Progress/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "In Progress" }).getByRole("button", { name: /ENG-1/ })).toBeVisible();

  // Escape leaves the field, which saves it; a second Escape closes the peek.
  await peek.getByLabel("Description").fill("Agents hold identifiers in **context**.");
  await peek.getByLabel("Description").press("Escape");
  await expect
    .poll(async () => (await (await page.request.get(`/api/v1/organizations/${orgId}/issues/ENG-1`)).json()).description)
    .toBe("Agents hold identifiers in **context**.");

  // The board shows it in its column.
  await page.keyboard.press("Escape");
  await expect(peek).toBeHidden();
  await page.keyboard.press("v");
  await expect(page).toHaveURL(/view=board/);
  await expect(page.getByRole("region", { name: "In Progress" }).getByRole("button", { name: /ENG-1/ })).toBeVisible();

  // After a key rename, a link with the old identifier opens the issue under
  // its new one.
  const renamed = await page.request.patch(`/api/v1/organizations/${orgId}/teams/${team.id}`, {
    headers: { origin: baseURL! },
    data: { version: team.version, key: "CORE" },
  });
  expect(renamed.ok()).toBe(true);
  await page.goto("/acme/issue/ENG-1");
  await expect(page).toHaveURL(/\?issue=CORE-1$/);
  await expect(page.getByRole("complementary", { name: /CORE-1 Keep old identifiers resolving/ })).toBeVisible();
});
