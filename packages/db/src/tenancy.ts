import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema.js";

// ADR 0016. Every table below except organizations carries org_id, and row-level
// security restricts it to the organization set by the data-access layer
// (scope.ts). Rows referencing another org-owned row use composite keys on
// (org_id, id), so a reference can never cross organizations.

const id = () => uuid("id").primaryKey().default(sql`uuidv7()`);
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`);

export const memberKind = pgEnum("member_kind", ["human", "agent"]);
export const role = pgEnum("role", ["owner", "admin", "member", "guest"]);
// What agents cannot do until an admin grants it (ADR 0021): deleting, changing
// team and organization settings, managing members, and creating agents.
export const agentPower = pgEnum("agent_power", ["delete", "settings", "members", "agents"]);

// The tenant root.
export const organizations = pgTable("organizations", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
});

export const members = pgTable(
  "members",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: memberKind("kind").notNull(),
    // Humans only. Null for agents, and for a human whose user was deleted:
    // the member stays so events keep their actor.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    role: role("role").notNull(),
    // Agents only: humans take their name from their user.
    name: text("name"),
    description: text("description").notNull().default(""),
    // A connected agent's human (ADR 0015). Null for admin-created agents.
    connectedBy: uuid("connected_by"),
    // The MCP client a connected agent was registered as, e.g. "Claude Code".
    clientName: text("client_name"),
    grants: agentPower("grants").array().notNull().default(sql`'{}'::agent_power[]`),
    // A paused agent holds no tokens and cannot act until an admin resumes it.
    pausedAt: timestamp("paused_at", { withTimezone: true }),
    // ADR 0018, for an agent's name, description, role and grants.
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    // A removed member keeps its row for the event log; re-inviting the same
    // user brings the same member back.
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    unique("members_org_id_id_unique").on(table.orgId, table.id),
    unique("members_org_id_user_id_unique").on(table.orgId, table.userId),
    index("members_user_id_idx").on(table.userId),
    // Reconnecting the same client as the same human reuses the agent.
    uniqueIndex("members_connected_client_unique")
      .on(table.orgId, table.connectedBy, table.clientName)
      .where(sql`${table.connectedBy} IS NOT NULL`),
    check("members_agent_has_no_user", sql`${table.kind} = 'human' OR ${table.userId} IS NULL`),
    check(
      "members_agent_role",
      sql`${table.kind} = 'human' OR ${table.role} IN ('member', 'guest')`,
    ),
    check("members_agent_has_name", sql`${table.kind} = 'human' OR ${table.name} IS NOT NULL`),
    check(
      "members_human_is_not_connected",
      sql`${table.kind} = 'agent' OR (${table.connectedBy} IS NULL AND ${table.pausedAt} IS NULL)`,
    ),
    foreignKey({
      name: "members_connected_by_fk",
      columns: [table.orgId, table.connectedBy],
      foreignColumns: [table.orgId, table.id],
    }),
  ],
);

// ADR 0021. A secret that lets one agent call the API as itself. Only its
// SHA-256 hash is stored.
export const apiKeys = pgTable(
  "api_keys",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    agentId: uuid("agent_id").notNull(),
    name: text("name").notNull(),
    // The secret's first characters, to tell keys apart.
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    // Narrows the agent's team access. Null: the agent's own access.
    teamIds: uuid("team_ids").array(),
    createdBy: uuid("created_by").notNull(),
    createdAt: createdAt(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    index("api_keys_agent_id_idx").on(table.agentId),
    foreignKey({
      name: "api_keys_agent_fk",
      columns: [table.orgId, table.agentId],
      foreignColumns: [members.orgId, members.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "api_keys_created_by_fk",
      columns: [table.orgId, table.createdBy],
      foreignColumns: [members.orgId, members.id],
    }),
  ],
);

export const teams = pgTable(
  "teams",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull(),
    private: boolean("private").notNull().default(false),
    // The last issue number given out. Only goes up, so numbers are never
    // reused (ADR 0017).
    issueCounter: integer("issue_counter").notNull().default(0),
    // ADR 0018.
    version: integer("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  },
  (table) => [
    unique("teams_org_id_id_unique").on(table.orgId, table.id),
    unique("teams_org_id_key_unique").on(table.orgId, table.key),
  ],
);

// Every key a team has had, its current one included. Old identifiers resolve
// through it, and a retired key stays reserved to its team (ADR 0017).
export const teamKeys = pgTable(
  "team_keys",
  {
    orgId: uuid("org_id").notNull(),
    key: text("key").notNull(),
    teamId: uuid("team_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.orgId, table.key] }),
    index("team_keys_team_id_idx").on(table.teamId),
    foreignKey({
      name: "team_keys_team_fk",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }).onDelete("cascade"),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    orgId: uuid("org_id").notNull(),
    teamId: uuid("team_id").notNull(),
    memberId: uuid("member_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.teamId, table.memberId] }),
    index("team_members_member_id_idx").on(table.memberId),
    foreignKey({
      name: "team_members_team_fk",
      columns: [table.orgId, table.teamId],
      foreignColumns: [teams.orgId, teams.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "team_members_member_fk",
      columns: [table.orgId, table.memberId],
      foreignColumns: [members.orgId, members.id],
    }).onDelete("cascade"),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    orgId: uuid("org_id").notNull(),
    // Stored lowercase.
    email: text("email").notNull(),
    role: role("role").notNull(),
    // Teams the invitee joins on accepting. Teams deleted meanwhile are skipped.
    teamIds: uuid("team_ids").array().notNull().default(sql`'{}'::uuid[]`),
    invitedBy: uuid("invited_by").notNull(),
    // SHA-256 of the token in the invite link. The token itself is never stored.
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: uuid("accepted_by"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    foreignKey({
      name: "invites_org_fk",
      columns: [table.orgId],
      foreignColumns: [organizations.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "invites_invited_by_fk",
      columns: [table.orgId, table.invitedBy],
      foreignColumns: [members.orgId, members.id],
    }),
    foreignKey({
      name: "invites_accepted_by_fk",
      columns: [table.orgId, table.acceptedBy],
      foreignColumns: [members.orgId, members.id],
    }),
    // One open invite per email. A new invite for the same email replaces it.
    uniqueIndex("invites_open_email_unique")
      .on(table.orgId, table.email)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`),
  ],
);
