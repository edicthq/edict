import { readFileSync } from "node:fs";

// The running server's version, from its package.json: one level above both
// src/ (tests, development) and dist/ (the image).
export const VERSION: string = (
  JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }
).version;
