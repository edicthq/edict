// Connecting an MCP client through OAuth (ADR 0015, ADR 0021). Better Auth's
// OAuth provider runs the flow at /api/auth/oauth2/*. The consent page asks
// which organization the client joins, and this records the answer on the
// session for the provider to put on the grant.
import { createRoute } from "@hono/zod-openapi";
import { and, eq, isNull } from "drizzle-orm";
import { inScope, members, organizations, session, type Database } from "@edicthq/db";
import { ConnectionOrganization, Membership } from "@edicthq/schema";
import { callerMember, loadMember } from "./access.js";
import { body, errors, json, router, signedIn, type ApiDeps } from "./context.js";
import { toOrganization } from "./organizations.js";

const chooseOrganization = createRoute({
  method: "post",
  path: "/oauth/organization",
  tags: ["Connections"],
  summary: "Choose the organization an MCP client being connected joins",
  description:
    "The consent page calls this before accepting the OAuth request. The client's connected agent joins this organization, on behalf of the signed-in person.",
  request: body(ConnectionOrganization),
  responses: {
    200: json(Membership, "The organization, and the signed-in person's member in it"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found"),
  },
});

export function connectionRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(chooseOrganization, async (c) => {
    const user = signedIn(c);
    const { orgId } = c.req.valid("json");
    const membership = await inScope(deps.db, { userId: user.id, orgId }, async (tx) => {
      const member = await callerMember(tx, orgId, user.id);
      await tx.update(session).set({ oauthOrgId: orgId }).where(eq(session.id, user.sessionId));
      const [organization] = await tx.select().from(organizations).where(eq(organizations.id, orgId));
      return { organization: toOrganization(organization!), member: await loadMember(tx, orgId, member.id) };
    });
    return c.json(membership, 200);
  });

  return app;
}

// The organization a grant is for: the one the user chose, if they still
// belong to it.
export async function consentOrganization(db: Database, userId: string, orgId: string | undefined): Promise<string | undefined> {
  if (!orgId) {
    return undefined;
  }
  const [member] = await inScope(db, { userId, orgId }, (tx) =>
    tx
      .select({ id: members.id })
      .from(members)
      .where(and(eq(members.orgId, orgId), eq(members.userId, userId), eq(members.kind, "human"), isNull(members.removedAt))),
  );
  return member ? orgId : undefined;
}
