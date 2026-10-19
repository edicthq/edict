import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures.js";

// The team page's filter, group and sort: everything runs over the client
// collection, so the URL and the screen are checked together throughout.

interface IssueJson {
  id: string;
  identifier: string;
  version: number;
}

async function patchIssue(
  request: APIRequestContext,
  baseURL: string,
  orgId: string,
  issue: IssueJson,
  changes: Record<string, unknown>,
): Promise<void> {
  const response = await request.patch(`/api/v1/organizations/${orgId}/issues/${issue.id}`, {
    headers: { origin: baseURL },
    data: { version: issue.version, ...changes },
  });
  expect(response.ok(), await response.text()).toBe(true);
}

async function issueByRef(
  request: APIRequestContext,
  baseURL: string,
  orgId: string,
  ref: string,
): Promise<IssueJson> {
  const response = await request.get(`/api/v1/organizations/${orgId}/issues/${ref}`, { headers: { origin: baseURL } });
  expect(response.ok(), await response.text()).toBe(true);
  return (await response.json()) as IssueJson;
}

test("filter, group and sort a team's issues without waiting on the network", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Iris Vale", email: "iris@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Tidefall", slug: "tidefall" } })).json();
  const orgId = org.organization.id as string;
  const team = await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Product", key: "PRD" } })
  ).json() as { id: string };

  // Three issues with different priorities, owners and ages. The urgent one
  // gets the only sub-issue title so the search has something to find.
  const made = async (title: string): Promise<IssueJson> =>
    (await (
      await page.request.post(`/api/v1/organizations/${orgId}/teams/${team.id}/issues`, {
        headers,
        data: { title },
      })
    ).json()) as IssueJson;
  const a = await made("Chart the coast");
  const b = await made("Paint the beacons");
  const c = await made("Stow the charts");
  await patchIssue(page.request, baseURL!, orgId, a, { priority: "urgent" });
  await patchIssue(page.request, baseURL!, orgId, b, { priority: "low" });
  // The endpoint returns the members array itself; the first row is whoever
  // created the organization.
  const me = await (await page.request.get(`/api/v1/organizations/${orgId}/members`, { headers })).json() as {
    id: string;
    name: string;
  }[];
  // A second patch to the same issue needs the version the last write left.
  await patchIssue(page.request, baseURL!, orgId, await issueByRef(page.request, baseURL!, orgId, b.identifier), {
    assigneeId: me[0]!.id,
  });
  // A quiet rename ages the untouched issues out of "newest first" and marks
  // what a last-updated sort reads.
  await patchIssue(page.request, baseURL!, orgId, c, { title: "Stow the charts and rope" });

  await page.goto(`/tidefall/teams/${team.id}`);

  // The untouched page keeps its address clean and shows the whole team.
  await expect(page.getByText("3 issues")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/tidefall/teams/${team.id}$`));

  // Search narrows rows by words from the title, and the count says so.
  await page.getByLabel("Search issues").fill("charts");
  await expect(page).toHaveURL(/q=charts/);
  await expect(page.getByText("1 of 3 issues")).toBeVisible();
  await expect(page.getByRole("button", { name: /PRD-3 Stow the charts and rope/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /PRD-1 Chart the coast/ })).toBeHidden();

  // A question with nothing in it is not an error but a way back.
  await page.getByLabel("Search issues").fill("kelp");
  await expect(page.getByText("No issues match")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.getByText("3 issues")).toBeVisible();
  await expect(page).not.toHaveURL(/q=/);

  // Filtering picks one priority from the menu, shows its pill, and the
  // count tracks it.
  await page.getByRole("button", { name: "Filter", exact: true }).click();
  await page.getByRole("combobox", { name: "Filter" }).fill("urgent");
  await page.getByRole("option", { name: "Urgent" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/priority=urgent/);
  await expect(page.getByText("1 of 3 issues")).toBeVisible();
  await expect(page.getByRole("button", { name: /PRD-1 Chart the coast/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /PRD-2 Paint the beacons/ })).toBeHidden();

  // The pill removes its filter in one click and the address keeps none of it.
  await page.getByRole("button", { name: "Remove filter Urgent" }).click();
  await expect(page).not.toHaveURL(/priority=/);
  await expect(page.getByText("3 issues")).toBeVisible();
  await expect(page.getByRole("button", { name: /PRD-2 Paint the beacons/ })).toBeVisible();
});

// The second test builds its own org on the same instance, so grouping and
// sorting start from the defaults untouched.
test("group by assignee and sort by last updated, all in the address", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Noor Haddad", email: "noor@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Kindle", slug: "kindle" } })).json();
  const orgId = org.organization.id as string;
  const team = await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Studio", key: "STU" } })
  ).json() as { id: string };
  const made = async (title: string): Promise<IssueJson> =>
    (await (
      await page.request.post(`/api/v1/organizations/${orgId}/teams/${team.id}/issues`, {
        headers,
        data: { title },
      })
    ).json()) as IssueJson;
  const a = await made("Sketch the cover");
  const b = await made("Sew the spine");
  await made("Font the colophon");
  // The endpoint returns the members array itself; the first row is whoever
  // created the organization.
  const me = await (await page.request.get(`/api/v1/organizations/${orgId}/members`, { headers })).json() as {
    id: string;
    name: string;
  }[];
  await patchIssue(page.request, baseURL!, orgId, b, { assigneeId: me[0]!.id });
  await patchIssue(page.request, baseURL!, orgId, a, { title: "Sketch the cover again" });

  await page.goto(`/kindle/teams/${team.id}`);

  // The list groups by status until the view says otherwise.
  await expect(page.getByRole("region", { name: "Todo" })).toBeVisible();
  await page.getByRole("button", { name: "Group Status", exact: true }).click();
  await page.getByRole("combobox", { name: "Grouping" }).fill("assignee");
  await page.getByRole("option", { name: "Assignee" }).click();
  await expect(page).toHaveURL(/group=assignee/);
  await expect(page.getByRole("region", { name: "Unassigned" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Noor Haddad" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Todo" })).toBeHidden();

  // Sorting by last updated puts the issue touched last first.
  await page.getByRole("button", { name: "Sort Priority", exact: true }).click();
  await page.getByRole("combobox", { name: "Sorting" }).fill("updated");
  await page.getByRole("option", { name: "Last updated" }).click();
  await expect(page).toHaveURL(/sort=updated/);
  const rows = page.getByRole("region", { name: "Unassigned" }).getByRole("button");
  await expect(rows.first()).not.toContainText("STU-3");
  await expect(rows.last()).toContainText("STU-3");

  // The arrow flips the direction and records it in the address: the button
  // names the direction the list is now in, and clicking turns it over.
  await page.getByRole("button", { name: "Sort descending" }).click();
  await expect(page).toHaveURL(/dir=asc/);
  await expect(rows.first()).toContainText("STU-3");
});

test("a saved view comes back after reloading and is deleted for good", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Tam Ellis", email: "tam@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Studland", slug: "studland-views" } })).json();
  const orgId = org.organization.id as string;
  const team = await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, { headers, data: { name: "Support", key: "SUP" } })
  ).json() as { id: string };
  for (const title of ["Charts for the tide", "Ropes and knots", "Sea charts overdue"]) {
    const res = await page.request.post(`/api/v1/organizations/${orgId}/teams/${team.id}/issues`, {
      headers,
      data: { title },
    });
    expect(res.ok(), await res.text()).toBe(true);
  }

  await page.goto(`/studland-views/teams/${team.id}`);

  // A filtered arrangement of the page...
  await page.getByLabel("Search issues").fill("charts");

  // ...gets a name through the Views menu: typing a name the list doesn't
  // know offers to create it.
  await page.getByRole("button", { name: "Views" }).click();
  await page.getByRole("combobox").fill("Tide charts");
  await page.getByRole("option", { name: "Create “Tide charts”" }).click();
  await expect(page).toHaveURL(/q=charts/);

  // The view is the URL again after a reload: applying it filters the list.
  await page.reload();
  await page.getByLabel("Search issues").fill("");
  await expect(page.getByText("3 issues")).toBeVisible();
  await page.getByRole("button", { name: "Views" }).click();
  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "Tide charts" }).click();
  await expect(page).toHaveURL(/q=charts/);
  await expect(page.getByText("2 of 3 issues")).toBeVisible();

  // Deleting the active view is immediate: no trash, the name is gone.
  await page.getByRole("button", { name: "Delete view Tide charts" }).click();
  await expect(page.getByText("Deleted the view Tide charts.")).toBeVisible();
  await page.getByRole("button", { name: "Views" }).click();
  await page.getByRole("combobox").fill("Tide charts");
  // The name is free again: it offers to create it once more.
  await expect(page.getByRole("option", { name: "Create “Tide charts”" })).toBeVisible();
  await page.keyboard.press("Escape");

  // The URL stays filtered, but nothing is stored for this name again.
  await page.reload();
  await expect(page).toHaveURL(/q=charts/);
});
