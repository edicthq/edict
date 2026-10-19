import { createRoute, z } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";
import {
  attachments,
  comments,
  emit,
  events,
  issueLabels,
  issueLinks,
  issueRelations,
  issues,
  labels,
  members,
  organizations,
  progressUpdates,
  projects,
  savedViews,
  statuses,
  teamKeys,
  teamMembers,
  teams,
  templates,
  type Transaction,
  user,
  webhooks,
} from "@edicthq/db";
import type { AttachmentDeps } from "./attachments.js";
import { requireEveryTeam, requireRole } from "./access.js";
import { errors, inOrg, OrgParams, router } from "./context.js";

// The glossary of tables, exported as one document: everything the members
// made and the event log that records how, without credentials. Secrets
// (API-key hashes and webhook signing keys) never leave the instance. Inbox
// items stay behind: they are made from the events, which go.

// Rows go out as plain JSON: Postgres's timestamps become ISO strings, and
// the rest passes through as Drizzle mapped it.
function serialize(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  );
}

const exportOrganization = createRoute({
  method: "get",
  path: "/organizations/{orgId}/export",
  tags: ["Organization"],
  summary: "A zip of the whole organization",
  description:
    "Owners and admins only. The zip holds one JSON document describing the organization — members, teams, statuses, labels, projects, templates, saved views, issues with their comments, relations, links, progress updates, attachment metadata and the event log — plus every attachment's bytes at files/<attachment id>/<name>, the path markdown links to. Secrets are not included, so nothing in the zip can act on any other instance. The zip streams, so a large organization starts downloading at once.",
  request: { params: OrgParams },
  responses: {
    200: {
      description: "The export zip: edict-export.json and files/<attachment id>/<name>",
      content: { "application/zip": { schema: z.string().openapi({ format: "binary" }) } },
    },
    ...errors("unauthorized", "forbidden", "not_found"),
  },
});

export function exportRoutes(deps: AttachmentDeps) {
  const app = router();

  app.openapi(exportOrganization, async (c) => {
    const { orgId } = c.req.valid("param");

    const { document, attachmentRows, organization } = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireRole(caller, "admin", "export the organization");
      requireEveryTeam(caller, "export the organization");
      const collected = await collect(tx, orgId);
      await emit(tx, orgId, { type: "organization.exported", actorId: caller.id, subjectId: orgId, data: { attachments: collected.attachmentRows.length } });
      return collected;
    });

    // One file at a time, as the reader asks for more: the JSON first, then
    // each attachment, so memory holds one file however large the export is.
    // Attachments are stored, not compressed; most are compressed already.
    const queue: Uint8Array[] = [];
    let failed: Error | undefined;
    let ended = false;
    const zip = new Zip((error, chunk, final) => {
      if (error) failed = error;
      else queue.push(chunk);
      if (final) ended = true;
    });
    let next = -1;
    const stream = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        while (queue.length === 0 && !ended && !failed) {
          if (next === -1) {
            const json = new ZipDeflate("edict-export.json", { level: 6 });
            zip.add(json);
            json.push(new TextEncoder().encode(JSON.stringify(document, null, 2)), true);
          } else if (next < attachmentRows.length) {
            const row = attachmentRows[next]!;
            // A missing file is not fatal: the JSON holds its metadata, so
            // the re-upload that repairs a lost file also repairs the export.
            const bytes = await deps.storage.get(`${orgId}/${row.id}`);
            if (bytes) {
              const file = new ZipPassThrough(`files/${row.id}/${row.name}`);
              zip.add(file);
              file.push(bytes, true);
            }
          } else {
            zip.end();
          }
          next++;
        }
        if (failed) return controller.error(failed);
        const chunk = queue.shift();
        if (chunk) controller.enqueue(chunk);
        if (ended && queue.length === 0) controller.close();
      },
    });

    c.header("content-disposition", `attachment; filename="${organization.slug}-edict-export.zip"`);
    return c.body(stream, 200, { "content-type": "application/zip" });
  });

  return app;
}

