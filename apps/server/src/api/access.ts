import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { members, teamMembers, teams, user, type Transaction } from "@edicthq/db";
import type { Member, Role, Team } from "@edicthq/schema";
import { forbidden, notFound } from "./errors.js";

export type MemberRow = typeof members.$inferSelect;
export type TeamRow = typeof teams.$inferSelect;

const rank: Record<Role, number> = { owner: 3, admin: 2, member: 1, guest: 0 };

export function atLeast(role: Role, min: Role): boolean {
  return rank[role] >= rank[min];
}

// The signed-in user's member in the scoped organization. Outsiders get 404,
// so they cannot tell whether the organization exists.
export async function callerMember(tx: Transaction, orgId: string, userId: string): Promise<MemberRow> {
  const [member] = await tx
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.userId, userId), isNull(members.removedAt)));
  if (!member) {
    throw notFound("organization");
  }
  return member;
}

export function requireRole(caller: MemberRow, min: Role, action: string): void {
  if (!atLeast(caller.role, min)) {
    throw forbidden(`Only ${min === "owner" ? "Owners" : "Admins and Owners"} can ${action}.`);
  }
}

export async function activeMember(tx: Transaction, orgId: string, memberId: string): Promise<MemberRow> {
  const [member] = await tx
    .select()
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.id, memberId), isNull(members.removedAt)));
  if (!member) {
    throw notFound("member");
  }
  return member;
}

// Admins and Owners see every team. Members see public teams and the private
// teams they belong to. Guests see only the teams they belong to.
export function teamVisibility(tx: Transaction, caller: MemberRow): SQL | undefined {
  if (atLeast(caller.role, "admin")) {
    return undefined;
  }
  const own = inArray(
    teams.id,
    tx.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.memberId, caller.id)),
  );
  return caller.role === "guest" ? own : or(eq(teams.private, false), own);
}

export async function visibleTeam(tx: Transaction, caller: MemberRow, teamId: string): Promise<TeamRow> {
  const [team] = await tx
    .select()
    .from(teams)
    .where(and(eq(teams.orgId, caller.orgId), eq(teams.id, teamId), teamVisibility(tx, caller)));
  if (!team) {
    throw notFound("team");
  }
  return team;
}

// Member fields joined with the user behind a human member.
export const memberColumns = {
  id: members.id,
  kind: members.kind,
  role: members.role,
  createdAt: members.createdAt,
  userName: user.name,
  userEmail: user.email,
};

export function memberWithUser(tx: Transaction) {
  return tx.select(memberColumns).from(members).leftJoin(user, eq(user.id, members.userId));
}

type MemberWithUser = {
  id: string;
  kind: MemberRow["kind"];
  role: Role;
  createdAt: Date;
  userName: string | null;
  userEmail: string | null;
};

export function toMember(row: MemberWithUser): Member {
  return {
    id: row.id,
    kind: row.kind,
    role: row.role,
    // Agents get names of their own in M3. A human whose user was deleted
    // keeps their member for the event log.
    name: row.userName ?? (row.kind === "agent" ? "Agent" : "Deleted user"),
    email: row.userEmail,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function loadMember(tx: Transaction, orgId: string, memberId: string): Promise<Member> {
  const [row] = await memberWithUser(tx).where(and(eq(members.orgId, orgId), eq(members.id, memberId)));
  if (!row) {
    throw notFound("member");
  }
  return toMember(row);
}

export function toTeam(row: TeamRow): Team {
  return {
    id: row.id,
    name: row.name,
    key: row.key,
    private: row.private,
    createdAt: row.createdAt.toISOString(),
  };
}
