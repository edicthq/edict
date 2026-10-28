'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { downloads, type Platform } from '@/lib/release';

function detect(): Platform | null {
  if (typeof navigator === 'undefined') return null;
  const hint = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.userAgent;
  if (/mac/i.test(hint) && !/iphone|ipad/i.test(navigator.userAgent)) return 'macos';
  if (/win/i.test(hint)) return 'windows';
  if (/linux|x11/i.test(hint) && !/android/i.test(navigator.userAgent)) return 'linux';
  return null;
}

// The one filled button: the download for the visitor's system once known,
// macOS until then (and on phones, where it reads as a pointer to it).
export function DownloadButton({ className = '' }: { className?: string }) {
  const [platform, setPlatform] = useState<Platform>('macos');
  useEffect(() => {
    const found = detect();
    if (found) setPlatform(found);
  }, []);
  const download = downloads.find((d) => d.platform === platform)!;
  return (
    <a
      href={download.primary.href}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-l-ink px-5 text-[15px] font-semibold text-l-on-ink transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.97] ${className}`}
    >
      {download.primary.label}
    </a>
  );
}

// A command or file to paste: a header names it and holds the copy button,
// so the code keeps the full width. Lines are written to fit a phone; the
// odd longer one scrolls rather than breaking mid-word.
export function CopyBlock({ code, label, file }: { code: string; label: string; file: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl bg-[oklch(0.17_0.008_260)] text-[oklch(0.92_0.005_255)] shadow-[0_0_0_1px_oklch(1_0_0/0.07)]">
      <div className="flex h-10 items-center border-b border-[oklch(1_0_0/0.07)] ps-4 pe-1.5">
        <span className="truncate font-l-mono text-[11.5px] text-[oklch(0.62_0.01_255)]">{file}</span>
        <button
          type="button"
          aria-label={copied ? 'Copied' : `Copy ${label}`}
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            });
          }}
          className="ms-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-[oklch(0.72_0.01_255)] transition-colors hover:bg-[oklch(1_0_0/0.08)] hover:text-white"
        >
          {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3.5 font-l-mono text-[11.5px] leading-[1.75] sm:text-[12.5px]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// The same steps as the app's Connect an agent page (apps/web, connect.tsx).
const clients = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    file: 'Terminal',
    code: 'claude mcp add --transport http \\\n  --scope user edict \\\n  https://edict.example.com/mcp\nclaude mcp login edict',
    after: 'The login opens your browser to approve Claude Code as your agent.',
  },
  {
    id: 'codex',
    name: 'Codex',
    file: '~/.codex/config.toml',
    code: '[mcp_servers.edict]\nurl = "https://edict.example.com/mcp"',
    after: 'Then run codex mcp login edict, and approve Codex in the browser.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    file: '~/.cursor/mcp.json',
    code: '{\n  "mcpServers": {\n    "edict": {\n      "url": "https://edict.example.com/mcp"\n    }\n  }\n}',
    after: 'Cursor shows edict as needing login. Click it, and approve it in the browser.',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    file: 'opencode.json',
    code: '{\n  "mcp": {\n    "edict": {\n      "type": "remote",\n      "url": "https://edict.example.com/mcp"\n    }\n  }\n}',
    after: 'Then run opencode mcp auth edict, and approve OpenCode in the browser.',
  },
  {
    id: 'other',
    name: 'Other',
    file: 'MCP server URL',
    code: 'https://edict.example.com/mcp',
    after: 'Any client that speaks Streamable HTTP with OAuth. Paste the URL where it adds a remote server.',
  },
] as const;

// "One URL, any client": the setup for each, a tab apiece.
export function ClientTabs() {
  const [chosen, setChosen] = useState<(typeof clients)[number]['id']>('claude-code');
  const client = clients.find((c) => c.id === chosen)!;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* One row that scrolls on a phone, its edge fading to say there's more. */}
      <div
        role="tablist"
        aria-label="MCP clients"
        className="flex gap-1 overflow-x-auto [scrollbar-width:none] max-sm:[mask-image:linear-gradient(to_right,black_80%,transparent)] max-sm:pe-8"
      >
        {clients.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === chosen}
            onClick={() => setChosen(c.id)}
            className={`h-8 shrink-0 rounded-md px-3 text-[13px] font-medium transition-colors ${
              c.id === chosen ? 'bg-l-surface text-l-ink shadow-[0_0_0_1px_var(--l-line-2)]' : 'text-l-ink-2 hover:bg-l-hover hover:text-l-ink'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={client.name} className="flex flex-col gap-2">
        <CopyBlock code={client.code} file={client.file} label={`the ${client.name} setup`} />
        <p className="text-[13px] text-l-ink-2">{client.after}</p>
      </div>
    </div>
  );
}
