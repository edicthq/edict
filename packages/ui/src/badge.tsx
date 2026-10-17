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
