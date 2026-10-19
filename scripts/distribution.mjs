#!/usr/bin/env node
// Renders the desktop app's package manifests for a release: the Homebrew
// cask for the amiralibg/tap tap and the Scoop manifest. The release workflow
// writes them into their repositories once their token is set up
// (docs/releasing.md).
//
//   node scripts/distribution.mjs cask <version> <dmg sha256>
//   node scripts/distribution.mjs scoop <version> <setup.exe sha256>
import { pathToFileURL } from "node:url";

const RELEASES = "https://github.com/edicthq/edict/releases";
const SHA256 = /^[0-9a-f]{64}$/;

function checked(version, sha256) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${version} is not a release version`);
  if (!SHA256.test(sha256)) throw new Error(`${sha256} is not a SHA-256`);
}

// The app is not signed by Apple yet, so the cask clears the quarantine flag
// after installing, and the app opens without "Open Anyway". It updates
// itself, so Homebrew leaves upgrades to it.
export function cask(version, sha256) {
  checked(version, sha256);
  return `cask "edict" do
  version "${version}"
  sha256 "${sha256}"

  url "${RELEASES}/download/v#{version}/Edict_#{version}_universal.dmg"
  name "Edict"
  desc "Issue tracker where AI agents are members of your team"
  homepage "https://edict.dev"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
  depends_on macos: ">= :big_sur"

  app "Edict.app"

  postflight do
    system_command "/usr/bin/xattr", args: ["-dr", "com.apple.quarantine", "#{appdir}/Edict.app"]
  end

  zap trash: [
    "~/Library/Application Support/dev.edict.desktop",
    "~/Library/Caches/dev.edict.desktop",
    "~/Library/Preferences/dev.edict.desktop.plist",
    "~/Library/WebKit/dev.edict.desktop",
  ]
end
`;
}

// Scoop runs the NSIS setup silently; it installs for the current user.
export function scoop(version, sha256) {
  checked(version, sha256);
  const manifest = {
    version,
    description: "Issue tracker where AI agents are members of your team",
    homepage: "https://edict.dev",
    license: "AGPL-3.0-only",
    notes: "Edict updates itself. The app is not signed yet, so Windows may ask before it first opens.",
    architecture: {
      "64bit": {
        url: `${RELEASES}/download/v${version}/Edict_${version}_x64-setup.exe#/setup.exe`,
        hash: sha256,
      },
    },
    installer: { file: "setup.exe", args: ["/S"] },
    uninstaller: { script: 'Start-Process -Wait "$env:LOCALAPPDATA\\Edict\\uninstall.exe" -ArgumentList "/S"' },
    checkver: { github: "https://github.com/edicthq/edict" },
    autoupdate: {
      architecture: { "64bit": { url: `${RELEASES}/download/v$version/Edict_$version_x64-setup.exe#/setup.exe` } },
    },
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [kind, version, sha256] = process.argv.slice(2);
  try {
    if (kind === "cask") process.stdout.write(cask(version, sha256));
    else if (kind === "scoop") process.stdout.write(scoop(version, sha256));
    else throw new Error("Usage: node scripts/distribution.mjs cask|scoop <version> <sha256>");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
