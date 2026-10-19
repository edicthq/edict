import { createRoute, z } from "@hono/zod-openapi";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  apiKeys,
  emit,
  members,
  oauthAccessToken,
  oauthClient,
  oauthConsent,
  oauthRefreshToken,
  teamMembers,
  webhooks,
  type Transaction,
} from "@edicthq/db";
import {
  Agent,
  ApiKey,
  CreateAgent,
  CreateApiKey,
  CreatedApiKey,
  Id,
  UpdateAgent,
} from "@edicthq/schema";
import { requireRole, requireVisibleTeams, requireWithinCaller, type MemberRow } from "./access.js";
import { newApiKey, type Caller } from "./callers.js";
import { OrgParams, body, errors, inOrg, json, noContent, router, type ApiDeps } from "./context.js";
import { disableAgentWebhooks } from "./webhooks.js";
import { changesOf, conflict, forbidden, invalid, notFound, requireVersion } from "./errors.js";

const AgentParams = OrgParams.extend({ agentId: Id });
const ApiKeyParams = AgentParams.extend({ keyId: Id });

export function toAgent(row: MemberRow, webhook = false): Agent {
  return {
    id: row.id,
    name: row.name ?? "Agent",
    description: row.description,
    role: row.role === "guest" ? "guest" : "member",
    grants: [...row.grants].sort(),
    connectedBy: row.connectedBy,
    clientName: row.clientName,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    webhook,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

function toApiKey(row: typeof apiKeys.$inferSelect): ApiKey {
  return {
    id: row.id,
    agentId: row.agentId,
    name: row.name,
    prefix: row.prefix,
    teamIds: row.teamIds,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
  };
}

const listAgents = createRoute({
  method: "get",
  path: "/organizations/{orgId}/agents",
  tags: ["Agents"],
  summary: "Agents in the organization, paused ones included",
  request: { params: OrgParams },
  responses: {
    200: json(z.array(Agent), "Agents, oldest first"),
    ...errors("unauthorized", "not_found"),
  },
});

const getAgent = createRoute({
  method: "get",
  path: "/organizations/{orgId}/agents/{agentId}",
  tags: ["Agents"],
  summary: "One agent",
  request: { params: AgentParams },
  responses: {
    200: json(Agent, "The agent"),
    ...errors("unauthorized", "not_found"),
  },
});

const createAgent = createRoute({
  method: "post",
  path: "/organizations/{orgId}/agents",
  tags: ["Agents"],
  summary: "Create an agent for an agent runner",
  description:
    "Admins and Owners create agents and give them API keys. Agents that MCP clients connect through OAuth are created by Edict.",
  request: { params: OrgParams, ...body(CreateAgent) },
  responses: {
    201: json(Agent, "The new agent"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found"),
  },
});

const updateAgent = createRoute({
  method: "patch",
  path: "/organizations/{orgId}/agents/{agentId}",
  tags: ["Agents"],
  summary: "Rename an agent, or change its role and grants",
  request: { params: AgentParams, ...body(UpdateAgent) },
  responses: {
    200: json(Agent, "The agent"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const pauseAgent = createRoute({
  method: "post",
  path: "/organizations/{orgId}/agents/{agentId}/pause",
  tags: ["Agents"],
  summary: "Pause an agent",
  description: "Revokes every token the agent holds, API keys and OAuth grants alike. It acts again only after an admin resumes it and it gets new credentials.",
  request: { params: AgentParams },
  responses: {
    200: json(Agent, "The paused agent"),
    ...errors("unauthorized", "forbidden", "not_found"),
  },
});

const resumeAgent = createRoute({
  method: "post",
  path: "/organizations/{orgId}/agents/{agentId}/resume",
  tags: ["Agents"],
  summary: "Resume a paused agent",
  description: "Revoked credentials stay revoked: give the agent a new API key, or reconnect its MCP client.",
  request: { params: AgentParams },
  responses: {
    200: json(Agent, "The agent"),
    ...errors("unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const listApiKeys = createRoute({
  method: "get",
  path: "/organizations/{orgId}/agents/{agentId}/api-keys",
  tags: ["Agents"],
  summary: "An agent's API keys that are not revoked",
  request: { params: AgentParams },
  responses: {
    200: json(z.array(ApiKey), "API keys, without their secrets"),
    ...errors("unauthorized", "forbidden", "not_found"),
  },
});

const createApiKey = createRoute({
  method: "post",
  path: "/organizations/{orgId}/agents/{agentId}/api-keys",
  tags: ["Agents"],
  summary: "Give an agent an API key",
  description: "The secret is in this response only. Send it as `Authorization: Bearer <secret>`.",
  request: { params: AgentParams, ...body(CreateApiKey) },
  responses: {
    201: json(CreatedApiKey, "The key and its secret"),
    ...errors("invalid_request", "unauthorized", "forbidden", "not_found", "conflict"),
  },
});

const revokeApiKey = createRoute({
  method: "delete",
  path: "/organizations/{orgId}/agents/{agentId}/api-keys/{keyId}",
  tags: ["Agents"],
  summary: "Revoke an API key",
  request: { params: ApiKeyParams },
  responses: {
    ...noContent,
    ...errors("unauthorized", "forbidden", "not_found"),
  },
});

export function agentRoutes(deps: ApiDeps) {
  const app = router();

  app.openapi(listAgents, async (c) => {
    const { orgId } = c.req.valid("param");
    const { rows, hooked } = await inOrg(deps, c, orgId, async (tx) => ({
      rows: await tx
        .select()
        .from(members)
        .where(and(eq(members.orgId, orgId), eq(members.kind, "agent"), isNull(members.removedAt)))
        .orderBy(asc(members.createdAt)),
      hooked: await agentsWithWebhooks(tx),
    }));
    return c.json(rows.map((row) => toAgent(row, hooked.has(row.id))), 200);
  });

  app.openapi(getAgent, async (c) => {
    const { orgId, agentId } = c.req.valid("param");
    const { row, hooked } = await inOrg(deps, c, orgId, async (tx) => ({
      row: await agentRow(tx, orgId, agentId),
      hooked: await agentsWithWebhooks(tx),
    }));
    return c.json(toAgent(row, hooked.has(row.id)), 200);
  });

  app.openapi(createAgent, async (c) => {
    const { orgId } = c.req.valid("param");
    const input = c.req.valid("json");
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      requireRole(caller, "admin", "create agents", "agents");
      const teamIds = [...new Set(input.teamIds)];
      await requireVisibleTeams(tx, caller, teamIds);
      const grants = [...new Set(input.grants)].sort();
      requireWithinCaller(caller, { grants, role: input.role });
      const [agent] = await tx
        .insert(members)
        .values({ orgId, kind: "agent", role: input.role, name: input.name, description: input.description, grants })
        .returning();
      if (teamIds.length > 0) {
        await tx.insert(teamMembers).values(teamIds.map((teamId) => ({ orgId, teamId, memberId: agent!.id })));
      }
      await emit(tx, orgId, {
        type: "agent.created",
        actorId: caller.id,
        subjectId: agent!.id,
        data: { name: input.name, role: input.role, teamIds, grants },
      });
      return agent!;
    });
    return c.json(toAgent(row), 201);
  });

  app.openapi(updateAgent, async (c) => {
    const { orgId, agentId } = c.req.valid("param");
    const { version, ...input } = c.req.valid("json");
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      const agent = await agentRow(tx, orgId, agentId, { forUpdate: true });
      requireRole(caller, "admin", "change agents", "agents");
      if (caller.id === agent.id) {
        throw forbidden("An agent cannot change itself. An admin can.");
      }
      requireVersion(agent.version, version, "agent");
      const next = { ...input, grants: input.grants ? [...new Set(input.grants)].sort() : undefined };
      requireWithinCaller(caller, { grants: next.grants, role: next.role });
      const changes = changesOf({ ...agent, grants: [...agent.grants].sort() }, next);
      if (Object.keys(changes).length === 0) {
        return agent;
      }
      const [updated] = await tx
        .update(members)
        .set({ ...next, version: sql`${members.version} + 1` })
        .where(eq(members.id, agent.id))
        .returning();
      await emit(tx, orgId, { type: "agent.updated", actorId: caller.id, subjectId: agent.id, data: { changes, version: updated!.version } });
      return updated!;
    });
    return c.json(toAgent(row), 200);
  });

  app.openapi(pauseAgent, async (c) => {
    const { orgId, agentId } = c.req.valid("param");
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      const agent = await agentRow(tx, orgId, agentId, { forUpdate: true });
      requirePauseRights(caller, agent);
      return pause(tx, caller.id, agent);
    });
    return c.json(toAgent(row), 200);
  });

  app.openapi(resumeAgent, async (c) => {
    const { orgId, agentId } = c.req.valid("param");
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      const agent = await agentRow(tx, orgId, agentId, { forUpdate: true });
      requireRole(caller, "admin", "resume agents", "agents");
      if (!agent.pausedAt) {
        return agent;
      }
      if (agent.connectedBy) {
        const [human] = await tx.select().from(members).where(eq(members.id, agent.connectedBy));
        if (human?.removedAt) {
          throw conflict("The person who connected this agent left the organization, so it stays paused.");
        }
      }
      const [resumed] = await tx
        .update(members)
        .set({ pausedAt: null, version: sql`${members.version} + 1` })
        .where(eq(members.id, agent.id))
        .returning();
      await emit(tx, orgId, { type: "agent.resumed", actorId: caller.id, subjectId: agent.id, data: { version: resumed!.version } });
      return resumed!;
    });
    return c.json(toAgent(row), 200);
  });

  app.openapi(listApiKeys, async (c) => {
    const { orgId, agentId } = c.req.valid("param");
    const rows = await inOrg(deps, c, orgId, async (tx, caller) => {
      await agentRow(tx, orgId, agentId);
      requireRole(caller, "admin", "see API keys", "agents");
      return tx
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.agentId, agentId), isNull(apiKeys.revokedAt)))
        .orderBy(asc(apiKeys.createdAt));
    });
    return c.json(rows.map(toApiKey), 200);
  });

  app.openapi(createApiKey, async (c) => {
    const { orgId, agentId } = c.req.valid("param");
    const input = c.req.valid("json");
    const key = newApiKey();
    const row = await inOrg(deps, c, orgId, async (tx, caller) => {
      const agent = await agentRow(tx, orgId, agentId);
      requireRole(caller, "admin", "give agents API keys", "agents");
      if (agent.pausedAt) {
        throw conflict("The agent is paused. Resume it first.");
      }
      if (agent.connectedBy) {
        throw invalid("A connected agent acts through its MCP client's OAuth connection, not API keys.");
      }
      const teamIds = input.teamIds ? [...new Set(input.teamIds)] : null;
      await requireVisibleTeams(tx, caller, teamIds ?? []);
      const [created] = await tx
        .insert(apiKeys)
        .values({ orgId, agentId, name: input.name, prefix: key.prefix, tokenHash: key.hash, teamIds, createdBy: caller.id })
        .returning();
      await emit(tx, orgId, {
        type: "api_key.created",
        actorId: caller.id,
        subjectId: created!.id,
        data: { agentId, name: input.name, prefix: key.prefix, teamIds },
      });
      return created!;
    });
    return c.json({ apiKey: toApiKey(row), secret: key.secret }, 201);
  });

  app.openapi(revokeApiKey, async (c) => {
    const { orgId, agentId, keyId } = c.req.valid("param");
    await inOrg(deps, c, orgId, async (tx, caller) => {
      await agentRow(tx, orgId, agentId);
      requireRole(caller, "admin", "revoke API keys", "agents");
      const [revoked] = await tx
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, keyId), eq(apiKeys.agentId, agentId), isNull(apiKeys.revokedAt)))
        .returning();
      if (!revoked) {
        throw notFound("API key");
      }
      await emit(tx, orgId, { type: "api_key.revoked", actorId: caller.id, subjectId: keyId, data: { agentId } });
    });
    return c.body(null, 204);
  });

  return app;
}

