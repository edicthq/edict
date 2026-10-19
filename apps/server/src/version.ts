import { readFileSync } from "node:fs";

// The running server's version, from its package.json: one level above both
// src/ (tests, development) and dist/ (the image).
export const VERSION: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;

// Whether semver version a comes after b. A prerelease (1.5.0-rc.1) comes
// before its release (1.5.0); two prereleases of one version compare as text.
export function isNewer(a: string, b: string): boolean {
  const [coreA = "", preA] = a.split(/-(.*)/);
  const [coreB = "", preB] = b.split(/-(.*)/);
  const x = coreA.split(".").map(Number);
  const y = coreB.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return diff > 0;
  }
  if (preA === undefined || preB === undefined) return preA === undefined && preB !== undefined;
  return preA.localeCompare(preB, "en", { numeric: true }) > 0;
}
