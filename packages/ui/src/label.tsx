import type { CSSProperties } from "react";
import { cn } from "./cn.js";

// A label's colored dot. The hue comes from the label; lightness and chroma
// from the theme (docs/design/tokens.md, "Label dots").
export function LabelDot({ hue, className }: { hue: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={{ "--h": hue } as CSSProperties}
      className={cn("block size-1.5 shrink-0 rounded-full bg-[oklch(var(--label-l)_var(--label-c)_var(--h))]", className)}
    />
  );
}

// The outlined label pill from the prototype: compact on rows and cards,
// chip-sized ("lg") among the peek's properties.
export function LabelPill({
  name,
  hue,
  size = "md",
  className,
}: {
  name: string;
  hue: number;
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] whitespace-nowrap rounded-full text-sm text-ink-2 shadow-[inset_0_0_0_1px_var(--line-strong)]",
        size === "md" ? "py-0.5 ps-[7px] pe-2" : "h-7 ps-2.5 pe-3",
        className,
      )}
    >
      <LabelDot hue={hue} />
      {name}
    </span>
  );
}
