import type { AnyExtension } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { TableKit } from "@tiptap/extension-table";
import { Markdown } from "@tiptap/markdown";
import StarterKit from "@tiptap/starter-kit";

// What the editor understands of markdown (ADR 0009): CommonMark, and the
// GitHub extensions people and agents write, tables and task lists. Text is
// stored as markdown; the editor reads and writes it through @tiptap/markdown,
// so a description an agent wrote comes back out the same.
export function markdownExtensions(): AnyExtension[] {
  return [
    StarterKit.configure({
      // Links stay links; opening one is a click on the rendered text.
      link: { openOnClick: false, autolink: true, protocols: ["http", "https"] },
      heading: { levels: [1, 2, 3] },
    }),
    // Attachments are images at their /files path (ADR 0020).
    Image.configure({ inline: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TableKit,
    Markdown.configure({ indentation: { style: "space", size: 2 } }),
  ];
}
