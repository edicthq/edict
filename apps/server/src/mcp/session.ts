// What one MCP request works with: the caller's API client and the values it
// resolves names against. The MCP server calls the API only through
// packages/client (AGENTS.md), in process, with the caller's own token.
import type { Agent, EdictClient, Issue, Label, Member, Status, StatusCategory, Team } from "@edicthq/client";

// A tool's failure, worded for the agent: what went wrong and what to do.
export class ToolError extends Error {}

type Result<T> = { data?: T; error?: unknown; response: Response };

// The data of an API call, or a ToolError with the API's message.
export async function ok<T>(call: Promise<Result<T>>): Promise<T> {
  const { data, error, response } = await call;
  if (error !== undefined || !response.ok) {
    const body = error as { error?: { code?: string; message?: string; fields?: string[] } } | undefined;
    const message = body?.error?.message ?? `The Edict API answered ${response.status}.`;
    if (body?.error?.code === "conflict" && body.error.fields) {
      throw new ToolError(`${message} Call get_issue again for the current version and values, then retry.`);
    }
    throw new ToolError(message);
  }
  return data as T;
}

const categories: Record<string, StatusCategory> = {
  backlog: "backlog",
  todo: "todo",
  "to do": "todo",
  "in progress": "in_progress",
  in_progress: "in_progress",
  started: "in_progress",
  done: "done",
  completed: "done",
  canceled: "canceled",
  cancelled: "canceled",
};

const norm = (value: string) => value.trim().toLowerCase();

// A member's handle as tools show it and accept it: a person's email name, or
// an agent's name in lowercase words.
export function handleOf(member: Member): string {
  if (member.kind === "human" && member.email) {
    return `@${member.email.split("@")[0]!.toLowerCase()}`;
  }
  return `@${member.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export class Session {
  private cache = new Map<string, Promise<unknown>>();

  constructor(
    readonly api: EdictClient,
    readonly orgId: string,
    readonly me: Member,
  ) {}

  get path() {
    return { orgId: this.orgId };
  }

  private once<T>(key: string, load: () => Promise<T>): Promise<T> {
    if (!this.cache.has(key)) this.cache.set(key, load());
    return this.cache.get(key) as Promise<T>;
  }

  // After a write, names the next lookup must see fresh.
  forget(key: string): void {
    this.cache.delete(key);
  }

  teams(): Promise<Team[]> {
    return this.once("teams", () => ok(this.api.GET("/organizations/{orgId}/teams", { params: { path: this.path } })));
  }

  statuses(teamId: string): Promise<Status[]> {
    return this.once(`statuses:${teamId}`, () =>
      ok(this.api.GET("/organizations/{orgId}/teams/{teamId}/statuses", { params: { path: { ...this.path, teamId } } })),
    );
  }

  labels(teamId: string): Promise<Label[]> {
    return this.once(`labels:${teamId}`, () =>
      ok(this.api.GET("/organizations/{orgId}/teams/{teamId}/labels", { params: { path: { ...this.path, teamId } } })),
    );
  }

  members(): Promise<Member[]> {
    return this.once("members", () => ok(this.api.GET("/organizations/{orgId}/members", { params: { path: this.path } })));
  }

  agents(): Promise<Agent[]> {
    return this.once("agents", () => ok(this.api.GET("/organizations/{orgId}/agents", { params: { path: this.path } })));
  }

  issue(ref: string): Promise<Issue> {
    return ok(this.api.GET("/organizations/{orgId}/issues/{issueRef}", { params: { path: { ...this.path, issueRef: ref } } }));
  }

  // ---------- names to ids ----------

  async team(value: string): Promise<Team> {
    const teams = await this.teams();
    const found = teams.find((team) => [team.id, norm(team.key), norm(team.name)].includes(norm(value)));
    if (!found) {
      throw new ToolError(`No team "${value}". Teams you can see: ${teams.map((t) => `${t.key} (${t.name})`).join(", ") || "none"}.`);
    }
    return found;
  }

  async teamOf(teamId: string): Promise<Team> {
    return (await this.teams()).find((team) => team.id === teamId) ?? (await this.team(teamId));
  }

  // A status by name, or the first status in a category.
  async status(teamId: string, value: string): Promise<Status> {
    const statuses = await this.statuses(teamId);
    const byName = statuses.find((status) => norm(status.name) === norm(value) || status.id === value);
    const category = categories[norm(value)];
    const found = byName ?? (category && statuses.find((status) => status.category === category));
    if (!found) {
      const team = await this.teamOf(teamId);
      throw new ToolError(
        `No status "${value}" in ${team.key}. Its statuses: ${statuses.map((s) => `${s.name} (${s.category})`).join(", ")}. A category name also works.`,
      );
    }
    return found;
  }

  async labelIds(teamId: string, values: string[]): Promise<string[]> {
    const labels = await this.labels(teamId);
    return values.map((value) => {
      const found = labels.find((label) => norm(label.name) === norm(value) || label.id === value);
      if (!found) {
        throw new ToolError(`No label "${value}". Labels this team's issues can have: ${labels.map((l) => l.name).join(", ") || "none"}.`);
      }
      return found.id;
    });
  }

  // A member by handle, name, first name, email or id; "me" is the caller.
  async member(value: string, kind: "human" | "agent", role: string): Promise<Member> {
    if (norm(value) === "me") {
      if (this.me.kind !== kind) {
        throw new ToolError(`"me" is an agent, and the ${role} must be a person. Name the person instead.`);
      }
      return this.me;
    }
    const wanted = norm(value).replace(/^@/, "");
    const members = (await this.members()).filter((member) => member.kind === kind);
    const matches = (member: Member) =>
      member.id === value ||
      handleOf(member) === `@${wanted}` ||
      norm(member.name) === wanted ||
      norm(member.name).split(/\s+/)[0] === wanted ||
      (member.email !== null && norm(member.email) === wanted);
    const found = members.filter(matches);
    if (found.length !== 1) {
      const options = members.map((member) => `${handleOf(member)} (${member.name})`).join(", ");
      throw new ToolError(
        found.length > 1
          ? `"${value}" matches several members: ${found.map(handleOf).join(", ")}. Use one of those handles.`
          : `No ${kind === "human" ? "person" : "agent"} "${value}" can be the ${role}. Options: ${options || "none"}.`,
      );
    }
    return found[0]!;
  }

  async memberName(id: string | null): Promise<string | null> {
    if (!id) return null;
    const member = (await this.members()).find((m) => m.id === id);
    return member ? member.name : "a former member";
  }
}
