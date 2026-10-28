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

// A command to paste, with a button that copies it.
export function CopyBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative overflow-hidden rounded-lg bg-[oklch(0.17_0.008_260)] text-[oklch(0.92_0.005_255)] shadow-[0_0_0_1px_oklch(1_0_0/0.06)]">
      <pre className="px-4 py-3.5 pe-14 font-l-mono text-[12.5px] leading-[1.7] whitespace-pre-wrap break-all">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        aria-label={copied ? 'Copied' : `Copy ${label}`}
        onClick={() => {
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          });
        }}
        className="absolute end-2 top-2 grid size-8 place-items-center rounded-md text-[oklch(0.7_0.01_255)] transition-colors hover:bg-[oklch(1_0_0/0.08)] hover:text-white"
      >
        {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

// The same steps as the app's Connect an agent page (apps/web, connect.tsx).
const clients = [
  {
    id: 'claude-code',
    name: 'Claude Code',
    code: 'claude mcp add --transport http --scope user edict https://edict.example.com/mcp\nclaude mcp login edict',
    after: 'The login opens your browser to approve Claude Code as your agent.',
  },
  {
    id: 'codex',
    name: 'Codex',
    code: '# ~/.codex/config.toml\n[mcp_servers.edict]\nurl = "https://edict.example.com/mcp"\n\n# then\ncodex mcp login edict',
    after: 'The login opens your browser to approve Codex as your agent.',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    code: '// ~/.cursor/mcp.json\n{\n  "mcpServers": {\n    "edict": { "url": "https://edict.example.com/mcp" }\n  }\n}',
    after: 'Cursor shows edict as needing login. Click it, and approve it in the browser.',
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    code: '// opencode.json\n{\n  "mcp": {\n    "edict": { "type": "remote", "url": "https://edict.example.com/mcp" }\n  }\n}\n\n// then: opencode mcp auth edict',
    after: 'The auth command opens your browser to approve OpenCode as your agent.',
  },
  {
    id: 'other',
    name: 'Any MCP client',
    code: 'https://edict.example.com/mcp',
    after: 'Streamable HTTP with OAuth. Paste the URL wherever your client adds a remote server.',
  },
] as const;

// "One URL, any client": the setup for each, a tab apiece.
export function ClientTabs() {
  const [chosen, setChosen] = useState<(typeof clients)[number]['id']>('claude-code');
  const client = clients.find((c) => c.id === chosen)!;
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="MCP clients" className="flex flex-wrap gap-1">
        {clients.map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={c.id === chosen}
            onClick={() => setChosen(c.id)}
            className={`h-8 rounded-md px-3 text-[13px] font-medium transition-colors ${
              c.id === chosen ? 'bg-l-surface text-l-ink shadow-[0_0_0_1px_var(--l-line-2)]' : 'text-l-ink-2 hover:bg-l-hover hover:text-l-ink'
            }`}
          >
            {c.name}
          </button>
        ))}
      </div>
      <div role="tabpanel" aria-label={client.name} className="flex flex-col gap-2">
        <CopyBlock code={client.code} label={`the ${client.name} setup`} />
        <p className="text-[13px] text-l-ink-2">{client.after}</p>
      </div>
    </div>
  );
}
