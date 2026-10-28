import { PanelLeft } from "lucide-react";
import { cn } from "@edicthq/ui";
import { useRail } from "../lib/rail.js";
import { formatShortcut, useShortcuts } from "../lib/shortcuts.js";

// Hides or shows the rail on a wide screen. It sits in the rail while the rail
// is out, and at the start of the page bar once it is folded away.
export function RailToggle({ className }: { className?: string }) {
  const rail = useRail();
  const shortcuts = useShortcuts();
  if (!rail) return null;
  const label = rail.collapsed ? "Show sidebar" : "Hide sidebar";
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={!rail.collapsed}
      title={`${label} (${formatShortcut(shortcuts.toggleSidebar)})`}
      onClick={rail.toggle}
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink",
        className,
      )}
    >
      <PanelLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
    </button>
  );
}
