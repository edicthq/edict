// Realtime: fans every committed event out over the /ws socket (the plan's
// "WebSocket, fanned out across instances with Postgres LISTEN/NOTIFY").
// emit notifies the edict_events channel on commit; every replica's hub reads
// the event and sends it to the sockets subscribed to that organization.
// Each event goes only to the people it is for: a private team's events to
// those who can see the team, Admin-only events (invites, API keys, webhooks)
// to Admins and Owners, and a person's own events (inbox, saved views) to that
// person. Membership is checked per event, so leaving stops the stream.
import type { ServerType } from "@hono/node-server";
import { and, eq, isNull } from "drizzle-orm";
import type { Pool } from "pg";
import { EVENTS_CHANNEL, events, inScope, issues, members, teamMembers, teams, type Database } from "@edicthq/db";
import { WebSocketServer, type WebSocket } from "ws";
import { listen } from "./listen.js";
import { eventPayload } from "./webhooks.js";

export interface RealtimeUser {
  id: string;
}

export interface Realtime {
  stop: () => Promise<void>;
}

export interface RealtimeDeps {
  db: Database;
  pool: Pool;
  // Resolves the signed-in person from the upgrade request's session cookie.
  // Null rejects the upgrade.
  getUser: (headers: Headers) => Promise<RealtimeUser | null>;
  // The instance's public URL. A browser upgrade must come from its origin;
  // without one, from the origin the request was sent to.
  publicUrl?: string;
}

interface SocketMeta {
  userId: string;
  orgs: Set<string>;
  // The upgrade's headers, to check the session is still alive.
  headers: Headers;
}

// Seen only by Admins and Owners, as their API reads are.
const adminOnly = /^(invite\.|api_key\.|webhook\.|organization\.exported$)/;
// About one person's own things: their inbox and saved views.
const personal = /^(inbox|view)\./;

type EventRow = typeof events.$inferSelect;

// An upgrade request's headers as a Headers object.
function requestHeaders(request: import("node:http").IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === "string") headers.set(name, value);
    else if (Array.isArray(value)) for (const entry of value) headers.append(name, entry);
  }
  return headers;
}

// The team whose visibility decides who sees this event, when it has one.
// Issue events name the issue in their subject; comment, link, relation,
// attachment and progress events name it in their data.
async function teamOf(tx: Tx, event: EventRow): Promise<string | null> {
  const data = event.data as { teamId?: unknown; issueId?: unknown };
  if (typeof data.teamId === "string") return data.teamId;
  const issueId = event.type.startsWith("issue.")
    ? event.subjectId
    : typeof data.issueId === "string"
      ? data.issueId
      : null;
  if (issueId) {
    const [issue] = await tx
      .select({ teamId: issues.teamId })
      .from(issues)
      .where(and(eq(issues.orgId, event.orgId), eq(issues.id, issueId)));
    if (issue) return issue.teamId;
  }
  if (event.type.startsWith("team.")) return event.subjectId;
  return null;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

interface MemberInfo {
  id: string;
  role: "owner" | "admin" | "member" | "guest";
}

async function memberOf(tx: Tx, orgId: string, userId: string): Promise<MemberInfo | null> {
  const [member] = await tx
    .select({ id: members.id, role: members.role })
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.userId, userId), isNull(members.removedAt)));
  return member ?? null;
}

// Who can see a team: Owners and Admins every team, Members the public ones,
// Guests only the teams they are in — the same rule the API's visibleTeam
// applies to reads.
async function canSeeTeam(tx: Tx, orgId: string, member: MemberInfo, teamId: string): Promise<boolean> {
  if (member.role === "owner" || member.role === "admin") return true;
  const [team] = await tx
    .select({ private: teams.private })
    .from(teams)
    .where(and(eq(teams.orgId, orgId), eq(teams.id, teamId)));
  if (!team) return false;
  if (!team.private && member.role === "member") return true;
  const [inTeam] = await tx
    .select({ memberId: teamMembers.memberId })
    .from(teamMembers)
    .where(and(eq(teamMembers.orgId, orgId), eq(teamMembers.teamId, teamId), eq(teamMembers.memberId, member.id)));
  return inTeam !== undefined;
}

// A guest sees a project only when it holds an issue in one of their teams.
async function guestSeesProject(tx: Tx, member: MemberInfo, projectId: string): Promise<boolean> {
  const [row] = await tx
    .select({ id: issues.id })
    .from(issues)
    .innerJoin(teamMembers, and(eq(teamMembers.teamId, issues.teamId), eq(teamMembers.memberId, member.id)))
    .where(and(eq(issues.projectId, projectId), isNull(issues.deletedAt)))
    .limit(1);
  return row !== undefined;
}

async function mayReceive(tx: Tx, event: EventRow, userId: string, teamId: string | null): Promise<boolean> {
  const member = await memberOf(tx, event.orgId, userId);
  if (!member) return false;
  if (personal.test(event.type)) return member.id === event.actorId;
  if (adminOnly.test(event.type)) return member.role === "owner" || member.role === "admin";
  if (teamId) return canSeeTeam(tx, event.orgId, member, teamId);
  if (event.type.startsWith("project.") && member.role === "guest") return guestSeesProject(tx, member, event.subjectId);
  return true;
}

// Whether a browser upgrade comes from the instance's own pages. Clients that
// are not browsers send no Origin.
function sameOrigin(request: import("node:http").IncomingMessage, publicUrl: string | undefined): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const expected = publicUrl ? new URL(publicUrl).host : request.headers.host;
    return new URL(origin).host === expected;
  } catch {
    return false;
  }
}

