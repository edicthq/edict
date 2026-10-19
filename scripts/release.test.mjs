import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notes, plan } from "./release.mjs";

describe("plan", () => {
  it("gives the newest release every floating tag and npm's latest", () => {
    assert.deepEqual(plan("1.4.2", ["1.4.1", "1.3.0", "0.9.0"]), {
      version: "1.4.2",
      prerelease: false,
      latest: true,
      imageTags: ["1.4.2", "1.4", "1", "latest"],
      npmTag: "latest",
    });
  });

  it("keeps latest and the major on the newest line when an older line gets a patch", () => {
    const older = plan("1.4.3", ["1.4.2", "1.5.0"]);
    assert.deepEqual(older.imageTags, ["1.4.3", "1.4"]);
    assert.equal(older.latest, false);
    assert.equal(older.npmTag, "release-1.4");
    assert.deepEqual(plan("1.9.1", ["1.9.0", "2.0.0"]).imageTags, ["1.9.1", "1.9", "1"]);
  });

  it("gives major zero no major tag", () => {
    assert.deepEqual(plan("0.1.0", []).imageTags, ["0.1.0", "0.1", "latest"]);
  });

  it("floats a prerelease nowhere and ignores prereleases when finding the newest", () => {
    const rc = plan("1.5.0-rc.1", ["1.4.2"]);
    assert.deepEqual(rc.imageTags, ["1.5.0-rc.1"]);
    assert.equal(rc.prerelease, true);
    assert.equal(rc.latest, false);
    assert.equal(rc.npmTag, "next");
    assert.deepEqual(plan("1.4.3", ["1.4.2", "1.5.0-rc.1"]).imageTags, ["1.4.3", "1.4", "1", "latest"]);
  });

  it("refuses a version that is not one", () => {
    assert.throws(() => plan("1.4", []), /not a version/);
  });
});

describe("notes", () => {
  const changelog = "# Changelog\n\n## 1.5.0 (2027-03-01)\n\nSSO.\n\n## 1.4.2\n\n- Fixes.\n- More fixes.\n\n## 1.4.1\n";

  it("is the section headed with the version, up to the next one", () => {
    assert.equal(notes("1.5.0", changelog), "SSO.");
    assert.equal(notes("1.4.2", changelog), "- Fixes.\n- More fixes.");
  });

  it("refuses a version with no section or an empty one", () => {
    assert.throws(() => notes("1.4.0", changelog), /no "## 1.4.0" section/);
    assert.throws(() => notes("1.4.1", changelog), /section is empty/);
    assert.throws(() => notes("1.4", changelog), /no "## 1.4" section/);
  });
});
