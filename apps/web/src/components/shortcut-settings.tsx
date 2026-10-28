import { useEffect, useState, type KeyboardEvent } from "react";
import { useLocation } from "react-router";
import { Button, cn } from "@edicthq/ui";
import { SettingsCard } from "./settings-frame.js";
import {
  bindingOf,
  formatShortcut,
  isDefaultShortcut,
  resetShortcut,
  setShortcut,
  shortcutActions,
  shortcutConflict,
  useShortcuts,
  type ShortcutAction,
} from "../lib/shortcuts.js";

// Preferences › Keyboard shortcuts: each app-wide shortcut with the keys it
// has now. Pick one, press the new keys, and it takes them at once.
export function ShortcutSettings() {
  const bindings = useShortcuts();
  const location = useLocation();
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [problem, setProblem] = useState<{ action: ShortcutAction; message: string } | null>(null);
  const changed = shortcutActions.some((action) => !isDefaultShortcut(action.id));

  // The command menu's "Keyboard shortcuts" lands here.
  useEffect(() => {
    if (location.hash === "#shortcuts") document.getElementById("shortcuts")?.scrollIntoView({ block: "start" });
  }, [location.hash]);

  const record = (action: ShortcutAction) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (recording !== action) return;
    // The keys are the answer, not a command for the page.
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      return;
    }
    const binding = bindingOf(event.nativeEvent);
    if (!binding) return;
    const conflict = shortcutConflict(action, binding);
    setRecording(null);
    if (conflict) {
      setProblem({ action, message: conflict });
      return;
    }
    setProblem(null);
    setShortcut(action, binding);
  };

  return (
    <div id="shortcuts" className="scroll-mt-6">
      <SettingsCard
        title="Keyboard shortcuts"
        actions={
          changed ? (
            <Button variant="ghost" onClick={() => resetShortcut()}>
              Reset all
            </Button>
          ) : null
        }
      >
        {shortcutActions.map((action) => {
          const id = `shortcut-${action.id}`;
          const active = recording === action.id;
          const message = problem?.action === action.id ? problem.message : null;
          return (
            // Denser than a settings row: seven of them read as one list.
            <div key={action.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2.5">
              <div className="min-w-[200px] flex-1">
                <h3 id={id} className="text-ui font-medium">
                  {action.label}
                </h3>
                {message ? <p className="mt-0.5 text-sm text-ink text-pretty">{message}</p> : null}
              </div>
              <div className="flex items-center gap-3">
                {!isDefaultShortcut(action.id) ? (
                  <button
                    type="button"
                    onClick={() => {
                      resetShortcut(action.id);
                      setProblem(null);
                    }}
                    className="text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline"
                  >
                    Reset to {formatShortcut(action.default)}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-labelledby={id}
                  aria-describedby={`${id}-keys`}
                  onClick={(event) => {
                    // WebKit leaves a clicked button unfocused, and the keys
                    // must land on it.
                    event.currentTarget.focus();
                    setProblem(null);
                    setRecording(active ? null : action.id);
                  }}
                  onKeyDown={record(action.id)}
                  onBlur={() => setRecording((current) => (current === action.id ? null : current))}
                  className={cn(
                    "h-7 min-w-20 rounded-sm bg-hover px-2.5 text-ui font-medium tabular-nums text-ink transition-[box-shadow,color,background-color] duration-(--duration-fast) ease-standard hover:shadow-[inset_0_0_0_1px_var(--line-strong)]",
                    active && "bg-transparent font-normal text-ink-2 shadow-[inset_0_0_0_1px_var(--ink-2),0_0_0_3px_var(--focus-soft)]",
                  )}
                >
                  <span id={`${id}-keys`} aria-live="polite">
                    {active ? "Press keys…" : formatShortcut(bindings[action.id])}
                  </span>
                </button>
              </div>
            </div>
          );
        })}
      </SettingsCard>
      <p className="mt-2 text-sm text-ink-2 text-pretty">
        A list's own keys stay as they are: J and K move, X selects, S, P, A and D set status, priority, assignee and
        delegate, Enter opens and Esc closes.
      </p>
    </div>
  );
}
