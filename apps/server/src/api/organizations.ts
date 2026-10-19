import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, isNull, notExists, sql } from "drizzle-orm";
import {
  emit,
  enterOrg,
  inScope,
  members,
  organizations,
  teamMembers,
  user as userTable,
  type Transaction,
} from "@edicthq/db";
import {
  CreateOrganization,
  Id,
  Member,
  Membership,
  Organization,
  UpdateMember,
  UpdateOrganization,
} from "@edicthq/schema";
import {
  activeMember,
  atLeast,
  loadMember,
  memberColumns,
  memberWithUser,
  requireNotAbove,
  requireRole,
  requireWithinCaller,
  toMember,
} from "./access.js";
import { pauseConnectedAgents } from "./agents.js";
import { callerIn, credentialOrg, scopeFor } from "./callers.js";
import {
  OrgParams,
  body,
  credential,
  errors,
  inOrg,
  json,
  noContent,
  router,
  signedIn,
  type ApiDeps,
} from "./context.js";
import { changesOf, conflict, forbidden, invalid, isUniqueViolation, notFound } from "./errors.js";
import { domainOf } from "../instance.js";

type OrganizationRow = typeof organizations.$inferSelect;

export function toOrganization(row: OrganizationRow): Organization {
  return { id: row.id, name: row.name, slug: row.slug, joinDomain: row.joinDomain, createdAt: row.createdAt.toISOString() };
}