export async function startRealtime(server: ServerType, deps: RealtimeDeps): Promise<Realtime> {
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Map<WebSocket, SocketMeta>();
  const rooms = new Map<string, Set<WebSocket>>();

  const leave = (ws: WebSocket) => {
    const meta = sockets.get(ws);
    if (!meta) return;
    for (const orgId of meta.orgs) {
      rooms.get(orgId)?.delete(ws);
      if (rooms.get(orgId)?.size === 0) rooms.delete(orgId);
    }
    sockets.delete(ws);
  };

  const onUpgrade = (request: import("node:http").IncomingMessage, socket: import("node:net").Socket, head: Buffer) => {
    const path = new URL(request.url ?? "/", "http://localhost").pathname;
    if (path !== "/ws") {
      socket.destroy();
      return;
    }
    if (!sameOrigin(request, deps.publicUrl)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nconnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const headers = requestHeaders(request);
    deps
      .getUser(headers)
      .then((person) => {
        if (!person) {
          socket.write("HTTP/1.1 401 Unauthorized\r\nconnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          sockets.set(ws, { userId: person.id, orgs: new Set(), headers });
          ws.on("message", (raw) => {
            subscribe(ws, person.id, String(raw)).catch((error) => console.error("realtime subscribe:", error));
          });
          ws.on("close", () => leave(ws));
          ws.on("error", () => leave(ws));
        });
      })
      .catch(() => socket.destroy());
  };

  const subscribe = async (ws: WebSocket, userId: string, raw: string) => {
    let message: { type?: string; orgId?: unknown };
    try {
      message = JSON.parse(raw);
    } catch {
      message = {};
    }
    // The browser pings when it wakes or after a quiet spell; no pong means a
    // dead socket it should replace.
    if (message.type === "ping") {
      ws.send(JSON.stringify({ type: "pong" }));
      return;
    }
    if (message.type === "unsubscribe" && typeof message.orgId === "string") {
      const meta = sockets.get(ws);
      meta?.orgs.delete(message.orgId);
      rooms.get(message.orgId)?.delete(ws);
      if (rooms.get(message.orgId)?.size === 0) rooms.delete(message.orgId);
      return;
    }
    if (typeof message.orgId !== "string") {
      ws.send(JSON.stringify({ type: "error", message: "Send { type: 'subscribe', orgId } to subscribe." }));
      return;
    }
    const orgId = message.orgId;
    const member = await inScope(deps.db, { userId }, async (tx) => {
      const [row] = await tx
        .select({ id: members.id })
        .from(members)
        .where(and(eq(members.orgId, orgId), eq(members.userId, userId), isNull(members.removedAt)));
      return row !== undefined;
    });
    if (!member) {
      ws.send(JSON.stringify({ type: "error", message: "You are not a member of this organization." }));
      ws.close(1008, "not a member");
      return;
    }
    // The socket may have closed while membership was checked.
    const meta = sockets.get(ws);
    if (!meta) return;
    meta.orgs.add(orgId);
    const room = rooms.get(orgId) ?? new Set();
    room.add(ws);
    rooms.set(orgId, room);
    ws.send(JSON.stringify({ type: "subscribed", orgId }));
  };

  // One notification per event, shared by every socket in the organization:
  // read the event once, decide visibility per person, send the same JSON.
  const fanout = async (notification: string) => {
    const separator = notification.indexOf(":");
    const orgId = notification.slice(0, separator);
    const eventId = notification.slice(separator + 1);
    const subscribers = [...(rooms.get(orgId) ?? [])].map((ws) => sockets.get(ws)!);
    if (subscribers.length === 0) return;
    const sent = await inScope(deps.db, { orgId }, async (tx) => {
      const [event] = await tx.select().from(events).where(eq(events.id, eventId));
      if (!event) return undefined;
      const body = await eventPayload(tx, event);
      const teamId = await teamOf(tx, event);
      const allowed = new Map<string, boolean>();
      for (const person of subscribers) {
        if (!allowed.has(person.userId)) {
          allowed.set(person.userId, await mayReceive(tx, event, person.userId, teamId));
        }
      }
      return { body, allowed };
    }).catch((error) => {
      console.error("realtime fanout:", error);
      return undefined;
    });
    if (!sent) return;
    for (const [ws, meta] of sockets) {
      if (meta.orgs.has(orgId) && sent.allowed.get(meta.userId)) ws.send(sent.body);
    }
  };

  // Events committed while the listener reconnects are lost, so every socket
  // is told to refetch what it shows.
  const unlisten = await listen(
    deps.pool,
    EVENTS_CHANNEL,
    (payload) => void fanout(payload),
    () => {
      for (const ws of sockets.keys()) ws.send(JSON.stringify({ type: "resync" }));
    },
  );
  // Pings keep proxies from closing idle sockets. Every other beat, sockets
  // whose session ended (signed out, revoked, expired) are closed.
  let beat = 0;
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) ws.ping();
    if (++beat % 2 === 0) {
      for (const [ws, meta] of sockets) {
        void deps
          .getUser(meta.headers)
          .then((person) => {
            if (person?.id !== meta.userId) ws.close(4401, "session ended");
          })
          .catch(() => undefined);
      }
    }
  }, 30_000);
  server.on("upgrade", onUpgrade);

  return {
    stop: async () => {
      server.off("upgrade", onUpgrade);
      clearInterval(heartbeat);
      // Abrupt, so an open socket never holds server.close() hostage.
      for (const ws of wss.clients) ws.terminate();
      await unlisten();
    },
  };
}
