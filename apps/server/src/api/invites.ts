import { createHash, randomBytes } from "node:crypto";
import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import {
  emit,
  enterOrg,
  inScope,
  invites,
  members,
  organizations,
  teamMembers,
  teams,
  user,
  type Transaction,
} from "@edicthq/db";
import { CreateInvite, CreatedInvite, Id, Invite, InvitePreview, Membership } from "@edicthq/schema";
import { inviteEmail } from "../email.js";
import { loadMember, requireRole } from "./access.js";
import { OrgParams, body, errors, inOrg, json, noContent, router, signedIn, type ApiDeps } from "./context.js";
import { conflict, forbidden, gone, invalid, notFound } from "./errors.js";
import { toOrganization } from "./organizations.js";

const INVITE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

type InviteRow = typeof invites.$inferSelect;

function toInvite(row: InviteRow): z.infer<typeof Invite> {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    teamIds: row.teamIds,
    invitedBy: row.invitedBy,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const TokenParams = z.object({ token: z.string().min(1).max(200) });

const createInvite = createRoute({
  method: "post",
  path: "/organizations/{orgId}/invites",
  tags: ["Invites"],
  summary: "Invite someone by email",
  description:
    "Returns the invite link once. Share it yourself when the instance has no email set up. A new invite for the same email replaces the open one.",
  request: { params: OrgParams, ...body(CreateInvite) },
  responses: {
    201: json(CreatedInvite, "The invite and its link"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const listInvites = createRoute({
  method: "get",
  path: "/organizations/{orgId}/invites",
  tags: ["Invites"],
  summary: "Open invites",
  request: { params: OrgParams },
  responses: {
    200: json(z.array(Invite), "Invites not yet accepted, revoked or expired"),
    ...errors("unauthorized", "forbidden", "not_found"),
  },
});

const revokeInvite = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/invites/{inviteId}",
  tags: ["Invites"],
  summary: "Revoke an open invite",
  request: { params: OrgParams.extend({ inviteId: Id }) },
  responses: {
    ...noContent,
    ...errors("unauthorized", "forbidden", "not_found"),
  },
});

const previewInvite = createRoute({
  method: "get",
  path: "/invites/{token}",
  tags: ["Invites"],
  summary: "What an invite link offers, before accepting it",
  request: { params: TokenParams },
  responses: {
    200: json(InvitePreview, "The invite"),
    ...errors("not_found", "gone"),
  },
});

const acceptInvite = createRoute({
  method: "post",
  path: "/invites/{token}/accept",
  tags: ["Invites"],
  summary: "Accept an invite as the signed-in user",
  description:
    "The signed-in user's email must be the invited one, and verified when the instance sends email.",
  request: { params: TokenParams },
  responses: {
    200: json(Membership, "The organization joined and the caller's member in it"),
    ...errors("unauthorized", "forbidden", "not_found", "conflict", "gone"),
  },
});

// Finds an open invite by its link token and enters its organization's scope.
async function openInvite(tx: Transaction, token: string): Promise<InviteRow> {
  const [invite] = await tx.select().from(invites).where(eq(invites.tokenHash, hashToken(token)));
  if (!invite || invite.acceptedAt || invite.revokedAt) {
    throw notFound("invite");
  }
  if (invite.expiresAt <= new Date()) {
    throw gone("This invite has expired. Ask for a new one.");
  }
  await enterOrg(tx, invite.orgId);
  return invite;
}

export function inviteRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(createInvite, async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    const email = input.email.toLowerCase();
    const token = randomBytes(32).toString("base64url");

    const { invite, inviterName, organizationName } = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireRole(caller, "admin", "invite people");
      if (input.role === "owner") {
        requireRole(caller, "owner", "invite Owners");
      }

      const [existing] = await tx
        .select({ id: members.id })
        .from(members)
        .innerJoin(user, eq(user.id, members.userId))
        .where(and(eq(members.orgId, orgId), isNull(members.removedAt), sql`lower(${user.email}) = ${email}`));
      if (existing) {
        throw conflict(`${email} is already a member.`);
      }

      const teamIds = [...new Set(input.teamIds)];
      if (teamIds.length > 0) {
        const found = await tx.select({ id: teams.id }).from(teams).where(inArray(teams.id, teamIds));
        if (found.length !== teamIds.length) {
          throw invalid("Some of teamIds are not teams in this organization.");
        }
      }

      const replaced = await tx
        .update(invites)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(invites.orgId, orgId), eq(invites.email, email), isNull(invites.acceptedAt), isNull(invites.revokedAt)),
        )
        .returning({ id: invites.id });
      for (const { id } of replaced) {
        await emit(tx, orgId, { type: "invite.revoked", actorId: caller.id, subjectId: id, data: { email } });
      }

      const [invite] = await tx
        .insert(invites)
        .values({
          orgId,
          email,
          role: input.role,
          teamIds,
          invitedBy: caller.id,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + INVITE_LIFETIME_MS),
        })
        .returning();
      await emit(tx, orgId, {
        type: "invite.created",
        actorId: caller.id,
        subjectId: invite!.id,
        data: { email, role: input.role, teamIds },
      });
      const [organization] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
      const inviter = await loadMember(tx, orgId, caller.id);
      return { invite: invite!, inviterName: inviter.name, organizationName: organization!.name };
    });

    const base = deps.publicUrl ?? new URL(c.req.url).origin;
    const url = new URL(`/invite/${token}`, base).toString();
    // After the commit: the link exists only in this request, since only its
    // hash is stored. A failed send leaves the invite in place to share by hand.
    let emailSent = false;
    if (deps.mailer) {
      try {
        await deps.mailer.send(
          inviteEmail({ to: email, inviterName, organizationName, role: invite.role, url }),
        );
        emailSent = true;
      } catch (error) {
        console.error(`Emailing the invite for ${email} failed`, error);
      }
    }
    return c.json({ ...toInvite(invite), url, emailSent }, 201);
  });

  app.openapi(listInvites, async (c) => {
    const { orgId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, (tx, caller) => {
      requireRole(caller, "admin", "see invites");
      return tx
        .select()
        .from(invites)
        .where(
          and(
            eq(invites.orgId, orgId),
            isNull(invites.acceptedAt),
            isNull(invites.revokedAt),
            gt(invites.expiresAt, new Date()),
          ),
        )
        .orderBy(asc(invites.createdAt));
    });
    return c.json(rows.map(toInvite), 200);
  });

  app.openapi(revokeInvite, async (c) => {
    const { orgId, inviteId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      requireRole(caller, "admin", "revoke invites");
      const revoked = await tx
        .update(invites)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(invites.orgId, orgId), eq(invites.id, inviteId), isNull(invites.acceptedAt), isNull(invites.revokedAt)),
        )
        .returning();
      if (revoked.length === 0) {
        throw notFound("open invite");
      }
      await emit(tx, orgId, {
        type: "invite.revoked",
        actorId: caller.id,
        subjectId: inviteId,
        data: { email: revoked[0]!.email },
      });
    });
    return c.body(null, 204);
  });

  app.openapi(previewInvite, async (c) => {
    const { token } = c.req.valid("param");
    const preview = await inScope(deps.db, { inviteTokenHash: hashToken(token) }, async (tx) => {
      const invite = await openInvite(tx, token);
      const [organization] = await tx.select().from(organizations).where(eq(organizations.id, invite.orgId));
      const inviter = await loadMember(tx, invite.orgId, invite.invitedBy);
      return {
        organization: { name: organization!.name, slug: organization!.slug },
        email: invite.email,
        role: invite.role,
        invitedBy: { name: inviter.name },
        expiresAt: invite.expiresAt.toISOString(),
      };
    });
    return c.json(preview, 200);
  });

  app.openapi(acceptInvite, async (c) => {
    const { token } = c.req.valid("param");
    const signedInUser = signedIn(c);
    const membership = await inScope(
      deps.db,
      { userId: signedInUser.id, inviteTokenHash: hashToken(token) },
      async (tx) => {
        const invite = await openInvite(tx, token);
        if (signedInUser.email.toLowerCase() !== invite.email) {
          throw forbidden(`This invite is for ${invite.email}. Sign in with that email to accept it.`);
        }
        // With email set up, the address must be proven, or anyone holding the
        // link could sign up as the invitee (ADR 0016).
        if (deps.mailer && !signedInUser.emailVerified) {
          throw forbidden(`Verify ${invite.email} first: open the link in the email Edict sent you, then accept.`);
        }
        const orgId = invite.orgId;

        // Claim the invite first. A second accept racing this one waits on the
        // row lock, then finds the invite taken.
        const claimed = await tx
          .update(invites)
          .set({ acceptedAt: new Date() })
          .where(and(eq(invites.id, invite.id), isNull(invites.acceptedAt), isNull(invites.revokedAt)))
          .returning();
        if (claimed.length === 0) {
          throw notFound("invite");
        }

        const [previous] = await tx
          .select()
          .from(members)
          .where(and(eq(members.orgId, orgId), eq(members.userId, signedInUser.id)));
        if (previous && !previous.removedAt) {
          throw conflict("You are already a member of this organization.");
        }
        const [member] = previous
          ? await tx
              .update(members)
              .set({ role: invite.role, removedAt: null })
              .where(eq(members.id, previous.id))
              .returning()
          : await tx
              .insert(members)
              .values({ orgId, kind: "human", userId: signedInUser.id, role: invite.role })
              .returning();

        await tx.update(invites).set({ acceptedBy: member!.id }).where(eq(invites.id, invite.id));
        await emit(tx, orgId, {
          type: "invite.accepted",
          actorId: member!.id,
          subjectId: invite.id,
          data: { memberId: member!.id, role: invite.role },
        });

        // Teams deleted since the invite was made are skipped.
        const stillThere = invite.teamIds.length
          ? await tx.select({ id: teams.id }).from(teams).where(inArray(teams.id, invite.teamIds))
          : [];
        for (const { id: teamId } of stillThere) {
          await tx.insert(teamMembers).values({ orgId, teamId, memberId: member!.id }).onConflictDoNothing();
          await emit(tx, orgId, {
            type: "team.member_added",
            actorId: member!.id,
            subjectId: teamId,
            data: { memberId: member!.id },
          });
        }

        const [organization] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
        return { organization: toOrganization(organization!), member: await loadMember(tx, orgId, member!.id) };
      },
    );
    return c.json(membership, 200);
  });

  return app;
}
