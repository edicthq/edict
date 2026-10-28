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
//   node scripts/release.mjs next patch      the version after the newest v* tag:
//                                            patch, minor, major, or one given
//   node scripts/release.mjs changelog 1.4.2 add a "## 1.4.2" section to
//                                            CHANGELOG.md from the commit subjects
//                                            since the last tag
import { execFileSync } from "node:child_process";
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

// The desktop app's Rust crate carries the version too, in its manifest and
// its lockfile. Tauri reads its own version from apps/desktop/package.json.
const CRATE = "apps/desktop/src-tauri";
const CRATE_VERSION = /^(\[package\]\nname = "edict-desktop"\nversion = ")[^"]*"/m;
const LOCK_VERSION = /^(name = "edict-desktop"\nversion = ")[^"]*"/m;

function crateVersions() {
  const read = (file) => (existsSync(join(root, file)) ? readFileSync(join(root, file), "utf8") : null);
  return [
    [`${CRATE}/Cargo.toml`, read(`${CRATE}/Cargo.toml`), CRATE_VERSION],
    [`${CRATE}/Cargo.lock`, read(`${CRATE}/Cargo.lock`), LOCK_VERSION],
  ].filter(([, text]) => text !== null);
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
  for (const [file, text, pattern] of crateVersions()) {
    if (!pattern.test(text)) throw new ReleaseError(`Could not find edict-desktop's version in ${file}`);
    writeFileSync(join(root, file), text.replace(pattern, `$1${version}"`));
    files.push(file);
  }
  return `Set ${version} in ${files.join(", ")}`;
}

function check() {
  const { version } = read("package.json");
  if (!version || !SEMVER.test(version)) throw new ReleaseError("package.json has no release version");
  const stale = workspacePackages().filter((file) => read(file).version !== version);
  for (const [file, text, pattern] of crateVersions()) {
    if (pattern.exec(text)?.[0].endsWith(`"${version}"`) !== true) stale.push(file);
  }
  if (stale.length > 0) {
    throw new ReleaseError(`${stale.join(", ")} not at ${version}. Run: pnpm release version ${version}`);
  }
  return version;
}

const headsSection = (version) => (line) => line === `## ${version}` || line.startsWith(`## ${version} `);

// The section of the changelog headed with this version, up to the next one.
export function notes(version, changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8")) {
  const lines = changelog.split("\n");
  const start = lines.findIndex(headsSection(version));
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

// The version after the newest stable tag, or the one given, if no tag has it.
export function next(bump, tags) {
  if (SEMVER.test(bump)) {
    if (tags.includes(bump)) throw new ReleaseError(`v${bump} is already tagged`);
    return bump;
  }
  const stable = tags.filter((v) => SEMVER.test(v) && !parts(v).pre).sort(newest);
  const { major, minor, patch } = parts(stable.at(-1) ?? "0.0.0");
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  if (bump === "patch") return `${major}.${minor}.${patch + 1}`;
  throw new ReleaseError(`${bump} is not patch, minor, major or a version like 1.4.2`);
}

// The changelog with a section for this version on top, one bullet per commit
// subject. Earlier release commits say nothing new. A section written by hand
// before the release stays as it is.
export function changelog(version, subjects, text, date = new Date()) {
  if (!SEMVER.test(version)) throw new ReleaseError(`${version} is not a version like 1.4.2 or 1.5.0-rc.1`);
  const lines = text.split("\n");
  if (lines.some(headsSection(version))) return text;
  const bullets = subjects.filter((subject) => subject.trim() !== "" && !/^Release \d+\.\d+\.\d+\S*$/.test(subject));
  if (bullets.length === 0) throw new ReleaseError("Nothing to release: no commits since the last tag");
  const section = [`## ${version} (${date.toISOString().slice(0, 10)})`, "", ...bullets.map((s) => `- ${s.trim()}`), ""];
  const first = lines.findIndex((line) => line.startsWith("## "));
  if (first === -1) return [text.trimEnd(), "", ...section].join("\n");
  return [...lines.slice(0, first), ...section, ...lines.slice(first)].join("\n");
}

function git(...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function tagged() {
  return git("tag", "--list", "v*")
    .split("\n")
    .filter(Boolean)
    .map((tag) => tag.slice(1));
}

// The subjects of the commits since the closest v* tag behind HEAD, oldest
// first, merges left out.
function subjectsSinceTag() {
  let since;
  try {
    since = git("describe", "--tags", "--abbrev=0", "--match", "v*", "HEAD");
  } catch {
    since = null;
  }
  const log = git("log", "--no-merges", "--reverse", "--format=%s", since ? `${since}..HEAD` : "HEAD");
  return log.split("\n").filter(Boolean);
}

function writeChangelog(version) {
  const file = join(root, "CHANGELOG.md");
  const text = readFileSync(file, "utf8");
  const updated = changelog(version, subjectsSinceTag(), text);
  if (updated === text) return `CHANGELOG.md already has ${version}`;
  writeFileSync(file, updated);
  return `Added ${version} to CHANGELOG.md`;
}

function main([command, arg]) {
  if (command === "version" && arg) return setVersion(arg);
  if (command === "check") return check();
  if (command === "notes" && arg) return notes(arg);
  if (command === "plan" && arg) return planRelease(arg, readFileSync(0, "utf8"));
  if (command === "next" && arg) return next(arg, tagged());
  if (command === "changelog" && arg) return writeChangelog(arg);
  throw new ReleaseError(
    "Usage: pnpm release version <x.y.z> | check | notes <x.y.z> | plan <vX.Y.Z> < tags | next <patch|minor|major|x.y.z> | changelog <x.y.z>",
  );
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