// Agents with an active webhook, whose runners start right away.
async function agentsWithWebhooks(tx: Transaction): Promise<Set<string>> {
  const rows = await tx
    .selectDistinct({ agentId: webhooks.agentId })
    .from(webhooks)
    .where(and(isNotNull(webhooks.agentId), isNull(webhooks.disabledAt)));
  return new Set(rows.map((row) => row.agentId!));
}

async function agentRow(tx: Transaction, orgId: string, agentId: string, options: { forUpdate?: boolean } = {}) {
  const query = tx
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.id, agentId), eq(members.kind, "agent"), isNull(members.removedAt)));
  const [row] = options.forUpdate ? await query.for("update") : await query;
  if (!row) {
    throw notFound("agent");
  }
  return row;
}

// Admins pause any agent. The human who connected an agent can pause it too.
function requirePauseRights(caller: Caller, agent: MemberRow): void {
  if (caller.kind === "human" && agent.connectedBy === caller.id) {
    return;
  }
  if (caller.id === agent.id) {
    throw forbidden("An agent cannot pause itself.");
  }
  requireRole(caller, "admin", "pause agents", "agents");
}

// Revokes every token the agent holds and stops it acting (ADR 0021).
export async function pause(tx: Transaction, actorId: string, agent: MemberRow): Promise<MemberRow> {
  if (agent.pausedAt) {
    return agent;
  }
  const revoked = await tx
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.agentId, agent.id), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  const revokedGrants = agent.connectedBy ? await revokeGrants(tx, agent) : 0;
  const disabledWebhooks = await disableAgentWebhooks(tx, agent.id);
  const [paused] = await tx
    .update(members)
    .set({ pausedAt: new Date(), version: sql`${members.version} + 1` })
    .where(eq(members.id, agent.id))
    .returning();
  await emit(tx, agent.orgId, {
    type: "agent.paused",
    actorId,
    subjectId: agent.id,
    data: { revokedApiKeys: revoked.length, revokedGrants, disabledWebhooks, version: paused!.version },
  });
  return paused!;
}

