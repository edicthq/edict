import type { Agent, Issue } from "@edicthq/client";
import { describe, expect, it } from "vitest";
import { agentState } from "./agents.js";

const agent = { id: "agent-1", pausedAt: null } as unknown as Agent;
const issue = (changes: Partial<Issue>): Issue =>
  ({ delegateId: "agent-1", closedAt: null, latestProgress: null, ...changes }) as unknown as Issue;
const progress = (state: string) => ({ agentId: "agent-1", state, message: "", createdAt: "2026-10-20T00:00:00Z" });

describe("agentState", () => {
  it("waits until the delegate says something", () => {
    expect(agentState(issue({}), agent)).toBe("waiting");
  });

  it("follows the delegate's latest progress", () => {
    expect(agentState(issue({ latestProgress: progress("working") as Issue["latestProgress"] }), agent)).toBe("working");
  });

  it("is done once the issue is closed, even if the agent never said so", () => {
    expect(agentState(issue({ closedAt: "2026-10-20T00:00:00Z" }), agent)).toBe("done");
    expect(
      agentState(issue({ closedAt: "2026-10-20T00:00:00Z", latestProgress: progress("working") as Issue["latestProgress"] }), agent),
    ).toBe("done");
  });

  it("is paused whenever the agent is", () => {
    expect(agentState(issue({ closedAt: "2026-10-20T00:00:00Z" }), { ...agent, pausedAt: "2026-10-20T00:00:00Z" } as Agent)).toBe("paused");
  });
});
