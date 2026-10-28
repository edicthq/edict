import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn.js";
import { usePresence } from "./presence.js";

export interface MenuItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  // Extra words the filter matches, like a status's category.
  keywords?: string;
  // Quieter text after the label, like how a delegate connects.
  detail?: string;
}

const GAP = 4;
const MARGIN = 8;
const WIDTH = 240;
const MAX_HEIGHT = 288;

interface Placement {
  left: number;
  top: number;
  maxHeight: number;
  // Where it grows from: the corner nearest the trigger.
  origin: string;
}

// A picker that opens under its trigger with a filter field, like the
// prototype's "Change status…". Arrows move, Enter picks, Escape closes and
// returns focus to the trigger. Pass open and onOpenChange to open it from a
// keyboard shortcut. With `multiple`, picking toggles an item in `values` and
// the menu stays open. With `onCreate`, a filter that matches nothing exactly
// offers to create it.
//
// The panel renders in a portal, fixed to the viewport. Inside a dialog or a
// scrolling panel an absolutely positioned menu is clipped by the nearest
// overflow box, which cut the bottom of the status picker off under the
// dialog's footer. It flips above the trigger when the space below runs out.
export function Menu<T extends string>({
  label,
  items,
  value,
  values,
  multiple = false,
  onSelect,
  onCreate,
  trigger,
  open: controlledOpen,
  onOpenChange,
  align = "start",
  side = "bottom",
  filter = true,
  className,
}: {
  label: string;
  items: MenuItem<T>[];
  value?: T;
  values?: T[];
  multiple?: boolean;
  onSelect: (value: T) => void;
  onCreate?: (name: string) => void;
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    "aria-haspopup": "listbox";
    "aria-expanded": boolean;
  }) => ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  align?: "start" | "end";
  side?: "top" | "bottom";
  // A short fixed list, like roles, has no filter field to show. The field
  // stays, out of sight, to take the arrow keys and type-ahead.
  filter?: boolean;
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
  const [placement, setPlacement] = useState<Placement | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const q = query.trim().toLowerCase();
  const matches = q ? items.filter((item) => `${item.label} ${item.keywords ?? ""}`.toLowerCase().includes(q)) : items;
  const creating = onCreate && q && !items.some((item) => item.label.toLowerCase() === q);
  const createValue = "\u0000create" as T;
  const shown: MenuItem<T>[] = creating
    ? [...matches, { value: createValue, label: `Create “${query.trim()}”` }]
    : matches;
  const isSelected = (item: MenuItem<T>) => (multiple ? (values ?? []).includes(item.value) : item.value === value);

  const place = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    const panel = panelRef.current;
    if (!rect || !panel) return;
    // The panel is already capped by the max height of the previous pass.
    const height = panel.offsetHeight;
    const below = window.innerHeight - rect.bottom - GAP - MARGIN;
    const above = rect.top - GAP - MARGIN;
    const flip = side === "top" ? above > 0 : height > below && above > below;
    const maxHeight = Math.max(120, Math.min(MAX_HEIGHT, flip ? above : below));
    const left = Math.min(
      Math.max(MARGIN, align === "end" ? rect.right - WIDTH : rect.left),
      window.innerWidth - WIDTH - MARGIN,
    );
    const top = flip
      ? Math.max(MARGIN, rect.top - GAP - Math.min(height, maxHeight))
      : rect.bottom + GAP;
    const origin = `${flip ? "bottom" : "top"} ${align === "end" ? "right" : "left"}`;
    setPlacement((current) =>
      current && current.left === left && current.top === top && current.maxHeight === maxHeight && current.origin === origin
        ? current
        : { left, top, maxHeight, origin },
    );
  }, [align, side]);

  // Resets only when it opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(Math.max(0, items.findIndex((item) => item.value === value)));
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!root.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Measure after the panel mounts, and keep it anchored while the page or the
  // dialog behind it scrolls. The filter changing the row count changes the
  // height, so it measures again then.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the row count changes the panel height
  useLayoutEffect(() => {
    // Closing keeps the placement, so the panel fades out where it was.
    if (!open) return;
    place();
    const onScroll = () => place();
    window.addEventListener("resize", onScroll);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onScroll);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, place, shown.length]);

  // Focus moves into the filter once the panel is placed and visible:
  // autoFocus would fire while it is still hidden for measuring, and fail.
  const inputRef = useRef<HTMLInputElement>(null);
  const placed = placement !== null;
  useEffect(() => {
    if (open && placed) inputRef.current?.focus();
  }, [open, placed]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (item: MenuItem<T> | undefined) => {
    if (!item) return;
    if (item.value === createValue) {
      onCreate?.(query.trim());
      setQuery("");
      if (!multiple) close();
      return;
    }
    if (multiple) {
      onSelect(item.value);
      return;
    }
    close();
    if (item.value !== value) onSelect(item.value);
  };

  // A modal dialog lives in the top layer, so a panel portaled to the body
  // would sit behind its backdrop. Portal into the open dialog when there is
  // one, and into the body otherwise.
  const portalTarget =
    typeof document === "undefined"
      ? null
      : (triggerRef.current?.closest("dialog[open]") ?? document.body);
  const presence = usePresence(open, 100);
  const panel = presence.shown ? (
    <div
      ref={panelRef}
      role="presentation"
      data-leaving={presence.leaving || undefined}
      inert={presence.leaving || undefined}
      aria-hidden={presence.leaving || undefined}
      style={{
        width: WIDTH,
        maxHeight: placement?.maxHeight ?? MAX_HEIGHT,
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        transformOrigin: placement?.origin,
        visibility: placement ? undefined : "hidden",
      }}
      className="motion-pop fixed z-50 flex flex-col rounded-md bg-raised p-1 shadow-overlay"
    >
      <input
        ref={inputRef}
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
        className={cn(
          "shrink-0 rounded-sm bg-transparent text-ui text-ink placeholder:text-ink-2 focus-visible:outline-none",
          filter ? "mb-1 h-8 px-2" : "absolute size-px opacity-0",
        )}
      />
      {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA combobox pattern; focus stays in the input, which points here with aria-activedescendant */}
      <ul role="listbox"
        id={`${id}-list`}
        aria-label={label}
        aria-multiselectable={multiple || undefined}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        {shown.map((item, index) => (
          // biome-ignore lint/a11y/useKeyWithClickEvents: the input handles the keys (aria-activedescendant)
          // biome-ignore lint/a11y/useFocusableInteractive: options are reached from the input, not focused
          // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: options of the listbox above
          <li role="option"
            key={item.value}
            id={`${id}-${item.value}`}
            aria-selected={isSelected(item)}
            onPointerMove={() => setActive(index)}
            onClick={() => pick(item)}
            className={cn(
              "hover-fade flex h-8 shrink-0 cursor-default items-center gap-2 rounded-sm px-2 text-ui",
              index === active && "bg-hover",
              !multiple && isSelected(item) && "font-semibold",
            )}
          >
            {multiple && item.value !== createValue ? (
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-3.5 shrink-0 place-items-center rounded-xs shadow-[inset_0_0_0_1px_var(--line-strong)]",
                  isSelected(item) && "bg-ink shadow-none",
                )}
              >
                {isSelected(item) ? (
                  <svg viewBox="0 0 10 10" className="size-2.5 text-on-human" aria-hidden="true">
                    <path d="M2 5.2l2 2 4-4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : null}
              </span>
            ) : null}
            {item.icon}
            <span className={item.detail ? "shrink-0" : "truncate"}>{item.label}</span>
            {item.detail ? <span className="truncate text-sm text-ink-2">{item.detail}</span> : null}
          </li>
        ))}
        {shown.length === 0 ? <li className="px-2 py-1.5 text-ui text-ink-2">No match</li> : null}
      </ul>
    </div>
  ) : null;

  return (
    <div ref={root} className={cn("relative inline-flex", className)}>
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen(!open),
        "aria-haspopup": "listbox",
        "aria-expanded": open,
      })}
      {panel && portalTarget ? createPortal(panel, portalTarget) : null}
    </div>
  );
}
