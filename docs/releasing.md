# Releasing

A release is a `v*` tag on a commit of `main`. Pushing the tag runs [`.github/workflows/release.yml`](../.github/workflows/release.yml), which publishes three things, in this order:

1. The image `ghcr.io/edicthq/edict` for amd64 and arm64, each built on its own runner and booted against Postgres before anything is tagged.
2. `@edicthq/client` on npm, with provenance.
3. A GitHub Release with the notes from [`CHANGELOG.md`](../CHANGELOG.md), plus `compose.yml` and `postgres-init.sh` for new installs.

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

1. Write the notes in `CHANGELOG.md` under a heading with the version, newest first: `## 1.4.2 (2027-02-10)`. Say what changed for the people who run Edict and the agents that use it, and anything an upgrade needs.
2. Set the version: `pnpm release version 1.4.2`.
3. Commit both as `Release 1.4.2`, through a pull request like any change, and merge it.
4. Tag the merged commit and push the tag:

   ```sh
   git switch main && git pull
   git tag -a v1.4.2 -m "Edict 1.4.2"
   git push origin v1.4.2
   ```

5. Watch the Release workflow. If a job fails, fix the cause and re-run the failed jobs: every step can run again, since the image tags are recreated, npm skips a version it already has, and the GitHub Release is edited in place.

Never move or delete a pushed tag. If a release is broken, ship the next patch.

## Before the first release

These are one-time settings outside the repository:

- **npm.** The `@edicthq` organization must exist on npm. npm's trusted publishing can only be configured for a package that exists, so the first publish uses a token: add a granular access token that can publish to `@edicthq` as the `NPM_TOKEN` repository secret. Once `@edicthq/client` is on npm, add a trusted publisher in its settings (repository `edicthq/edict`, workflow `release.yml`), then delete the secret and the token.
- **GHCR.** The first push creates the `edict` package in the `edicthq` organization as private. Make it public in the package's settings, or nobody can pull it.
- **Runners.** The arm64 image builds on `ubuntu-24.04-arm`, which is free for public repositories.
