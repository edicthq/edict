import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// How markdown looks, read or edited: the Tiptap editor uses it too.
export const markdownClass =
  "min-w-0 break-words text-body leading-[1.55] text-ink " +
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0 " +
  "[&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 " +
  "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ps-5 [&_ol]:ps-5 [&_li]:my-1 " +
  "[&_li::marker]:text-ink-3 " +
  "[&_h1]:mt-4 [&_h1]:text-lg [&_h2]:mt-3 [&_h2]:text-body [&_h3]:mt-3 [&_h3]:text-ui " +
  "[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h1]:text-ink [&_h2]:text-ink [&_h3]:text-ink " +
  "[&_blockquote]:my-2 [&_blockquote]:border-s-2 [&_blockquote]:border-line-strong [&_blockquote]:ps-3 [&_blockquote]:text-ink-2 " +
  "[&_hr]:my-3 [&_hr]:border-line " +
  "[&_a]:underline [&_a]:decoration-line-strong [&_a]:underline-offset-2 hover:[&_a]:decoration-ink " +
  "[&_code]:rounded-[3px] [&_code]:bg-bg [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-code " +
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:bg-bg [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-code [&_pre]:shadow-[inset_0_0_0_1px_var(--line)] [&_pre]:rounded-sm " +
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 " +
  "[&_table]:w-full [&_th]:text-start [&_th]:font-semibold [&_td]:align-top " +
  "[&_table]:text-ui [&_table]:border-collapse [&_th]:border-b [&_th]:border-line-strong [&_td]:border-b [&_td]:border-line [&_th]:p-1.5 [&_td]:p-1.5 " +
  "[&_img]:max-h-[24rem] [&_img]:max-w-full [&_img]:rounded-sm [&_img]:shadow-[0_0_0_1px_var(--line)] " +
  "[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:ps-0 [&_li[data-type=taskItem]]:flex [&_li[data-type=taskItem]]:gap-2 ";

// Descriptions and comments are markdown end to end (ADR 0009). The stored
// text renders here, and the Tiptap editor edits it (markdown-editor.tsx).
// Linked files point at /files paths, which images follow to show a preview
// inline.
export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={`${markdownClass} ${className ?? ""}`}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url) =>
          // Relative /files paths name attachments; http(s) is out on the
          // open web. Anything else — javascript:, data:, bare hosts — is not
          // a link at all.
          url.startsWith("/files/") || /^https?:\/\//i.test(url) ? url : ""
        }
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}
