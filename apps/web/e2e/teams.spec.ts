import { expect, test } from "./fixtures.js";

test("the Teams page shows each team's open work, members and agents", async ({ page, baseURL }) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Tara Quinn", email: "tara@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Teamco", slug: "teamco" } })).json();
  const base = `/api/v1/organizations/${org.organization.id}`;
  const eng = await (await page.request.post(`${base}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })).json();
  await page.request.post(`${base}/teams`, { headers, data: { name: "Operations", key: "OPS", private: true } });
  const agent = await (await page.request.post(`${base}/agents`, { headers, data: { name: "Ferro", teamIds: [eng.id] } })).json();
  const statuses = (await (await page.request.get(`${base}/teams/${eng.id}/statuses`, { headers })).json()) as {
    id: string;
    category: string;
  }[];
  for (const title of ["Open one", "Open two"]) {
    await page.request.post(`${base}/teams/${eng.id}/issues`, { headers, data: { title } });
  }
  const working = await (
    await page.request.post(`${base}/teams/${eng.id}/issues`, { headers, data: { title: "Ferro on it" } })
  ).json();
  await page.request.patch(`${base}/issues/${working.identifier}`, {
    headers,
    data: { version: working.version, delegateId: agent.id, statusId: statuses.find((s) => s.category === "in_progress")!.id },
  });

  await page.goto("/teamco");
  const teams = page.getByRole("list", { name: "Teams" });
  const engRow = teams.getByRole("link", { name: /ENG Engineering/ });
  await expect(engRow).toContainText("3 open issues");
  await expect(engRow).toContainText("1 in progress");
  await expect(engRow).toContainText("1 delegated to an agent");
  await expect(engRow).toContainText("1 member: Tara Quinn");
  await expect(engRow).toContainText("1 agent: Ferro");
  await expect(teams.getByRole("link", { name: /OPS Operations/ })).toContainText("Private");

  await engRow.click();
  await expect(page).toHaveURL(new RegExp(`/teamco/teams/${eng.id}`));
});
