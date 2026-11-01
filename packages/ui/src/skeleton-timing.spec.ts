import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SKELETON_DELAY_MS, SKELETON_HANDOFF_MS, createSkeletonClock } from "./skeleton-timing.js";

describe("skeleton timing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits 150 ms before a skeleton shows, then fades it in", () => {
    const clock = createSkeletonClock();
    const reveal = vi.fn();
    clock.begin(reveal);
    vi.advanceTimersByTime(SKELETON_DELAY_MS - 1);
    expect(reveal).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(reveal).toHaveBeenCalledExactlyOnceWith(false);
    expect(clock.shown()).toBe(1);
  });

  it("never shows a skeleton for a load that ends inside the delay", () => {
    const clock = createSkeletonClock();
    const reveal = vi.fn();
    const end = clock.begin(reveal);
    vi.advanceTimersByTime(SKELETON_DELAY_MS - 10);
    end();
    vi.advanceTimersByTime(1_000);
    expect(reveal).not.toHaveBeenCalled();
    expect(clock.shown()).toBe(0);
  });

  it("shows a skeleton at once and whole while another is on screen", () => {
    const clock = createSkeletonClock();
    clock.begin(() => {});
    vi.advanceTimersByTime(SKELETON_DELAY_MS);
    const reveal = vi.fn();
    clock.begin(reveal);
    expect(reveal).toHaveBeenCalledExactlyOnceWith(true);
    expect(clock.shown()).toBe(2);
  });

  it("hands over at once to the skeleton that takes the place of one that just left", () => {
    const clock = createSkeletonClock();
    const endFrame = clock.begin(() => {});
    vi.advanceTimersByTime(SKELETON_DELAY_MS + 200);
    endFrame();
    vi.advanceTimersByTime(SKELETON_HANDOFF_MS);
    const next = vi.fn();
    clock.begin(next);
    expect(next).toHaveBeenCalledExactlyOnceWith(true);
  });

  it("waits again once the last skeleton left longer ago than the handoff", () => {
    const clock = createSkeletonClock();
    const end = clock.begin(() => {});
    vi.advanceTimersByTime(SKELETON_DELAY_MS);
    end();
    vi.advanceTimersByTime(SKELETON_HANDOFF_MS + 1);
    const later = vi.fn();
    clock.begin(later);
    expect(later).not.toHaveBeenCalled();
    vi.advanceTimersByTime(SKELETON_DELAY_MS);
    expect(later).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("does not count a skeleton that never showed as one that just left", () => {
    const clock = createSkeletonClock();
    clock.begin(() => {})();
    const next = vi.fn();
    clock.begin(next);
    expect(next).not.toHaveBeenCalled();
  });

  it("takes a skeleton off screen once, however often it is ended", () => {
    const clock = createSkeletonClock();
    const first = clock.begin(() => {});
    vi.advanceTimersByTime(SKELETON_DELAY_MS);
    const second = clock.begin(() => {});
    first();
    first();
    expect(clock.shown()).toBe(1);
    second();
    expect(clock.shown()).toBe(0);
  });

  it("takes its delay and handoff from options", () => {
    const clock = createSkeletonClock(undefined, { delay: 40, handoff: 0 });
    const reveal = vi.fn();
    clock.begin(reveal);
    vi.advanceTimersByTime(40);
    expect(reveal).toHaveBeenCalledWith(false);
  });
});
