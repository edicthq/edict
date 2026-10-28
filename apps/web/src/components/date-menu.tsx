import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@edicthq/ui";

// A date picker in the app's menu style: a month under its trigger, opened on
// the chosen day or today. Arrows move a day or a week, Page Up and Page Down a
// month, Enter picks and Escape closes. Dates are calendar days, kept as UTC
// midnight so a date reads the same in every time zone.

const WIDTH = 256;
const GAP = 4;
const MARGIN = 8;

const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

// A calendar day as YYYY-MM-DD.
type Day = string;

const dayOf = (date: Date): Day => date.toISOString().slice(0, 10);
const todayDay = (): Day => {
  const now = new Date();
  return dayOf(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
};
const toDate = (day: Day) => new Date(`${day}T00:00:00.000Z`);
const addDays = (day: Day, n: number): Day => {
  const date = toDate(day);
  date.setUTCDate(date.getUTCDate() + n);
  return dayOf(date);
};
const addMonths = (day: Day, n: number): Day => {
  const date = toDate(day);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), last));
  return dayOf(target);
};

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function DateMenu({
  label,
  value,
  onChange,
  trigger,
}: {
  label: string;
  // An ISO timestamp at UTC midnight, or null.
  value: string | null;
  onChange: (value: string | null) => void;
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    "aria-haspopup": "dialog";
    "aria-expanded": boolean;
  }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? value.slice(0, 10) : null;
  const [focus, setFocus] = useState<Day>(selected ?? todayDay());
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = (day: Day | null) => {
    close();
    if (day !== selected) onChange(day ? toDate(day).toISOString() : null);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const height = panelRef.current?.offsetHeight ?? 0;
      if (!rect) return;
      const left = Math.min(Math.max(MARGIN, rect.left), window.innerWidth - WIDTH - MARGIN);
      const below = rect.bottom + GAP;
      const top = below + height > window.innerHeight - MARGIN ? Math.max(MARGIN, rect.top - GAP - height) : below;
      setPlacement({ left, top });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Keep keyboard focus on the focused day as it moves.
  useEffect(() => {
    if (open && placement) panelRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus();
  }, [open, placement, focus]);

  const first = toDate(`${focus.slice(0, 7)}-01`);
  const start = addDays(dayOf(first), -first.getUTCDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const month = focus.slice(0, 7);
  const today = todayDay();

  const onKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, () => Day> = {
      ArrowLeft: () => addDays(focus, -1),
      ArrowRight: () => addDays(focus, 1),
      ArrowUp: () => addDays(focus, -7),
      ArrowDown: () => addDays(focus, 7),
      PageUp: () => addMonths(focus, -1),
      PageDown: () => addMonths(focus, 1),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      setFocus(move());
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  const nav = "grid size-7 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink";
  const panel = open ? (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ width: WIDTH, left: placement?.left ?? 0, top: placement?.top ?? 0, visibility: placement ? undefined : "hidden" }}
      className="motion-pop fixed z-50 flex origin-top-left flex-col gap-1 rounded-md bg-raised p-2 shadow-overlay"
    >
      <div className="flex items-center gap-1 ps-2">
        <p aria-live="polite" className="flex-1 text-ui font-semibold">
          {first.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}
        </p>
        <button type="button" aria-label="Previous month" className={nav} onClick={() => setFocus(addMonths(focus, -1))}>
          <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
        <button type="button" aria-label="Next month" className={nav} onClick={() => setFocus(addMonths(focus, 1))}>
          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <div className="grid grid-cols-7">
        {weekdays.map((name) => (
          <span key={name} aria-hidden="true" className="grid h-7 place-items-center text-meta text-ink-2">
            {name}
          </span>
        ))}
        {days.map((day) => (
          <button
            key={day}
            type="button"
            data-day={day}
            tabIndex={day === focus ? 0 : -1}
            aria-label={formatDay(toDate(day).toISOString())}
            aria-pressed={day === selected}
            aria-current={day === today ? "date" : undefined}
            onClick={() => pick(day)}
            className={cn(
              "grid h-8 place-items-center rounded-sm text-ui tabular-nums hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink",
              day.slice(0, 7) !== month && "text-ink-2",
              day === today && "font-semibold underline decoration-line-strong underline-offset-4",
              day === selected && "bg-ink text-on-human hover:bg-ink",
            )}
          >
            {Number(day.slice(8))}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line pt-1">
        <button type="button" className="h-7 rounded-sm px-2 text-ui text-ink-2 hover:bg-hover hover:text-ink" onClick={() => pick(today)}>
          Today
        </button>
        {selected ? (
          <button type="button" className="h-7 rounded-sm px-2 text-ui text-ink-2 hover:bg-hover hover:text-ink" onClick={() => pick(null)}>
            Clear
          </button>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: () => {
          if (!open) setFocus(selected ?? todayDay());
          setOpen(!open);
        },
        "aria-haspopup": "dialog",
        "aria-expanded": open,
      })}
      {/* Inside a modal dialog the body is behind its backdrop: portal into
          the dialog then, as the app's menus do. */}
      {panel ? createPortal(panel, triggerRef.current?.closest("dialog[open]") ?? document.body) : null}
    </>
  );
}
