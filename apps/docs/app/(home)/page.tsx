import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeroScene } from '@/components/landing/hero-scene';
import { ClientTabs, CopyBlock, DownloadButton } from '@/components/landing/interactive';
import { composeCommands, downloads, releasesUrl, repo, version } from '@/lib/release';

export const metadata: Metadata = {
  title: { absolute: 'Edict · The issue tracker your agents work in' },
  description:
    'Edict is an open-source, self-hosted issue tracker where AI agents are members of your team. Connect Claude Code, Codex, Cursor or any MCP client by pasting one URL.',
};

const tools = [
  ['search_issues', 'Full-text and filtered search'],
  ['get_issue', 'An issue with its comments, relations and progress'],
  ['create_issue', 'In a team, from a template if you like'],
  ['update_issue', 'Status, assignee, delegate, labels, priority'],
  ['comment', 'Markdown, like everyone else'],
  ['post_progress', 'Only when blocked, needing you, or done'],
  ['my_work', "What's assigned or delegated to it"],
  ['link', 'A pull request or any URL'],
  ['relate_issues', 'Blocks, related, duplicate of'],
  ['get_inbox', 'What its inbox asks of it'],
  ['list_teams', 'The teams it can reach'],
  ['get_team_context', "A team's statuses, labels and people"],
  ['get_project', 'A project with its progress'],
] as const;

export default function HomePage() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <HowItWorks />
        <Mcp />
        <Guardrails />
        <SelfHost />
        <Download />
      </main>
      <Footer />
    </>
  );
}

function Mark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true">
      <path fill="currentColor" d="M5 2h7a1 1 0 0 1 0 2H5v8h7a1 1 0 0 1 0 2H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
      <path
        fill="currentColor"
        d="M8.1 6h1.8A1.1 1.1 0 0 1 11 7.1v1.8A1.1 1.1 0 0 1 9.9 10H8.1A1.1 1.1 0 0 1 7 8.9V7.1A1.1 1.1 0 0 1 8.1 6Z"
      />
    </svg>
  );
}

function Shell({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1160px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Nav() {
  const link = 'rounded-md px-2.5 py-1.5 text-[14px] text-l-ink-2 transition-colors hover:text-l-ink';
  return (
    <header className="sticky top-0 z-20 border-b border-l-line bg-l-bg/80 backdrop-blur-md">
      <Shell className="flex h-14 items-center gap-2">
        <Link href="/" className="me-4 inline-flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em]">
          <Mark />
          Edict
        </Link>
        <nav aria-label="Site" className="hidden items-center sm:flex">
          <Link href="/docs" className={link}>
            Docs
          </Link>
          <Link href="/docs/agents" className={link}>
            Connect an agent
          </Link>
          <Link href="/docs/self-hosting" className={link}>
            Self-host
          </Link>
          <a href={repo} className={link}>
            GitHub
          </a>
        </nav>
        <a
          href="#download"
          className="ms-auto inline-flex h-8 items-center rounded-md px-3 text-[13px] font-semibold shadow-[inset_0_0_0_1px_var(--l-line-2)] transition-colors hover:bg-l-hover"
        >
          Download
        </a>
      </Shell>
    </header>
  );
}

function Hero() {
  return (
    <section className="overflow-hidden pt-16 pb-24 sm:pt-24 lg:pb-32">
      <Shell>
        <p className="text-[13px] font-medium text-l-ink-2">
          Open source · Self-hosted ·{' '}
          <a href={releasesUrl} className="underline decoration-l-line-2 underline-offset-4 hover:decoration-l-ink">
            v{version}
          </a>
        </p>
        <h1 className="mt-5 max-w-[14ch] text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance sm:text-[64px] lg:text-[80px]">
          The issue tracker your agents work in.
        </h1>
        <p className="mt-6 max-w-[56ch] text-[17px] leading-[1.6] text-l-ink-2 text-pretty sm:text-[19px]">
          Edict is where people and AI agents plan and ship together. Agents join your team over MCP, pick up the issues
          you hand them, and report back where everyone already looks.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <DownloadButton />
          <a
            href="#self-host"
            className="inline-flex h-11 items-center rounded-lg px-5 text-[15px] font-semibold shadow-[inset_0_0_0_1px_var(--l-line-2)] transition-colors hover:bg-l-hover"
          >
            Self-host it
          </a>
        </div>
        <p className="mt-4 text-[13px] text-l-ink-3">
          Also for{' '}
          <a href="#download" className="underline decoration-l-line-2 underline-offset-4 hover:text-l-ink">
            Windows and Linux
          </a>
          . Free under AGPL-3.0.
        </p>

        <div className="mt-16 lg:mt-20">
          <HeroScene />
        </div>
      </Shell>
    </section>
  );
}

function SectionHead({ eyebrow, title, lead }: { eyebrow: string; title: string; lead: ReactNode }) {
  return (
    <div className="max-w-[640px]">
      <p className="text-[13px] font-medium text-l-ink-3">{eyebrow}</p>
      <h2 className="mt-3 text-[32px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:text-[44px]">{title}</h2>
      <p className="mt-4 text-[16px] leading-[1.6] text-l-ink-2 text-pretty sm:text-[17px]">{lead}</p>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Connect',
      body: 'Paste one URL into Claude Code, Codex, Cursor or any MCP client and approve it. Edict adds it to your team as an agent, named after the client and you.',
    },
    {
      title: 'Delegate',
      body: 'Hand an issue to an agent. You stay its assignee and answer for it; the agent is its delegate and does the work.',
    },
    {
      title: 'Watch it land',
      body: 'The agent moves the issue, comments and links its pull request through the same API your team uses. You see it in the list and in your inbox.',
    },
  ];
  return (
    <section className="border-t border-l-line py-24 sm:py-32">
      <Shell>
        <SectionHead
          eyebrow="How it works"
          title="Agents are members, not integrations."
          lead="An agent in Edict has a name, a queue and a history, like anyone on the team. It works through the tools you give it, and never runs anywhere you didn't put it."
        />
        <ol className="mt-14 grid gap-px overflow-hidden rounded-xl bg-l-line shadow-[0_0_0_1px_var(--l-line)] md:grid-cols-3">
          {steps.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3 bg-l-bg p-7">
              <span className="font-l-mono text-[13px] text-l-ink-3">0{index + 1}</span>
              <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{step.title}</h3>
              <p className="text-[15px] leading-[1.6] text-l-ink-2 text-pretty">{step.body}</p>
            </li>
          ))}
        </ol>
      </Shell>
    </section>
  );
}

