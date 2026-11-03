import { describe, expect, it } from "vitest";
import { safeNext, secondsLeft, verifiedCallback } from "./email-flow.js";

describe("safeNext", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/invite/abc?x=1")).toBe("/invite/abc?x=1");
  });

  it("falls back to home for nothing, another origin or a protocol-relative URL", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext("https://evil.example")).toBe("/");
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
  });
});

describe("verifiedCallback", () => {
  it("lands on the Email verified screen, carrying where to go next", () => {
    expect(verifiedCallback("/invite/abc")).toBe("/email-verified?next=%2Finvite%2Fabc");
    expect(verifiedCallback("https://evil.example")).toBe("/email-verified?next=%2F");
  });
});

describe("secondsLeft", () => {
  it("counts down from 60 and stops at 0", () => {
    expect(secondsLeft(null, 1_000)).toBe(0);
    expect(secondsLeft(0, 0)).toBe(60);
    expect(secondsLeft(0, 59_001)).toBe(1);
    expect(secondsLeft(0, 60_000)).toBe(0);
    expect(secondsLeft(0, 90_000)).toBe(0);
  });
});
