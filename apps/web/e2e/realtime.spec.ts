import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.js";

// The agent panel stays current (EDI-35). Realtime is the one path: progress
// an agent posts from outside the page reaches the lane, the row, the rail
// and the agents roster at once, in every window. Nothing polls while the
// socket is up; while it is down the panels poll, and a reconnect refetches.

interface Setup {
  slug: string;
  teamId: string;
  agentName: string;
  post: (state: string, message: string) => Promise<void>;
}

async function setUp(page: Page, baseURL: string, slug: string): Promise<Setup> {
  const headers = { origin: baseURL };
  const signUp = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Rosa Realtime", email: `${slug}@example.com`, password: "correct-horse-battery" },
  });
  expect(signUp.ok(), await signUp.text()).toBe(true);
  const org = await (await page.request.post("/api/v1/organizations", { headers, data: { name: "Realtime", slug } })).json();
  const orgId = org.organization.id as string;
  const v1 = `/api/v1/organizations/${orgId}`;
  const team = await (await page.request.post(`${v1}/teams`, { headers, data: { name: "Engineering", key: "ENG" } })).json();
  const agentName = "Ferro";
  const agent = await (await page.request.post(`${v1}/agents`, { headers, data: { name: agentName, teamIds: [team.id] } })).json();
  const key = await (await page.request.post(`${v1}/agents/${agent.id}/api-keys`, { headers, data: { name: "runner" } })).json();
  const issue = await (
    await page.request.post(`${v1}/teams/${team.id}/issues`, { headers, data: { title: "Keep the panel current" } })
  ).json();
  const delegated = await page.request.patch(`${v1}/issues/ENG-1`, { headers, data: { version: issue.version, delegateId: agent.id } });
  expect(delegated.ok(), await delegated.text()).toBe(true);
  // The agent posts from outside the page, with its API key.
  const post = async (state: string, message: string) => {
    const res = await fetch(`${baseURL}${v1}/issues/ENG-1/progress`, {
      method: "POST",
      headers: { authorization: `Bearer ${key.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ state, message }),
    });
    expect(res.status, await res.text()).toBe(201);
  };
  return { slug, teamId: team.id as string, agentName, post };
}

// Resolves once the page's socket has subscribed to its organization.
function subscribed(page: Page): Promise<void> {
  return new Promise((resolve) => {
    page.on("websocket", (ws) => {
      ws.on("framereceived", (frame) => {
        if (String(frame.payload).includes('"subscribed"')) resolve();
      });
    });
  });
}

// What the panels would poll if they polled.
const polled = (url: string) => /\/progress\b|delegateId=|\/inbox\/unread-count/.test(url);

test("an agent's progress reaches the lane, the row, the rail and the roster at once, in two windows", async ({ page, baseURL }) => {
  const { slug, teamId, agentName, post } = await setUp(page, baseURL!, "realtime-two");
  await page.setViewportSize({ width: 1280, height: 800 });
  const ready = subscribed(page);
  await page.goto(`/${slug}/teams/${teamId}?issue=ENG-1`);
  const peek = page.getByRole("complementary", { name: /ENG-1/ });
  await expect(peek.getByText("Waiting for Ferro to pick it up")).toBeVisible();
  await ready;

  // A second window on the agents roster.
  const roster = await page.context().newPage();
  await roster.setViewportSize({ width: 1280, height: 800 });
  const rosterReady = subscribed(roster);
  await roster.goto(`/${slug}/agents`);
  await expect(roster.locator("button[id]", { hasText: agentName })).toContainText("Idle");
  await rosterReady;

  await post("working", "Tracing the stale badge through `agentState`.");
  const soon = { timeout: 1_500 };
  await expect(peek.getByText("Tracing the stale badge")).toBeVisible(soon);
  await expect(peek.getByText(`${agentName} is working`)).toBeVisible(soon);
  await expect(page.getByRole("button", { name: /ENG-1 Keep the panel current.*Tracing the stale badge/ })).toBeVisible(soon);
  for (const window of [page, roster]) {
    const rail = window.getByRole("navigation", { name: "Organization" }).first();
    await expect(rail.getByRole("link", { name: new RegExp(agentName) }).first()).toContainText("Working", soon);
    await expect(rail.getByRole("link", { name: /ENG-1 Keep the panel current/ })).toBeVisible(soon);
  }
  await expect(roster.locator("button[id]", { hasText: agentName })).toContainText("Working", soon);

  await post("blocked", "The fixture has no agent.");
  await expect(page.getByRole("button", { name: /ENG-1 Keep the panel current.*The fixture has no agent/ })).toBeVisible(soon);
  await expect(roster.locator("button[id]", { hasText: agentName })).toContainText("Blocked", soon);
});

test("nothing polls while the socket is up; while it is down the panels poll, and a reconnect catches up", async ({
  page,
  baseURL,
}) => {
  const { slug, teamId, post } = await setUp(page, baseURL!, "realtime-down");
  await page.setViewportSize({ width: 1280, height: 800 });
  // The socket goes through the test, which can drop it and refuse new ones.
  let down = false;
  let subscriptions = 0;
  // Pings and pongs on the socket that is up now, if one is.
  let up = false;
  let pings = 0;
  let pongs = 0;
  const sockets: { close: () => Promise<void> }[] = [];
  await page.routeWebSocket("**/ws", (ws) => {
    if (down) {
      void ws.close();
      return;
    }
    const server = ws.connectToServer();
    up = true;
    pings = 0;
    pongs = 0;
    ws.onMessage((message) => {
      if (String(message).includes('"ping"')) pings += 1;
      server.send(message);
    });
    server.onMessage((message) => {
      if (String(message).includes('"subscribed"')) subscriptions += 1;
      if (String(message).includes('"pong"')) pongs += 1;
      ws.send(message);
    });
    sockets.push(ws);
  });
  await page.clock.install();
  // Time passes in steps shorter than the wait for a pong, each one letting
  // the heartbeat's pong arrive, since the fake clock outruns the network.
  const pass = async (ms: number) => {
    for (let left = ms; left > 0; left -= 4_000) {
      await page.clock.runFor(Math.min(4_000, left));
      await expect.poll(() => !up || pongs >= pings).toBe(true);
    }
  };
  const requests: string[] = [];
  page.on("request", (request) => {
    if (polled(request.url())) requests.push(request.url());
  });
  await page.goto(`/${slug}/teams/${teamId}?issue=ENG-1`);
  const peek = page.getByRole("complementary", { name: /ENG-1/ });
  await expect(peek.getByText("Waiting for Ferro to pick it up")).toBeVisible();
  // Up: a minute passes with no polling.
  await expect.poll(() => subscriptions).toBe(1);
  const loaded = requests.length;
  await pass(60_000);
  expect(requests.slice(loaded)).toEqual([]);

  // Down: the panels poll, so an update still shows.
  down = true;
  up = false;
  await sockets[0]!.close();
  await post("working", "Posted while the socket was down.");
  await page.clock.runFor(10_000);
  await expect(peek.getByText("Posted while the socket was down.")).toBeVisible();

  // Back: the reconnect refetches what is shown, and polling stops again.
  await post("needs_input", "Which branch should this land on?");
  down = false;
  await pass(35_000);
  await expect.poll(() => subscriptions).toBe(2);
  await expect(page.getByRole("button", { name: /ENG-1 Keep the panel current.*Which branch/ })).toBeVisible();
  const reconnected = requests.length;
  await pass(60_000);
  expect(requests.slice(reconnected)).toEqual([]);
});

test("Working turns quiet after half an hour without a word from the agent", async ({ page, baseURL }) => {
  const { slug, teamId, agentName, post } = await setUp(page, baseURL!, "realtime-quiet");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.clock.install();
  await post("working", "Starting on it.");
  await page.goto(`/${slug}/teams/${teamId}?issue=ENG-1`);
  const peek = page.getByRole("complementary", { name: /ENG-1/ });
  await expect(peek.getByText(`${agentName} is working`)).toBeVisible();
  await expect(page.getByText(`${agentName} is working`, { exact: true }).first()).toBeVisible();

  await page.clock.fastForward("31:00");
  await expect(peek.getByText(`${agentName} is working`)).toBeHidden();
  await expect(peek.getByText("No word from Ferro for 31m")).toBeVisible();
  const row = page.getByRole("button", { name: /ENG-1 Keep the panel current/ });
  await expect(row).toContainText("Quiet");
  await expect(row).not.toContainText("Working");
  const rail = page.getByRole("navigation", { name: "Organization" }).first();
  await expect(rail.getByRole("link", { name: /ENG-1 Keep the panel current/ })).toBeHidden();
});