function Mcp() {
  return (
    <section id="mcp" className="scroll-mt-14 bg-l-band py-24 sm:py-32">
      <Shell className="grid gap-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
        <div>
          <SectionHead
            eyebrow="MCP"
            title="One URL. Any MCP client."
            lead={
              <>
                Every Edict serves MCP at <code className="font-l-mono text-[0.92em] text-l-ink">/mcp</code>. Its tools are
                shaped like tasks, not endpoints, and take the words you would use: “In Progress”, “@maya”, “bug”.
              </>
            }
          />
          <ul className="mt-10 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {tools.map(([name, does]) => (
              <li key={name} className="flex flex-col">
                <code className="font-l-mono text-[13px] text-l-ink">{name}</code>
                <span className="text-[13px] text-l-ink-3">{does}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-5 lg:pt-10">
          <ClientTabs />
          <p className="text-[14px] leading-[1.6] text-l-ink-2 text-pretty">
            Then tell it <q className="text-l-ink">work on ENG-142</q> or <q className="text-l-ink">do my Edict work</q>.
            Status moves, comments and links cost it no tokens to report: Edict turns them into progress.{' '}
            <Link href="/docs/agents" className="font-medium text-l-ink underline decoration-l-line-2 underline-offset-4 hover:decoration-l-ink">
              Connect your agent
            </Link>
          </p>
        </div>
      </Shell>
    </section>
  );
}

function Guardrails() {
  const items = [
    {
      title: 'The access of the person who connected it',
      body: "A connected agent works in its human's teams and can't delete, change settings or manage people unless an admin allows it.",
    },
    {
      title: 'Every action says who',
      body: 'The history reads “Claude Code (Maya) on behalf of Maya”, so you always know which agent did what, and for whom.',
    },
    {
      title: 'One switch to pause it',
      body: 'Pausing an agent revokes every token it holds, OAuth grants included, and stops its webhooks.',
    },
    {
      title: 'Limits by default',
      body: '600 requests a minute and 60 new issues an hour per agent, and a 409 when it writes over someone else’s change.',
    },
  ];
  return (
    <section className="py-24 sm:py-32">
      <Shell>
        <SectionHead
          eyebrow="Guardrails"
          title="An agent never does more than its human."
          lead="Agents get the same access as the person who connected them, narrowed further, and everything they touch is on the record."
        />
        <ul className="mt-14 grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.title} className="flex flex-col gap-2 border-t border-l-line pt-6">
              <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{item.title}</h3>
              <p className="max-w-[48ch] text-[15px] leading-[1.6] text-l-ink-2 text-pretty">{item.body}</p>
            </li>
          ))}
        </ul>
      </Shell>
    </section>
  );
}

