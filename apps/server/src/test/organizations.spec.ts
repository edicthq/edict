import { describe, expect, it } from "vitest";
import { apiClient, signUpAs, startTestServer, type ApiClient } from "./server.js";

async function createOrg(client: ApiClient, slug = "acme") {
  const res = await client.post("/organizations", { name: "Acme", slug });
  expect(res.status).toBe(201);
  return res.body as { organization: { id: string }; member: { id: string } };
}

// Brings a second user into the organization through an invite.
async function join(baseUrl: string, inviter: ApiClient, orgId: string, name: string, role: string, teamIds: string[] = []) {
  const invitee = await signUpAs(baseUrl, name);
  const invite = await inviter.post(`/organizations/${orgId}/invites`, {
    email: `${name.toLowerCase()}@example.com`,
    role,
    teamIds,
  });
  expect(invite.status).toBe(201);
  const token = new URL(invite.body.url).pathname.split("/").pop();
  const accepted = await invitee.post(`/invites/${token}/accept`);
  expect(accepted.status).toBe(200);
  return { client: invitee, memberId: accepted.body.member.id as string };
}

describe("organizations", () => {
  it("needs a signed-in user", async () => {
    const t = await startTestServer();
    const res = await apiClient(t.baseUrl).get("/organizations");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("unauthorized");
  });

  it("makes the creator its Owner and lists it for them", async () => {
    const t = await startTestServer();
    const amirali = await signUpAs(t.baseUrl, "Amirali");

    const created = await amirali.post("/organizations", { name: "Acme", slug: "acme" });
    expect(created.status).toBe(201);
    expect(created.body.organization).toMatchObject({ name: "Acme", slug: "acme" });
    expect(created.body.member).toMatchObject({
      kind: "human",
      role: "owner",
      name: "Amirali",
      email: "amirali@example.com",
    });

    const list = await amirali.get("/organizations");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].organization.slug).toBe("acme");
    expect(list.body[0].member.role).toBe("owner");
  });

  it("hides organizations from users who are not members", async () => {
    const t = await startTestServer();
    const amirali = await signUpAs(t.baseUrl, "Amirali");
    const stranger = await signUpAs(t.baseUrl, "Stranger");
    const { organization } = await createOrg(amirali);

    expect((await stranger.get("/organizations")).body).toEqual([]);
    const res = await stranger.get(`/organizations/${organization.id}/teams`);
    expect(res.status).toBe(404);
  });

  it("rejects a taken slug and an invalid one", async () => {
    const t = await startTestServer();
    const amirali = await signUpAs(t.baseUrl, "Amirali");
    await createOrg(amirali, "acme");

    const taken = await amirali.post("/organizations", { name: "Other", slug: "acme" });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("conflict");

    const invalid = await amirali.post("/organizations", { name: "Other", slug: "Not A Slug" });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("invalid_request");
  });
});

