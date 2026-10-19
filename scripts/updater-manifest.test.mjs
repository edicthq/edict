import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { manifest } from "./updater-manifest.mjs";

const files = [
  "Edict_1.4.2_universal.app.tar.gz",
  "Edict_1.4.2_universal.app.tar.gz.sig",
  "Edict_1.4.2_universal.dmg",
  "Edict_1.4.2_x64-setup.exe",
  "Edict_1.4.2_x64-setup.exe.sig",
  "Edict_1.4.2_x64_en-US.msi",
  "Edict_1.4.2_amd64.AppImage",
  "Edict_1.4.2_amd64.AppImage.sig",
  "Edict_1.4.2_amd64.deb",
];

describe("manifest", () => {
  it("points each platform at its signed update bundle in the release", () => {
    const result = manifest("1.4.2", files, (name) => `sig of ${name}\n`, { date: new Date("2027-01-29T12:00:00Z") });
    assert.equal(result.version, "1.4.2");
    assert.equal(result.pub_date, "2027-01-29T12:00:00.000Z");
    assert.deepEqual(Object.keys(result.platforms).sort(), ["darwin-aarch64", "darwin-x86_64", "linux-x86_64", "windows-x86_64"]);
    assert.deepEqual(result.platforms["darwin-aarch64"], {
      signature: "sig of Edict_1.4.2_universal.app.tar.gz.sig",
      url: "https://github.com/edicthq/edict/releases/download/v1.4.2/Edict_1.4.2_universal.app.tar.gz",
    });
    assert.equal(result.platforms["darwin-x86_64"], result.platforms["darwin-aarch64"]);
    assert.equal(
      result.platforms["windows-x86_64"].url,
      "https://github.com/edicthq/edict/releases/download/v1.4.2/Edict_1.4.2_x64-setup.exe",
    );
  });

  it("refuses a release missing a platform or a signature", () => {
    assert.throws(() => manifest("1.4.2", files.filter((f) => !f.endsWith(".AppImage")), () => ""), /AppImage/);
    assert.throws(() => manifest("1.4.2", files.filter((f) => f !== "Edict_1.4.2_x64-setup.exe.sig"), () => ""), /no \.sig/);
  });
});
