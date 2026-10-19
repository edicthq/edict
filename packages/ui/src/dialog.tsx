import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./cn.js";

// A floating panel on the native <dialog>: focus moves in and back, Escape
// closes, the page behind is inert. Floating layers are the one place the
// tokens allow a shadow.
export function Dialog({
  open,
  onClose,
  title,
  children,
  className,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
  // When the dialog renders its own heading instead of title.
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

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
        "m-auto w-[min(480px,calc(100vw-32px))] max-h-[calc(100dvh-32px)] overflow-auto rounded-md bg-surface p-0 text-ink shadow-overlay",
        "backdrop:bg-scrim open:animate-[dialog-rise_220ms_cubic-bezier(0.2,0,0,1)] motion-reduce:open:animate-none",
        className,
      )}
    >
      {open ? (
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
