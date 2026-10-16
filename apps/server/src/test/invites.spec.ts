import { describe, expect, it } from "vitest";
import { Pool } from "pg";
import { apiClient, createTestDatabase, signUpAs, startTestServer, type ApiClient } from "./server.js";

async function setup(baseUrl: string) {
  const owner = await signUpAs(baseUrl, "Owner");
  const created = await owner.post("/organizations", { name: "Acme", slug: "acme" });
  const orgId = created.body.organization.id as string;
  return { owner, orgId, org: `/organizations/${orgId}` };
}

function tokenOf(url: string): string {
  return new URL(url).pathname.split("/").pop()!;
}

async function invite(owner: ApiClient, org: string, body: Record<string, unknown>) {
  const res = await owner.post(`${org}/invites`, body);
  expect(res.status).toBe(201);
  return res.body as { id: string; url: string; email: string; role: string };
}

describe("invites", () => {
  it("an invitee previews the invite, accepts it and joins its teams", async () => {
    const t = await startTestServer();
    const { owner, orgId, org } = await setup(t.baseUrl);
    const eng = (await owner.post(`${org}/teams`, { name: "Engineering", key: "ENG", private: true })).body;

    const created = await invite(owner, org, { email: "Mia@Example.com", role: "member", teamIds: [eng.id] });
    expect(created).toMatchObject({ email: "mia@example.com", role: "member" });
    const token = tokenOf(created.url);

    const preview = await apiClient(t.baseUrl).get(`/invites/${token}`);
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      organization: { name: "Acme", slug: "acme" },
      email: "mia@example.com",
      role: "member",
      invitedBy: { name: "Owner" },
    });

    const mia = await signUpAs(t.baseUrl, "Mia");
    const accepted = await mia.post(`/invites/${token}/accept`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.organization.id).toBe(orgId);
    expect(accepted.body.member).toMatchObject({ role: "member", name: "Mia" });

    const teams = await mia.get(`${org}/teams`);
    expect(teams.body.map((team: { key: string }) => team.key)).toEqual(["ENG"]);

    const again = await mia.post(`/invites/${token}/accept`);
    expect(again.status).toBe(404);
  });

  it("only the invited email can accept", async () => {
    const t = await startTestServer();
    const { owner, org } = await setup(t.baseUrl);
    const { url } = await invite(owner, org, { email: "mia@example.com" });

    const someoneElse = await signUpAs(t.baseUrl, "Eve");
    const res = await someoneElse.post(`/invites/${tokenOf(url)}/accept`);
    expect(res.status).toBe(403);
  });

  it("needs a signed-in user to accept", async () => {
    const t = await startTestServer();
    const { owner, org } = await setup(t.baseUrl);
    const { url } = await invite(owner, org, { email: "mia@example.com" });

    expect((await apiClient(t.baseUrl).post(`/invites/${tokenOf(url)}/accept`)).status).toBe(401);
  });

  it("an unknown token is not found", async () => {
    const t = await startTestServer();
    expect((await apiClient(t.baseUrl).get("/invites/not-a-real-token")).status).toBe(404);
  });

  it("a revoked invite stops working and leaves the pending list", async () => {
    const t = await startTestServer();
    const { owner, org } = await setup(t.baseUrl);
    const created = await invite(owner, org, { email: "mia@example.com" });

    expect((await owner.get(`${org}/invites`)).body).toHaveLength(1);
    expect((await owner.delete(`${org}/invites/${created.id}`)).status).toBe(204);
    expect((await owner.get(`${org}/invites`)).body).toHaveLength(0);

    const mia = await signUpAs(t.baseUrl, "Mia");
    expect((await mia.post(`/invites/${tokenOf(created.url)}/accept`)).status).toBe(404);
  });

  it("inviting the same email again replaces the open invite", async () => {
    const t = await startTestServer();
    const { owner, org } = await setup(t.baseUrl);
    const first = await invite(owner, org, { email: "mia@example.com", role: "member" });
    const second = await invite(owner, org, { email: "mia@example.com", role: "guest" });

    const pending = (await owner.get(`${org}/invites`)).body;
    expect(pending.map((i: { id: string }) => i.id)).toEqual([second.id]);

    const mia = await signUpAs(t.baseUrl, "Mia");
    expect((await mia.post(`/invites/${tokenOf(first.url)}/accept`)).status).toBe(404);
    const accepted = await mia.post(`/invites/${tokenOf(second.url)}/accept`);
    expect(accepted.body.member.role).toBe("guest");
  });

  it("an expired invite is gone", async () => {
    const database = await createTestDatabase();
    const t = await startTestServer({ database });
    const { owner, org } = await setup(t.baseUrl);
    const { id, url } = await invite(owner, org, { email: "mia@example.com" });

    const pool = new Pool({ connectionString: database.url });
    await pool.query(`UPDATE invites SET expires_at = now() - interval '1 minute' WHERE id = $1`, [id]);
    await pool.end();

    const mia = await signUpAs(t.baseUrl, "Mia");
    const res = await mia.post(`/invites/${tokenOf(url)}/accept`);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("gone");
  });

  it("refuses to invite someone who is already a member", async () => {
    const t = await startTestServer();
    const { owner, org } = await setup(t.baseUrl);
    const res = await owner.post(`${org}/invites`, { email: "owner@example.com" });
    expect(res.status).toBe(409);
  });

  it("members cannot invite, and admins cannot invite Owners", async () => {
    const t = await startTestServer();
    const { owner, org } = await setup(t.baseUrl);

    const adminInvite = await invite(owner, org, { email: "ada@example.com", role: "admin" });
    const ada = await signUpAs(t.baseUrl, "Ada");
    await ada.post(`/invites/${tokenOf(adminInvite.url)}/accept`);
    const memberInvite = await invite(owner, org, { email: "mia@example.com", role: "member" });
    const mia = await signUpAs(t.baseUrl, "Mia");
    await mia.post(`/invites/${tokenOf(memberInvite.url)}/accept`);

    expect((await mia.post(`${org}/invites`, { email: "x@example.com" })).status).toBe(403);
    expect((await ada.post(`${org}/invites`, { email: "x@example.com", role: "owner" })).status).toBe(403);
    expect((await ada.post(`${org}/invites`, { email: "x@example.com", role: "admin" })).status).toBe(201);
  });

  it("a removed member who is invited again comes back as the same member", async () => {
    const t = await startTestServer();
    const { owner, org } = await setup(t.baseUrl);
    const mia = await signUpAs(t.baseUrl, "Mia");

    const first = await invite(owner, org, { email: "mia@example.com" });
    const memberId = (await mia.post(`/invites/${tokenOf(first.url)}/accept`)).body.member.id;
    await owner.delete(`${org}/members/${memberId}`);

    const second = await invite(owner, org, { email: "mia@example.com", role: "guest" });
    const back = await mia.post(`/invites/${tokenOf(second.url)}/accept`);
    expect(back.status).toBe(200);
    expect(back.body.member).toMatchObject({ id: memberId, role: "guest" });
  });

  it("rejects teams from another organization", async () => {
    const t = await startTestServer();
    const { owner, org } = await setup(t.baseUrl);
    const other = await owner.post("/organizations", { name: "Other", slug: "other" });
    const foreign = (
      await owner.post(`/organizations/${other.body.organization.id}/teams`, { name: "X", key: "XX" })
    ).body;

    const res = await owner.post(`${org}/invites`, { email: "mia@example.com", teamIds: [foreign.id] });
    expect(res.status).toBe(400);
  });
});
