import { useRef, type ReactNode } from "react";
import { cn } from "./cn.js";

export interface TabItem<Value extends string> {
  value: Value;
  label: string;
  /** Shown beside the label in `ink-3`, tabular figures. */
  count?: number;
}

interface TabsProps<Value extends string> {
  items: TabItem<Value>[];
  value: Value;
  onChange: (value: Value) => void;
  /** Names the tab list for screen readers, such as "Project groups". */
  label: string;
  /**
   * `underline` filters what a page lists, and sits directly under the page
   * header. `segmented` switches how something is shown, like Open and All,
   * and belongs with the header actions.
   */
  variant?: "underline" | "segmented";
  className?: string;
}

// One active look per job. Before this, Projects, My issues and the Inbox each
// drew their own tabs slightly differently.
export function Tabs<Value extends string>({
  items,
  value,
  onChange,
  label,
  variant = "underline",
  className,
}: TabsProps<Value>): ReactNode {
  const listRef = useRef<HTMLDivElement>(null);

  // Arrow keys move between tabs, Home and End jump to the ends (WAI-ARIA).
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    const index = items.findIndex((item) => item.value === value);
    if (index === -1) return;
    event.preventDefault();
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : (index + (event.key === "ArrowLeft" ? -1 : 1) + items.length) % items.length;
    const target = items[next];
    if (!target) return;
    onChange(target.value);
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn(
        "flex items-center text-sm",
        variant === "segmented" && "inline-flex gap-0.5 rounded-sm border border-line bg-surface p-0.5",
        variant === "underline" && "gap-1 border-b border-line px-0.5",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 whitespace-nowrap font-medium transition-[color,background-color] duration-(--duration-fast) ease-standard",
              variant === "segmented" && "rounded-xs px-2.5 py-1",
              variant === "underline" && "-mb-px h-8 px-2.5",
              active ? "text-ink" : "text-ink-2 hover:text-ink",
              variant === "segmented" && active && "bg-hover",
            )}
          >
            {item.label}
            {item.count !== undefined ? (
              <span className={cn("tabular-nums", active ? "text-ink-2" : "text-ink-3")}>{item.count}</span>
            ) : null}
            {variant === "underline" && active ? (
              <span aria-hidden="true" className="absolute inset-x-1.5 -bottom-px h-0.5 rounded-full bg-ink" />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
