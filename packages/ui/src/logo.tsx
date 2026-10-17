import { cn } from "./cn.js";

// Placeholder mark from the M0 prototype: a hexagon in the agent color with
// three lines of an edict on it. Edict still needs a real logo and app icon
// (docs/PLAN.md, "Logo and app icon"); replace this when it exists.
export function LogoMark({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size} aria-hidden="true" className={cn("shrink-0", className)}>
      <path d="M10 1.5l7.4 4.25v8.5L10 18.5l-7.4-4.25v-8.5z" fill="var(--agent)" />
      <path
        d="M6.5 6.5h7M6.5 10h5M6.5 13.5h6"
        stroke="var(--on-agent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
