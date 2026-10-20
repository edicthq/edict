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

// Quiet: was working, but has said nothing for a while.
export type AgentState = "working" | "quiet" | "blocked" | "needs_input" | "done" | "waiting" | "paused";

const stateLabel: Record<AgentState, string> = {
  working: "Working",
  quiet: "Quiet",
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
        (state === "quiet" || state === "done" || state === "waiting" || state === "paused") && "bg-hover text-ink-2",
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

export function ProgressBar({
  percentage,
  className,
}: {
  percentage: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-line", className)}
    >
      <div
        className="h-full rounded-full bg-ink transition-[width] duration-300 ease-out"
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

export function ProjectStatusBadge({
  status,
  className,
}: {
  status: "planned" | "in_progress" | "paused" | "completed" | "canceled";
  className?: string;
}) {
  const labels: Record<string, string> = {
    planned: "Planned",
    in_progress: "In Progress",
    paused: "Paused",
    completed: "Completed",
    canceled: "Canceled",
  };
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-meta font-medium",
        status === "in_progress" && "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]",
        status === "planned" && "bg-hover text-ink-2",
        status === "paused" && "bg-hover text-ink-2",
        status === "completed" && "bg-hover font-semibold text-ink",
        status === "canceled" && "bg-hover text-ink-2 line-through",
        className,
      )}
    >
      {labels[status] ?? status}
    </span>
  );
}
