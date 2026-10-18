import { and, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { members, teamMembers, teams, user, type Transaction } from "@edicthq/db";
import type { AgentPower, Member, Role, Team } from "@edicthq/schema";
import type { Caller } from "./callers.js";
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

// Whether the caller's role allows an action. Agents are never Admins, so an
// action above an agent's role needs the power behind it granted (ADR 0021),
// and a connected agent also needs its human to be allowed. Nothing lifts an
// agent to Owner.
export function may(caller: Caller, min: Role, power: AgentPower): boolean {
  if (caller.kind === "human") {
    return atLeast(caller.role, min);
  }
  const allowed = atLeast(caller.role, min) || (min !== "owner" && caller.grants.includes(power));
  const human = caller.access.id === caller.id ? undefined : caller.access;
  return allowed && (!human || atLeast(human.role, min));
}

// `power` is what an agent needs granted to pass: settings unless the action
// manages members or agents.
export function requireRole(caller: Caller, min: Role, action: string, power: AgentPower = "settings"): void {
  if (!may(caller, min, power)) {
    if (caller.kind === "agent" && min !== "owner") {
      throw forbidden(`Agents cannot ${action} unless an admin grants them the "${power}" power.`);
    }
    throw forbidden(`Only ${min === "owner" ? "Owners" : "Admins and Owners"} can ${action}.`);
  }
}

// For actions any human member may take but agents only with a power granted,
// like deleting (ADR 0008).
export function requireAgentPower(caller: Caller, power: AgentPower, action: string): void {
  if (caller.kind === "agent" && !caller.grants.includes(power)) {
    throw forbidden(`Agents cannot ${action} unless an admin grants them the "${power}" power.`);
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
// teams they belong to. Guests see only the teams they belong to. A connected
// agent sees what its human sees, and an API key can narrow an agent to some
// of its teams.
export function teamVisibility(tx: Transaction, caller: Caller): SQL | undefined {
  const access = caller.access;
  const keyTeams = caller.keyTeamIds ? inArray(teams.id, caller.keyTeamIds) : undefined;
  if (atLeast(access.role, "admin")) {
    return keyTeams;
  }
  const own = inArray(
    teams.id,
    tx.select({ id: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.memberId, access.id)),
  );
  return and(access.role === "guest" ? own : or(eq(teams.private, false), own), keyTeams);
}

export async function visibleTeam(tx: Transaction, caller: Caller, teamId: string): Promise<TeamRow> {
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
  agentName: members.name,
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
  agentName: string | null;
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
    // A human whose user was deleted keeps their member for the event log.
    name: row.kind === "agent" ? (row.agentName ?? "Agent") : (row.userName ?? "Deleted user"),
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
    version: row.version,
    createdAt: row.createdAt.toISOString(),
  };
}

// Whether a member can see a team, by the rules of teamVisibility.
export async function canSeeTeam(tx: Transaction, member: MemberRow, team: TeamRow): Promise<boolean> {
  if (atLeast(member.role, "admin")) {
    return true;
  }
  if (member.role !== "guest" && !team.private) {
    return true;
  }
  const [row] = await tx
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, team.id), eq(teamMembers.memberId, member.id)));
  return row !== undefined;
}
