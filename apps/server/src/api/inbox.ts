import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { comments, inbox, issues, members, teams } from "@edicthq/db";
import {
  Id,
  InboxItem,
  InboxSummary,
  UpdateInboxItem,
  } from "@edicthq/schema";
import { loadMember, memberWithUser, toMember } from "./access.js";
import type { Caller } from "./callers.js";
import { inOrg, json, router, type ApiDeps } from "./context.js";
import { notFound } from "./errors.js";

type Transaction = Parameters<Parameters<typeof inOrg>[3]>[0];

// Helper to notify a member about an issue event.
export async function notify(
  tx: Transaction,
  params: {
    orgId: string;
    recipientId: string;
    actorId?: string | null;
    issueId: string;
    commentId?: string | null;
    type: "assigned" | "delegated" | "status_changed" | "comment_created" | "mentioned";
  },
): Promise<void> {
  // Never notify oneself
  if (params.actorId && params.actorId === params.recipientId) return;

  await tx.insert(inbox).values({
    orgId: params.orgId,
    recipientId: params.recipientId,
    actorId: params.actorId ?? null,
    issueId: params.issueId,
    commentId: params.commentId ?? null,
    type: params.type,
  });
}

// Parses @mentions in markdown body, matching member names or emails.
export function extractMentions(text: string, orgMembers: Array<{ id: string; name: string | null; email?: string | null }>): string[] {
  const matches = text.match(/@([a-zA-Z0-9._-]+)/g);
  if (!matches) return [];

  const tokens = matches.map((m) => m.slice(1).toLowerCase());
  const recipientIds = new Set<string>();

  for (const token of tokens) {
    for (const member of orgMembers) {
      const name = member.name?.toLowerCase().replace(/\s+/g, "");
      const email = member.email?.toLowerCase().split("@")[0];
      if ((name && (name === token || name.startsWith(token))) || (email && email === token)) {
        recipientIds.add(member.id);
      }
    }
  }

  return [...recipientIds];
}

const listInbox = createRoute({
  method: "get",
  path: "/organizations/{orgId}/inbox",
  summary: "List inbox notifications for the current member",
  request: {
    params: z.object({ orgId: Id }),
    query: z.object({
      filter: z.enum(["unread", "all"]).optional().default("unread"),
    }),
  },
  responses: {
    200: json(z.array(InboxItem), "Inbox items"),
  },
});

const getUnreadCount = createRoute({
  method: "get",
  path: "/organizations/{orgId}/inbox/unread-count",
  summary: "Get unread count for current member",
  request: {
    params: z.object({ orgId: Id }),
  },
  responses: {
    200: json(InboxSummary, "Inbox unread summary"),
  },
});

const updateInboxItem = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/inbox/{itemId}",
  summary: "Mark an inbox item read or unread",
  request: {
    params: z.object({ orgId: Id, itemId: Id }),
    body: {
      content: { "application/json": { schema: UpdateInboxItem } },
    },
  },
  responses: {
    200: json(InboxItem, "Updated inbox item"),
  },
});

const markAllRead = createRoute({
  method: "post",
  path: "/organizations/{orgId}/inbox/read-all",
  summary: "Mark all inbox items as read",
  request: {
    params: z.object({ orgId: Id }),
  },
  responses: {
    200: json(z.object({ count: z.number().int() }), "Marked items count"),
  },
});

export function inboxRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listInbox, async (c) => {
    const { orgId } = c.req.valid("param");
    const { filter } = c.req.valid("query");

    const items = await inOrg(deps, c, orgId, async (tx, caller) => {
      const conditions = [
        eq(inbox.orgId, orgId),
        eq(inbox.recipientId, caller.id),
      ];
      if (filter === "unread") {
        conditions.push(isNull(inbox.readAt));
      }

      const rows = await tx
        .select({
          inboxRow: inbox,
          issueRow: issues,
          teamRow: teams,
        })
        .from(inbox)
        .innerJoin(issues, eq(inbox.issueId, issues.id))
        .innerJoin(teams, eq(issues.teamId, teams.id))
        .where(and(...conditions))
        .orderBy(desc(inbox.createdAt))
        .limit(100);

      const result: z.infer<typeof InboxItem>[] = [];
      for (const { inboxRow, issueRow, teamRow } of rows) {
        let actor: z.infer<typeof InboxItem>["actor"] = null;
        if (inboxRow.actorId) {
          try {
            actor = await loadMember(tx, orgId, inboxRow.actorId);
          } catch {
            actor = null;
          }
        }

        result.push({
          id: inboxRow.id,
          type: inboxRow.type as any,
          actor,
          issue: {
            id: issueRow.id,
            identifier: `${teamRow.key}-${issueRow.number}`,
            title: issueRow.title,
            teamId: teamRow.id,
          },
          commentId: inboxRow.commentId,
          readAt: inboxRow.readAt ? inboxRow.readAt.toISOString() : null,
          createdAt: inboxRow.createdAt.toISOString(),
        });
      }

      return result;
    });

    return c.json(items, 200);
  });

  app.openapi(getUnreadCount, async (c) => {
    const { orgId } = c.req.valid("param");

    const summary = await inOrg(deps, c, orgId, async (tx, caller) => {
      const [countResult] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(inbox)
        .where(
          and(
            eq(inbox.orgId, orgId),
            eq(inbox.recipientId, caller.id),
            isNull(inbox.readAt),
          ),
        );

      return { unreadCount: countResult?.count ?? 0 };
    });

    return c.json(summary, 200);
  });

  app.openapi(updateInboxItem, async (c) => {
    const { orgId, itemId } = c.req.valid("param");
    const { read } = c.req.valid("json");

    const updated = await inOrg(deps, c, orgId, async (tx, caller) => {
      const [existing] = await tx
        .select({
          inboxRow: inbox,
          issueRow: issues,
          teamRow: teams,
        })
        .from(inbox)
        .innerJoin(issues, eq(inbox.issueId, issues.id))
        .innerJoin(teams, eq(issues.teamId, teams.id))
        .where(
          and(
            eq(inbox.orgId, orgId),
            eq(inbox.id, itemId),
            eq(inbox.recipientId, caller.id),
          ),
        );

      if (!existing) {
        throw notFound("Inbox item not found");
      }

      const readAt = read ? new Date() : null;
      const [row] = await tx
        .update(inbox)
        .set({ readAt })
        .where(eq(inbox.id, itemId))
        .returning();

      let actor: z.infer<typeof InboxItem>["actor"] = null;
      if (row!.actorId) {
        try {
          actor = await loadMember(tx, orgId, row!.actorId);
        } catch {
          actor = null;
        }
      }

      return {
        id: row!.id,
        type: row!.type as any,
        actor,
        issue: {
          id: existing.issueRow.id,
          identifier: `${existing.teamRow.key}-${existing.issueRow.number}`,
          title: existing.issueRow.title,
          teamId: existing.teamRow.id,
        },
        commentId: row!.commentId,
        readAt: row!.readAt ? row!.readAt.toISOString() : null,
        createdAt: row!.createdAt.toISOString(),
      };
    });

    return c.json(updated, 200);
  });

  app.openapi(markAllRead, async (c) => {
    const { orgId } = c.req.valid("param");

    const result = await inOrg(deps, c, orgId, async (tx, caller) => {
      const updatedRows = await tx
        .update(inbox)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(inbox.orgId, orgId),
            eq(inbox.recipientId, caller.id),
            isNull(inbox.readAt),
          ),
        )
        .returning();

      return { count: updatedRows.length };
    });

    return c.json(result, 200);
  });

  return app;
}
