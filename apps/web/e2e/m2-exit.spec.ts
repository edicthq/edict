import { expect, test } from "./fixtures.js";

// The M2 exit criterion (docs/PLAN.md): the full issue lifecycle works through
// the UI and the API. One issue goes from creation to Done to the trash and
// back, through the web app, and the API agrees at every step. Runs after
// m1-exit.spec.ts on the same instance, which has set it up.
test("an issue's whole lifecycle, through the UI, as the API sees it", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Ines Moreau", email: "ines@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Lifecycle", slug: "lifecycle" } })).json();
  const orgId = org.organization.id as string;
  const team = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })
  ).json()) as { id: string };
  const api = (path: string) => page.request.get(`/api/v1/organizations/${orgId}${path}`);
  const issue = async () => (await api("/issues/ENG-1")).json();

  // Create it from the keyboard.
  await page.goto(`/lifecycle/teams/${team.id}`);
  await expect(page.getByText("No issues yet")).toBeVisible();
  await page.keyboard.press("c");
  const dialog = page.getByRole("dialog", { name: "New issue" });
  await dialog.getByLabel("Title").fill("Export an organization");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(dialog).toBeHidden();
  const row = page.getByRole("button", { name: /ENG-1 Export an organization/ });
  await expect(row).toBeVisible();
  expect(await issue()).toMatchObject({ identifier: "ENG-1", title: "Export an organization" });

  // Fill it in from the peek: title, description, status, priority,
  // assignee, estimate and a label.
  await row.click();
  const peek = page.getByRole("complementary", { name: /ENG-1/ });
  await expect(peek).toBeVisible();
  await peek.getByLabel("Title").fill("Export an organization as JSON");
  await peek.getByLabel("Title").press("Enter");
  // Typed, so the editor turns **files** into bold, which it stores as markdown.
  await peek.getByLabel("Description").click();
  await page.keyboard.type("Issues, comments and **files**.");
  await peek.getByLabel("Description").press("Escape");
  await expect.poll(async () => (await issue()).description).toBe("Issues, comments and **files**.");

  await page.keyboard.press("s");
  await page.getByRole("combobox", { name: "Change status" }).fill("in prog");
  await page.keyboard.press("Enter");
  await expect(peek.getByRole("button", { name: /Status: In Progress/ })).toBeVisible();
  await page.keyboard.press("p");
  await page.getByRole("combobox", { name: "Set priority" }).fill("high");
  await page.keyboard.press("Enter");
  await expect(peek.getByRole("button", { name: /Priority: High/ })).toBeVisible();
  await page.keyboard.press("a");
  await page.getByRole("combobox", { name: "Assign to" }).fill("ines");
  await page.keyboard.press("Enter");
  await expect(peek.getByRole("button", { name: /Assignee: Ines Moreau/ })).toBeVisible();
  await peek.getByRole("button", { name: /Estimate: none/ }).click();
  await page.getByRole("option", { name: "3 points" }).click();
  await expect(peek.getByRole("button", { name: /Estimate: 3/ })).toBeVisible();
  await peek.getByRole("button", { name: "Labels: none. Add labels" }).click();
  await page.getByRole("combobox", { name: "Add labels" }).fill("export");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(peek.getByRole("button", { name: "Labels: export. Change labels" })).toBeVisible();

  const me = org.member.id as string;
  await expect
    .poll(async () => {
      const { title, priority, assigneeId, estimate, labelIds } = await issue();
      return { title, priority, assigneeId, estimate, labels: labelIds.length };
    })
    .toEqual({ title: "Export an organization as JSON", priority: "high", assigneeId: me, estimate: 3, labels: 1 });

  // A sub-issue, a comment and an attached file.
  await peek.getByRole("button", { name: "Add sub-issue" }).click();
  const sub = page.getByRole("dialog", { name: "New sub-issue of ENG-1" });
  await sub.getByLabel("Title").fill("Zip the files");
  await page.keyboard.press("ControlOrMeta+Enter");
  await expect(sub).toBeHidden();
  await expect(peek.getByRole("button", { name: /ENG-2 Zip the files/ })).toBeVisible();

  const discussion = peek.locator('section[aria-labelledby="peek-discussion"]');
  await discussion.getByLabel("Add a comment").click();
  await page.keyboard.type("Format agreed: **one** JSON file.");
  await discussion.getByLabel("Add a comment").press("ControlOrMeta+Enter");
  await expect(discussion.locator("article strong")).toHaveText("one");
  // Out of the composer, so the next keys are shortcuts.
  await discussion.getByLabel("Add a comment").press("Escape");

  await peek.locator('input[type="file"]').setInputFiles({
    name: "schema.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":1}'),
  });
  await expect(peek.getByRole("link", { name: /schema\.json/ })).toBeVisible();

  expect((await (await api("/issues/ENG-1/sub-issues")).json()).map((s: { identifier: string }) => s.identifier)).toEqual(["ENG-2"]);
  expect((await (await api("/issues/ENG-1/comments")).json())[0].body).toBe("Format agreed: **one** JSON file.");
  const [file] = await (await api("/issues/ENG-1/attachments")).json();
  expect(await (await page.request.get(file.path)).text()).toBe('{"version":1}');

  // Done.
  await page.keyboard.press("s");
  await page.getByRole("combobox", { name: "Change status" }).fill("done");
  await page.keyboard.press("Enter");
  await expect(peek.getByRole("button", { name: /Status: Done/ })).toBeVisible();
  const statuses = (await (await api(`/teams/${team.id}/statuses`)).json()) as { id: string; name: string }[];
  const done = statuses.find((s) => s.name === "Done")!;
  await expect.poll(async () => (await issue()).statusId).toBe(done.id);

  // To the trash, back with Undo, to the trash again, back from the Trash page.
  await peek.getByRole("button", { name: "Delete ENG-1" }).click();
  await expect(peek).toBeHidden();
  expect((await api("/issues/ENG-1")).status()).toBe(410);
  expect((await api("/issues/ENG-2")).status()).toBe(410);
  // Each recent toast keeps its own Undo; this one undoes the delete.
  await page.getByRole("status").locator("div").filter({ hasText: "Moved ENG-1 to the trash" }).getByRole("button", { name: /Undo/ }).click();
  await expect(page.getByRole("status").getByText("Undone")).toBeVisible();
  await expect.poll(async () => (await api("/issues/ENG-1")).status()).toBe(200);

  await row.click();
  await expect(peek).toBeVisible();
  await peek.getByRole("button", { name: "Delete ENG-1" }).click();
  await expect(peek).toBeHidden();
  await page.getByRole("link", { name: "Trash" }).click();
  await page.getByRole("listitem").filter({ hasText: "Export an organization as JSON" }).getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("The trash is empty")).toBeVisible();

  // Everything came back together.
  expect(await issue()).toMatchObject({ title: "Export an organization as JSON", priority: "high", estimate: 3 });
  expect((await api("/issues/ENG-2")).status()).toBe(200);
  expect(await (await api("/issues/ENG-1/comments")).json()).toHaveLength(1);
  expect(await (await api("/issues/ENG-1/attachments")).json()).toHaveLength(1);
});
