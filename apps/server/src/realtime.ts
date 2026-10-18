// Realtime: fans every committed event out over the /ws socket (the plan's
// "WebSocket, fanned out across instances with Postgres LISTEN/NOTIFY").
// emit notifies the edict_events channel on commit; every replica's hub reads
// the event and sends it to the sockets subscribed to that organization.
// Private-team events only go to sockets whose person can see the team.
import type { ServerType } from "@hono/node-server";
import { and, eq, isNull } from "drizzle-orm";
import type { Pool } from "pg";
import { EVENTS_CHANNEL, events, inScope, issues, members, teamMembers, teams, type Database } from "@edicthq/db";
import { WebSocketServer, type WebSocket } from "ws";
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
}

interface SocketMeta {
  userId: string;
  orgs: Set<string>;
}

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
async function teamOf(tx: Parameters<Parameters<Database["transaction"]>[0]>[0], event: EventRow): Promise<string | null> {
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

// Who can see a team: Owners and Admins every team, Members the public ones,
// Guests only the teams they are in — the same rule the API's visibleTeam
// applies to reads.
async function canSeeTeam(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  orgId: string,
  userId: string,
  teamId: string,
): Promise<boolean> {
  const [member] = await tx
    .select({ id: members.id, role: members.role })
    .from(members)
    .where(and(eq(members.orgId, orgId), eq(members.userId, userId), isNull(members.removedAt)));
  if (!member) return false;
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

// Holds one connection that LISTENs for emit's notifications, like jobs.ts
// does for the webhook dispatcher.
async function listen(pool: Pool, onNotify: (payload: string) => void): Promise<() => Promise<void>> {
  const client = await pool.connect();
  client.on("notification", (message) => {
    if (message.channel === EVENTS_CHANNEL && message.payload) onNotify(message.payload);
  });
  await client.query(`LISTEN ${EVENTS_CHANNEL}`);
  return async () => {
    await client.query(`UNLISTEN ${EVENTS_CHANNEL}`).catch(() => undefined);
    client.release();
  };
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
    deps
      .getUser(requestHeaders(request))
      .then((person) => {
        if (!person) {
          socket.write("HTTP/1.1 401 Unauthorized\r\nconnection: close\r\n\r\n");
          socket.destroy();
          return;
        }
        wss.handleUpgrade(request, socket, head, (ws) => {
          sockets.set(ws, { userId: person.id, orgs: new Set() });
          ws.on("message", (raw) => {
            void subscribe(ws, person.id, String(raw));
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
    sockets.get(ws)!.orgs.add(orgId);
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
          allowed.set(person.userId, teamId ? await canSeeTeam(tx, orgId, person.userId, teamId) : true);
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

  const unlisten = await listen(deps.pool, (payload) => void fanout(payload));
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) ws.ping();
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
