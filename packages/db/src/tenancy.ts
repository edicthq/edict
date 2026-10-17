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
    createdAt: createdAt(),
    // A removed member keeps its row for the event log; re-inviting the same
    // user brings the same member back.
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    unique("members_org_id_id_unique").on(table.orgId, table.id),
    unique("members_org_id_user_id_unique").on(table.orgId, table.userId),
    index("members_user_id_idx").on(table.userId),
    check("members_agent_has_no_user", sql`${table.kind} = 'human' OR ${table.userId} IS NULL`),
    check(
      "members_agent_role",
      sql`${table.kind} = 'human' OR ${table.role} IN ('member', 'guest')`,
    ),
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
