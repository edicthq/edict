import type { Metadata } from 'next';
import { Database, Gauge, History, LogIn, Pause, RefreshCw, ShieldCheck, type LucideIcon } from 'lucide-react';
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
    <section className="overflow-hidden pt-12 pb-16 sm:pt-24 sm:pb-24 lg:pb-32">
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

        <div className="mt-12 sm:mt-16 lg:mt-20">
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
      <h2 className="mt-2.5 text-[30px] leading-[1.1] font-semibold tracking-[-0.025em] text-balance sm:mt-3 sm:text-[44px]">
        {title}
      </h2>
      <p className="mt-3.5 text-[16px] leading-[1.6] text-l-ink-2 text-pretty sm:mt-4 sm:text-[17px]">{lead}</p>
    </div>
  );
}

// Sections breathe less on a phone, where every pixel of height is a scroll.
const sectionY = 'py-16 sm:py-24 lg:py-32';

// A small tile that anchors a point of text, so a list of them scans.
function Point({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-l-surface text-l-ink-2 shadow-[0_0_0_1px_var(--l-line)]">
        <Icon aria-hidden="true" className="size-[17px]" strokeWidth={1.75} />
      </span>
      <div className="min-w-0 pt-1.5">
        <h3 className="text-[15.5px] leading-[1.35] font-semibold tracking-[-0.005em]">{title}</h3>
        <p className="mt-1 text-[15px] leading-[1.55] text-l-ink-2 text-pretty">{children}</p>
      </div>
    </li>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: 'Connect',
      body: 'Paste one URL into Claude Code, Codex, Cursor or any MCP client and approve it. It joins your team as an agent, named after the client and you.',
    },
    {
      title: 'Delegate',
      body: 'Hand an issue to an agent. You stay its assignee and answer for it; the agent is its delegate and does the work.',
    },
    {
      title: 'Watch it land',
      body: 'The agent moves the issue, comments and links its pull request. You see it in the list and in your inbox.',
    },
  ];
  return (
    <section className={`border-t border-l-line ${sectionY}`}>
      <Shell>
        <SectionHead
          eyebrow="How it works"
          title="Agents are members, not integrations."
          lead="An agent in Edict has a name, a queue and a history, like anyone on the team. It works through the tools you give it, and runs only where you put it."
        />
        {/* A timeline: down the side on a phone, across on a wide screen. */}
        <ol className="mt-10 grid gap-7 md:mt-14 md:grid-cols-3 md:gap-8">
          {steps.map((step, index) => (
            <li key={step.title} className="relative flex gap-4 md:flex-col md:gap-5">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="absolute start-4 top-10 -bottom-5 w-px bg-l-line-2 md:start-12 md:-end-6 md:top-4 md:bottom-auto md:h-px md:w-auto"
                />
              ) : null}
              <span className="relative grid size-8 shrink-0 place-items-center rounded-full bg-l-bg text-[13px] font-semibold tabular-nums shadow-[inset_0_0_0_1px_var(--l-line-2)]">
                {index + 1}
              </span>
              <div className="min-w-0 pt-1 md:pt-0">
                <h3 className="text-[17px] font-semibold tracking-[-0.01em] sm:text-[19px]">{step.title}</h3>
                <p className="mt-1.5 text-[15px] leading-[1.55] text-l-ink-2 text-pretty">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Shell>
    </section>
  );
}

function Mcp() {
  return (
    <section id="mcp" className={`scroll-mt-14 bg-l-band ${sectionY}`}>
      {/* On a phone: what it is, then how to connect, then the tools. On a
          wide screen the setup sits beside the other two. */}
      <Shell className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-x-20 lg:gap-y-10">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
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
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:pt-10">
          <ClientTabs />
          <p className="text-[14px] leading-[1.6] text-l-ink-2 text-pretty">
            Then tell it <q className="text-l-ink">work on ENG-142</q> or <q className="text-l-ink">do my Edict work</q>.
            Moving the issue, commenting and linking are its progress report, at no extra tokens.{' '}
            <Link href="/docs/agents" className="font-medium text-l-ink underline decoration-l-line-2 underline-offset-4 hover:decoration-l-ink">
              Connect your agent
            </Link>
          </p>
        </div>
        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <p className="text-[13px] font-medium text-l-ink-3">{tools.length} tools</p>
          {/* Names only on a phone, as chips; with what each does from sm up. */}
          <ul className="mt-3 flex flex-wrap gap-1.5 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:gap-y-2.5">
            {tools.map(([name, does]) => (
              <li
                key={name}
                className="rounded-md bg-l-surface px-2 py-1 shadow-[0_0_0_1px_var(--l-line)] sm:flex sm:flex-col sm:rounded-none sm:bg-transparent sm:p-0 sm:shadow-none"
              >
                <code className="font-l-mono text-[12px] text-l-ink sm:text-[13px]">{name}</code>
                <span className="hidden text-[13px] text-l-ink-3 sm:block">{does}</span>
              </li>
            ))}
          </ul>
        </div>
      </Shell>
    </section>
  );
}