async function collect(tx: Transaction, orgId: string) {
  // Members join their user for the provenance an export needs; removed
  // members keep zeroed rows and go out with the rest.
  const memberRows = await tx
    .select({ row: members, email: user.email })
    .from(members)
    .leftJoin(user, eq(members.userId, user.id))
    .where(eq(members.orgId, orgId))
    .orderBy(asc(members.id));
  const [organization] = await tx.select().from(organizations).where(eq(organizations.id, orgId));

  // One after another: queries on one transaction cannot overlap.
  const teamSelect = await tx.select().from(teams).where(eq(teams.orgId, orgId)).orderBy(asc(teams.key));
  const teamKeySelect = await tx.select().from(teamKeys).where(eq(teamKeys.orgId, orgId));
  const membershipSelect = await tx.select().from(teamMembers).where(eq(teamMembers.orgId, orgId));
  const statusSelect = await tx.select().from(statuses).where(eq(statuses.orgId, orgId));
  const labelSelect = await tx.select().from(labels).where(eq(labels.orgId, orgId)).orderBy(asc(labels.name));
  const projectSelect = await tx.select().from(projects).where(eq(projects.orgId, orgId)).orderBy(asc(projects.id));
  const templateSelect = await tx.select().from(templates).where(eq(templates.orgId, orgId)).orderBy(asc(templates.teamId));
  const issueSelect = await tx.select().from(issues).where(eq(issues.orgId, orgId)).orderBy(asc(issues.id));
  const commentSelect = await tx.select().from(comments).where(eq(comments.orgId, orgId)).orderBy(asc(comments.id));
  const relationSelect = await tx.select().from(issueRelations).where(eq(issueRelations.orgId, orgId));
  const labelLinkSelect = await tx.select().from(issueLabels).where(eq(issueLabels.orgId, orgId));
  const linkSelect = await tx.select().from(issueLinks).where(eq(issueLinks.orgId, orgId));
  const attachmentSelect = await tx.select().from(attachments).where(eq(attachments.orgId, orgId)).orderBy(asc(attachments.id));
  const progressSelect = await tx.select().from(progressUpdates).where(eq(progressUpdates.orgId, orgId)).orderBy(asc(progressUpdates.id));
  const viewSelect = await tx.select().from(savedViews).where(eq(savedViews.orgId, orgId));
  // Only the description, not the key that signs deliveries.
  const webhookSelect = await tx
    .select({
      id: webhooks.id,
      orgId: webhooks.orgId,
      agentId: webhooks.agentId,
      url: webhooks.url,
      eventTypes: webhooks.eventTypes,
      disabledAt: webhooks.disabledAt,
      disabledReason: webhooks.disabledReason,
      createdBy: webhooks.createdBy,
      version: webhooks.version,
      createdAt: webhooks.createdAt,
    })
    .from(webhooks)
    .where(eq(webhooks.orgId, orgId));
  const eventSelect = await tx.select().from(events).where(eq(events.orgId, orgId)).orderBy(asc(events.id));

  // The document is deliberately squeaky: JSON-safe rows that reference each
  // other by id, so an importer rebuilds the graph without guessing types.
  const document = {
    format: "edict-export" as const,
    version: 1,
    exportedAt: new Date().toISOString(),
    organization: serialize(organization!),
    members: memberRows.map(({ row, email }) => ({ ...serialize(row), email: email ?? null })),
    teams: teamSelect.map(serialize),
    teamKeys: teamKeySelect.map(serialize),
    memberships: membershipSelect.map(serialize),
    statuses: statusSelect.map(serialize),
    labels: labelSelect.map(serialize),
    projects: projectSelect.map(serialize),
    templates: templateSelect.map(serialize),
    savedViews: viewSelect.map(serialize),
    issues: issueSelect.map(serialize),
    comments: commentSelect.map(serialize),
    issueLabels: labelLinkSelect.map(serialize),
    issueRelations: relationSelect.map(serialize),
    issueLinks: linkSelect.map(serialize),
    attachments: attachmentSelect.map(serialize),
    progressUpdates: progressSelect.map(serialize),
    webhooks: webhookSelect.map(serialize),
    events: eventSelect.map(serialize),
  };

  return { document, attachmentRows: attachmentSelect, organization: organization! };
}
