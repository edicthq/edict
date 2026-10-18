import { createContext, useCallback, useContext, useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, peekLastChange, takeLastChange, unwrap } from "../lib/api.js";
import { mod } from "../lib/labels.js";
import { useToast } from "./toast.js";

// Shows a toast for the change just made, with Undo when there is one.
type OfferUndo = (message: string) => void;

const UndoContext = createContext<OfferUndo>(() => {});

// Undo runs on the server over the event log (ADR 0019). ⌘Z outside a text
// field undoes the last change this tab made, as the toast's button does;
// the undo itself is not offered back, so ⌘Z twice does not redo.
export function UndoProvider({ orgId, children }: { orgId: string; children: ReactNode }) {
  const toast = useToast();
  const client = useQueryClient();

  const undo = useCallback(
    async (changeId: string) => {
      try {
        await unwrap(
          api.POST("/organizations/{orgId}/changes/{changeId}/undo", { params: { path: { orgId, changeId } } }),
        );
        takeLastChange();
        toast("Undone");
      } catch (error) {
        toast((error as Error).message);
      } finally {
        // An undo can touch any list: refetch what the organization shows.
        void client.invalidateQueries({ queryKey: ["org", orgId] });
      }
    },
    [client, orgId, toast],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      // Text fields keep their own undo.
      if (target?.closest("input, textarea, [contenteditable]")) return;
      const change = takeLastChange();
      if (!change) return;
      event.preventDefault();
      void undo(change);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  const offer = useCallback<OfferUndo>(
    (message) => {
      const change = peekLastChange();
      if (!change) {
        toast(message);
        return;
      }
      toast(message, {
        label: "Undo",
        kbd: `${mod}Z`,
        run: () => {
          if (peekLastChange() === change) takeLastChange();
          void undo(change);
        },
      });
    },
    [toast, undo],
  );

  return <UndoContext.Provider value={offer}>{children}</UndoContext.Provider>;
}

export function useOfferUndo() {
  return useContext(UndoContext);
}
