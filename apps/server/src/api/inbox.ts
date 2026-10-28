// The inbox (ADR 0005): each item is made from one event, in the transaction
// that writes the event, so the inbox can never disagree with the log. Reads
// show only items about issues the recipient can see now, so an item about
// an issue that moved into a private team or went to the trash disappears.
import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from "drizzle-orm";
import {
  comments,
  consumeEvents,
  emit,
  events,
  inbox,
  issues,
  members,
  teams,
  user,
  webhooks,
  type EventRow,
  type Transaction,
} from "@edicthq/db";
import { Id, InboxItem, InboxSummary, UpdateInboxItem, type InboxItemType, type ProgressState } from "@edicthq/schema";
import { loadMember, teamVisibility } from "./access.js";
import type { Caller } from "./callers.js";
import { body, errors, inOrg, json, OrgParams, router, type ApiDeps } from "./context.js";
import { notFound } from "./errors.js";

interface NewItem {
  recipientId: string;
  type: InboxItemType;
  issueId?: string;
  webhookId?: string;
  commentId?: string;
}

type Changes = Record<string, { from: unknown; to: unknown } | undefined>;

// Who hears about an event. Undoing a change tells nobody again.
async function itemsFor(tx: Transaction, event: EventRow): Promise<NewItem[]> {
  const data = event.data as Record<string, unknown>;
  if (data.undoes) return [];
  switch (event.type) {
    case "issue.created": {
      const out: NewItem[] = [];
      if (typeof data.assigneeId === "string") out.push({ recipientId: data.assigneeId, type: "assigned", issueId: event.subjectId });
      if (typeof data.delegateId === "string") out.push({ recipientId: data.delegateId, type: "delegated", issueId: event.subjectId });
      return out;
    }
    case "issue.updated": {
      const changes = (data.changes ?? {}) as Changes;
      const out: NewItem[] = [];
      const assignee = changes.assigneeId?.to;
      const delegate = changes.delegateId?.to;
      if (typeof assignee === "string") out.push({ recipientId: assignee, type: "assigned", issueId: event.subjectId });
      if (typeof delegate === "string") out.push({ recipientId: delegate, type: "delegated", issueId: event.subjectId });
      if (changes.statusId && typeof assignee !== "string") {
        const [issue] = await tx.select({ assigneeId: issues.assigneeId }).from(issues).where(eq(issues.id, event.subjectId));
        if (issue?.assigneeId) out.push({ recipientId: issue.assigneeId, type: "status_changed", issueId: event.subjectId });
      }
      return out;
    }
    case "comment.created": {
      const [row] = await tx
        .select({ body: comments.body, issueId: comments.issueId, assigneeId: issues.assigneeId, creatorId: issues.creatorId })
        .from(comments)
        .innerJoin(issues, eq(issues.id, comments.issueId))
        .where(eq(comments.id, event.subjectId));
      if (!row) return [];
      const mentioned = await mentionedMembers(tx, event.orgId, row.body);
      const out: NewItem[] = mentioned.map((id) => ({ recipientId: id, type: "mentioned", issueId: row.issueId, commentId: event.subjectId }));
      for (const id of [row.assigneeId, row.creatorId]) {
        if (id && !out.some((item) => item.recipientId === id)) {
          out.push({ recipientId: id, type: "comment_created", issueId: row.issueId, commentId: event.subjectId });
        }
      }
      return out;
    }
    case "progress.posted": {
      if (typeof data.issueId !== "string") return [];
      // ADR 0029: activity already told people through its own event, and a
      // hook speaks up only when the work is done.
      if (data.source === "activity" || (data.source === "hook" && data.state !== "done")) return [];
      const [issue] = await tx.select({ assigneeId: issues.assigneeId }).from(issues).where(eq(issues.id, data.issueId));
      return issue?.assigneeId ? [{ recipientId: issue.assigneeId, type: "progress_posted", issueId: data.issueId }] : [];
    }
    case "webhook.disabled": {
      const admins = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.orgId, event.orgId), eq(members.kind, "human"), inArray(members.role, ["owner", "admin"]), isNull(members.removedAt)));
      return admins.map((admin) => ({ recipientId: admin.id, type: "webhook_disabled", webhookId: event.subjectId }));
    }
    default:
      return [];
  }
}