describe("teams", () => {
  it("an admin creates a team and joins it", async () => {
    const t = await startTestServer();
    const amirali = await signUpAs(t.baseUrl, "Amirali");
    const { organization, member } = await createOrg(amirali);

    const res = await amirali.post(`/organizations/${organization.id}/teams`, {
      name: "Engineering",
      key: "ENG",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Engineering", key: "ENG", private: false });

    const members = await amirali.get(`/organizations/${organization.id}/teams/${res.body.id}/members`);
    expect(members.status).toBe(200);
    expect(members.body.map((m: { id: string }) => m.id)).toEqual([member.id]);
  });

  it("rejects a duplicate or malformed team key", async () => {
    const t = await startTestServer();
    const amirali = await signUpAs(t.baseUrl, "Amirali");
    const { organization } = await createOrg(amirali);
    await amirali.post(`/organizations/${organization.id}/teams`, { name: "Engineering", key: "ENG" });

    const dup = await amirali.post(`/organizations/${organization.id}/teams`, { name: "Eng 2", key: "ENG" });
    expect(dup.status).toBe(409);

    const bad = await amirali.post(`/organizations/${organization.id}/teams`, { name: "Design", key: "design" });
    expect(bad.status).toBe(400);
  });

  it("only admins and owners create teams", async () => {
    const t = await startTestServer();
    const owner = await signUpAs(t.baseUrl, "Owner");
    const { organization } = await createOrg(owner);
    const { client: member } = await join(t.baseUrl, owner, organization.id, "Mia", "member");

    const res = await member.post(`/organizations/${organization.id}/teams`, { name: "Design", key: "DES" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("forbidden");
  });

  it("members see public teams and their private ones; guests see only their own", async () => {
    const t = await startTestServer();
    const owner = await signUpAs(t.baseUrl, "Owner");
    const { organization } = await createOrg(owner);
    const org = `/organizations/${organization.id}`;

    const eng = (await owner.post(`${org}/teams`, { name: "Engineering", key: "ENG" })).body;
    const ops = (await owner.post(`${org}/teams`, { name: "Ops", key: "OPS", private: true })).body;
    const sec = (await owner.post(`${org}/teams`, { name: "Security", key: "SEC", private: true })).body;

    const { client: member } = await join(t.baseUrl, owner, organization.id, "Mia", "member", [ops.id]);
    const { client: guest } = await join(t.baseUrl, owner, organization.id, "Gus", "guest", [sec.id]);

    const keys = (res: { body: { key: string }[] }) => res.body.map((team) => team.key).sort();
    expect(keys(await owner.get(`${org}/teams`))).toEqual(["ENG", "OPS", "SEC"]);
    expect(keys(await member.get(`${org}/teams`))).toEqual(["ENG", "OPS"]);
    expect(keys(await guest.get(`${org}/teams`))).toEqual(["SEC"]);

    expect((await guest.get(`${org}/teams/${eng.id}/members`)).status).toBe(404);
  });

  it("a member joins a public team themselves but not a private one", async () => {
    const t = await startTestServer();
    const owner = await signUpAs(t.baseUrl, "Owner");
    const { organization } = await createOrg(owner);
    const org = `/organizations/${organization.id}`;
    const eng = (await owner.post(`${org}/teams`, { name: "Engineering", key: "ENG" })).body;
    const ops = (await owner.post(`${org}/teams`, { name: "Ops", key: "OPS", private: true })).body;
    const { client: mia, memberId } = await join(t.baseUrl, owner, organization.id, "Mia", "member");

    expect((await mia.post(`${org}/teams/${eng.id}/members`, { memberId })).status).toBe(201);
    expect((await mia.post(`${org}/teams/${ops.id}/members`, { memberId })).status).toBe(404);
    expect((await owner.post(`${org}/teams/${ops.id}/members`, { memberId })).status).toBe(201);
    expect((await mia.delete(`${org}/teams/${eng.id}/members/${memberId}`)).status).toBe(204);
  });
});

describe("members and roles", () => {
  it("an owner changes a member's role", async () => {
    const t = await startTestServer();
    const owner = await signUpAs(t.baseUrl, "Owner");
    const { organization } = await createOrg(owner);
    const { memberId } = await join(t.baseUrl, owner, organization.id, "Mia", "member");

    const res = await owner.patch(`/organizations/${organization.id}/members/${memberId}`, { role: "admin" });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("admin");
  });

  it("an admin cannot make anyone an Owner or change an Owner", async () => {
    const t = await startTestServer();
    const owner = await signUpAs(t.baseUrl, "Owner");
    const { organization, member: ownerMember } = await createOrg(owner);
    const org = `/organizations/${organization.id}`;
    const { client: admin } = await join(t.baseUrl, owner, organization.id, "Ada", "admin");
    const { memberId } = await join(t.baseUrl, owner, organization.id, "Mia", "member");

    expect((await admin.patch(`${org}/members/${memberId}`, { role: "owner" })).status).toBe(403);
    expect((await admin.patch(`${org}/members/${ownerMember.id}`, { role: "member" })).status).toBe(403);
    expect((await admin.delete(`${org}/members/${ownerMember.id}`)).status).toBe(403);
    expect((await admin.patch(`${org}/members/${memberId}`, { role: "guest" })).status).toBe(200);
  });

  it("the last Owner can be neither demoted nor removed", async () => {
    const t = await startTestServer();
    const owner = await signUpAs(t.baseUrl, "Owner");
    const { organization, member } = await createOrg(owner);
    const org = `/organizations/${organization.id}`;

    const demote = await owner.patch(`${org}/members/${member.id}`, { role: "admin" });
    expect(demote.status).toBe(409);
    const remove = await owner.delete(`${org}/members/${member.id}`);
    expect(remove.status).toBe(409);

    const { memberId: second } = await join(t.baseUrl, owner, organization.id, "Olga", "owner");
    expect(second).toBeDefined();
    expect((await owner.patch(`${org}/members/${member.id}`, { role: "admin" })).status).toBe(200);
  });

  it("a removed member loses access, and the member list no longer shows them", async () => {
    const t = await startTestServer();
    const owner = await signUpAs(t.baseUrl, "Owner");
    const { organization } = await createOrg(owner);
    const org = `/organizations/${organization.id}`;
    const { client: mia, memberId } = await join(t.baseUrl, owner, organization.id, "Mia", "member");

    expect((await owner.delete(`${org}/members/${memberId}`)).status).toBe(204);
    expect((await mia.get(`${org}/teams`)).status).toBe(404);
    expect((await mia.get("/organizations")).body).toEqual([]);

    const names = (await owner.get(`${org}/members`)).body.map((m: { name: string }) => m.name);
    expect(names).toEqual(["Owner"]);
  });
});

describe("event log", () => {
  it("records every change with its actor, readable by admins only", async () => {
    const t = await startTestServer();
    const owner = await signUpAs(t.baseUrl, "Owner");
    const { organization, member } = await createOrg(owner);
    const org = `/organizations/${organization.id}`;
    const team = (await owner.post(`${org}/teams`, { name: "Engineering", key: "ENG" })).body;
    const { client: mia, memberId } = await join(t.baseUrl, owner, organization.id, "Mia", "member");
    await owner.patch(`${org}/members/${memberId}`, { role: "guest" });

    const res = await owner.get(`${org}/events`);
    expect(res.status).toBe(200);
    const log = (res.body as { type: string; actorId: string; subjectId: string; data: object }[])
      .map(({ type, actorId, subjectId }) => ({ type, actorId, subjectId }))
      .reverse();
    expect(log).toEqual([
      { type: "organization.created", actorId: member.id, subjectId: organization.id },
      { type: "team.created", actorId: member.id, subjectId: team.id },
      { type: "team.member_added", actorId: member.id, subjectId: team.id },
      { type: "invite.created", actorId: member.id, subjectId: expect.any(String) },
      { type: "invite.accepted", actorId: memberId, subjectId: expect.any(String) },
      { type: "member.role_changed", actorId: member.id, subjectId: memberId },
    ]);
    expect(res.body[0].data).toEqual({ from: "member", to: "guest" });

    expect((await mia.get(`${org}/events`)).status).toBe(403);
  });
});

describe("the organization's default accent", () => {
  it("starts violet, and only Admins and Owners change it", async () => {
    const t = await startTestServer();
    const owner = await signUpAs(t.baseUrl, "Owner");
    const { organization } = await createOrg(owner);
    const { client: mina } = await join(t.baseUrl, owner, organization.id, "Mina", "member");

    const mine = (await mina.get("/organizations")).body[0].organization;
    expect(mine.defaultAccent).toBe("violet");
    expect((await mina.patch(`/organizations/${organization.id}`, { defaultAccent: "teal" })).status).toBe(403);
    const set = await owner.patch(`/organizations/${organization.id}`, { defaultAccent: "teal" });
    expect(set.status).toBe(200);
    expect(set.body.defaultAccent).toBe("teal");
    expect((await mina.get("/organizations")).body[0].organization.defaultAccent).toBe("teal");
    expect((await owner.patch(`/organizations/${organization.id}`, { defaultAccent: "orange" })).status).toBe(400);
  });
});

