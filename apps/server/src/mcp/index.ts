// The MCP server at /mcp (Streamable HTTP). Every instance has one. A request
// carries an agent's bearer token: an OAuth access token from a connected MCP
// client, or an API key. Each request gets its own stateless server.
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context, Hono } from "hono";
import { z } from "zod";
import { createEdictClient } from "@edicthq/client";
import type { OAuthDiscovery } from "../oauth.js";
import { Session } from "./session.js";
import { registerTools, renderIssue, renderProject } from "./tools.js";

const instructions = `Edict is the issue tracker your team uses. You are an agent member of the organization: issues delegated to you are your queue, and the person assigned still answers for each.
To do your Edict work: call my_work, then for each issue get_issue, post_progress with state working, do the work, link pull requests, comment with what people should know, update_issue to move its status, and post_progress done.
Values are names: statuses (or a category like "in progress"), @handles, label names, team keys. A wrong one gets an error listing the valid ones.`;

export function mcpRoutes(app: Hono, discovery: OAuthDiscovery): void {
  app.all("/mcp", async (c) => {
    const origin = discovery.originOf(c);
    // Stateless and JSON only: no server-sent event stream to open, and no
    // session to end.
    if (c.req.method !== "POST") {
      c.header("allow", "POST");
      return c.json({ error: { code: "invalid_request", message: "Send MCP requests as POST." } }, 405);
    }
    const authorization = c.req.header("authorization");
    if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
      return challenge(c, origin, "Connect through OAuth, or send an agent's API key as a bearer token.");
    }
    await discovery.ensureResource(origin);

    // In process, through the same client every other caller uses.
    const api = createEdictClient(origin, {
      fetch: async (request: Request) => app.fetch(request),
      headers: { authorization },
    });
    const me = await api.GET("/organizations");
    if (me.response.status === 401) {
      const message = (me.error as { error?: { message?: string } } | undefined)?.error?.message;
      return challenge(c, origin, message ?? "The token is not valid.", "invalid_token");
    }
    const membership = me.data?.[0];
    if (!membership) {
      return c.json(me.error ?? { error: { code: "forbidden", message: "This token belongs to no organization." } }, me.response.status === 200 ? 403 : (me.response.status as 403));
    }

    const session = new Session(api, membership.organization.id, membership.member);
    const server = createServer(session, membership.organization.name);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(c.req.raw);
      // JSON responses are complete here, so the server can go.
      const body = await response.arrayBuffer();
      return new Response(body, response);
    } finally {
      await server.close();
    }
  });
}

// RFC 6750 and RFC 9728: where an MCP client learns how to get a token.
function challenge(c: Context, origin: string, message: string, error?: string) {
  const params = [`resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`];
  if (error) params.unshift(`error="${error}"`);
  c.header("www-authenticate", `Bearer ${params.join(", ")}`);
  return c.json({ error: { code: "unauthorized", message } }, 401);
}

function createServer(session: Session, organizationName: string): McpServer {
  const server = new McpServer(
    { name: "edict", title: `Edict (${organizationName})`, version: "0.1.0" },
    { instructions },
  );
  registerTools(server, session);

  server.registerResource(
    "issue",
    new ResourceTemplate("edict://issue/{identifier}", { list: undefined }),
    { title: "Issue", description: "An issue by identifier, as get_issue shows it", mimeType: "text/markdown" },
    async (uri, { identifier }) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: await renderIssue(session, String(identifier)) }],
    }),
  );

  server.registerResource(
    "project",
    new ResourceTemplate("edict://project/{slug}", { list: undefined }),
    { title: "Project", description: "A project by slug, as get_project shows it", mimeType: "text/markdown" },
    async (uri, { slug }) => ({
      contents: [{ uri: uri.href, mimeType: "text/markdown", text: await renderProject(session, String(slug)) }],
    }),
  );

  server.registerPrompt(
    "work_my_queue",
    {
      title: "Do my Edict work",
      description: "Pick up every issue delegated to you and work each one.",
    },
    () => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: "Do my Edict work. Call my_work, then take each issue in order: get_issue, post_progress working, do the work, link any pull request, comment with what people should know, move it with update_issue, and post_progress done. If you get stuck, post_progress blocked or needs_input with what you need, and go on to the next issue.",
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "plan_issues",
    {
      title: "Plan this into issues",
      description: "Break a goal into issues and sub-issues in one team.",
      argsSchema: { team: z.string().describe("Team key"), goal: z.string().describe("What should get done") },
    },
    ({ team, goal }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Plan this goal into issues in team ${team}: ${goal}\n\nCall get_team_context for ${team} first. Propose the issues as a list with a title, a one-paragraph description and a priority each, grouping steps as sub-issues of a parent where that helps. Ask me before you create them, then create them with create_issue and relate the ones that block each other with relate_issues.`,
          },
        },
      ],
    }),
  );

  return server;
}
