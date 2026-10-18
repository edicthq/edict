import type { HTMLAttributes } from "react";
import { cn } from "./cn.js";

// Neutral pill for static state (role, private, pending). Never the accent,
// which means "agent", and never amber or red, which mean an agent waits on you.
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full bg-hover px-2 text-meta font-medium text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

// A team key chip (ENG), as in the rail and page titles.
export function TeamKey({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-xs bg-hover px-1.5 py-1 text-[10.5px] leading-none font-semibold tracking-[0.02em] text-ink",
        className,
      )}
      {...props}
    />
  );
}

// A number that changes, such as a count beside a rail item.
export function Count({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn("text-sm text-ink-2 tabular-nums", className)} {...props} />;
}

export type AgentState = "working" | "blocked" | "needs_input" | "done" | "waiting" | "paused";

const stateLabel: Record<AgentState, string> = {
  working: "Working",
  blocked: "Blocked",
  needs_input: "Needs input",
  done: "Done",
  waiting: "Waiting",
  paused: "Paused",
};

// An agent's state on an issue, as the prototype's soft badges show it: the
// accent while it works, with a pulse; amber when it needs a person; red when
// it is blocked; neutral otherwise.
export function ProgressBadge({ state, className }: { state: AgentState; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-meta font-medium",
        state === "working" && "bg-agent-wash text-agent-ink",
        state === "needs_input" && "bg-warn-wash text-warn",
        state === "blocked" && "bg-danger-wash text-danger",
        (state === "done" || state === "waiting" || state === "paused") && "bg-hover text-ink-2",
        className,
      )}
    >
      {state === "working" ? (
        <span aria-hidden="true" className="size-1.5 rounded-full bg-agent motion-safe:animate-pulse" />
      ) : null}
      {stateLabel[state]}
    </span>
  );
}
