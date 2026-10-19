#!/usr/bin/env node
// Writes latest.json, the manifest the desktop app's updater reads from the
// latest GitHub release (apps/desktop, tauri.conf.json), from the signed
// update bundles the release built.
//
//   node scripts/updater-manifest.mjs <version> <dir> > latest.json
//
// <dir> holds the release's desktop files, each update bundle beside its .sig.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Which file updates which platform. The universal macOS app serves both
// Apple architectures.
const BUNDLES = [
  { pattern: /_universal\.app\.tar\.gz$/, platforms: ["darwin-aarch64", "darwin-x86_64"] },
  { pattern: /_x64-setup\.exe$/, platforms: ["windows-x86_64"] },
  { pattern: /_amd64\.AppImage$/, platforms: ["linux-x86_64"] },
];

export function manifest(version, files, signatureOf, { repository = "edicthq/edict", date = new Date() } = {}) {
  const platforms = {};
  for (const { pattern, platforms: names } of BUNDLES) {
    const file = files.find((name) => pattern.test(name));
    if (!file) throw new Error(`No update bundle matches ${pattern}`);
    if (!files.includes(`${file}.sig`)) throw new Error(`${file} has no .sig beside it`);
    const entry = {
      signature: signatureOf(`${file}.sig`).trim(),
      url: `https://github.com/${repository}/releases/download/v${version}/${encodeURIComponent(file)}`,
    };
    for (const name of names) platforms[name] = entry;
  }
  return { version, notes: `https://github.com/${repository}/releases/tag/v${version}`, pub_date: date.toISOString(), platforms };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [version, dir] = process.argv.slice(2);
  if (!version || !dir) {
    console.error("Usage: node scripts/updater-manifest.mjs <version> <dir>");
    process.exit(1);
  }
  const files = readdirSync(dir);
  console.log(JSON.stringify(manifest(version, files, (name) => readFileSync(join(dir, name), "utf8")), null, 2));
}
