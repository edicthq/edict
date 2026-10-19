import { MarkdownManager } from "@tiptap/markdown";
import { describe, expect, it } from "vitest";
import { markdownExtensions } from "./markdown-extensions.js";

// The editor must give back the markdown it was given (ADR 0009): agents
// write descriptions, people edit them, and nothing should drift.
const manager = new MarkdownManager({ extensions: markdownExtensions(), indentation: { style: "space", size: 2 } });
// Tables come back with their cells padded to line up, the same table.
const roundTrip = (markdown: string) =>
  manager
    .serialize(manager.parse(markdown))
    .trim()
    .replace(/[ \t]+$/gm, "")
    .replace(/ {2,}\|/g, " |");

describe("markdown round trip", () => {
  for (const [name, markdown] of [
    ["paragraphs and marks", "Issues, comments and **files**, with *emphasis*, `code` and ~~strikes~~.\n\nA second paragraph."],
    ["headings", "# One\n\n## Two\n\n### Three"],
    ["a link", "See [the PR](https://github.com/edicthq/edict/pull/1)."],
    ["an attachment image", "![shot.png](/files/0190a000-0000-7000-8000-000000000000/shot.png)"],
    ["bullet and ordered lists", "- one\n- two\n  - nested\n\n1. first\n2. second"],
    ["a task list", "- [ ] open\n- [x] done"],
    ["a code block", "```ts\nconst a = 1;\n```"],
    ["a quote", "> quoted"],
    ["a table", "| A | B |\n| --- | --- |\n| 1 | 2 |"],
  ] as const) {
    it(`keeps ${name}`, () => {
      expect(roundTrip(markdown)).toBe(markdown);
    });
  }
});
