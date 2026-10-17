import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn.js";

export interface MenuItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  // Extra words the filter matches, like a status's category.
  keywords?: string;
}

// A picker that opens under its trigger with a filter field, like the
// prototype's "Change status…". Arrows move, Enter picks, Escape closes and
// returns focus to the trigger. Pass open and onOpenChange to open it from a
// keyboard shortcut.
export function Menu<T extends string>({
  label,
  items,
  value,
  onSelect,
  trigger,
  open: controlledOpen,
  onOpenChange,
  align = "start",
  className,
}: {
  label: string;
  items: MenuItem<T>[];
  value?: T;
  onSelect: (value: T) => void;
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    "aria-haspopup": "listbox";
    "aria-expanded": boolean;
  }) => ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "end";
  className?: string;
}) {
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const q = query.trim().toLowerCase();
  const shown = q ? items.filter((item) => `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(q)) : items;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(Math.max(0, items.findIndex((item) => item.value === value)));
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
    // Reset only when it opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (item: MenuItem<T> | undefined) => {
    if (!item) return;
    close();
    if (item.value !== value) onSelect(item.value);
  };

  return (
    <div ref={root} className={cn("relative inline-flex", className)}>
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen(!open),
        "aria-haspopup": "listbox",
        "aria-expanded": open,
      })}
      {open ? (
        <div
          className={cn(
            "absolute top-[calc(100%+4px)] z-30 flex w-60 flex-col rounded-md bg-surface p-1 shadow-overlay",
            align === "end" ? "end-0" : "start-0",
          )}
        >
          <input
            autoFocus
            role="combobox"
            aria-label={label}
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={shown[active] ? `${id}-${shown[active].value}` : undefined}
            placeholder={`${label}…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((i) => Math.min(shown.length - 1, i + 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (event.key === "Enter") {
                event.preventDefault();
                pick(shown[active]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              }
            }}
            className="mb-1 h-8 rounded-sm bg-transparent px-2 text-ui text-ink placeholder:text-ink-2 focus-visible:outline-none"
          />
          <ul id={`${id}-list`} role="listbox" aria-label={label} className="flex max-h-72 flex-col overflow-y-auto">
            {shown.map((item, index) => (
              <li
                key={item.value}
                id={`${id}-${item.value}`}
                role="option"
                aria-selected={item.value === value}
                onPointerMove={() => setActive(index)}
                onClick={() => pick(item)}
                className={cn(
                  "flex h-8 cursor-default items-center gap-2 rounded-sm px-2 text-ui",
                  index === active && "bg-hover",
                  item.value === value && "font-semibold",
                )}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </li>
            ))}
            {shown.length === 0 ? <li className="px-2 py-1.5 text-ui text-ink-2">No match</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
