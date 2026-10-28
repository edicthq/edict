import { expect, test } from "./fixtures.js";

// The pages people set things up on, after the feel pass (EDI-29 to EDI-33):
// roles are app menus, not native selects; a project lists its open issues
// first; the rail marks a team's Members page, not its Issues; an
// organization without webhooks shows one quiet action.
test("roles are set from a menu, a project shows open work first, and the rail marks the page you are on", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Paz Pages", email: "paz-pages@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Pages", slug: "pages-co" } })).json();
  const v1 = `/api/v1/organizations/${org.organization.id}`;
  const team = await (await page.request.post(`${v1}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })).json();
  await page.request.post(`${v1}/agents`, { headers, data: { name: "Ferro", teamIds: [team.id] } });
  const statuses = (await (await page.request.get(`${v1}/teams/${team.id}/statuses`)).json()) as { id: string; category: string }[];
  const project = await (await page.request.post(`${v1}/projects`, { headers, data: { name: "Launch", slug: "launch" } })).json();
  const done = statuses.find((s) => s.category === "done")!.id;
  const todo = statuses.find((s) => s.category === "todo")!.id;
  for (const [title, statusId] of [
    ["Shipped already", done],
    ["Also shipped", done],
    ["Still to do", todo],
  ] as const) {
    const created = await page.request.post(`${v1}/teams/${team.id}/issues`, { headers, data: { title, statusId, projectId: project.id } });
    expect(created.ok(), await created.text()).toBe(true);
  }

  // Members: an agent's role is an app menu.
  await page.goto("/pages-co/members");
  await expect(page.getByRole("navigation", { name: "Settings" }).getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
  await expect(page.locator("select")).toHaveCount(0);
  await page.getByRole("button", { name: "Role of Ferro: Member" }).click();
  await page.getByRole("option", { name: "Guest" }).click();
  await expect(page.getByRole("button", { name: "Role of Ferro: Guest" })).toBeVisible();

  // A project: Todo before Done, and Done folded while work is open.
  await page.goto("/pages-co/projects/launch");
  const todoGroup = page.getByRole("region", { name: "Todo" });
  const doneGroup = page.getByRole("region", { name: "Done" });
  await expect(todoGroup.getByText("Still to do")).toBeVisible();
  await expect(doneGroup.getByText("Shipped already")).toBeHidden();
  const order = await page.locator("main section[aria-label]").evaluateAll((sections) => sections.map((s) => s.getAttribute("aria-label")));
  expect(order.indexOf("Todo")).toBeLessThan(order.indexOf("Done"));
  await doneGroup.getByRole("button", { name: /Done/ }).click();
  await expect(doneGroup.getByText("Shipped already")).toBeVisible();

  // A team's Members page: the rail marks Members, not Issues.
  await page.goto(`/pages-co/teams/${team.id}/members`);
  const rail = page.getByRole("navigation", { name: "Organization" }).first();
  await expect(rail.getByRole("link", { name: "Engineering members" })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("link", { name: "Issues", exact: true })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("button", { name: "Archive closed issues: After 1 month" })).toBeVisible();

  // Agents: no organization webhook yet is one quiet action that opens the form.
  await page.goto("/pages-co/agents");
  await expect(page.getByLabel("URL")).toBeHidden();
  await page.getByRole("button", { name: "Add an organization webhook" }).click();
  await expect(page.getByLabel("URL")).toBeFocused();
});

// Connect an agent: pick your client from the tiles and its steps follow;
// until you approve one, the page says where its agent will appear.
test("Connect an agent shows the steps for the client you pick", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Cy Connect", email: "cy-connect@example.com", password: "correct-horse-battery" },
  });
  await page.request.post("/api/v1/organizations", { headers, data: { name: "Connect", slug: "connect-co" } });

  await page.goto("/connect-co/connect");
  await expect(page.getByText(`${baseURL}/mcp`, { exact: true })).toBeVisible();
  const picker = page.getByRole("radiogroup", { name: "Your client" });
  await expect(picker.getByRole("radio", { name: /Claude Code/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByText("claude mcp login edict")).toBeVisible();
  // Claude Code's hooks come after its steps; the key needs its agent first.
  const hooks = page.getByRole("region", { name: "Progress at no token cost" });
  await expect(hooks.getByText("Connect Claude Code first.", { exact: false })).toBeVisible();
  await expect(hooks.getByText('"if": "Bash(git commit *)"', { exact: false })).toBeVisible();

  await picker.getByRole("radio", { name: /Codex/ }).click();
  await expect(page.getByRole("heading", { name: "Connect Codex" })).toBeVisible();
  await expect(page.getByText("codex mcp login edict")).toBeVisible();
  await expect(hooks).toBeHidden();
  await expect(page.getByText("Once you approve a client, its agent shows up here and in the sidebar.")).toBeVisible();
});

// The rail folds away with ⌘B (Ctrl+B) or its button, the page panel takes the
// room, and it stays folded until brought back, across a reload.
test("the rail folds away and comes back, and stays as it was left", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Rhea Rail", email: "rhea-rail@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Rail", slug: "rail-co" } })).json();
  await page.request.post(`/api/v1/organizations/${org.organization.id}/teams`, { headers, data: { name: "Engineering", key: "ENG" } });

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/rail-co/inbox");
  const rail = page.getByRole("navigation", { name: "Organization" });
  await expect(rail.getByRole("link", { name: "My issues" })).toBeVisible();

  await page.keyboard.press("ControlOrMeta+b");
  await expect(rail.getByRole("link", { name: "My issues" })).toBeHidden();
  const show = page.getByRole("button", { name: "Show sidebar" });
  await expect(show).toBeVisible();

  await page.reload();
  await expect(show).toBeVisible();
  await expect(rail.getByRole("link", { name: "My issues" })).toBeHidden();

  await show.click();
  await expect(rail.getByRole("link", { name: "My issues" })).toBeVisible();
  await rail.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(show).toBeVisible();
});

test("Preferences rebind the sidebar shortcut, and refuse keys the list keeps", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Kai Keys", email: "kai-keys@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  await page.request.post("/api/v1/organizations", { headers, data: { name: "Keys", slug: "keys-co" } });
  await page.setViewportSize({ width: 1280, height: 800 });
  const rail = page.getByRole("navigation", { name: "Organization" });

  await page.goto("/keys-co/settings");
  const binding = page.getByRole("button", { name: "Show or hide the sidebar" });
  await binding.click();
  await expect(binding).toContainText("Press keys");
  await page.keyboard.press("j");
  await expect(page.getByText("J is kept for the next issue.")).toBeVisible();
  // The button keeps focus, so Enter starts recording again without a mouse.
  await expect(binding).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(binding).toContainText("Press keys");
  await page.keyboard.press("n");
  await expect(binding).toContainText("N");
  await expect(page.getByRole("button", { name: /Reset to/ })).toBeVisible();

  await page.goto("/keys-co/inbox");
  await expect(rail.getByRole("link", { name: "My issues" })).toBeVisible();
  // The old keys do nothing now; the new one folds the rail.
  await page.keyboard.press("ControlOrMeta+b");
  await expect(rail.getByRole("link", { name: "My issues" })).toBeVisible();
  await page.keyboard.press("n");
  await expect(rail.getByRole("link", { name: "My issues" })).toBeHidden();
});
