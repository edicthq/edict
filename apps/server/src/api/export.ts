import { createRoute, z } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";
import JSZip from "jszip";
import {
  attachments,
  comments,
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
// made, without credentials. Secrets (API-key hashes and webhook signing
// keys) never leave the instance, and the event log stays behind — it is a
// record for this instance, not data for the next one (PLAN.md).

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
    "Owners and admins only. The zip holds one JSON document describing the organization — members, teams, statuses, labels, projects, templates, saved views, issues with their comments, relations, links, progress updates and attachment metadata — plus every attachment's bytes. Secrets are not included, so nothing in the zip can act on any other instance.",
  request: { params: OrgParams },
  responses: {
    200: {
      description: "The export zip: edict-export.json and attachments/<attachment id>/<name>",
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
      return collect(tx, orgId);
    });

    const zip = new JSZip();
    zip.file("edict-export.json", JSON.stringify(document, null, 2));
    for (const row of attachmentRows) {
      // A missing file is not fatal — the JSON holds its metadata regardless,
      // so the re-upload that repairs a lost file also repairs the export.
      const bytes = await deps.storage.get(`${orgId}/${row.id}`);
      if (bytes) zip.file(`attachments/${row.id}/${row.name}`, bytes);
    }
    const bundle = await zip.generateAsync({ type: "uint8array" });
    // JSZip allocates a plain ArrayBuffer; TS just cannot see through the
    // generic buffer type, so the cast avoids a full copy of the bundle.
    const bytes = bundle as Uint8Array<ArrayBuffer>;

    c.header("content-disposition", `attachment; filename="${organization.slug}-edict-export.zip"`);
    return c.body(bytes, 200, { "content-type": "application/zip" });
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

  const [
    teamSelect,
    teamKeySelect,
    membershipSelect,
    statusSelect,
    labelSelect,
    projectSelect,
    templateSelect,
    issueSelect,
    commentSelect,
    relationSelect,
    labelLinkSelect,
    linkSelect,
    attachmentSelect,
    progressSelect,
    viewSelect,
    webhookSelect,
  ] = await Promise.all([
    tx.select().from(teams).where(eq(teams.orgId, orgId)).orderBy(asc(teams.key)),
    tx.select().from(teamKeys).where(eq(teamKeys.orgId, orgId)),
    tx.select().from(teamMembers).where(eq(teamMembers.orgId, orgId)),
    tx.select().from(statuses).where(eq(statuses.orgId, orgId)),
    tx.select().from(labels).where(eq(labels.orgId, orgId)).orderBy(asc(labels.name)),
    tx.select().from(projects).where(eq(projects.orgId, orgId)).orderBy(asc(projects.id)),
    tx.select().from(templates).where(eq(templates.orgId, orgId)).orderBy(asc(templates.teamId)),
    tx.select().from(issues).where(eq(issues.orgId, orgId)).orderBy(asc(issues.id)),
    tx.select().from(comments).where(eq(comments.orgId, orgId)).orderBy(asc(comments.id)),
    tx.select().from(issueRelations).where(eq(issueRelations.orgId, orgId)),
    tx.select().from(issueLabels).where(eq(issueLabels.orgId, orgId)),
    tx.select().from(issueLinks).where(eq(issueLinks.orgId, orgId)),
    tx.select().from(attachments).where(eq(attachments.orgId, orgId)).orderBy(asc(attachments.id)),
    tx.select().from(progressUpdates).where(eq(progressUpdates.orgId, orgId)).orderBy(asc(progressUpdates.id)),
    tx.select().from(savedViews).where(eq(savedViews.orgId, orgId)),
    // Only the description, not the key that signs deliveries.
    tx
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
      .where(eq(webhooks.orgId, orgId)),
  ]);

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
  };

  return { document, attachmentRows: attachmentSelect, organization: organization! };
}