function Guardrails() {
  return (
    <section className={sectionY}>
      <Shell>
        <SectionHead
          eyebrow="Guardrails"
          title="An agent never does more than its human."
          lead="Agents get the access of the person who connected them, narrowed further, and everything they touch is on the record."
        />
        <ul className="mt-10 grid gap-x-12 gap-y-7 sm:mt-14 sm:grid-cols-2 sm:gap-y-9">
          <Point icon={ShieldCheck} title="Its human's access, and less">
            It works in its human's teams, and can't delete, change settings or manage people unless an admin allows it.
          </Point>
          <Point icon={History} title="Every action says who">
            The history reads “Claude Code (Maya) on behalf of Maya”, so you know which agent did what, and for whom.
          </Point>
          <Point icon={Pause} title="One switch to pause it">
            Pausing an agent revokes every token it holds, OAuth grants included, and stops its webhooks.
          </Point>
          <Point icon={Gauge} title="Limits by default">
            600 requests a minute and 60 new issues an hour per agent, and a conflict when it writes over a newer change.
          </Point>
        </ul>
      </Shell>
    </section>
  );
}

function SelfHost() {
  return (
    <section id="self-host" className={`scroll-mt-14 border-t border-l-line ${sectionY}`}>
      <Shell className="grid gap-10 lg:grid-cols-2 lg:gap-20">
        <div>
          <SectionHead
            eyebrow="Self-hosting"
            title="Yours to run, in one command."
            lead="One image for amd64 and arm64, and Postgres. The first person to sign up runs the instance."
          />
          <ul className="mt-9 flex flex-col gap-6">
            <Point icon={Database} title="Postgres and nothing else">
              Redis and S3 are optional. Attachments go to disk until you point them at a bucket.
            </Point>
            <Point icon={RefreshCw} title="Migrations on boot">
              Upgrading is pulling the new image and starting it again.
            </Point>
            <Point icon={LogIn} title="Your sign-in">
              Email and password, magic links, Google, GitHub or any OpenID Connect provider.
            </Point>
          </ul>
        </div>
        <div className="flex min-w-0 flex-col gap-3 lg:pt-10">
          <CopyBlock code={composeCommands} file="Terminal" label="the install commands" />
          <p className="text-[14px] text-l-ink-2">
            Then open <code className="font-l-mono text-[0.92em] text-l-ink">localhost:3000</code>.{' '}
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
    <section id="download" className={`scroll-mt-14 bg-l-band ${sectionY}`}>
      <Shell>
        <SectionHead
          eyebrow={`Desktop app · v${version}`}
          title="Edict, a hotkey away."
          lead="Tabs, a global hotkey for a new issue, notifications and edict:// links, for every Edict you use. It loads the app from your server, so the two always match, and it updates itself."
        />
        {/* A row per system on a phone, a card each on a wide screen. */}
        <ul className="mt-10 flex flex-col overflow-hidden rounded-xl bg-l-bg shadow-[0_0_0_1px_var(--l-line)] max-md:divide-y max-md:divide-l-line md:mt-14 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:rounded-none md:bg-transparent md:shadow-none">
          {downloads.map((download) => (
            <li
              key={download.platform}
              className="flex items-center gap-4 px-5 py-4 md:flex-col md:items-stretch md:gap-5 md:rounded-xl md:bg-l-bg md:p-6 md:shadow-[0_0_0_1px_var(--l-line)]"
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-[16px] font-semibold tracking-[-0.01em] md:text-[19px]">{download.name}</h3>
                <p className="mt-0.5 text-[13px] text-l-ink-3 md:mt-1 md:text-[14px]">
                  {download.primary.detail}
                  {download.others.map((other) => (
                    <span key={other.label} className="md:hidden">
                      {' · '}
                      <a href={other.href} className="underline decoration-l-line-2 underline-offset-2 hover:text-l-ink">
                        {other.label}
                      </a>
                    </span>
                  ))}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2 md:mt-auto">
                <a
                  href={download.primary.href}
                  aria-label={download.primary.label}
                  className="inline-flex h-9 items-center rounded-lg bg-l-ink px-3.5 text-[14px] font-semibold text-l-on-ink transition-opacity hover:opacity-90 md:h-10 md:px-4"
                >
                  Download
                </a>
                {download.others.map((other) => (
                  <a
                    key={other.label}
                    href={other.href}
                    className="hidden h-10 items-center rounded-lg px-3 font-l-mono text-[13px] text-l-ink-2 shadow-[inset_0_0_0_1px_var(--l-line-2)] transition-colors hover:bg-l-hover hover:text-l-ink md:inline-flex"
                  >
                    {other.label}
                  </a>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-5 max-w-[72ch] text-[13.5px] leading-[1.6] text-l-ink-2 text-pretty sm:mt-6 sm:text-[14px]">
          A beta, not yet signed by Apple or Microsoft. On macOS, right-click Edict and choose Open the first time; on Windows,
          choose More info, then Run anyway.{' '}
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
