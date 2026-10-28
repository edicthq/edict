import { useSyncExternalStore } from "react";

// Whether events are reaching this browser: the socket is open and the server
// confirmed a subscription. Panels that change without the person's doing
// (progress, agents' queues, the inbox badge) poll only while it is not.
let live = false;
const liveListeners = new Set<() => void>();

export function setLive(next: boolean): void {
  if (live === next) return;
  live = next;
  for (const listener of liveListeners) listener();
}

function onLive(listener: () => void): () => void {
  liveListeners.add(listener);
  return () => liveListeners.delete(listener);
}

export function useRealtimeLive(): boolean {
  return useSyncExternalStore(onLive, () => live);
}

// How often a panel polls while events are not reaching it: the old interval
// while the socket is down, never while it is up.
export function usePollWhileDown(ms: number): number | false {
  return useRealtimeLive() ? false : ms;
}

// The time screens judge freshness by, ticking every 30s while anything reads
// it, so a Working badge goes quiet without waiting for an event.
let now = Date.now();
let clock: ReturnType<typeof setInterval> | undefined;
const clockListeners = new Set<() => void>();

function onTick(listener: () => void): () => void {
  clockListeners.add(listener);
  now = Date.now();
  clock ??= setInterval(() => {
    now = Date.now();
    for (const each of clockListeners) each();
  }, 30_000);
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0) {
      clearInterval(clock);
      clock = undefined;
    }
  };
}

export function useNow(): number {
  return useSyncExternalStore(onTick, () => now);
}
