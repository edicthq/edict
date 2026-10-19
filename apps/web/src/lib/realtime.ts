import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { patchIssues } from "./collections.js";
import { keys } from "./queries.js";

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
// The organizations this browser still subscribes to; a reconnect sends them all.
const subs = new Set<string>();

function send(message: unknown): void {
  // Sending while CONNECTING throws; the open handler covers that case.
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function connect(): void {
  socket = new WebSocket("/ws");
  const reconnecting = attempts > 0;
  socket.onopen = () => {
    attempts = 0;
    for (const orgId of subs) send({ type: "subscribe", orgId });
    // Events sent while the socket was down are gone: refetch what is shown.
    if (reconnecting) void client?.invalidateQueries({ queryKey: ["org"] });
  };
  socket.onmessage = (message) => {
    const event = JSON.parse(String(message.data)) as RealtimeEvent;
    // Control answers (subscribed, error) name their kind by their type; real
    // events carry event types like "issue.created". A resync means the
    // server missed events.
    if (event.type === "resync") {
      void client?.invalidateQueries({ queryKey: ["org"] });
      return;
    }
    if (event.type === "subscribed" || event.type === "error") return;
    onEvent(event);
  };
  // Backoff: 1s, 2s, 4s ... capped at 30s. The server pings to keep the
  // socket through quiet periods and proxies.
  socket.onclose = () => {
    socket = undefined;
    if (subs.size === 0) return;
    const delay = Math.min(1000 * 2 ** attempts, 30_000);
    attempts += 1;
    setTimeout(connect, delay);
  };
}

// Which queries an event touches. Issue events patch the team's collection
// and refresh every issue-scoped query (detail, comments, relations, progress)
// and the agents' queues; events about one issue's children refresh that
// issue's queries; everything else — teams, members, labels, agents, webhooks
// — refreshes the organization's queries.
function onEvent(event: RealtimeEvent): void {
  if (!client) return;
  const orgId = event.organizationId;
  const issueId = event.type.startsWith("issue.") ? event.subjectId : event.data.issueId;
  if (event.type.startsWith("issue.") || event.type === "progress.posted") {
    void patchIssues(event);
    void client.invalidateQueries({ queryKey: ["org", orgId, "issue"] });
    void client.invalidateQueries({ queryKey: keys.agents(orgId) });
    return;
  }
  if (typeof issueId === "string") {
    void client.invalidateQueries({ queryKey: ["org", orgId, "issue", issueId] });
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
