import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAnchoredPlacement } from "./anchor.js";
import { cn } from "./cn.js";
import { usePresence } from "./presence.js";

const MAX_HEIGHT = 360;

// A menu of links and actions under a button, like the organization button in
// the sidebar. Its items are the children with role="menuitem" (links or
// buttons). Opening focuses the first; arrows, Home and End move; Enter or a
// click activates and closes; Escape closes and returns focus to the button;
// Tab or a click outside closes. ArrowDown or ArrowUp on the button opens it
// on the first or last item.
//
// The panel renders in a portal, fixed to the viewport and placed like Menu's
// (useAnchoredPlacement), so the sidebar's overflow never clips it.
export function ActionMenu({
  label,
  trigger,
  children,
  width = 256,
  align = "start",
  className,
}: {
  label: string;
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string | undefined;
  }) => ReactNode;
  children: ReactNode;
  width?: number;
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Which item takes focus once the panel is placed: the first or the last.
  const [initial, setInitial] = useState<"first" | "last">("first");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const placement = useAnchoredPlacement({ open, trigger: triggerRef, panel: panelRef, align, width, maxHeight: MAX_HEIGHT });

  const items = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  const focusAt = (index: number) => {
    const all = items();
    if (!all.length) return;
    all[(index + all.length) % all.length]?.focus();
  };
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
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

  // Focus moves in once the panel is placed and visible: while it is hidden
  // for measuring, focus would fail.
  const placed = placement !== null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: only on opening
  useEffect(() => {
    if (open && placed) focusAt(initial === "first" ? 0 : -1);
  }, [open, placed]);

  const onPanelKeyDown = (event: React.KeyboardEvent) => {
    const all = items();
    const index = all.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusAt(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusAt(index < 0 ? -1 : index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusAt(-1);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "Tab") {
      // Back on the button, the Tab goes on to whatever follows it.
      close(true);
    }
  };

  const portalTarget =
    typeof document === "undefined" ? null : (triggerRef.current?.closest("dialog[open]") ?? document.body);
  const presence = usePresence(open, 100);
  const panel = presence.shown ? (
    <div
      ref={panelRef}
      id={`${id}-menu`}
      role="menu"
      aria-label={label}
      data-leaving={presence.leaving || undefined}
      inert={presence.leaving || undefined}
      onKeyDown={onPanelKeyDown}
      // Activating an item, by click or by Enter on a link or button, closes.
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('[role="menuitem"]')) close(false);
      }}
      style={{
        width: placement?.width ?? width,
        maxHeight: placement?.maxHeight ?? MAX_HEIGHT,
        left: placement?.left ?? 0,
        top: placement?.top ?? 0,
        transformOrigin: placement?.origin,
        visibility: placement ? undefined : "hidden",
      }}
      className={cn(
        "motion-pop fixed z-50 flex flex-col gap-0.5 overflow-y-auto rounded-md bg-raised p-1 shadow-overlay",
        className,
      )}
    >
      {children}
    </div>
  ) : null;

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: () => {
          setInitial("first");
          setOpen(!open);
        },
        onKeyDown: (event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          setInitial(event.key === "ArrowDown" ? "first" : "last");
          if (open) focusAt(event.key === "ArrowDown" ? 0 : -1);
          else setOpen(true);
        },
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? `${id}-menu` : undefined,
      })}
      {panel && portalTarget ? createPortal(panel, portalTarget) : null}
    </>
  );
}

// The look of one row in an ActionMenu. Give the element role="menuitem" and
// tabIndex={-1}; the menu moves focus between them.
export const actionMenuItemClass =
  "flex h-8 shrink-0 items-center gap-2 rounded-sm px-2 text-ui outline-none hover:bg-hover focus:bg-hover";
