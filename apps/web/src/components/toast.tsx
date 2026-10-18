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
}

type ShowToast = (message: string, action?: ToastAction) => void;

const ToastContext = createContext<ShowToast>(() => {});

// Short notices at the bottom right, per the C2 concept, read out by screen
// readers. One with an action stays a little longer.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), []);
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
            className="pointer-events-auto flex max-w-[480px] items-center gap-3 rounded-md bg-surface py-2.5 ps-3.5 pe-2.5 text-ui text-ink shadow-overlay outline outline-1 outline-line motion-safe:animate-[dialog-rise_220ms_var(--ease-standard)]"
          >
            <span className="min-w-0 text-pretty">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action!.run();
                  dismiss(toast.id);
                }}
                className="ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-sm bg-hover px-2 py-1 font-semibold text-ink"
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
