// When a skeleton shows. A load that ends inside the delay never shows one,
// so fast pages don't flash. Once a skeleton is on screen, the next one to
// take its place (the app's frame, then a page's rows) shows at once and
// whole, so the wait never blinks off and back on.

// How long a load runs before its skeleton appears.
export const SKELETON_DELAY_MS = 150;
// How soon after one skeleton leaves the next counts as taking its place.
export const SKELETON_HANDOFF_MS = 100;

export interface SkeletonTimer {
  now(): number;
  set(callback: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const browserTimer: SkeletonTimer = {
  now: () => Date.now(),
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface SkeletonClock {
  // Starts one skeleton's wait. `reveal` runs once, when the skeleton should
  // show: `whole` is true when it takes over from one already on screen, so
  // it appears without fading in. The function it returns ends the wait, or
  // takes the skeleton off screen once shown; calling it again does nothing.
  begin(reveal: (whole: boolean) => void): () => void;
  // Skeletons on screen right now.
  shown(): number;
}

export function createSkeletonClock(
  timer: SkeletonTimer = browserTimer,
  { delay = SKELETON_DELAY_MS, handoff = SKELETON_HANDOFF_MS }: { delay?: number; handoff?: number } = {},
): SkeletonClock {
  let onScreen = 0;
  let lastLeftAt = Number.NEGATIVE_INFINITY;

  return {
    begin(reveal) {
      let state: "waiting" | "shown" | "ended" = "waiting";
      let handle: unknown;
      const show = (whole: boolean) => {
        if (state !== "waiting") return;
        state = "shown";
        onScreen += 1;
        reveal(whole);
      };
      if (onScreen > 0 || timer.now() - lastLeftAt <= handoff) show(true);
      else handle = timer.set(() => show(false), delay);
      return () => {
        if (state === "ended") return;
        if (state === "shown") {
          onScreen -= 1;
          lastLeftAt = timer.now();
        } else {
          timer.clear(handle);
        }
        state = "ended";
      };
    },
    shown: () => onScreen,
  };
}

// The clock every skeleton in the app shares.
export const skeletonClock = createSkeletonClock();
