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
  if (!signUp.ok()) throw new Error(`sign-up failed: ${signUp.status()} ${await signUp.text()}`);
  const org = await (await request.post("/api/v1/organizations", { headers, data: { name: "Acme", slug: "acme" } })).json();
  const orgId = org.organization.id as string;
  const team = await (
    await request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })
  ).json();
  return { orgId, team: team as { id: string; version: number } };
}

test("label an issue, add a sub-issue and a relation, and move it to another team", async ({ page, baseURL }) => {
  // Distinct org and user: all tests in this file share the worker's instance.
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Maya Chen", email: "maya@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Waypoint", slug: "waypoint" } })).json();
  const orgId = org.organization.id as string;
  const team = await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })
  ).json() as { id: string };
  const ops = await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Ops", key: "OPS" } })
  ).json() as { id: string };
  await page.request.post(`/api/v1/organizations/${orgId}/teams/${team.id}/issues`, { headers, data: { title: "Ship the exporter" } });
  await page.request.post(`/api/v1/organizations/${orgId}/teams/${ops.id}/issues`, { headers, data: { title: "Restart the relay" } });

  await page.goto(`/waypoint/teams/${team.id}`);
  const list = page.getByRole("region", { name: "Todo" });
  await list.getByRole("button", { name: /ENG-1 Ship the exporter/ }).click();
  const peek = page.getByRole("complementary", { name: /Ship the exporter/ });
  await expect(peek).toBeVisible();

  // Create a label from the picker and the issue keeps the pill. Enter picks
  // the "create" option from the keyboard, which keeps focus in its input.
  await peek.getByRole("button", { name: "Labels: none. Add labels" }).click();
  await page.getByRole("combobox", { name: "Add labels" }).fill("bug");
  await page.keyboard.press("Enter");
  await expect(peek.getByRole("button", { name: "Labels: bug. Change labels" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list.getByRole("button", { name: /bug/ })).toBeVisible();

  // A sub-issue in the same team takes the next number.
  await peek.getByRole("button", { name: "Add sub-issue" }).click();
  const sub = page.getByRole("dialog", { name: "New sub-issue of ENG-1" });
  await sub.getByLabel("Title").fill("Pick the format");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(sub).toBeHidden();
  await expect(peek.getByText("0/1")).toBeVisible();
  await expect(peek.getByRole("button", { name: /ENG-2 Pick the format/ })).toBeVisible();

  // A relation to an issue in the other team.
  const relations = peek.locator('section[aria-labelledby="peek-relations"]');
  await peek.getByRole("button", { name: "Add relation" }).click();
  await peek.getByRole("textbox", { name: "Issue" }).fill("OPS-1");
  await peek.getByRole("button", { name: "Add", exact: true }).click();
  await expect(relations.getByText("Blocks")).toBeVisible();
  await expect(relations.getByRole("button", { name: /OPS-1 Restart the relay/ })).toBeVisible();

  // Moving the issue to Ops numbers it there; the old identifier still resolves.
  await peek.getByRole("button", { name: "Move", exact: true }).click();
  await page.getByRole("option", { name: /Ops/ }).click();
  await expect(page.getByRole("complementary", { name: /OPS-2 Ship the exporter/ })).toBeVisible();
  await expect(page).toHaveURL(/issue=OPS-2$/);
  await page.goto("/waypoint/issue/ENG-1");
  await expect(page).toHaveURL(/issue=OPS-2$/);
});

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

test("comment on an issue and attach a file in the peek", async ({ page, baseURL }) => {
  // Distinct org and user: all tests in this file share the worker's instance.
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Priya Nair", email: "priya@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Beacon", slug: "beacon" } })).json();
  const orgId = org.organization.id as string;
  const team = await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Core", key: "CORE" } })
  ).json() as { id: string };
  await page.request.post(`/api/v1/organizations/${orgId}/teams/${team.id}/issues`, { headers, data: { title: "Hook up discussion" } });

  await page.goto(`/beacon/teams/${team.id}`);
  const todo = page.getByRole("region", { name: "Todo" });
  await todo.getByRole("button", { name: /CORE-1 Hook up discussion/ }).click();
  const peek = page.getByRole("complementary", { name: /Hook up discussion/ });
  await expect(peek).toBeVisible();

  // Discussion: the creator line, then a comment from the composer. Markdown
  // renders, and ⌘/Ctrl-Enter sends.
  const discussion = peek.locator('section[aria-labelledby="peek-discussion"]');
  await expect(discussion.getByText("created the issue")).toBeVisible();
  const composer = discussion.getByLabel("Add a comment");
  await composer.fill("Agreed — shipping the **first** pass");
  await composer.press("ControlOrMeta+Enter");
  await expect(discussion.getByText("whole pass")).toBeHidden();
  await expect(discussion.getByText("first pass")).toBeVisible();
  await expect(discussion.locator("article strong")).toHaveText("first");
  await expect(composer).toHaveValue("");

  // Hover shows Edit; only the creator sees it (this user created it).
  await discussion.locator("article").first().hover();
  await discussion.getByRole("button", { name: "Edit" }).click();
  const edit = discussion.getByLabel("Edit your comment");
  await edit.fill("Agreed — shipping the whole pass");
  await discussion.getByRole("button", { name: "Save" }).click();
  await expect(discussion.getByText("whole pass")).toBeVisible();
  await expect(discussion.getByText("first pass")).toBeHidden();

  // Files: upload through the section's file input; the row shows the name
  // and size, and the link serves the same bytes back.
  const files = peek.locator('section[aria-labelledby="peek-attachments"]');
  await peek.locator('input[type="file"]').setInputFiles({
    name: "notes.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("hello from edict"),
  });
  const link = files.getByRole("link", { name: /notes\.md/ });
  await expect(link).toBeVisible();
  await expect(files.getByText("16 B")).toBeVisible();
  const href = await link.getAttribute("href");
  const fetched = await page.request.get(href!, { headers });
  expect(fetched.ok()).toBe(true);
  expect(await fetched.text()).toBe("hello from edict");
});
