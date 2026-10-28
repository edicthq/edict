import type { Agent, Issue } from "@edicthq/client";
import { describe, expect, it } from "vitest";
import { agentState, plainLine } from "./agents.js";

const agent = { id: "agent-1", pausedAt: null } as unknown as Agent;
const issue = (changes: Partial<Issue>): Issue =>
  ({ delegateId: "agent-1", closedAt: null, latestProgress: null, ...changes }) as unknown as Issue;
const posted = "2026-10-20T00:00:00Z";
const progress = (state: string) => ({ agentId: "agent-1", state, message: "", createdAt: posted }) as unknown as Issue["latestProgress"];
// Ten minutes after the update.
const now = Date.parse(posted) + 10 * 60_000;
const minutesLater = (minutes: number) => Date.parse(posted) + minutes * 60_000;

describe("agentState", () => {
  it("waits until the delegate says something", () => {
    expect(agentState(issue({}), agent, now)).toBe("waiting");
  });

  it("follows the delegate's latest progress", () => {
    expect(agentState(issue({ latestProgress: progress("working") }), agent, now)).toBe("working");
  });

  it("is done once the issue is closed, even if the agent never said so", () => {
    expect(agentState(issue({ closedAt: "2026-10-20T00:00:00Z" }), agent, now)).toBe("done");
    expect(
      agentState(issue({ closedAt: "2026-10-20T00:00:00Z", latestProgress: progress("working") }), agent, now),
    ).toBe("done");
  });

  it("goes quiet after half an hour without a word, and only from working", () => {
    const working = issue({ latestProgress: progress("working") });
    expect(agentState(working, agent, minutesLater(30))).toBe("working");
    expect(agentState(working, agent, minutesLater(31))).toBe("quiet");
    // Blocked and needs input wait on a person, however long that takes.
    expect(agentState(issue({ latestProgress: progress("blocked") }), agent, minutesLater(600))).toBe("blocked");
    expect(agentState(issue({ latestProgress: progress("needs_input") }), agent, minutesLater(600))).toBe("needs_input");
  });

  it("is paused whenever the agent is", () => {
    expect(agentState(issue({ closedAt: "2026-10-20T00:00:00Z" }), { ...agent, pausedAt: "2026-10-20T00:00:00Z" } as Agent, now)).toBe("paused");
  });
});

describe("plainLine", () => {
  it("drops markdown but keeps underscores inside words", () => {
    expect(plainLine("Added `open_switcher`, which is _very_ **small**.")).toBe("Added open_switcher, which is very small.");
  });

  it("reads the first paragraph, not the list after it", () => {
    expect(plainLine("Built it (`1f52e24`):\n- Progress has a source.\n- Hooks post.")).toBe("Built it (1f52e24):");
    expect(plainLine("A line that wraps\nonto a second.\n\nAnother paragraph.")).toBe("A line that wraps onto a second.");
  });

  it("drops a list marker that leads the message", () => {
    expect(plainLine("- First thing\n- Second")).toBe("First thing");
    expect(plainLine("1. Step one")).toBe("Step one");
    expect(plainLine("```\ncode\n```\n\nAfter the code.")).toBe("After the code.");
  });
});
