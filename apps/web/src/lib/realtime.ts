import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { patchIssues } from "./collections.js";
import { setLive } from "./live.js";

// Realtime: one socket to the server's /ws, subscribed to the organization
// the person is looking at. Issue events patch the team's TanStack DB
// collections (collections.ts), and every event invalidates the queries it
// touches, so another person's (or an agent's) change shows up without a
// refetch of the whole list.

interface RealtimeEvent {
  type: string;
  subjectId: string;
  organizationId: string;
  data: Record<string, unknown> & { teamId?: unknown; issueId?: unknown };
}

let socket: WebSocket | undefined;
let client: QueryClient | undefined;
let attempts = 0;
let retry: ReturnType<typeof setTimeout> | undefined;
let pongWait: ReturnType<typeof setTimeout> | undefined;
// The organizations this browser still subscribes to; a reconnect sends them all.
const subs = new Set<string>();

// A socket can die without closing: a laptop sleeps, the network changes, a
// proxy drops it. The browser pings every 25s while the tab is visible and
// when it comes back; no pong within 5s replaces the socket.
const HEARTBEAT_MS = 25_000;
const PONG_WAIT_MS = 5_000;

function send(message: unknown): void {
  // Sending while CONNECTING throws; the open handler covers that case.
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function connect(): void {
  clearTimeout(retry);
  retry = undefined;
  const ws = new WebSocket("/ws");
  socket = ws;
  const reconnecting = attempts > 0;
  ws.onopen = () => {
    for (const orgId of subs) send({ type: "subscribe", orgId });
    // Events sent while the socket was down are gone: refetch what is shown.
    if (reconnecting) void client?.invalidateQueries({ queryKey: ["org"] });
  };
  ws.onmessage = (message) => {
    clearTimeout(pongWait);
    const event = JSON.parse(String(message.data)) as RealtimeEvent;
    // Control answers (subscribed, pong, error) name their kind by their type;
    // real events carry event types like "issue.created". A resync means the
    // server missed events.
    if (event.type === "resync") {
      void client?.invalidateQueries({ queryKey: ["org"] });
      return;
    }
    if (event.type === "subscribed") {
      attempts = 0;
      setLive(true);
    }
    if (event.type === "subscribed" || event.type === "pong" || event.type === "error") return;
    onEvent(event);
  };
  ws.onclose = () => {
    if (socket === ws) lost();
  };
}

// The socket is gone: poll meanwhile, and reconnect with backoff, 1s, 2s, 4s
// ... capped at 30s.
function lost(): void {
  socket = undefined;
  clearTimeout(pongWait);
  setLive(false);
  if (subs.size === 0 || retry) return;
  const delay = Math.min(1000 * 2 ** attempts, 30_000);
  attempts += 1;
  retry = setTimeout(connect, delay);
}

// Is the socket still alive? A dead one is dropped without waiting for its
// close, which can take minutes on a broken connection.
function check(): void {
  if (subs.size === 0) return;
  const ws = socket;
  if (!ws) {
    // Waiting out a backoff; the network may be back, so try now.
    if (retry) connect();
    return;
  }
  if (ws.readyState !== WebSocket.OPEN) return;
  send({ type: "ping" });
  clearTimeout(pongWait);
  pongWait = setTimeout(() => {
    if (socket !== ws) return;
    ws.onclose = null;
    ws.close();
    attempts = Math.max(attempts, 1);
    lost();
  }, PONG_WAIT_MS);
}

if (typeof window !== "undefined") {
  setInterval(() => {
    if (document.visibilityState === "visible") check();
  }, HEARTBEAT_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });
  window.addEventListener("online", check);
}

// Queries that read issues outside a team's collection: the issue itself and
// its children, agents' queues, My issues, projects, the Teams page and the
// inbox, whose items are written with the event.
const issueScoped = new Set(["issue", "agents", "my-work", "projects", "team-overview", "inbox"]);

// Which queries an event touches. Issue and progress events patch the team's
// collection and refresh every query that reads issues; events about one
// issue's children (comments, links, relations) refresh that issue and the
// inbox; everything else — teams, members, labels, agents, webhooks —
// refreshes the organization's queries.
function onEvent(event: RealtimeEvent): void {
  if (!client) return;
  const orgId = event.organizationId;
  const issueId = event.type.startsWith("issue.") ? event.subjectId : event.data.issueId;
  if (event.type.startsWith("issue.") || event.type === "progress.posted") {
    void patchIssues(event);
    void client.invalidateQueries({
      predicate: ({ queryKey }) => queryKey[0] === "org" && queryKey[1] === orgId && issueScoped.has(String(queryKey[2])),
    });
    return;
  }
  if (typeof issueId === "string") {
    void client.invalidateQueries({ queryKey: ["org", orgId, "issue", issueId] });
    void client.invalidateQueries({ queryKey: ["org", orgId, "inbox"] });
    return;
  }
  void client.invalidateQueries({ queryKey: ["org", orgId] });
}

// Subscribes while the person works in this organization and unsubscribes on
// the way out. The socket itself stays open across organizations.
export function useRealtime(orgId: string | undefined): void {
  const qc = useQueryClient();
  useEffect(() => {
    client = qc;
    if (!orgId) return;
    if (!socket) connect();
    if (!subs.has(orgId)) {
      subs.add(orgId);
      send({ type: "subscribe", orgId });
    }
    return () => {
      subs.delete(orgId);
      send({ type: "unsubscribe", orgId });
    };
  }, [orgId, qc]);
}
