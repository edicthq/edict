import { expect } from "vitest";
import { signUpAs, type ApiClient } from "./server.js";

// An organization with its Owner signed in. `org` is the path prefix for its
// endpoints.
export async function orgWithOwner(baseUrl: string, name = "Owner") {
  const owner = await signUpAs(baseUrl, name);
  const res = await owner.post("/organizations", { name: "Acme", slug: "acme" });
  expect(res.status).toBe(201);
  const orgId = res.body.organization.id as string;
  return { owner, orgId, ownerId: res.body.member.id as string, org: `/organizations/${orgId}` };
}

export async function createTeam(client: ApiClient, org: string, key: string, options: { private?: boolean } = {}) {
  const res = await client.post(`${org}/teams`, { name: key, key, ...options });
  expect(res.status).toBe(201);
  return res.body as { id: string; key: string; version: number };
}

// Brings a new user into the organization through an invite.
export async function join(
  baseUrl: string,
  inviter: ApiClient,
  org: string,
  name: string,
  role: string,
  teamIds: string[] = [],
) {
  const invitee = await signUpAs(baseUrl, name);
  const invite = await inviter.post(`${org}/invites`, {
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
