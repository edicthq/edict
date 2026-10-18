// The MCP tools (ADR 0011): shaped around tasks, taking human values and
// answering in markdown an agent can read. Each may call several endpoints.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Issue, Link, ProgressUpdate } from "@edicthq/client";
import { handleOf, ok, ToolError, type Session } from "./session.js";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

// Runs a tool, turning a ToolError into an answer the agent reads and acts on.
function tool<A>(run: (args: A) => Promise<string>) {
  return async (args: A): Promise<ToolResult> => {
    try {
      return { content: [{ type: "text", text: await run(args) }] };
    } catch (error) {
      if (error instanceof ToolError) {
        return { content: [{ type: "text", text: error.message }], isError: true };
      }
      throw error;
    }
  };
}

const issueArg = z.string().describe("The issue's identifier, like ENG-123");
const priorityArg = z.enum(["urgent", "high", "medium", "low", "none"]);
const stateArg = z
  .enum(["working", "blocked", "needs_input", "done"])
  .describe("working: under way. blocked: you cannot go on. needs_input: you are waiting on a person. done: finished.");
const linkArg = z.object({ url: z.string().url(), title: z.string().optional() });

// One line per issue, for lists.
async function line(session: Session, issue: Issue): Promise<string> {
  const status = (await session.statuses(issue.teamId)).find((s) => s.id === issue.statusId);
  const parts = [`${issue.identifier} ${issue.title}`, status?.name ?? "", issue.priority === "none" ? "" : issue.priority];
  const delegate = await session.memberName(issue.delegateId);
  if (delegate) parts.push(`delegate: ${delegate}`);
  return `- ${parts.filter(Boolean).join(" · ")}`;
}

async function list(session: Session, issues: Issue[], empty: string): Promise<string> {
  if (issues.length === 0) return empty;
  return (await Promise.all(issues.map((issue) => line(session, issue)))).join("\n");
}

function progressLine(update: ProgressUpdate, who: string): string {
  const links = update.links.map((link) => ` [${link.title ?? link.url}](${link.url})`).join("");
  return `- ${update.createdAt} ${who}, ${update.state}: ${update.message}${links}`;
}

// An issue as get_issue and the edict://issue resource show it.
export async function renderIssue(session: Session, ref: string): Promise<string> {
  const issue = await session.issue(ref);
  const path = { params: { path: { ...session.path, issueRef: issue.id } } };
  const [team, statuses, labels, comments, relations, subIssues, links, progress] = await Promise.all([
    session.teamOf(issue.teamId),
    session.statuses(issue.teamId),
    session.labels(issue.teamId),
    ok(session.api.GET("/organizations/{orgId}/issues/{issueRef}/comments", path)),
    ok(session.api.GET("/organizations/{orgId}/issues/{issueRef}/relations", path)),
    ok(session.api.GET("/organizations/{orgId}/issues/{issueRef}/sub-issues", path)),
    ok(session.api.GET("/organizations/{orgId}/issues/{issueRef}/links", path)),
    ok(session.api.GET("/organizations/{orgId}/issues/{issueRef}/progress", { params: { ...path.params, query: { limit: 5 } } })),
  ]);
  const status = statuses.find((s) => s.id === issue.statusId);
  const names = async (id: string | null) => (await session.memberName(id)) ?? "none";
  const out = [
    `# ${issue.identifier} ${issue.title}`,
    "",
    `Team: ${team.key} (${team.name})`,
    `Status: ${status?.name} (${status?.category})`,
    `Priority: ${issue.priority}`,
    `Estimate: ${issue.estimate ?? "none"}`,
    `Assignee: ${await names(issue.assigneeId)}`,
    `Delegate: ${await names(issue.delegateId)}`,
    `Labels: ${labels.filter((l) => issue.labelIds.includes(l.id)).map((l) => l.name).join(", ") || "none"}`,
    `Version: ${issue.version} (send it to update_issue)`,
    "",
    "## Description",
    "",
    issue.description || "_No description._",
  ];
  if (subIssues.length) {
    out.push("", "## Sub-issues", "", ...subIssues.map((s) => `- ${s.identifier} ${s.title} · ${s.status.name}`));
  }
  if (relations.length) {
    out.push("", "## Relations", "", ...relations.map((r) => `- ${r.type.replace("_", " ")} ${r.issue.identifier} ${r.issue.title} · ${r.issue.status.name}`));
  }
  if (links.length) {
    out.push("", "## Links", "", ...links.map((l: Link) => `- [${l.title ?? l.url}](${l.url})`));
  }
  if (progress.length) {
    out.push("", "## Recent progress", "");
    for (const update of progress) out.push(progressLine(update, await names(update.agentId)));
  }
  if (comments.length) {
    out.push("", "## Comments", "");
    for (const comment of comments) out.push(`### ${await names(comment.creatorId)}, ${comment.createdAt}`, "", comment.body, "");
  }
  return out.join("\n");
}

