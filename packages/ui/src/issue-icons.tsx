import type { ReactNode } from "react";
import { cn } from "./cn.js";

type Category = "backlog" | "todo" | "in_progress" | "done" | "canceled";
type Priority = "none" | "urgent" | "high" | "medium" | "low";

// The status glyph from the C2 prototype: a dashed ring for backlog, a ring for
// todo, a ring filling up through the in-progress stages, a filled check for
// done and a filled cross for canceled. `fill` is how far along the
// in-progress stages this status is, between 0 and 1.
export function StatusIcon({
  category,
  fill = 0.5,
  className,
}: {
  category: Category;
  fill?: number;
  className?: string;
}) {
  const ring = (dashed: boolean) => (
    <circle
      cx="7"
      cy="7"
      r="5.6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray={dashed ? "1.75 1.75" : undefined}
    />
  );
  let inner: ReactNode;
  if (category === "backlog") inner = ring(true);
  else if (category === "todo") inner = ring(false);
  else if (category === "in_progress") {
    const angle = fill * 2 * Math.PI;
    const x = 7 + 3.2 * Math.sin(angle);
    const y = 7 - 3.2 * Math.cos(angle);
    inner = (
      <>
        {ring(false)}
        <path d={`M7 7 L7 3.8 A3.2 3.2 0 ${fill > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} fill="currentColor" />
      </>
    );
  } else if (category === "done") {
    inner = (
      <>
        <circle cx="7" cy="7" r="6.4" fill="currentColor" />
        <path
          d="M4.4 7.2l1.8 1.8 3.5-3.7"
          fill="none"
          stroke="var(--surface)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    );
  } else {
    inner = (
      <>
        <circle cx="7" cy="7" r="6.4" fill="currentColor" />
        <path d="M5 5l4 4M9 5l-4 4" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" />
      </>
    );
  }
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      aria-hidden="true"
      className={cn(
        "shrink-0",
        category === "in_progress" || category === "done" ? "text-ink" : "text-ink-3",
        className,
      )}
    >
      {inner}
    </svg>
  );
}

// Signal bars for high, medium and low; a filled square with "!" for urgent;
// three faint dashes for none.
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  let inner: ReactNode;
  if (priority === "urgent") {
    inner = (
      <>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path d="M7 3.9v3.7M7 10v.1" stroke="var(--surface)" strokeWidth="1.7" strokeLinecap="round" />
      </>
    );
  } else if (priority === "none") {
    inner = [2, 6, 10].map((x) => <rect key={x} x={x} y="6.3" width="2.2" height="1.4" rx=".7" fill="currentColor" opacity=".5" />);
  } else {
    const on = { high: 3, medium: 2, low: 1 }[priority];
    inner = (
      [
        [1.5, 9, 4],
        [5.5, 6, 7],
        [9.5, 3, 10],
      ] as const
    ).map(([x, y, h], i) => (
      <rect key={x} x={x} y={y} width="3" height={h} rx="1" fill="currentColor" opacity={i < on ? 1 : 0.25} />
    ));
  }
  return (
    <svg
      viewBox="0 0 14 14"
      width="14"
      height="14"
      aria-hidden="true"
      className={cn(
        "shrink-0",
        priority === "urgent" ? "text-ink" : priority === "none" ? "text-ink-3" : "text-ink-2",
        className,
      )}
    >
      {inner}
    </svg>
  );
}
