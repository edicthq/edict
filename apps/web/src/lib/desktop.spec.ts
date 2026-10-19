import { describe, expect, it } from "vitest";
import { deepLinkPath } from "./desktop.js";

describe("deepLinkPath", () => {
  it("opens an edict:// issue or project in the organization", () => {
    expect(deepLinkPath("edict://issue/ENG-123", "acme")).toBe("/acme/issue/ENG-123");
    expect(deepLinkPath("edict://project/launch", "acme")).toBe("/acme/projects/launch");
  });

  it("refuses anything else", () => {
    expect(deepLinkPath("https://acme.example.com/issue/ENG-1", "acme")).toBeNull();
    expect(deepLinkPath("edict://team/ENG", "acme")).toBeNull();
    expect(deepLinkPath("edict://issue/", "acme")).toBeNull();
    expect(deepLinkPath("edict://issue/ENG-1%2Fcomments", "acme")).toBeNull();
    expect(deepLinkPath("not a link", "acme")).toBeNull();
  });
});
