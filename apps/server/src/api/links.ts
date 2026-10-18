import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq } from "drizzle-orm";
import { emit, issueLinks, type Transaction } from "@edicthq/db";
import { Id, IssueRef, Link, WebLink } from "@edicthq/schema";
import { requireAgentPower } from "./access.js";
import type { Caller } from "./callers.js";
import { body, errors, inOrg, json, noContent, OrgParams, router, type ApiDeps } from "./context.js";
import { conflict, notFound } from "./errors.js";
import { visibleIssue } from "./issue-data.js";

type LinkRow = typeof issueLinks.$inferSelect;

export function toLink(row: LinkRow): Link {
  return {
    id: row.id,
    issueId: row.issueId,
    url: row.url,
    title: row.title,
    creatorId: row.creatorId,
    createdAt: row.createdAt.toISOString(),
  };
}

const IssueParams = OrgParams.extend({ issueRef: IssueRef });

const addLink = createRoute({
  method: "post",
  path: "/organizations/{orgId}/issues/{issueRef}/links",
  tags: ["Links"],
  summary: "Attach a URL, such as a pull request, to an issue",
  description: "An issue holds each URL once. Attaching one it already has answers 200 with the existing link.",
  request: { params: IssueParams, ...body(WebLink) },
  responses: {
    200: json(Link, "The link the issue already had"),
    201: json(Link, "The new link"),
    ...errors("invalid_request", "unauthorized", "not_found", "gone"),
  },
});

const listLinks = createRoute({
  method: "get",
  path: "/organizations/{orgId}/issues/{issueRef}/links",
  tags: ["Links"],
  summary: "An issue's links, oldest first",
  request: { params: IssueParams },
  responses: {
    200: json(z.array(Link), "Links"),
    ...errors("unauthorized", "not_found", "gone"),
  },
});

const removeLink = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/issues/{issueRef}/links/{linkId}",
  tags: ["Links"],
  summary: "Remove a link from an issue",
  request: { params: IssueParams.extend({ linkId: Id }) },
  responses: {
    ...noContent,
    ...errors("unauthorized", "forbidden", "not_found", "gone"),
  },
});

export function linkRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(addLink, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const input = c.req.valid("json");
    const { link, created } = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      const [row] = await tx
        .insert(issueLinks)
        .values({ orgId, issueId: issue.id, url: input.url, title: input.title ?? null, creatorId: caller.id })
        .onConflictDoNothing()
        .returning();
      if (!row) {
        const [existing] = await tx
          .select()
          .from(issueLinks)
          .where(and(eq(issueLinks.issueId, issue.id), eq(issueLinks.url, input.url)));
        return { link: toLink(existing!), created: false };
      }
      await emit(tx, orgId, { type: "link.created", actorId: caller.id, subjectId: row.id, data: eventData(row) });
      return { link: toLink(row), created: true };
    });
    return created ? c.json(link, 201) : c.json(link, 200);
  });

  app.openapi(listLinks, async (c) => {
    const { orgId, issueRef } = c.req.valid("param");
    const list = await inOrg(deps, c, orgId, async (tx, caller) => {
      const { issue } = await visibleIssue(tx, caller, issueRef);
      const rows = await tx.select().from(issueLinks).where(eq(issueLinks.issueId, issue.id)).orderBy(asc(issueLinks.id));
      return rows.map(toLink);
    });
    return c.json(list, 200);
  });

  app.openapi(removeLink, async (c) => {
    const { orgId, issueRef, linkId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      requireAgentPower(caller, "delete", "remove links");
      const { issue } = await visibleIssue(tx, caller, issueRef);
      const [row] = await tx
        .delete(issueLinks)
        .where(and(eq(issueLinks.id, linkId), eq(issueLinks.issueId, issue.id)))
        .returning();
      if (!row) {
        throw notFound("link");
      }
      await emit(tx, orgId, { type: "link.deleted", actorId: caller.id, subjectId: row.id, data: eventData(row) });
    });
    return c.body(null, 204);
  });

  return app;
}

// Enough to put a removed link back as it was.
function eventData(row: LinkRow) {
  return { issueId: row.issueId, url: row.url, title: row.title, creatorId: row.creatorId };
}

// Undo (ADR 0019).
export async function unlink(tx: Transaction, caller: Caller, linkId: string, extra: Record<string, unknown>): Promise<void> {
  const [row] = await tx.delete(issueLinks).where(eq(issueLinks.id, linkId)).returning();
  if (!row) {
    throw conflict("The link was removed since.");
  }
  await visibleIssue(tx, caller, row.issueId);
  await emit(tx, caller.orgId, { type: "link.deleted", actorId: caller.id, subjectId: row.id, data: { ...eventData(row), ...extra } });
}

export async function relink(
  tx: Transaction,
  caller: Caller,
  linkId: string,
  data: ReturnType<typeof eventData>,
  extra: Record<string, unknown>,
): Promise<void> {
  await visibleIssue(tx, caller, data.issueId);
  const [row] = await tx
    .insert(issueLinks)
    .values({ id: linkId, orgId: caller.orgId, ...data })
    .onConflictDoNothing()
    .returning();
  if (!row) {
    throw conflict("The issue has that link again.");
  }
  await emit(tx, caller.orgId, { type: "link.created", actorId: caller.id, subjectId: row.id, data: { ...data, ...extra } });
}
