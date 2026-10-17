import type { HTMLAttributes } from "react";
import { cn } from "./cn.js";

// Neutral pill for static state (role, private, pending). Never the accent,
// which means "agent", and never amber or red, which mean an agent waits on you.
export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center whitespace-nowrap rounded-full bg-hover px-2 text-meta font-medium text-ink-2",
        className,
      )}
      {...props}
    />
  );
}

// A team key, set like inline code.
export function TeamKey({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-xs bg-hover px-1.5 font-code text-meta font-medium tracking-[0.02em] text-ink-2",
        className,
      )}
      {...props}
    />
  );
}
