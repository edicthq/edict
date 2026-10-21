import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn.js";
import { usePresence } from "./presence.js";

// A floating panel on the native <dialog>: focus moves in and back, Escape
// closes, the page behind is inert. Floating layers are the one place the
// tokens allow a shadow. It pops in and fades out (motion-dialog in
// tokens.css), keeping its content while it fades.
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  labelledBy,
  placement = "center",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  // When the dialog renders its own heading instead of title.
  labelledBy?: string;
  // "top" anchors it high, like the palette, so it stays put while its
  // content grows.
  placement?: "center" | "top";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const { shown } = usePresence(open, 100);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a backdrop click; Escape already closes a modal dialog
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : title}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      className={cn(
        "motion-dialog w-[min(480px,calc(100vw-32px))] overflow-auto rounded-md bg-raised p-0 text-ink shadow-overlay",
        placement === "top" ? "mx-auto mt-[12vh] mb-auto max-h-[calc(88dvh-16px)]" : "m-auto max-h-[calc(100dvh-32px)]",
        "backdrop:bg-scrim",
        className,
      )}
    >
      {shown ? (
        <div className="flex flex-col">
          {title ? (
            <h2 className="px-5 pt-5 text-lg font-semibold">{title}</h2>
          ) : null}
          {children}
        </div>
      ) : null}
    </dialog>
  );
}
