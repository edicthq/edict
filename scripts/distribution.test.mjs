import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cask, scoop } from "./distribution.mjs";

const sha = "a".repeat(64);

describe("cask", () => {
  it("installs the universal dmg and clears the quarantine flag", () => {
    const text = cask("1.4.2", sha);
    assert.match(text, /version "1\.4\.2"/);
    assert.match(text, new RegExp(`sha256 "${sha}"`));
    assert.match(text, /Edict_#\{version\}_universal\.dmg/);
    assert.match(text, /com\.apple\.quarantine/);
    assert.match(text, /auto_updates true/);
  });

  it("refuses a prerelease or a bad hash", () => {
    assert.throws(() => cask("1.5.0-rc.1", sha), /not a release version/);
    assert.throws(() => cask("1.4.2", "abc"), /not a SHA-256/);
  });
});

describe("scoop", () => {
  it("installs the setup for the current user and knows how to update", () => {
    const manifest = JSON.parse(scoop("1.4.2", sha));
    assert.equal(manifest.version, "1.4.2");
    assert.equal(
      manifest.architecture["64bit"].url,
      "https://github.com/edicthq/edict/releases/download/v1.4.2/Edict_1.4.2_x64-setup.exe#/setup.exe",
    );
    assert.equal(manifest.architecture["64bit"].hash, sha);
    assert.deepEqual(manifest.installer.args, ["/S"]);
    assert.match(manifest.autoupdate.architecture["64bit"].url, /\$version/);
  });
});
