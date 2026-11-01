import { type RefObject, useCallback, useLayoutEffect, useState } from "react";

const GAP = 4;
const MARGIN = 8;

export interface Placement {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  // Where it grows from: the corner nearest the trigger.
  origin: string;
}

// Where a floating panel goes, fixed to the viewport under its trigger: it
// flips above when the space below runs out, and is clamped to the viewport.
// A panel inside the sidebar or a dialog, positioned absolutely, is clipped by
// the nearest overflow box; one fixed to the viewport and portaled out is not.
// `width: "trigger"` makes the panel as wide as the trigger, for a picker that
// fills its row. It measures again when `remeasure` changes, like the row count,
// and keeps anchored while the page scrolls. Closing keeps the last placement,
// so the panel fades out where it was.
export function useAnchoredPlacement({
  open,
  trigger,
  panel,
  align = "start",
  side = "bottom",
  width,
  maxHeight: cap,
  remeasure,
}: {
  open: boolean;
  trigger: RefObject<HTMLElement | null>;
  panel: RefObject<HTMLElement | null>;
  align?: "start" | "end";
  side?: "top" | "bottom";
  width: number | "trigger";
  maxHeight: number;
  remeasure?: unknown;
}): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);

  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    const element = panel.current;
    if (!rect || !element) return;
    const w = Math.min(width === "trigger" ? rect.width : width, window.innerWidth - 2 * MARGIN);
    // The panel is already capped by the max height of the previous pass.
    const height = element.offsetHeight;
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    const flip = side === "top" ? above > 0 : height > below && above > below;
    const maxHeight = Math.max(120, Math.min(cap, flip ? above : below));
    const left = Math.min(Math.max(MARGIN, align === "end" ? rect.right - w : rect.left), window.innerWidth - w - MARGIN);
    const top = flip ? Math.max(MARGIN, rect.top - GAP - Math.min(height, maxHeight)) : rect.bottom + GAP;
    const origin = `${flip ? "bottom" : "top"} ${align === "end" ? "right" : "left"}`;
    setPlacement((current) =>
      current &&
      current.left === left &&
      current.top === top &&
      current.width === w &&
      current.maxHeight === maxHeight &&
      current.origin === origin
        ? current
        : { left, top, width: w, maxHeight, origin },
    );
  }, [trigger, panel, align, side, width, cap]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: remeasure changes the panel height
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place, remeasure]);

  return placement;
}
