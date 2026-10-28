import { useEffect, useReducer, useRef } from "react";

// Keeps something on screen while it animates out. While `value` is set,
// `shown` is it. When it goes, `shown` holds the last value for `exitMs` with
// `leaving` set, so the layer can play its exit ([data-leaving] in
// tokens.css) and ignore input meanwhile. Under reduced motion it goes at once.
export function usePresence<T>(value: T | null | undefined | false, exitMs = 100): { shown: T | null; leaving: boolean } {
  const last = useRef<T | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // Without motion there is no exit to play: it goes in the same render.
  if (value || reducedMotion()) last.current = value || null;
  const present = Boolean(value);
  useEffect(() => {
    if (present || last.current === null) return;
    const timer = setTimeout(() => {
      last.current = null;
      rerender();
    }, exitMs);
    return () => clearTimeout(timer);
  }, [present, exitMs]);
  return { shown: value || last.current, leaving: !value && last.current !== null };
}

// How many times `value` has changed since mount: 0 until the first change.
// A key or class from it animates a change without animating the first render.
export function useChangeCount<T>(value: T): number {
  const previous = useRef(value);
  const count = useRef(0);
  if (!Object.is(previous.current, value)) {
    previous.current = value;
    count.current += 1;
  }
  return count.current;
}

function reducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
