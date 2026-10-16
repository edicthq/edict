import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, isNull } from "drizzle-orm";
import { emit, members, teamMembers, teams } from "@edicthq/db";
import { AddTeamMember, CreateTeam, Id, Member, Team } from "@edicthq/schema";
import {
  activeMember,
  atLeast,
  loadMember,
  memberWithUser,
  requireRole,
  teamVisibility,
  toMember,
  toTeam,
  visibleTeam,
} from "./access.js";
import { OrgParams, body, errors, inOrg, json, noContent, router, type ApiDeps } from "./context.js";
import { conflict, forbidden, isUniqueViolation, notFound } from "./errors.js";

const TeamParams = OrgParams.extend({ teamId: Id });
const TeamMemberParams = TeamParams.extend({ memberId: Id });

const createTeam = createRoute({
  method: "post",
  path: "/organizations/{orgId}/teams",
  tags: ["Teams"],
  summary: "Create a team. The caller joins it.",
  request: { params: OrgParams, ...body(CreateTeam) },
  responses: {
    201: json(Team, "The new team"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const listTeams = createRoute({
  method: "get",
  path: "/organizations/{orgId}/teams",
  tags: ["Teams"],
  summary: "Teams the caller can see",
  description:
    "Admins and Owners see every team. Members see public teams and their private ones. Guests see only their own.",
  request: { params: OrgParams },
  responses: {
    200: json(z.array(Team), "Visible teams, by key"),
    ...errors("unauthorized", "not_found"),
  },
});

const listTeamMembers = createRoute({
  method: "get",
  path: "/organizations/{orgId}/teams/{teamId}/members",
  tags: ["Teams"],
  summary: "Members of a team",
  request: { params: TeamParams },
  responses: {
    200: json(z.array(Member), "The team's members"),
    ...errors("unauthorized", "not_found"),
  },
});

const addTeamMember = createRoute({
  method: "post",
  path: "/organizations/{orgId}/teams/{teamId}/members",
  tags: ["Teams"],
  summary: "Add a member to a team",
  description: "Admins and Owners add anyone. Members can join a public team themselves.",
  request: { params: TeamParams, ...body(AddTeamMember) },
  responses: {
    201: json(Member, "The member who joined"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const removeTeamMember = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/teams/{teamId}/members/{memberId}",
  tags: ["Teams"],
  summary: "Remove a member from a team, or leave it",
  request: { params: TeamMemberParams },
  responses: {
    ...noContent,
    ...errors("unauthorized", "forbidden", "not_found"),
  },
});

export function teamRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(createTeam, async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    try {
      const team = await inOrg(deps, c, orgId, async (tx, caller) => {
        requireRole(caller, "admin", "create teams");
        const [team] = await tx.insert(teams).values({ orgId, ...input }).returning();
        await tx.insert(teamMembers).values({ orgId, teamId: team!.id, memberId: caller.id });
        await emit(tx, orgId, {
          type: "team.created",
          actorId: caller.id,
          subjectId: team!.id,
          data: { name: team!.name, key: team!.key, private: team!.private },
        });
        await emit(tx, orgId, {
          type: "team.member_added",
          actorId: caller.id,
          subjectId: team!.id,
          data: { memberId: caller.id },
        });
        return team!;
      });
      return c.json(toTeam(team), 201);
    } catch (error) {
      if (isUniqueViolation(error, "teams_org_id_key_unique")) {
        throw conflict(`A team already uses the key ${input.key}.`);
      }
      throw error;
    }
  });

  app.openapi(listTeams, async (c) => {
    const { orgId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, (tx, caller) =>
      tx
        .select()
        .from(teams)
        .where(and(eq(teams.orgId, orgId), teamVisibility(tx, caller)))
        .orderBy(asc(teams.key)),
    );
    return c.json(rows.map(toTeam), 200);
  });

  app.openapi(listTeamMembers, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, async (tx, caller) => {
      await visibleTeam(tx, caller, teamId);
      return memberWithUser(tx)
        .innerJoin(teamMembers, eq(teamMembers.memberId, members.id))
        .where(and(eq(teamMembers.teamId, teamId), isNull(members.removedAt)))
        .orderBy(asc(teamMembers.createdAt));
    });
    return c.json(rows.map(toMember), 200);
  });

  app.openapi(addTeamMember, async (c) => {
    const { orgId, teamId } = c.req.valid("param");
    const { memberId } = c.req.valid("json");
    const member = await inOrg(deps, c, orgId, async (tx, caller) => {
      // A private team is invisible to Members outside it, so they get 404.
      await visibleTeam(tx, caller, teamId);
      if (!atLeast(caller.role, "admin") && memberId !== caller.id) {
        throw forbidden("Only Admins and Owners can add other members to a team.");
      }
      await activeMember(tx, orgId, memberId);
      const added = await tx
        .insert(teamMembers)
        .values({ orgId, teamId, memberId })
        .onConflictDoNothing()
        .returning();
      if (added.length === 0) {
        throw conflict("The member is already in this team.");
      }
      await emit(tx, orgId, {
        type: "team.member_added",
        actorId: caller.id,
        subjectId: teamId,
        data: { memberId },
      });
      return loadMember(tx, orgId, memberId);
    });
    return c.json(member, 201);
  });

  app.openapi(removeTeamMember, async (c) => {
    const { orgId, teamId, memberId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      await visibleTeam(tx, caller, teamId);
      if (memberId !== caller.id) {
        requireRole(caller, "admin", "remove other members from a team");
      }
      const removed = await tx
        .delete(teamMembers)
        .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.memberId, memberId)))
        .returning();
      if (removed.length === 0) {
        throw notFound("team member");
      }
      await emit(tx, orgId, {
        type: "team.member_removed",
        actorId: caller.id,
        subjectId: teamId,
        data: { memberId },
      });
    });
    return c.body(null, 204);
  });

  return app;
}
