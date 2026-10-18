import { expect, test } from "./fixtures.js";

// The M4 exit criterion (docs/PLAN.md):
// TanStack DB collections, realtime, list and board, filter, group, sort,
// saved views, ⌘K, shortcuts, peek panel, bulk edit, themes, final visual design.
test("Milestone 4: board, keyboard navigation, bulk actions with undo, command palette, themes and accent", async ({
  page,
  baseURL,
}) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Devon Price", email: "devon@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);

  const org = await (
    await page.request.post("/api/v1/organizations", {
      headers,
      data: { name: "Vector", slug: "vector" },
    })
  ).json();
  const orgId = org.organization.id as string;

  const team = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, {
      headers,
      data: { name: "Core", key: "COR" },
    })
  ).json()) as { id: string };

  // Create four issues
  const titles = [
    "Implement keyboard shortcuts",
    "Add bulk selection and floating toolbar",
    "Refactor command palette issue search",
    "Support theme and accent cycling",
  ];
  for (const title of titles) {
    const res = await page.request.post(`/api/v1/organizations/${orgId}/teams/${team.id}/issues`, {
      headers,
      data: { title },
    });
    expect(res.ok()).toBe(true);
  }

  await page.goto(`/vector/teams/${team.id}`);
  await expect(page.getByText("4 issues")).toBeVisible();

  // 1. Keyboard shortcuts & peek panel:
  // Press J to move to an issue, then Enter to open peek
  await page.keyboard.press("j");
  await page.keyboard.press("Enter");
  const peek = page.getByRole("complementary", { name: /COR-/ });
  await expect(peek).toBeVisible();

  // Escape closes peek
  await page.keyboard.press("Escape");
  await expect(peek).toBeHidden();

  // 2. View toggle (V) and board column navigation (H / L):
  await page.keyboard.press("v");
  await expect(page).toHaveURL(/view=board/);
  await expect(page.getByRole("button", { name: "Board", exact: true })).toHaveAttribute("aria-pressed", "true");
  // Press L to move right across status columns, H to move left
  await page.keyboard.press("l");
  await page.keyboard.press("h");
  // Toggle back to list
  await page.keyboard.press("v");
  await expect(page).not.toHaveURL(/view=board/);
  await expect(page.getByRole("button", { name: "List", exact: true })).toHaveAttribute("aria-pressed", "true");

  // 3. Multi-issue selection & Bulk edit:
  // Select first issue with X
  await page.keyboard.press("j");
  await page.keyboard.press("x");
  const toolbar = page.getByRole("toolbar", { name: "Bulk actions" });
  await expect(toolbar).toBeVisible();
  await expect(toolbar.getByText("1 selected")).toBeVisible();

  // Select all issues via ControlOrMeta+A
  await page.keyboard.press("ControlOrMeta+a");
  await expect(toolbar.getByText("4 selected")).toBeVisible();

  // Change priority to High on all selected issues via bulk toolbar
  await toolbar.getByRole("button", { name: /Priority/ }).click();
  await page.getByRole("option", { name: "High" }).click();

  // Verify undo toast appears and all 4 issues are updated
  const undoToast = page.getByText(/Updated priority to high on 4 issues/);
  await expect(undoToast).toBeVisible();

  // Test single-step bulk Undo via toast button
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(undoToast).toBeHidden();

  // 4. Bulk Delete and Undo:
  // Select 2 issues via checkboxes
  await page.getByRole("checkbox", { name: "Select COR-1" }).check();
  await page.getByRole("checkbox", { name: "Select COR-2" }).check();
  await expect(toolbar.getByText("2 selected")).toBeVisible();

  // Click Trash on the bulk toolbar
  await toolbar.getByRole("button", { name: /Trash/ }).click();
  await expect(page.getByText("2 issues")).toBeVisible();
  const deleteToast = page.getByText(/Moved 2 issues to the trash/);
  await expect(deleteToast).toBeVisible();

  // Undo the bulk delete via toast Undo button
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("4 issues")).toBeVisible();

  // 5. Command Palette (⌘K) and search across issues:
  await page.keyboard.press("ControlOrMeta+k");
  const paletteDialog = page.getByRole("dialog");
  await expect(paletteDialog).toBeVisible();
  const paletteInput = page.getByRole("combobox", { name: "Search or command" });
  await paletteInput.fill("shortcuts");

  // Matching issue appears
  const matchingIssueCmd = page.getByRole("option", { name: /COR-1 Implement keyboard shortcuts/ });
  await expect(matchingIssueCmd).toBeVisible();
  await matchingIssueCmd.click();
  await expect(paletteDialog).toBeHidden();
  await expect(page.getByRole("complementary", { name: /COR-1/ })).toBeVisible();
  await page.keyboard.press("Escape");

  // 6. Themes & Accent shortcuts and settings:
  // Press T to toggle theme (checks document data-theme)
  const htmlEl = page.locator("html");
  await page.keyboard.press("t");
  const theme1 = await htmlEl.getAttribute("data-theme");
  expect(theme1).toBeTruthy();
  await page.keyboard.press("t");
  const theme2 = await htmlEl.getAttribute("data-theme");
  expect(theme2).toBeTruthy();
  expect(theme2).not.toBe(theme1);

  // Press G to cycle accent
  const currentAccent = await htmlEl.getAttribute("data-accent");
  await page.keyboard.press("g");
  const newAccent = await htmlEl.getAttribute("data-accent");
  expect(newAccent).not.toBe(currentAccent);

  // Visit Settings: verify Admin setting for Organization default accent
  await page.goto("/vector/settings");
  await expect(page.getByRole("heading", { name: "Organization default agent color" })).toBeVisible();
  const orgAccentGroup = page.getByRole("radiogroup", { name: /Organization default agent/ });
  await orgAccentGroup.getByRole("radio", { name: "Teal" }).click();
  await expect(orgAccentGroup.getByRole("radio", { name: "Teal" })).toHaveAttribute("aria-checked", "true");
});
