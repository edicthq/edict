import { expect, test } from "./fixtures.js";

test("Milestone 5: the inbox gathers assignments and mentions, and clearing it", async ({
  page,
  baseURL,
}) => {
  const headers = { origin: baseURL! };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Bob", email: "bob@example.com", password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);

  const org = await (
    await page.request.post("/api/v1/organizations", {
      headers,
      data: { name: "Acme Inbox", slug: "acme-inbox" },
    })
  ).json();
  const orgId = org.organization.id as string;

  const engTeam = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/teams`, {
      headers,
      data: { name: "Engineering", key: "ENG" },
    })
  ).json()) as { id: string };

  // A teammate joins through an invite, in a separate session.
  const invite = (await (
    await page.request.post(`/api/v1/organizations/${orgId}/invites`, {
      headers,
      data: { email: "charlie@example.com", role: "member", teamIds: [engTeam.id] },
    })
  ).json()) as { url: string };
  const token = new URL(invite.url).pathname.split("/").pop();
  const charlieHeaders = { origin: baseURL! };
  const charlieSignUp = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { ...charlieHeaders, "content-type": "application/json" },
    body: JSON.stringify({ name: "Charlie", email: "charlie@example.com", password: "correct-horse-battery" }),
  });
  // The accept runs as Charlie, so it carries Charlie's fresh session cookie.
  const charlie = charlieSignUp.headers.getSetCookie().map((entry) => entry.split(";")[0]).join("; ");
  const accepted = (await (
    await fetch(`${baseURL}/api/v1/invites/${token}/accept`, {
      method: "POST",
      headers: { ...charlieHeaders, cookie: charlie },
      body: JSON.stringify({}),
    })
  ).json()) as { member: { id: string } };
  const charlieMemberId = accepted.member.id;

  // The rail shows Inbox with no badge for somebody with an empty inbox.
  await page.goto("/acme-inbox");
  const nav = page.getByRole("navigation", { name: "Organization" });
  await expect(nav.getByRole("link", { name: "Inbox" })).toBeVisible();

  // Two issues assigned to Charlie: the inbox gathers both.
  await page.request.post(`/api/v1/organizations/${orgId}/teams/${engTeam.id}/issues`, {
    headers,
    data: { title: "Write the migration guide", assigneeId: charlieMemberId },
  });
  await page.request.post(`/api/v1/organizations/${orgId}/teams/${engTeam.id}/issues`, {
    headers,
    data: { title: "Fix flaky realtime test", assigneeId: charlieMemberId },
  });

  // Charlie signs in (a fresh cookie session over Bob's) and sees two unread
  // notifications in the rail.
  const charlieSignIn = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email: "charlie@example.com", password: "correct-horse-battery" },
  });
  expect(charlieSignIn.ok(), await charlieSignIn.text()).toBe(true);
  await page.goto("/acme-inbox");
  await expect(nav.getByRole("link", { name: /Inbox/ }).filter({ hasText: "2" })).toBeVisible();

  // Opening the inbox shows both assignments in Bob's words.
  await nav.getByRole("link", { name: /Inbox/ }).click();
  await expect(page).toHaveURL(/\/acme-inbox\/inbox/);
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByText(/assigned/).first()).toBeVisible();
  await expect(page.getByText("Bob").first()).toBeVisible();
  await expect(page.getByText("Write the migration guide")).toBeVisible();
  await expect(page.getByText("Fix flaky realtime test")).toBeVisible();

  // A row opens the issue and reads the notification.
  await page.getByText("Write the migration guide").click();
  await expect(page).toHaveURL(/issue=/);
  await expect(nav.getByRole("link", { name: /Inbox/ }).filter({ hasText: "1" })).toBeVisible();

  // Mark all read empties the unread view and clears the badge.
  await nav.getByRole("link", { name: /Inbox/ }).click();
  await page.getByRole("button", { name: "Mark all read" }).click();
  await expect(nav.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Inbox" })).not.toContainText(/\d/);

  // The all view keeps what was read.
  await page.getByRole("tab", { name: "All", exact: true }).click();
  await expect(page.getByText("Write the migration guide")).toBeVisible();
});
