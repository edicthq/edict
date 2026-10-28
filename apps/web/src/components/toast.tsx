import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Kbd } from "@edicthq/ui";

// A button on a toast, like Undo.
export interface ToastAction {
  label: string;
  // The shortcut that does the same, shown beside the label.
  kbd?: string;
  run: () => void;
}

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
  // Playing its exit before it goes.
  leaving?: boolean;
}

type ShowToast = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast>(() => {});

// Short notices at the bottom right, per the C2 concept, read out by screen
// readers. One with an action stays a little longer.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  // A toast fades out before it goes (motion-rise in tokens.css).
  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.map((toast) => (toast.id === id ? { ...toast, leaving: true } : toast)));
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 120);
  }, []);
  const show = useCallback<ShowToast>(
    (message, action) => {
      const id = next.current++;
      setToasts((list) => [...list.slice(-2), { id, message, action }]);
      setTimeout(() => dismiss(id), action ? 6000 : 3500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed end-5 bottom-5 z-[60] flex flex-col items-end gap-2 max-sm:inset-x-4 max-sm:items-stretch"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-leaving={toast.leaving || undefined}
            className="motion-rise pointer-events-auto flex min-h-11 max-w-[480px] origin-bottom-right items-center gap-3 rounded-md bg-raised py-2 ps-4 pe-2 text-ui text-ink shadow-overlay"
          >
            <span className="min-w-0 text-pretty">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action!.run();
                  dismiss(toast.id);
                }}
                className="hover-fade ms-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-sm bg-hover px-2.5 font-semibold text-ink hover:bg-line"
              >
                {toast.action.label}
                {toast.action.kbd ? <Kbd>{toast.action.kbd}</Kbd> : null}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