// A project as get_project and the edict://project resource show it.
export async function renderProject(session: Session, ref: string): Promise<string> {
  const project = await session.project(ref);
  const issues = await ok(
    session.api.GET("/organizations/{orgId}/projects/{projectRef}/issues", {
      params: { path: { ...session.path, projectRef: project.id } },
    }),
  );
  const lead = await session.memberName(project.leadId);
  const out = [
    `# ${project.name} (${project.slug})`,
    "",
    `Status: ${project.status}`,
    `Lead: ${lead ?? "none"}`,
    `Progress: ${project.progress.percentage}% (${project.progress.completed}/${project.progress.total} issues completed)`,
    `Target Date: ${project.targetDate ?? "none"}`,
    `Version: ${project.version}`,
    "",
    "## Description",
    "",
    project.description || "_No description._",
    "",
    "## Issues",
    "",
    await list(session, issues, "_No issues in this project._"),
  ];
  return out.join("\n");
}

export function registerTools(server: McpServer, session: Session): void {
  server.registerTool(
    "my_work",
    {
      title: "My work",
      description:
        "The issues in your queue: delegated to you, most pressing first. Start here when asked to do your Edict work, then get_issue each one before working it.",
      inputSchema: { include_done: z.boolean().default(false).describe("Also list issues already done or canceled") },
    },
    tool(async ({ include_done }) => {
      const issues = await ok(
        session.api.GET("/organizations/{orgId}/my-work", {
          params: { path: session.path, query: { include: include_done ? "all" : "open" } },
        }),
      );
      return list(session, issues, "Your queue is empty: no open issues are delegated to you.");
    }),
  );

  server.registerTool(
    "search_issues",
    {
      title: "Search issues",
      description: "Find issues across the teams you can see, by words, part of a title or an identifier, and filters.",
      inputSchema: {
        query: z.string().optional(),
        team: z.string().optional().describe("Team key or name"),
        status: z.string().optional().describe("Status name, or a category: backlog, todo, in progress, done, canceled"),
        assignee: z.string().optional().describe("@handle or name"),
        delegate: z.string().optional().describe("@handle or name of an agent, or me"),
        label: z.string().optional(),
        priority: priorityArg.optional(),
        project: z.string().optional().describe("Project slug, name or ID"),
        include_closed: z.boolean().default(false),
        limit: z.number().int().min(1).max(100).default(25),
      },
    },
    tool(async (args) => {
      const query: Record<string, string | number> = { limit: args.limit, include: args.include_closed ? "all" : "open" };
      if (args.query) query.q = args.query;
      if (args.priority) query.priority = args.priority;
      const team = args.team ? await session.team(args.team) : undefined;
      if (team) query.teamId = team.id;
      if (args.status) {
        const category = ["backlog", "todo", "in progress", "in_progress", "done", "canceled"].includes(args.status.toLowerCase());
        if (category && !team) {
          query.statusCategory = args.status.toLowerCase().replace(" ", "_");
        } else {
          if (!team) throw new ToolError("Give a team to search by status name, or use a status category.");
          query.statusId = (await session.status(team.id, args.status)).id;
        }
      }
      if (args.assignee) query.assigneeId = (await session.member(args.assignee, "human", "assignee")).id;
      if (args.delegate) query.delegateId = (await session.member(args.delegate, "agent", "delegate")).id;
      if (args.label) {
        if (!team) throw new ToolError("Give a team to search by label.");
        query.labelId = (await session.labelIds(team.id, [args.label]))[0]!;
      }
      if (args.project) query.projectId = (await session.project(args.project)).id;
      const issues = await ok(
        session.api.GET("/organizations/{orgId}/issues", { params: { path: session.path, query: query as never } }),
      );
      return list(session, issues, "No issues match.");
    }),
  );

  server.registerTool(
    "get_issue",
    {
      title: "Get an issue",
      description: "One issue with its description, comments, relations, sub-issues, links and recent progress updates, and the version update_issue needs.",
      inputSchema: { issue: issueArg },
    },
    tool(({ issue }) => renderIssue(session, issue)),
  );

  server.registerTool(
    "create_issue",
    {
      title: "Create an issue",
      description: "Create an issue in a team. Values are names: status, labels and people resolve to the team's. A team template name prefills the title, description and labels; anything you pass explicitly wins.",
      inputSchema: {
        team: z.string().describe("Team key or name"),
        template: z.string().optional().describe("A template's name; get_team_context lists them"),
        title: z.string().optional(),
        description: z.string().optional().describe("Markdown"),
        status: z.string().optional().describe("Defaults to the team's default status"),
        priority: priorityArg.optional(),
        estimate: z.number().int().min(0).optional(),
        assignee: z.string().optional().describe("The person who answers for it: @handle or name"),
        delegate: z.string().optional().describe("The agent who does it: @handle, name, or me"),
        labels: z.array(z.string()).optional(),
        project: z.string().optional().describe("Project slug, name or ID"),
        parent: z.string().optional().describe("Identifier of the parent issue, to make a sub-issue"),
      },
    },
    tool(async (args) => {
      const team = await session.team(args.team);
      let template: { title: string; description: string; labelIds: string[] } | undefined;
      if (args.template) {
        const all = await ok(
          session.api.GET("/organizations/{orgId}/teams/{teamId}/templates", { params: { path: { ...session.path, teamId: team.id } } }),
        );
        const found = all.find((item) => item.name.toLowerCase() === args.template!.toLowerCase());
        if (!found) {
          throw new ToolError(`No template named ${args.template} on ${team.key}. Valid templates: ${all.map((item) => item.name).join(", ") || "none"}.`);
        }
        template = found;
      }
      const title = args.title ?? template?.title ?? "";
      if (!title.trim()) {
        throw new ToolError(`Give a title, or a template with one.`);
      }
      const labels = args.labels;
      const templateLabels = !labels && template ? template.labelIds : undefined;
      const parent = args.parent ? await session.issue(args.parent) : undefined;
      const project = args.project ? await session.project(args.project) : undefined;
      const created = await ok(
        session.api.POST("/organizations/{orgId}/teams/{teamId}/issues", {
          params: { path: { ...session.path, teamId: team.id } },
          body: {
            title,
            description: args.description ?? template?.description ?? "",
            statusId: args.status ? (await session.status(team.id, args.status)).id : undefined,
            priority: args.priority ?? "none",
            estimate: args.estimate ?? null,
            assigneeId: args.assignee ? (await session.member(args.assignee, "human", "assignee")).id : null,
            delegateId: args.delegate ? (await session.member(args.delegate, "agent", "delegate")).id : null,
            labelIds: labels ? await session.labelIds(team.id, labels) : (templateLabels ?? []),
            projectId: project?.id ?? null,
            parentId: parent?.id ?? null,
          },
        }),
      );
      return `Created ${created.identifier} ${created.title} (version ${created.version}).`;
    }),
  );

  server.registerTool(
    "update_issue",
    {
      title: "Update an issue",
      description:
        "Change an issue's status, people, labels, priority, estimate, team or parent. Send the version from get_issue; if someone changed the same fields since, call get_issue again and retry. Report your work with post_progress and comment, not by rewriting the description.",
      inputSchema: {
        issue: issueArg,
        version: z.number().int().min(1).describe("The version get_issue showed"),
        title: z.string().optional(),
        description: z.string().optional().describe("Markdown. Replaces the whole description; rarely what you want."),
        status: z.string().optional().describe("Status name, or a category: backlog, todo, in progress, done, canceled"),
        priority: priorityArg.optional(),
        estimate: z.number().int().min(0).nullable().optional(),
        assignee: z.string().nullable().optional().describe("@handle or name; null to clear"),
        delegate: z.string().nullable().optional().describe("@handle, name or me; null to clear"),
        labels: z.array(z.string()).optional().describe("Replaces all labels"),
        add_labels: z.array(z.string()).optional(),
        remove_labels: z.array(z.string()).optional(),
        team: z.string().optional().describe("Move to this team; the issue gets a new identifier"),
        project: z.string().nullable().optional().describe("Project slug, name or ID; null to clear"),
        parent: z.string().nullable().optional().describe("Parent identifier; null to clear"),
      },
    },
    tool(async (args) => {
      const current = await session.issue(args.issue);
      const target = args.team ? await session.team(args.team) : await session.teamOf(current.teamId);
      const body: Record<string, unknown> = { version: args.version };
      if (args.title !== undefined) body.title = args.title;
      if (args.description !== undefined) body.description = args.description;
      if (args.status !== undefined) body.statusId = (await session.status(target.id, args.status)).id;
      if (args.priority !== undefined) body.priority = args.priority;
      if (args.estimate !== undefined) body.estimate = args.estimate;
      if (args.assignee !== undefined) {
        body.assigneeId = args.assignee === null ? null : (await session.member(args.assignee, "human", "assignee")).id;
      }
      if (args.delegate !== undefined) {
        body.delegateId = args.delegate === null ? null : (await session.member(args.delegate, "agent", "delegate")).id;
      }
      if (args.labels || args.add_labels || args.remove_labels) {
        let ids = args.labels ? await session.labelIds(target.id, args.labels) : current.labelIds;
        if (args.add_labels) ids = [...new Set([...ids, ...(await session.labelIds(target.id, args.add_labels))])];
        if (args.remove_labels) {
          const gone = new Set(await session.labelIds(target.id, args.remove_labels));
          ids = ids.filter((id) => !gone.has(id));
        }
        body.labelIds = ids;
      }
      if (args.team) body.teamId = target.id;
      if (args.project !== undefined) body.projectId = args.project === null ? null : (await session.project(args.project)).id;
      if (args.parent !== undefined) body.parentId = args.parent === null ? null : (await session.issue(args.parent)).id;
      const updated = await ok(
        session.api.PATCH("/organizations/{orgId}/issues/{issueRef}", {
          params: { path: { ...session.path, issueRef: current.id } },
          body: body as never,
        }),
      );
      return `Updated. ${(await line(session, updated)).slice(2)} (version ${updated.version})`;
    }),
  );

  server.registerTool(
    "comment",
    {
      title: "Comment",
      description: "Add a markdown comment to an issue, for findings, questions and answers people should read.",
      inputSchema: { issue: issueArg, body: z.string().describe("Markdown") },
    },
    tool(async ({ issue, body }) => {
      await ok(
        session.api.POST("/organizations/{orgId}/issues/{issueRef}/comments", {
          params: { path: { ...session.path, issueRef: issue } },
          body: { body },
        }),
      );
      return `Commented on ${issue}.`;
    }),
  );

  server.registerTool(
    "post_progress",
    {
      title: "Post progress",
      description:
        "Report how your work on an issue is going, so the people on it see it live. Post when you start, when you are blocked or need input, and when you finish. It does not change the issue's status: use update_issue for that.",
      inputSchema: {
        issue: issueArg,
        state: stateArg,
        message: z.string().describe("Markdown, a sentence or two"),
        links: z.array(linkArg).max(10).optional().describe("Pull requests or other URLs"),
      },
    },
    tool(async ({ issue, state, message, links }) => {
      await ok(
        session.api.POST("/organizations/{orgId}/issues/{issueRef}/progress", {
          params: { path: { ...session.path, issueRef: issue } },
          body: { state, message, links: links ?? [] },
        }),
      );
      return `Posted ${state} on ${issue}.`;
    }),
  );

  server.registerTool(
    "link",
    {
      title: "Link a URL",
      description: "Attach a pull request or other URL to an issue. Attaching the same URL twice keeps one link.",
      inputSchema: { issue: issueArg, url: z.string().url(), title: z.string().optional() },
    },
    tool(async ({ issue, url, title }) => {
      await ok(
        session.api.POST("/organizations/{orgId}/issues/{issueRef}/links", {
          params: { path: { ...session.path, issueRef: issue } },
          body: { url, title },
        }),
      );
      return `Linked ${url} to ${issue}.`;
    }),
  );

  server.registerTool(
    "relate_issues",
    {
      title: "Relate issues",
      description: "Record that one issue blocks, is blocked by, relates to or duplicates another.",
      inputSchema: {
        issue: issueArg,
        relation: z.enum(["blocks", "blocked_by", "related", "duplicate_of", "duplicated_by"]),
        other: z.string().describe("The other issue's identifier"),
      },
    },
    tool(async ({ issue, relation, other }) => {
      await ok(
        session.api.POST("/organizations/{orgId}/issues/{issueRef}/relations", {
          params: { path: { ...session.path, issueRef: issue } },
          body: { type: relation, issue: other },
        }),
      );
      return `${issue} ${relation.replace("_", " ")} ${other}.`;
    }),
  );

  server.registerTool(
    "list_teams",
    { title: "List teams", description: "The teams you can see, with their keys.", inputSchema: {} },
    tool(async () => {
      const teams = await session.teams();
      return teams.map((team) => `- ${team.key} ${team.name}${team.private ? " (private)" : ""}`).join("\n") || "You can see no teams.";
    }),
  );

  server.registerTool(
    "get_team_context",
    {
      title: "Get a team's context",
      description: "A team's statuses with their categories, its labels, and its people and agents with their handles. Use it before creating or updating issues there.",
      inputSchema: { team: z.string().describe("Team key or name") },
    },
    tool(async ({ team: value }) => {
      const team = await session.team(value);
      const [statuses, labels, members, agents, templates] = await Promise.all([
        session.statuses(team.id),
        session.labels(team.id),
        ok(session.api.GET("/organizations/{orgId}/teams/{teamId}/members", { params: { path: { ...session.path, teamId: team.id } } })),
        session.agents(),
        ok(session.api.GET("/organizations/{orgId}/teams/{teamId}/templates", { params: { path: { ...session.path, teamId: team.id } } })),
      ]);
      const agentLine = (id: string) => {
        const agent = agents.find((a) => a.id === id);
        if (!agent) return "";
        return agent.connectedBy ? " · connected, picks up work when asked" : " · runner";
      };
      return [
        `# ${team.key} ${team.name}`,
        "",
        "## Statuses",
        ...statuses.map((s) => `- ${s.name} (${s.category})${s.default ? " · default" : ""}`),
        "",
        "## Labels",
        ...(labels.length ? labels.map((l) => `- ${l.name}${l.teamId ? "" : " · organization"}`) : ["- none"]),
        "",
        "## Members",
        ...members.map((m) => `- ${handleOf(m)} ${m.name} · ${m.kind === "agent" ? "agent" : m.role}${agentLine(m.id)}`),
        "",
        "## Templates",
        ...(templates.length
          ? templates.map((t) => `- ${t.name}: prefills the title "${t.title}"${t.description ? " and the description" : ""}`)
          : ["- none"]),
      ].join("\n");
    }),
  );


  server.registerTool(
    "get_inbox",
    {
      title: "Get inbox",
      description: "List unread notifications for the caller in this organization.",
      inputSchema: {},
    },
    tool(async () => {
      const items = await ok(session.api.GET("/organizations/{orgId}/inbox", { params: { path: session.path, query: { filter: "unread" } } }));
      if (!items.length) {
        return "# Inbox\n\nNo unread notifications.";
      }
      return [
        `# Inbox (${items.length} unread)`,
        "",
        ...items.map((item) => {
          const actor = item.actor ? item.actor.name : "Someone";
          return `- **${item.issue.identifier}** (${item.issue.title}): ${actor} ${item.type.replace(/_/g, " ")}`;
        }),
      ].join("\n");
    }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Get project",
      description: "Read a project by slug or ID with its progress and issues.",
      inputSchema: { project: z.string().describe("Project slug or ID") },
    },
    tool(async ({ project }) => renderProject(session, project)),
  );
}