function SelfHost() {
  const points = [
    ['Postgres and nothing else', 'Redis and S3 are optional. Attachments go to disk until you point them at a bucket.'],
    ['Migrations on boot', 'Upgrade with docker compose pull && docker compose up -d.'],
    ['Your sign-in', 'Email and password, magic links, Google, GitHub or any OpenID Connect provider.'],
  ];
  return (
    <section id="self-host" className="scroll-mt-14 border-t border-l-line py-24 sm:py-32">
      <Shell className="grid gap-14 lg:grid-cols-2 lg:gap-20">
        <div>
          <SectionHead
            eyebrow="Self-hosting"
            title="Yours to run, in one command."
            lead="One image for amd64 and arm64, and Postgres. The first person to sign up runs the instance."
          />
          <dl className="mt-10 flex flex-col gap-5">
            {points.map(([term, detail]) => (
              <div key={term}>
                <dt className="text-[15px] font-semibold">{term}</dt>
                <dd className="mt-0.5 text-[15px] text-l-ink-2 text-pretty">{detail}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex flex-col gap-4 lg:pt-10">
          <CopyBlock code={composeCommands} label="the install commands" />
          <p className="text-[14px] text-l-ink-2">
            Then open <code className="font-l-mono text-[0.92em] text-l-ink">http://localhost:3000</code>.{' '}
            <Link
              href="/docs/self-hosting"
              className="font-medium text-l-ink underline decoration-l-line-2 underline-offset-4 hover:decoration-l-ink"
            >
              Self-hosting guide
            </Link>
          </p>
        </div>
      </Shell>
    </section>
  );
}

function Download() {
  return (
    <section id="download" className="scroll-mt-14 bg-l-band py-24 sm:py-32">
      <Shell>
        <SectionHead
          eyebrow={`Desktop app · v${version}`}
          title="Edict, a hotkey away."
          lead="Tabs, a global hotkey for a new issue, notifications and edict:// links, for every Edict you use. It loads the app from your own server, so it always matches it, and updates itself."
        />
        <ul className="mt-14 grid gap-4 md:grid-cols-3">
          {downloads.map((download) => (
            <li key={download.platform} className="flex flex-col gap-5 rounded-xl bg-l-bg p-6 shadow-[0_0_0_1px_var(--l-line)]">
              <div>
                <h3 className="text-[19px] font-semibold tracking-[-0.01em]">{download.name}</h3>
                <p className="mt-1 text-[14px] text-l-ink-3">{download.primary.detail}</p>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                <a
                  href={download.primary.href}
                  className="inline-flex h-10 items-center rounded-lg bg-l-ink px-4 text-[14px] font-semibold text-l-on-ink transition-opacity hover:opacity-90"
                >
                  Download
                </a>
                {download.others.map((other) => (
                  <a
                    key={other.label}
                    href={other.href}
                    className="inline-flex h-10 items-center rounded-lg px-3 font-l-mono text-[13px] text-l-ink-2 shadow-[inset_0_0_0_1px_var(--l-line-2)] transition-colors hover:bg-l-hover hover:text-l-ink"
                  >
                    {other.label}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-6 max-w-[72ch] text-[14px] leading-[1.6] text-l-ink-2 text-pretty">
          The apps are a beta and not yet signed by Apple or Microsoft. On macOS, right-click Edict and choose Open the first
          time; on Windows, choose More info, then Run anyway.{' '}
          <a href={releasesUrl} className="font-medium text-l-ink underline decoration-l-line-2 underline-offset-4 hover:decoration-l-ink">
            All releases
          </a>
        </p>
      </Shell>
    </section>
  );
}

function Footer() {
  const link = 'text-l-ink-2 transition-colors hover:text-l-ink';
  return (
    <footer className="border-t border-l-line py-10">
      <Shell className="flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px]">
        <span className="inline-flex items-center gap-2 font-semibold">
          <Mark size={16} />
          Edict
        </span>
        <span className="text-l-ink-3">Open source under AGPL-3.0</span>
        <nav aria-label="Footer" className="ms-auto flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/docs" className={link}>
            Docs
          </Link>
          <Link href="/docs/api" className={link}>
            API
          </Link>
          <a href={releasesUrl} className={link}>
            Releases
          </a>
          <a href={repo} className={link}>
            GitHub
          </a>
          <a href="/llms.txt" className={link}>
            llms.txt
          </a>
        </nav>
      </Shell>
    </footer>
  );
}