const updateOrganization = createRoute({
  method: "patch",
  path: "/organizations/{orgId}",
  tags: ["Organizations"],
  summary: "Rename the organization, or set who may join by their email's domain",
  description: "Admins and Owners. With a joinDomain, anyone with a verified address at it may join as a Member.",
  request: { params: OrgParams, ...body(UpdateOrganization) },
  responses: {
    200: json(Organization, "The organization"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found"),
  },
});

const listJoinable = createRoute({
  method: "get",
  path: "/organizations/joinable",
  tags: ["Organizations"],
  summary: "Organizations the signed-in person may join by their verified email's domain",
  responses: {
    200: json(z.array(Organization), "Organizations open to the caller's domain"),
    ...errors("unauthorized", "forbidden"),
  },
});

const joinOrganization = createRoute({
  method: "post",
  path: "/organizations/{orgId}/join",
  tags: ["Organizations"],
  summary: "Join an organization whose domain rule matches your verified email",
  description: "You join as a Member. Someone removed from the organization needs an invite to come back.",
  request: { params: OrgParams },
  responses: {
    200: json(Membership, "The organization and the caller's member in it"),
    ...errors("unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const MemberParams = OrgParams.extend({ memberId: Id });

const createOrganization = createRoute({
  method: "post",
  path: "/organizations",
  tags: ["Organizations"],
  summary: "Create an organization. The caller becomes its Owner.",
  request: body(CreateOrganization),
  responses: {
    201: json(Membership, "The new organization and the caller's member in it"),
    ...errors("invalid_request", "unauthorized", "conflict"),
  },
});

const listOrganizations = createRoute({
  method: "get",
  path: "/organizations",
  tags: ["Organizations"],
  summary: "Organizations the caller is a member of",
  responses: {
    200: json(z.array(Membership), "The caller's memberships"),
    ...errors("unauthorized"),
  },
});

const listMembers = createRoute({
  method: "get",
  path: "/organizations/{orgId}/members",
  tags: ["Members"],
  summary: "Members of an organization",
  request: { params: OrgParams },
  responses: {
    200: json(z.array(Member), "Current members, humans and agents"),
    ...errors("unauthorized", "not_found"),
  },
});

const updateMember = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/members/{memberId}",
  tags: ["Members"],
  summary: "Change a member's role",
  description:
    "Admins and Owners change roles. Only Owners grant or take away the Owner role, and the last Owner stays an Owner.",
  request: { params: MemberParams, ...body(UpdateMember) },
  responses: {
    200: json(Member, "The member with the new role"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const removeMember = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/members/{memberId}",
  tags: ["Members"],
  summary: "Remove a member, or leave the organization",
  description:
    "Admins and Owners remove members, and anyone can remove themselves. Only Owners remove an Owner, and the last Owner cannot leave. The member's history stays, and agents they connected are paused.",
  request: { params: MemberParams },
  responses: {
    ...noContent,
    ...errors("unauthorized", "forbidden", "not_found", "conflict"),
  },
});

export function organizationRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(createOrganization, async (c) => {
    const user = signedIn(c);
    const input = c.req.valid("json");
    try {
      const result = await inScope(deps.db, { userId: user.id }, async (tx) => {
        // The insert policy only admits the organization the scope is in.
        const { rows } = await tx.execute<{ id: string }>(sql`SELECT uuidv7() AS id`);
        const id = rows[0]!.id;
        await enterOrg(tx, id);
        const [organization] = await tx
          .insert(organizations)
          .values({ id, name: input.name, slug: input.slug })
          .returning();
        const [owner] = await tx
          .insert(members)
          .values({ orgId: id, kind: "human", userId: user.id, role: "owner" })
          .returning();
        await emit(tx, id, {
          type: "organization.created",
          actorId: owner!.id,
          subjectId: id,
          data: { name: input.name, slug: input.slug },
        });
        return { organization: toOrganization(organization!), member: await loadMember(tx, id, owner!.id) };
      });
      return c.json(result, 201);
    } catch (error) {
      if (isUniqueViolation(error, "organizations_slug_unique")) {
        throw conflict(`The slug "${input.slug}" is taken.`);
      }
      throw error;
    }
  });

  app.openapi(updateOrganization, async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    const organization = await inOrg(deps, c, orgId, async (tx, caller) => {
      if (input.name !== undefined) requireRole(caller, "admin", "rename the organization");
      // Letting a domain in is managing members.
      if (input.joinDomain !== undefined) requireRole(caller, "admin", "set who may join by domain", "members");
      const [current] = await tx.select().from(organizations).where(eq(organizations.id, orgId)).for("update");
      const changes = changesOf(current!, input);
      if (Object.keys(changes).length === 0) return current!;
      const [updated] = await tx
        .update(organizations)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(organizations.id, orgId))
        .returning();
      await emit(tx, orgId, { type: "organization.updated", actorId: caller.id, subjectId: orgId, data: { changes } });
      return updated!;
    });
    return c.json(toOrganization(organization), 200);
  });

  app.openapi(listJoinable, async (c) => {
    const user = signedIn(c);
    if (!user.emailVerified) return c.json([], 200);
    const domain = domainOf(user.email);
    const rows = await inScope(deps.db, { userId: user.id, joinDomain: domain }, (tx) =>
      tx
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.joinDomain, domain),
            // Members already, and people who were removed, are left out.
            notExists(tx.select({ id: members.id }).from(members).where(and(eq(members.orgId, organizations.id), eq(members.userId, user.id)))),
          ),
        )
        .orderBy(asc(organizations.name)),
    );
    return c.json(rows.map(toOrganization), 200);
  });

  app.openapi(joinOrganization, async (c) => {
    const { orgId } = c.req.valid("param");
    const user = signedIn(c);
    if (!user.emailVerified) {
      throw forbidden("Verify your email first: a domain rule only trusts a proven address.");
    }
    const domain = domainOf(user.email);
    const membership = await inScope(deps.db, { userId: user.id, joinDomain: domain }, async (tx) => {
      const [organization] = await tx
        .select()
        .from(organizations)
        .where(and(eq(organizations.id, orgId), eq(organizations.joinDomain, domain)));
      if (!organization) throw notFound("organization");
      await enterOrg(tx, orgId);
      const [previous] = await tx.select().from(members).where(and(eq(members.orgId, orgId), eq(members.userId, user.id)));
      if (previous && !previous.removedAt) throw conflict("You are already a member of this organization.");
      if (previous) throw forbidden("You were removed from this organization. Ask an Admin for an invite to come back.");
      const [member] = await tx.insert(members).values({ orgId, kind: "human", userId: user.id, role: "member" }).returning();
      await emit(tx, orgId, { type: "member.joined", actorId: member!.id, subjectId: member!.id, data: { domain } });
      return { organization: toOrganization(organization), member: await loadMember(tx, orgId, member!.id) };
    });
    return c.json(membership, 200);
  });

  app.openapi(listOrganizations, async (c) => {
    const found = credential(c);
    if (found.kind !== "session") {
      // An agent belongs to one organization.
      const membership = await inScope(deps.db, scopeFor(found), async (tx) => {
        const orgId = (await credentialOrg(tx, found))!;
        const caller = await callerIn(tx, orgId, found);
        const [organization] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
        return { organization: toOrganization(organization!), member: await loadMember(tx, orgId, caller.id) };
      });
      return c.json([membership], 200);
    }
    const user = found.user;
    const rows = await inScope(deps.db, { userId: user.id }, (tx) =>
      tx
        .select({ organization: organizations, ...memberColumns })
        .from(members)
        .innerJoin(organizations, eq(organizations.id, members.orgId))
        .leftJoin(userTable, eq(userTable.id, members.userId))
        .where(and(eq(members.userId, user.id), isNull(members.removedAt)))
        .orderBy(asc(organizations.name)),
    );
    return c.json(
      rows.map((row) => ({ organization: toOrganization(row.organization), member: toMember(row) })),
      200,
    );
  });

  app.openapi(listMembers, async (c) => {
    const { orgId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, (tx) =>
      memberWithUser(tx)
        .where(and(eq(members.orgId, orgId), isNull(members.removedAt)))
        .orderBy(asc(members.createdAt)),
    );
    return c.json(rows.map(toMember), 200);
  });

  app.openapi(updateMember, async (c) => {
    const { orgId, memberId } = c.req.valid("param");
    const { role } = c.req.valid("json");
    const member = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireRole(caller, "admin", "change roles", "members");
      const target = await activeMember(tx, orgId, memberId);
      if (caller.kind === "agent" && target.id === caller.id) {
        throw forbidden("An agent cannot change its own role. An admin can.");
      }
      requireNotAbove(caller, target, "change roles");
      requireWithinCaller(caller, { role });
      if ((target.role === "owner" || role === "owner") && caller.role !== "owner") {
        throw forbidden("Only Owners can grant or take away the Owner role.");
      }
      if (target.kind === "agent" && atLeast(role, "admin")) {
        throw invalid("An agent can only be a Member or a Guest.");
      }
      if (target.role === role) {
        return loadMember(tx, orgId, memberId);
      }
      if (target.role === "owner") {
        await requireAnotherOwner(tx, orgId, target.id);
      }
      await tx.update(members).set({ role }).where(eq(members.id, target.id));
      await emit(tx, orgId, {
        type: "member.role_changed",
        actorId: caller.id,
        subjectId: target.id,
        data: { from: target.role, to: role },
      });
      return loadMember(tx, orgId, memberId);
    });
    return c.json(member, 200);
  });

  app.openapi(removeMember, async (c) => {
    const { orgId, memberId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      const target = await activeMember(tx, orgId, memberId);
      if (target.id !== caller.id) {
        requireRole(caller, "admin", "remove members", "members");
        requireNotAbove(caller, target, "remove members");
        if (target.role === "owner" && caller.role !== "owner") {
          throw forbidden("Only Owners can remove an Owner.");
        }
      }
      if (target.role === "owner") {
        await requireAnotherOwner(tx, orgId, target.id);
      }
      await tx.update(members).set({ removedAt: new Date() }).where(eq(members.id, target.id));
      await tx.delete(teamMembers).where(eq(teamMembers.memberId, target.id));
      await emit(tx, orgId, { type: "member.removed", actorId: caller.id, subjectId: target.id });
      await pauseConnectedAgents(tx, caller.id, target);
    });
    return c.body(null, 204);
  });

  return app;
}

// Locks the Owners' rows, so two Owners demoting each other at once cannot
// leave the organization without one.
async function requireAnotherOwner(tx: Transaction, orgId: string, ownerId: string) {
  const owners = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.role, "owner"), isNull(members.removedAt)))
    .for("update");
  if (!owners.some((owner) => owner.id !== ownerId)) {
    throw conflict("An organization needs at least one Owner. Make someone else an Owner first.");
  }
}
