'use client';

import type { ReactNode } from 'react';
import { useInView, usePhase } from './motion';

// How it works: three steps, each with a small scene that plays while the
// section is on screen. The line between the numbers draws itself in.

const steps = [
  {
    title: 'Connect',
    body: 'Paste one URL into Claude Code, Codex, Cursor or any MCP client and approve it. It joins your team as an agent, named after the client and you.',
    Scene: ConnectScene,
  },
  {
    title: 'Delegate',
    body: 'Hand an issue to an agent. You stay its assignee and answer for it; the agent is its delegate and does the work.',
    Scene: DelegateScene,
  },
  {
    title: 'Watch it land',
    body: 'The agent moves the issue, comments and links its pull request. You see it in the list and in your inbox.',
    Scene: LandScene,
  },
];

export function Timeline() {
  const { ref, inView } = useInView<HTMLOListElement>();
  return (
    <ol ref={ref} className="mt-10 grid gap-9 md:mt-14 md:grid-cols-3 md:gap-8">
      {steps.map(({ title, body, Scene }, index) => (
        // A phone: the number beside the title, then the scene, then the text.
        // A wide screen: the number on the line, the scene, then title and text.
        <li
          key={title}
          className="relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-4 transition-[opacity,transform] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:grid-cols-1 md:gap-y-0"
          style={{
            opacity: inView ? 1 : 0,
            transform: inView ? 'none' : 'translateY(14px)',
            transitionDelay: `${index * 140}ms`,
          }}
        >
          <div className="relative col-start-1 row-start-1 flex items-center gap-3 md:mb-5">
            <span className="relative z-[1] grid size-8 shrink-0 place-items-center rounded-full bg-l-bg text-[13px] font-semibold tabular-nums shadow-[inset_0_0_0_1px_var(--l-line-2)]">
              {index + 1}
            </span>
            {index < steps.length - 1 ? (
              <span
                aria-hidden="true"
                className="hidden h-px flex-1 origin-left bg-l-line-2 transition-transform duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none md:block md:-me-8"
                style={{ transform: inView ? 'scaleX(1)' : 'scaleX(0)', transitionDelay: `${300 + index * 200}ms` }}
              />
            ) : null}
          </div>
          <h3 className="col-start-2 row-start-1 text-[17px] font-semibold tracking-[-0.01em] sm:text-[19px] md:col-start-1 md:row-start-3 md:mt-5">
            {title}
          </h3>
          <div className="col-span-2 row-start-2 md:col-span-1">
            <Scene running={inView} />
          </div>
          <p className="col-span-2 row-start-3 -mt-1 text-[15px] leading-[1.55] text-l-ink-2 text-pretty md:col-span-1 md:row-start-4 md:mt-1.5">
            {body}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-[132px] flex-col justify-center gap-2.5 overflow-hidden rounded-xl bg-l-surface p-4 text-[12px] shadow-[0_0_0_1px_var(--l-line)]"
    >
      {children}
    </div>
  );
}

const url = 'https://edict.example.com/mcp';

// The URL types itself into a client, then the agent joins.
function ConnectScene({ running }: { running: boolean }) {
  const phase = usePhase(24, 140, running);
  const typed = Math.min(url.length, Math.round((phase / 12) * url.length));
  const joined = phase >= 15;
  return (
    <Frame label="An MCP client given Edict's URL, and the agent it becomes joining the team">
      <div className="flex h-8 items-center gap-2 rounded-lg bg-l-bg px-2.5 font-l-mono text-[11px] shadow-[inset_0_0_0_1px_var(--l-line-2)]">
        <span className="text-l-ink-3">MCP</span>
        <span className="truncate text-l-ink">
          {url.slice(0, typed)}
          {typed < url.length ? <span className="l-caret ms-px inline-block h-3 w-px translate-y-0.5 bg-l-ink" /> : null}
        </span>
      </div>
      <div
        className="flex items-center gap-2 transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ opacity: joined ? 1 : 0, transform: joined ? 'none' : 'translateY(6px)' }}
      >
        <Square>CC</Square>
        <span className="font-medium">Claude Code (Maya)</span>
        <span className="text-l-ink-3">joined Acme</span>
      </div>
    </Frame>
  );
}

// An issue gets its human, then its agent.
function DelegateScene({ running }: { running: boolean }) {
  const phase = usePhase(6, 900, running);
  return (
    <Frame label="An issue with Maya as its assignee and Claude Code as its delegate">
      <div className="flex items-center gap-2">
        <span className="font-l-mono text-[10.5px] text-l-ink-3">ENG-142</span>
        <span className="truncate font-medium">Keep ?next through SSO sign-in</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Assignee" shown={phase >= 1}>
          <Circle>MC</Circle>
          Maya
        </Field>
        <Field label="Delegate" shown={phase >= 2}>
          <Square>CC</Square>
          Claude Code
        </Field>
      </div>
    </Frame>
  );
}

function Field({ label, shown, children }: { label: string; shown: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg bg-l-bg px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--l-line)]">
      <span className="text-[10.5px] text-l-ink-3">{label}</span>
      <span
        className="flex items-center gap-1.5 font-medium transition-[opacity,transform] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ opacity: shown ? 1 : 0, transform: shown ? 'none' : 'translateX(-6px)' }}
      >
        {children}
      </span>
    </div>
  );
}

// The issue moves on, and its pull request is linked.
function LandScene({ running }: { running: boolean }) {
  const phase = usePhase(5, 1100, running);
  const status = phase === 0 ? 'todo' : phase === 1 ? 'progress' : 'review';
  const name = { todo: 'Todo', progress: 'In Progress', review: 'In Review' }[status];
  return (
    <Frame label="An issue moving from Todo to In Progress to In Review, with its pull request linked">
      <div className="flex items-center gap-2">
        <Status status={status} />
        <span className="font-medium">{name}</span>
        {status === 'progress' ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-l-agent-wash px-1.5 text-[10px] font-medium text-l-agent-ink">
            <i className="l-pulse size-1 rounded-full bg-l-agent" />
            Working
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-l-bg px-2.5 py-2 shadow-[inset_0_0_0_1px_var(--l-line)]">
        <Square>CC</Square>
        <span className="min-w-0 truncate text-l-ink-2">
          {phase >= 3 ? 'linked ' : 'working on '}
          <span className="font-medium text-l-ink">{phase >= 3 ? '#418' : 'ENG-142'}</span>
        </span>
        <span
          className="ms-auto rounded-full px-1.5 text-[10px] text-l-ink-2 shadow-[0_0_0_1px_var(--l-line-2)] transition-opacity duration-500"
          style={{ opacity: phase >= 3 ? 1 : 0 }}
        >
          PR #418
        </span>
      </div>
    </Frame>
  );
}

function Status({ status }: { status: 'todo' | 'progress' | 'review' }) {
  const color = status === 'todo' ? 'text-l-ink-3' : status === 'progress' ? 'text-l-started' : 'text-l-review';
  const fill = status === 'progress' ? 0.5 : 0.75;
  const angle = fill * 2 * Math.PI;
  return (
    <svg viewBox="0 0 14 14" className={`size-3.5 shrink-0 transition-colors duration-300 ${color}`} aria-hidden="true">
      <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {status === 'todo' ? null : (
        <path
          d={`M7 7 L7 3.8 A3.2 3.2 0 ${fill > 0.5 ? 1 : 0} 1 ${(7 + 3.2 * Math.sin(angle)).toFixed(2)} ${(7 - 3.2 * Math.cos(angle)).toFixed(2)} Z`}
          fill="currentColor"
        />
      )}
    </svg>
  );
}

function Square({ children }: { children: string }) {
  return (
    <span className="grid size-[18px] shrink-0 place-items-center rounded-[5px] bg-l-agent text-[8px] font-bold text-white">
      {children}
    </span>
  );
}

function Circle({ children }: { children: string }) {
  return (
    <span className="grid size-[18px] shrink-0 place-items-center rounded-full text-[8px] font-bold text-l-ink-2 shadow-[inset_0_0_0_1px_var(--l-line-2)]">
      {children}
    </span>
  );
}
