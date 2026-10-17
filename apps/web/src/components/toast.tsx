import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface Toast {
  id: number;
  message: string;
}

const ToastContext = createContext<(message: string) => void>(() => {});

// Short notices at the bottom of the screen, read out by screen readers.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const show = useCallback((message: string) => {
    const id = next.current++;
    setToasts((list) => [...list.slice(-2), { id, message }]);
    setTimeout(() => setToasts((list) => list.filter((toast) => toast.id !== id)), 6000);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((toast) => (
          <p
            key={toast.id}
            className="pointer-events-auto max-w-[480px] rounded-md bg-ink px-3.5 py-2.5 text-ui text-on-human shadow-overlay text-pretty"
          >
            {toast.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
