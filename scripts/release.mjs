#!/usr/bin/env node
// The release version lives in the root package.json. Every workspace package
// carries a copy, since the server reports its own (apps/server/src/version.ts)
// and @edicthq/client publishes with its own. See docs/releasing.md.
//
//   node scripts/release.mjs version 1.4.2   set the version everywhere
//   node scripts/release.mjs check           fail if a copy differs
//   node scripts/release.mjs notes 1.4.2     print the release notes for 1.4.2
//   node scripts/release.mjs plan v1.4.2     what the release workflow publishes,
//                                            given every v* tag on stdin
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(-[0-9A-Za-z.-]+)?$/;
// The top-level "version" key, at two spaces of indent, so a rewrite keeps the
// rest of the file as it was written.
const VERSION_KEY = /^ {2}"version": "[^"]*"/m;

class ReleaseError extends Error {}

function read(file) {
  return JSON.parse(readFileSync(join(root, file), "utf8"));
}

function workspacePackages() {
  return ["apps", "packages"].flatMap((dir) =>
    readdirSync(join(root, dir), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && existsSync(join(root, dir, entry.name, "package.json")))
      .map((entry) => `${dir}/${entry.name}/package.json`),
  );
}

function setVersion(version) {
  if (!SEMVER.test(version)) throw new ReleaseError(`${version} is not a version like 1.4.2 or 1.5.0-rc.1`);
  const files = ["package.json", ...workspacePackages()];
  for (const file of files) {
    const text = readFileSync(join(root, file), "utf8");
    const line = `  "version": "${version}"`;
    const next = VERSION_KEY.test(text)
      ? text.replace(VERSION_KEY, line)
      : text.replace(/^ {2}"name": "[^"]*",\n/m, (name) => `${name}${line},\n`);
    if (JSON.parse(next).version !== version) throw new ReleaseError(`Could not set the version in ${file}`);
    writeFileSync(join(root, file), next);
  }
  return `Set ${version} in ${files.join(", ")}`;
}

function check() {
  const { version } = read("package.json");
  if (!version || !SEMVER.test(version)) throw new ReleaseError("package.json has no release version");
  const stale = workspacePackages().filter((file) => read(file).version !== version);
  if (stale.length > 0) {
    throw new ReleaseError(`${stale.join(", ")} not at ${version}. Run: pnpm release version ${version}`);
  }
  return version;
}

// The section of the changelog headed with this version, up to the next one.
export function notes(version, changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8")) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line === `## ${version}` || line.startsWith(`## ${version} `));
  if (start === -1) throw new ReleaseError(`CHANGELOG.md has no "## ${version}" section`);
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  const body = lines
    .slice(start + 1, end === -1 ? undefined : end)
    .join("\n")
    .trim();
  if (body === "") throw new ReleaseError(`CHANGELOG.md's "## ${version}" section is empty`);
  return body;
}

function parts(version) {
  const [, major, minor, patch, pre] = SEMVER.exec(version);
  return { major: Number(major), minor: Number(minor), patch: Number(patch), pre };
}

function newest(a, b) {
  const x = parts(a);
  const y = parts(b);
  return x.major - y.major || x.minor - y.minor || x.patch - y.patch;
}

// What a release publishes besides its exact version. A floating tag (1.4, 1,
// latest) moves only to the newest release it covers, so a patch to an older
// line never takes `latest` back. Major zero gets no `0`: every 0.x minor may
// break. A prerelease (1.5.0-rc.1) floats nowhere.
export function plan(version, tags) {
  if (!SEMVER.test(version)) throw new ReleaseError(`${version} is not a version like 1.4.2 or 1.5.0-rc.1`);
  const { major, minor, pre } = parts(version);
  const stable = [...new Set([...tags, version])].filter((v) => SEMVER.test(v) && !parts(v).pre);
  const isNewest = (within) => !pre && stable.filter(within).every((v) => newest(version, v) >= 0);
  const latest = isNewest(() => true);
  const imageTags = [version];
  if (isNewest((v) => parts(v).major === major && parts(v).minor === minor)) imageTags.push(`${major}.${minor}`);
  if (major > 0 && isNewest((v) => parts(v).major === major)) imageTags.push(`${major}`);
  if (latest) imageTags.push("latest");
  return {
    version,
    prerelease: Boolean(pre),
    latest,
    imageTags,
    // npm needs a dist-tag for every publish, and moves `latest` to it.
    npmTag: pre ? "next" : latest ? "latest" : `release-${major}.${minor}`,
  };
}

// `plan` checks the tag against the versions and the changelog before anything
// is published, and prints GitHub Actions outputs.
function planRelease(tag, stdin) {
  const version = check();
  if (tag !== `v${version}`) throw new ReleaseError(`The tag ${tag} does not match package.json's ${version}`);
  notes(version);
  const tags = [...stdin.matchAll(/refs\/tags\/v(\S+)|^v(\S+)$/gm)].map((m) => m[1] ?? m[2]);
  const result = plan(version, tags);
  return [
    `version=${result.version}`,
    `prerelease=${result.prerelease}`,
    `latest=${result.latest}`,
    `image-tags=${result.imageTags.join(" ")}`,
    `npm-tag=${result.npmTag}`,
  ].join("\n");
}

function main([command, arg]) {
  if (command === "version" && arg) return setVersion(arg);
  if (command === "check") return check();
  if (command === "notes" && arg) return notes(arg);
  if (command === "plan" && arg) return planRelease(arg, readFileSync(0, "utf8"));
  throw new ReleaseError("Usage: pnpm release version <x.y.z> | check | notes <x.y.z> | plan <vX.Y.Z> < tags");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(main(process.argv.slice(2)));
  } catch (error) {
    if (!(error instanceof ReleaseError)) throw error;
    console.error(error.message);
    process.exit(1);
  }
}