// Writes the items an event makes. Nobody hears about what they did
// themselves, or what their own connected agent did for them. A webhook
// turning itself off names its creator as the actor, but nobody acted.
async function inboxFromEvent(tx: Transaction, event: EventRow): Promise<void> {
  const items = await itemsFor(tx, event);
  if (items.length === 0) return;
  const skip = new Set(event.type === "webhook.disabled" ? [] : [event.actorId, event.onBehalfOfId].filter(Boolean));
  const wanted = items.filter((item) => !skip.has(item.recipientId));
  if (wanted.length === 0) return;
  const active = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.orgId, event.orgId), inArray(members.id, wanted.map((item) => item.recipientId)), isNull(members.removedAt)));
  const present = new Set(active.map((row) => row.id));
  const rows = wanted
    .filter((item) => present.has(item.recipientId))
    .map((item) => ({
      orgId: event.orgId,
      eventId: event.id,
      recipientId: item.recipientId,
      actorId: event.actorId,
      issueId: item.issueId ?? null,
      webhookId: item.webhookId ?? null,
      commentId: item.commentId ?? null,
      type: item.type,
    }));
  if (rows.length > 0) await tx.insert(inbox).values(rows);
}

consumeEvents(inboxFromEvent);

// The members a markdown text @mentions by a whole handle: a person's email
// name or full name without spaces, or an agent's name in dashed words, as
// MCP shows handles. Members who left are not mentioned.
export async function mentionedMembers(tx: Transaction, orgId: string, text: string): Promise<string[]> {
  const tokens = new Set(
    [...text.matchAll(/(?:^|[^\w@])@([a-z0-9][\w.-]*)/gi)].map((match) => match[1]!.replace(/[.-]+$/, "").toLowerCase()),
  );
  if (tokens.size === 0) return [];
  const rows = await tx
    .select({ id: members.id, kind: members.kind, agentName: members.name, userName: user.name, email: user.email })
    .from(members)
    .leftJoin(user, eq(user.id, members.userId))
    .where(and(eq(members.orgId, orgId), isNull(members.removedAt)));
  return rows
    .filter((row) => {
      const handles =
        row.kind === "agent"
          ? [(row.agentName ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")]
          : [row.email?.split("@")[0]?.toLowerCase(), row.userName?.toLowerCase().replace(/\s+/g, "")];
      return handles.some((handle) => handle && tokens.has(handle));
    })
    .map((row) => row.id);
}

// The caller's items about what they can still see.
function visibleItems(tx: Transaction, caller: Caller, extra?: SQL) {
  return and(
    eq(inbox.recipientId, caller.id),
    or(isNull(inbox.issueId), and(isNull(issues.deletedAt), teamVisibility(tx, caller))),
    extra,
  );
}

function itemQuery(tx: Transaction) {
  return tx
    .select({ item: inbox, issue: issues, team: teams, webhook: { id: webhooks.id, url: webhooks.url }, eventData: events.data })
    .from(inbox)
    .leftJoin(issues, eq(issues.id, inbox.issueId))
    .leftJoin(teams, eq(teams.id, issues.teamId))
    .leftJoin(webhooks, eq(webhooks.id, inbox.webhookId))
    .leftJoin(events, eq(events.id, inbox.eventId));
}

type ItemRow = Awaited<ReturnType<ReturnType<typeof itemQuery>["execute"]>>[number];

async function toItem(tx: Transaction, orgId: string, row: ItemRow): Promise<InboxItem> {
  const actor = row.item.actorId ? await loadMember(tx, orgId, row.item.actorId).catch(() => null) : null;
  const state = (row.eventData as { state?: ProgressState } | null)?.state;
  return {
    id: row.item.id,
    type: row.item.type as InboxItemType,
    actor,
    issue:
      row.issue && row.team
        ? { id: row.issue.id, identifier: `${row.team.key}-${row.issue.number}`, title: row.issue.title, teamId: row.team.id }
        : null,
    webhook: row.webhook?.id ? { id: row.webhook.id, url: row.webhook.url } : null,
    commentId: row.item.commentId,
    progressState: row.item.type === "progress_posted" && state ? state : null,
    readAt: row.item.readAt?.toISOString() ?? null,
    createdAt: row.item.createdAt.toISOString(),
  };
}

const ItemParams = OrgParams.extend({ itemId: Id });

const listInbox = createRoute({
  method: "get",
  path: "/organizations/{orgId}/inbox",
  tags: ["Inbox"],
  summary: "The caller's inbox, newest first",
  description: "Items about issues the caller can no longer see, or that are in the trash, are left out. At most 100.",
  request: {
    params: OrgParams,
    query: z.object({ filter: z.enum(["unread", "all"]).optional().default("unread") }),
  },
  responses: { 200: json(z.array(InboxItem), "Inbox items"), ...errors("unauthorized", "not_found") },
});

const getUnreadCount = createRoute({
  method: "get",
  path: "/organizations/{orgId}/inbox/unread-count",
  tags: ["Inbox"],
  summary: "How many of the caller's inbox items are unread",
  request: { params: OrgParams },
  responses: { 200: json(InboxSummary, "The unread count"), ...errors("unauthorized", "not_found") },
});

const updateInboxItem = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/inbox/{itemId}",
  tags: ["Inbox"],
  summary: "Mark an inbox item read or unread",
  request: { params: ItemParams, ...body(UpdateInboxItem) },
  responses: { 200: json(InboxItem, "The item"), ...errors("invalid_request", "unauthorized", "not_found") },
});

