import type { Agent, Issue, Member, ProgressUpdate } from "@edicthq/client";
import type { AgentState } from "@edicthq/ui";

// How an agent connects and when it starts on delegated work, as every
// delegate picker says it (PLAN.md, Delegation).
export function connectionLine(agent: Agent, members: Member[]): string {
  if (agent.pausedAt) return "paused";
  if (agent.connectedBy) {
    const human = members.find((m) => m.id === agent.connectedBy);
    return `connected by ${firstName(human?.name ?? "someone")} · picks up work when asked`;
  }
  return agent.webhook ? "runner · starts right away" : "runner · picks up work when it next runs";
}

// What a connected agent is waiting for, in the words of the prototype.
export function waitingLine(agent: Agent): string {
  return `Waiting for ${agent.clientName ?? agent.name} to pick it up`;
}

// How long Working lasts without a word from the agent on the issue before it
// shows as quiet and its motion stops. Half an hour: an agent following the
// MCP guidance speaks when it starts, gets stuck and finishes, and its client
// hooks add a word on every commit and at the end of every turn, so a live
// run rarely goes 30 minutes silent; a session that crashed or was closed
// stops showing as live within the half hour instead of forever.
export const QUIET_AFTER_MS = 30 * 60_000;

// What one progress update says now: Working decays to quiet; blocked and
// needs input stay, since they wait on a person rather than on the agent.
export function progressState(update: Pick<ProgressUpdate, "state" | "createdAt">, now: number): AgentState {
  if (update.state === "working" && now - Date.parse(update.createdAt) > QUIET_AFTER_MS) return "quiet";
  return update.state;
}

// The delegate's state on an issue: its latest progress update, or waiting
// until it posts one.
export function agentState(issue: Issue, agent: Agent | undefined, now: number): AgentState {
  if (agent?.pausedAt) return "paused";
  // A closed issue waits on no one and runs nothing, whatever was said last.
  if (issue.closedAt) return "done";
  const latest = issue.latestProgress;
  if (latest && latest.agentId === issue.delegateId) return progressState(latest, now);
  return "waiting";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

const listMarker = /^\s*(?:[-*+]|\d+[.)])\s+/;

// A progress message as one line of plain text, for list rows: its first
// paragraph, or the first item of a list it opens with.
export function plainLine(markdown: string): string {
  const lines = markdown.replace(/```[\s\S]*?```/g, "\n").split("\n");
  const start = lines.findIndex((line) => line.trim());
  const first: string[] = [];
  for (const line of lines.slice(Math.max(start, 0))) {
    if (!line.trim() || (first.length > 0 && listMarker.test(line))) break;
    first.push(first.length === 0 ? line.replace(listMarker, "") : line);
  }
  return first
    .join(" ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*>#~]/g, "")
    // Underscores for emphasis go; ones inside words like open_switcher stay.
    .replace(/(?<![A-Za-z0-9])_+|_+(?![A-Za-z0-9])/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The phrase to say to any connected agent to start on an issue.
export function workOnPhrase(identifier: string): string {
  return `work on ${identifier}`;
}
