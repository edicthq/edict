# Releasing

A release is a `v*` tag on a commit of `main`. To cut one, run **Cut a release** in the Actions tab, or `gh workflow run cut-release.yml -f bump=patch` ([below](#cutting-a-release)). The tag runs [`.github/workflows/release.yml`](../.github/workflows/release.yml), which publishes four things, in this order:

1. The image `ghcr.io/edicthq/edict` for amd64 and arm64, each built on its own runner and booted against Postgres before anything is tagged.
2. `@edicthq/client` on npm, with provenance.
3. The desktop app for macOS (one universal `.dmg`), Windows (`-setup.exe` and `.msi`) and Linux (`.AppImage`, `.deb`, `.rpm`), unsigned for the operating systems but signed for its own updater, once the updater's key is set up (below).
4. A GitHub Release with the notes from [`CHANGELOG.md`](../CHANGELOG.md), plus `compose.yml` and `postgres-init.sh` for new installs, the desktop installers, and `latest.json` for the desktop app's updater.

The GitHub Release comes last because the update check and the desktop updater read GitHub releases: a release they can see always has its image and client out.

Nothing is published unless all of CI passes on the tagged commit, and the tag, the package versions and the changelog agree.

## Versions

Versions follow semver, and one number covers everything that ships. The root `package.json` holds it; every workspace package carries a copy, because the server reports its own (`apps/server/src/version.ts`, shown on the instance page and in the MCP handshake) and the client publishes with its own. `pnpm release version <x.y.z>` sets them all, and CI fails if any copy drifts.

The image gets the exact version as a tag, and floating tags when it is the newest release they cover:

| Release | Tags |
|---|---|
| `1.4.2`, the newest | `1.4.2`, `1.4`, `1`, `latest` |
| `1.4.3`, after `1.5.0` is out | `1.4.3`, `1.4` |
| `0.3.0` | `0.3.0`, `0.3`, `latest` (no `0`: every 0.x minor may break) |
| `1.5.0-rc.1` | `1.5.0-rc.1` only, a GitHub prerelease, npm's `next` |

So a patch to an older line never takes `latest` or the major back. npm's `latest` follows the same rule; an older line publishes under `release-1.4`.

## Cutting a release

In the Actions tab, open **Cut a release**, choose the part of the version that goes up (patch, minor or major, or type an exact version such as `1.5.0-rc.1`) and run it on `main`. From a terminal:

```sh
gh workflow run cut-release.yml -f bump=patch
gh workflow run cut-release.yml -f version=1.5.0-rc.1
```

The workflow ([`.github/workflows/cut-release.yml`](../.github/workflows/cut-release.yml)):

1. Takes the newest `v*` tag and bumps it, or takes the exact version and refuses one that is already tagged (`pnpm release next patch` prints what it will pick).
2. Adds a section for the version to the top of `CHANGELOG.md`, `## 1.4.2 (2027-02-10)`, with one bullet per commit subject since the last tag. Merge commits and earlier `Release x.y.z` commits are left out (`pnpm release changelog 1.4.2` does the same locally). If a section for that version is already on `main`, it is kept as written.
3. Sets the version everywhere (`pnpm release version 1.4.2`), commits it as `Release 1.4.2` straight to `main`, tags that commit `v1.4.2` and pushes both together.
4. Starts the Release workflow on the tag. A tag pushed with the workflow's own token starts no workflow, so the Release workflow is dispatched on the tag instead, and runs exactly as if the tag had been pushed by hand.

Commit subjects make plain notes. For a release that deserves better notes, write its section by hand first, `## 1.5.0` with whatever it needs to say, and land it on `main`; the workflow keeps it.

Then watch the Release workflow. If a job fails, fix the cause and re-run the failed jobs: every step can run again, since the image tags are recreated, npm skips a version it already has, and the GitHub Release is edited in place.

Never move or delete a pushed tag. If a release is broken, ship the next patch.

### By hand

The workflow only automates these steps, and they still work:

1. Write the notes in `CHANGELOG.md` under a heading with the version, newest first: `## 1.4.2 (2027-02-10)`. Say what changed for the people who run Edict and the agents that use it, and anything an upgrade needs. `pnpm release changelog 1.4.2` starts it from the commit subjects.
2. Set the version: `pnpm release version 1.4.2`.
3. Commit both as `Release 1.4.2`, through a pull request like any change, and merge it.
4. Tag the merged commit and push the tag, which starts the Release workflow:

   ```sh
   git switch main && git pull
   git tag -a v1.4.2 -m "Edict 1.4.2"
   git push origin v1.4.2
   ```

   Or, once the `Release 1.4.2` commit is on `main`, run **Cut a release** with the version `1.4.2`: with nothing left to change, it only tags and starts the release.

## The desktop app's updates

An installed desktop app checks for a newer release at launch and then every six hours while it is open, and **Check for updates…** in its menu checks at once. It reads `latest.json` from the latest GitHub release, downloads the update, verifies it against the key built into the app and asks to restart. On macOS and Linux the update is installed before it asks, so **Later** still gets it at the next launch; on Windows, installing quits the app, so it waits for **Restart**. While an update waits, the quiet checks stop, and the menu item offers the restart again.

## Before the first release

These are one-time settings outside the repository:

- **Cutting from Actions.** **Cut a release** pushes to `main` and creates the tag with the workflow's own token, which asks for `contents: write` and `actions: write` itself, so the repository's default workflow permissions can stay read-only. If `main` or `v*` tags ever get a branch protection rule or a ruleset, let GitHub Actions bypass it, or the push is refused.

- **npm.** The `@edicthq` organization must exist on npm. Trusted publishing is configured on a package that exists, so the first publish uses a short-lived token:
  1. On npmjs.com, under Access Tokens, generate a granular access token: read and write on the `@edicthq` scope only, no organization access, no IP ranges (GitHub's runners have none fixed), "bypass two-factor authentication" on (the workflow cannot answer a 2FA prompt), and the shortest expiry that covers the first release, such as 7 days.
  2. In the GitHub repository's settings, under Environments, create an environment named `npm`. Limit its deployment branches and tags to the tag rule `v*`, and add the token as its `NPM_TOKEN` secret. Only the release's npm job runs in that environment, and only for a release tag.
  3. Once `@edicthq/client` is on npm, add a trusted publisher in the package's settings: GitHub Actions, organization `edicthq`, repository `edict`, workflow `release.yml`, environment `npm`. Its first publish has to happen within two days of adding it.
  4. Delete the `NPM_TOKEN` secret and revoke the token. npm ends direct publishing with tokens in January 2027 anyway.
- **GHCR.** The first push creates the `edict` package in the `edicthq` organization as private. Make it public in the package's settings, or nobody can pull it.
- **Runners.** The arm64 image builds on `ubuntu-24.04-arm`, which is free for public repositories.
- **The desktop app's updater key.** The desktop jobs stay off, and a release ships without installers, until this exists. The Tauri updater checks every update against a public key built into the app, so the private key must never leak and never be lost: an app signed with a lost key can never update again.
  1. On your own machine, run `pnpm --filter @edicthq/desktop tauri signer generate -w ~/.tauri/edict-updater.key` and give it a password. Keep the key file and the password in your password manager.
  2. In the repository's settings, create an environment named `desktop`, limited to the tag rule `v*` like `npm`. Add the contents of `~/.tauri/edict-updater.key` as its `TAURI_SIGNING_PRIVATE_KEY` secret and the password as `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
  3. Add the contents of `~/.tauri/edict-updater.key.pub` as the repository variable `TAURI_UPDATER_PUBKEY`. The next release builds the apps, puts the key in them and publishes `latest.json`, which installed apps read to update.
- **Homebrew and Scoop.** Once the desktop app ships, a release can update the Homebrew cask and the Scoop manifest itself (`scripts/distribution.mjs` writes them). The tap is `amiralibg/tap`, which Homebrew reads from the repository `amiralibg/homebrew-tap`.
  1. Create that repository, and a Scoop bucket repository if you want one, such as `amiralibg/scoop-bucket`.
  2. Create a fine-grained GitHub token with read and write access to the contents of only those repositories. In a `distribution` environment limited to `v*` tags, add it as the `DISTRIBUTION_TOKEN` secret.
  3. Set the repository variables `HOMEBREW_TAP_REPO` (`amiralibg/homebrew-tap`) and, for Scoop, `SCOOP_BUCKET_REPO`.
- **winget.** Submitting to `microsoft/winget-pkgs` is a pull request reviewed by Microsoft, so it stays by hand: after a release, run `wingetcreate update Edict.Edict --version <x.y.z> --urls <the -setup.exe URL> --submit` (the first time, `wingetcreate new` with the same URL).
