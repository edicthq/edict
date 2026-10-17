import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { apiClient, cookieHeader, createTestDatabase, signUpAs, startTestServer } from "./server.js";

function signUp(baseUrl: string, email: string, headers: Record<string, string> = {}) {
  return fetch(`${baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ name: email.split("@")[0], email, password: "correct-horse-battery" }),
  });
}

async function sessionIp(baseUrl: string, res: Response): Promise<string | undefined> {
  const session = await fetch(`${baseUrl}/api/auth/get-session`, { headers: { cookie: cookieHeader(res) } });
  return ((await session.json()) as { session?: { ipAddress?: string } }).session?.ipAddress;
}

describe("instance settings", () => {
  it("anyone can read the sign-up mode, which starts open, and whether setup is done", async () => {
    const t = await startTestServer();
    const res = await apiClient(t.baseUrl).get("/instance");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ signUpMode: "open", setUp: false });

    await signUpAs(t.baseUrl, "Admin");
    expect((await apiClient(t.baseUrl).get("/instance")).body).toEqual({ signUpMode: "open", setUp: true });
  });

  it("only the instance admin changes it", async () => {
    const t = await startTestServer();
    const admin = await signUpAs(t.baseUrl, "Admin");
    const user = await signUpAs(t.baseUrl, "User");

    expect((await apiClient(t.baseUrl).patch("/instance", { signUpMode: "invite_only" })).status).toBe(401);
    expect((await user.patch("/instance", { signUpMode: "invite_only" })).status).toBe(403);

    const res = await admin.patch("/instance", { signUpMode: "invite_only" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ signUpMode: "invite_only", setUp: true });
    expect((await apiClient(t.baseUrl).get("/instance")).body.signUpMode).toBe("invite_only");
  });

  it("records each change as an instance event", async () => {
    const database = await createTestDatabase();
    const t = await startTestServer({ database });
    const admin = await signUpAs(t.baseUrl, "Admin");
    await admin.patch("/instance", { signUpMode: "invite_only" });

    const pool = new Pool({ connectionString: database.url });
    const { rows } = await pool.query(
      `SELECT e.type, e.data, u.email FROM instance_events e JOIN "user" u ON u.id = e.actor_user_id`,
    );
    await pool.end();
    expect(rows).toEqual([
      {
        type: "instance.sign_up_mode_changed",
        data: { from: "open", to: "invite_only" },
        email: "admin@example.com",
      },
    ]);
  });
});

describe("invite-only sign-up", () => {
  it("lets in only people with an open invite", async () => {
    const t = await startTestServer();
    const admin = await signUpAs(t.baseUrl, "Admin");
    await admin.patch("/instance", { signUpMode: "invite_only" });
    const org = await admin.post("/organizations", { name: "Acme", slug: "acme" });
    const invite = await admin.post(`/organizations/${org.body.organization.id}/invites`, {
      email: "Mia@Example.com",
    });

    const stranger = await signUp(t.baseUrl, "eve@example.com");
    expect(stranger.status).toBe(403);
    expect(((await stranger.json()) as { message?: string }).message).toMatch(/invite/i);

    const invited = await signUp(t.baseUrl, "mia@example.com");
    expect(invited.status).toBe(200);

    const token = new URL(invite.body.url).pathname.split("/").pop();
    const accepted = await apiClient(t.baseUrl, cookieHeader(invited)).post(`/invites/${token}/accept`);
    expect(accepted.status).toBe(200);
  });

  it("does not count a revoked invite", async () => {
    const t = await startTestServer();
    const admin = await signUpAs(t.baseUrl, "Admin");
    await admin.patch("/instance", { signUpMode: "invite_only" });
    const org = (await admin.post("/organizations", { name: "Acme", slug: "acme" })).body.organization;
    const invite = await admin.post(`/organizations/${org.id}/invites`, { email: "mia@example.com" });
    await admin.delete(`/organizations/${org.id}/invites/${invite.body.id}`);

    expect((await signUp(t.baseUrl, "mia@example.com")).status).toBe(403);
  });
});

describe("client IP", () => {
  it("ignores a forwarded IP the client set itself", async () => {
    const t = await startTestServer();
    const res = await signUp(t.baseUrl, "a@example.com", { "x-forwarded-for": "203.0.113.7" });
    expect(await sessionIp(t.baseUrl, res)).toBe("127.0.0.1");
  });

  it("believes the forwarded IP when the request comes through a trusted proxy", async () => {
    const t = await startTestServer({ trustedProxies: ["127.0.0.1"] });
    const res = await signUp(t.baseUrl, "a@example.com", { "x-forwarded-for": "203.0.113.7" });
    expect(await sessionIp(t.baseUrl, res)).toBe("203.0.113.7");
  });
});