// Deletes a connected agent's OAuth grants: the tokens and consents its human
// gave clients by its name in its organization. Row-level security keeps the
// deletes to that organization. Returns how many grants it removed.
async function revokeGrants(tx: Transaction, agent: MemberRow): Promise<number> {
  const [human] = await tx.select({ userId: members.userId }).from(members).where(eq(members.id, agent.connectedBy!));
  if (!human?.userId) {
    return 0;
  }
  // As clientNameOf names them.
  const clients = await tx
    .select({ clientId: oauthClient.clientId })
    .from(oauthClient)
    .where(sql`coalesce(nullif(trim(${oauthClient.name}), ''), 'MCP client') = ${agent.clientName}`);
  const clientIds = clients.map((client) => client.clientId);
  if (clientIds.length === 0) {
    return 0;
  }
  const mine = <T extends typeof oauthAccessToken | typeof oauthRefreshToken | typeof oauthConsent>(table: T) =>
    and(eq(table.referenceId, agent.orgId), eq(table.userId, human.userId!), inArray(table.clientId, clientIds));
  await tx.delete(oauthAccessToken).where(mine(oauthAccessToken));
  await tx.delete(oauthRefreshToken).where(mine(oauthRefreshToken));
  const consents = await tx.delete(oauthConsent).where(mine(oauthConsent)).returning({ id: oauthConsent.id });
  return consents.length;
}

// When a human leaves, the agents they connected stop acting for them.
export async function pauseConnectedAgents(tx: Transaction, actorId: string, human: MemberRow): Promise<void> {
  const connected = await tx
    .select()
    .from(members)
    .where(and(eq(members.orgId, human.orgId), eq(members.connectedBy, human.id), isNull(members.pausedAt)));
  for (const agent of connected) {
    await pause(tx, actorId, agent);
  }
}
