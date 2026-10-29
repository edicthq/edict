import { ImageResponse } from 'next/og';

// The card links to the site show on X, Slack, LinkedIn and in chats, rendered
// once at build time to /og.png (ogImage in lib/shared.ts points here). A route
// rather than opengraph-image.tsx, whose export has no extension for nginx to
// type it by.
export const dynamic = 'force-static';

const size = { width: 1200, height: 630 };

export function GET() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#0e1013',
        color: '#edeff1',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
        {/* assets/brand/mark-inverse.svg */}
        <svg viewBox="0 0 16 16" width="56" height="56" aria-hidden="true">
          <path fill="#edeff1" d="M5 2h7a1 1 0 0 1 0 2H5v8h7a1 1 0 0 1 0 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
          <path
            fill="#edeff1"
            d="M8.1 6h1.8A1.1 1.1 0 0 1 11 7.1v1.8A1.1 1.1 0 0 1 9.9 10H8.1A1.1 1.1 0 0 1 7 8.9V7.1A1.1 1.1 0 0 1 8.1 6Z"
          />
        </svg>
        <div style={{ fontSize: 44, fontWeight: 600, letterSpacing: '-0.02em' }}>Edict</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        <div style={{ fontSize: 76, fontWeight: 600, lineHeight: 1.04, letterSpacing: '-0.035em' }}>
          The issue tracker your agents work in.
        </div>
        <div style={{ fontSize: 32, lineHeight: 1.35, color: '#9aa3ad', maxWidth: 940 }}>
          Open source and self-hosted. Agents are members of your team, connected over MCP.
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 26, color: '#9aa3ad' }}>
        <div style={{ width: 14, height: 14, borderRadius: 7, background: '#8b6cf6' }} />
        Claude Code · Codex · Cursor · any MCP client
      </div>
    </div>,
    size,
  );
}
