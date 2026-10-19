import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useRef } from "react";
import { markdownExtensions } from "../lib/markdown-extensions.js";
import { markdownClass } from "./markdown.js";

// Descriptions and comments, edited in Tiptap and stored as markdown (ADR
// 0009). The editor takes and gives markdown; what it shows is the same as
// the rendered text, so editing looks like reading.
export function MarkdownEditor({
  id,
  label,
  value,
  onChange,
  onBlur,
  onSubmit,
  onEscape,
  placeholder,
  autoFocus,
  className,
}: {
  id?: string;
  // The accessible name, as a field label would give it.
  label: string;
  value: string;
  onChange?: (markdown: string) => void;
  onBlur?: (markdown: string) => void;
  // ⌘/Ctrl-Enter.
  onSubmit?: () => void;
  onEscape?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  // The editor keeps the options it was made with, so it calls the latest
  // handlers through this.
  const handlers = useRef({ onChange, onBlur, onSubmit, onEscape });
  handlers.current = { onChange, onBlur, onSubmit, onEscape };
  const editor = useEditor({
    extensions: [...markdownExtensions(), Placeholder.configure({ placeholder: placeholder ?? "" })],
    content: value,
    contentType: "markdown",
    autofocus: autoFocus ? "end" : false,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": label,
        class: `${markdownClass} min-h-[inherit] focus-visible:outline-none ${className ?? ""}`,
      },
      handleKeyDown: (_view, event) => {
        const { onSubmit, onEscape } = handlers.current;
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && onSubmit) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        if (event.key === "Escape" && onEscape) {
          // The peek closes on Escape; here it only leaves the field.
          event.stopPropagation();
          onEscape();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => handlers.current.onChange?.(editor.getMarkdown()),
    onBlur: ({ editor }) => handlers.current.onBlur?.(editor.getMarkdown()),
  });

  // A newer value from outside (realtime, a merge, a sent comment cleared)
  // replaces the text, unless the person is typing in it.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if ((editor.isFocused && value !== "") || editor.getMarkdown() === value) return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
  }, [editor, value]);

  return <EditorContent editor={editor} />;
}

// Leaves the field, as Escape does in a text box.
export function blurActive() {
  (document.activeElement as HTMLElement | null)?.blur();
}
