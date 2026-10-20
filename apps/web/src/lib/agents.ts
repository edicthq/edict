import type { Agent, Issue, Member } from "@edicthq/client";
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

// The delegate's state on an issue: its latest progress update, or waiting
// until it posts one.
export function agentState(issue: Issue, agent: Agent | undefined): AgentState {
  if (agent?.pausedAt) return "paused";
  // A closed issue waits on no one and runs nothing, whatever was said last.
  if (issue.closedAt) return "done";
  const latest = issue.latestProgress;
  if (latest && latest.agentId === issue.delegateId) return latest.state;
  return "waiting";
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

// A progress message as one line of plain text, for list rows.
export function plainLine(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// The phrase to say to any connected agent to start on an issue.
export function workOnPhrase(identifier: string): string {
  return `work on ${identifier}`;
}
