import { cn } from "./cn.js";

function initials(name: string): string {
  // Words only: "Claude Code (Amirali)" is CC, not C(.
  const parts = name
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0]![0]}${parts.at(-1)![0]}` : (parts[0]?.slice(0, 2) ?? "?");
  return letters.toUpperCase();
}

const sizes = {
  18: { box: "size-[18px] text-[8px]", agent: "rounded-[5px]" },
  22: { box: "size-[22px] text-[9px]", agent: "rounded-[6px]" },
  32: { box: "size-8 text-[12px]", agent: "rounded-[9px]" },
} as const;

// Humans are outlined circles; agents are accent-filled rounded squares.
// Shape and fill tell them apart even without seeing the color.
export function Avatar({
  name,
  kind = "human",
  size = 22,
  className,
}: {
  name: string;
  kind?: "human" | "agent";
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center font-semibold leading-none tracking-[0.01em]",
        sizes[size].box,
        kind === "agent"
          ? cn("bg-agent text-on-agent", sizes[size].agent)
          : "rounded-full bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)]",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
