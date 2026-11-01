import { describe, expect, it } from "vitest";
import { opaque, skeletonBlockClass } from "./skeleton.js";

describe("skeleton blocks", () => {
  it("are a slightly rounded 12px line by default", () => {
    expect(skeletonBlockClass("w-24")).toBe("skeleton-block block h-3 rounded-xs w-24");
  });

  it("keep the height, size or radius their class gives", () => {
    expect(skeletonBlockClass("size-[22px] rounded-full")).toBe("skeleton-block block size-[22px] rounded-full");
    expect(skeletonBlockClass("my-[4px] h-5 w-56")).toBe("skeleton-block block rounded-xs my-[4px] h-5 w-56");
    expect(skeletonBlockClass("w-16 sm:h-9")).toBe("skeleton-block block rounded-xs w-16 sm:h-9");
    // A minimum height is not a height.
    expect(skeletonBlockClass("min-h-12")).toBe("skeleton-block block h-3 rounded-xs min-h-12");
  });
});

describe("the crossfade's background", () => {
  it("takes only colors without transparency", () => {
    expect(opaque("oklch(0.99 0.002 255)")).toBe(true);
    expect(opaque("rgb(250, 250, 252)")).toBe(true);
    expect(opaque("transparent")).toBe(false);
    expect(opaque("rgba(0, 0, 0, 0)")).toBe(false);
    expect(opaque("oklch(0.22 0.02 260 / 0.055)")).toBe(false);
    expect(opaque("oklch(0.5 0 0 / 50%)")).toBe(false);
    expect(opaque("oklch(0.5 0 0 / 1)")).toBe(true);
  });
});
