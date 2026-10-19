import { cn } from "./cn.js";

// The Edict mark: an E whose middle arm is an agent's rounded square. It is
// drawn on a 16px grid in the current text color, never the accent, so it is
// crisp at 16 and 32. The SVG sources and app icons live in assets/brand.
export function LogoMark({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" className={cn("shrink-0 text-ink", className)}>
      <path d="M5 2h7a1 1 0 0 1 0 2H5v8h7a1 1 0 0 1 0 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="currentColor" />
      <path
        d="M8.1 6h1.8A1.1 1.1 0 0 1 11 7.1v1.8A1.1 1.1 0 0 1 9.9 10H8.1A1.1 1.1 0 0 1 7 8.9V7.1A1.1 1.1 0 0 1 8.1 6Z"
        fill="currentColor"
      />
    </svg>
  );
}