const markAllRead = createRoute({
  method: "post",
  path: "/organizations/{orgId}/inbox/read-all",
  tags: ["Inbox"],
  summary: "Mark every unread inbox item read",
  request: { params: OrgParams },
  responses: {
    200: json(z.object({ count: z.number().int() }), "How many items were marked"),
    ...errors("unauthorized", "not_found"),
  },
});

export function inboxRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listInbox, async (c) => {
    const { orgId } = c.req.valid("param");
    const { filter } = c.req.valid("query");
    const items = await inOrg(deps, c, orgId, async (tx, caller) => {
      const rows = await itemQuery(tx)
        .where(visibleItems(tx, caller, filter === "unread" ? isNull(inbox.readAt) : undefined))
        .orderBy(desc(inbox.id))
        .limit(100);
      const out: InboxItem[] = [];
      for (const row of rows) out.push(await toItem(tx, orgId, row));
      return out;
    });
    return c.json(items, 200);
  });

  app.openapi(getUnreadCount, async (c) => {
    const { orgId } = c.req.valid("param");
    const summary = await inOrg(deps, c, orgId, async (tx, caller) => {
      const [row] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(inbox)
        .leftJoin(issues, eq(issues.id, inbox.issueId))
        .leftJoin(teams, eq(teams.id, issues.teamId))
        .where(visibleItems(tx, caller, isNull(inbox.readAt)));
      return { unreadCount: row?.count ?? 0 };
    });
    return c.json(summary, 200);
  });

  app.openapi(updateInboxItem, async (c) => {
    const { orgId, itemId } = c.req.valid("param");
    const { read } = c.req.valid("json");
    const updated = await inOrg(deps, c, orgId, async (tx, caller) => {
      const [existing] = await itemQuery(tx).where(visibleItems(tx, caller, eq(inbox.id, itemId)));
      if (!existing) throw notFound("inbox item");
      if ((existing.item.readAt !== null) === read) return toItem(tx, orgId, existing);
      const readAt = read ? new Date() : null;
      await tx.update(inbox).set({ readAt }).where(eq(inbox.id, itemId));
      await emit(tx, orgId, { type: read ? "inbox.read" : "inbox.unread", actorId: caller.id, subjectId: caller.id, data: { itemIds: [itemId] } });
      return toItem(tx, orgId, { ...existing, item: { ...existing.item, readAt } });
    });
    return c.json(updated, 200);
  });

  app.openapi(markAllRead, async (c) => {
    const { orgId } = c.req.valid("param");
    const result = await inOrg(deps, c, orgId, async (tx, caller) => {
      const marked = await tx
        .update(inbox)
        .set({ readAt: new Date() })
        .where(and(eq(inbox.recipientId, caller.id), isNull(inbox.readAt)))
        .returning({ id: inbox.id });
      if (marked.length > 0) {
        await emit(tx, orgId, { type: "inbox.read", actorId: caller.id, subjectId: caller.id, data: { itemIds: marked.map((row) => row.id) } });
      }
      return { count: marked.length };
    });
    return c.json(result, 200);
  });

  return app;
}
