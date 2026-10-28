'use client';

import { useEffect, useState, type ReactNode } from 'react';

// The hero: Claude Code works ENG-142 through Edict's MCP tools in a terminal,
// and the Edict window answers each call as it lands. The issue moves from
// Todo to In Progress with its agent working, gets its pull request linked,
// and goes to In Review. It loops; with reduced motion it shows the end.

type Line =
  | { kind: 'prompt'; text: string }
  | { kind: 'tool'; tool: string; args: string; result?: string }
  | { kind: 'work'; label: string; text: string; result?: string };

const lines: Line[] = [
  { kind: 'prompt', text: 'work on ENG-142' },
  { kind: 'tool', tool: 'get_issue', args: 'ENG-142', result: 'Keep ?next through SSO sign-in · Todo · delegated to you' },
  { kind: 'tool', tool: 'update_issue', args: 'ENG-142, status: "In Progress"' },
  { kind: 'work', label: 'Update', text: 'src/auth/callback.ts', result: '+14 −3' },
  { kind: 'tool', tool: 'comment', args: 'ENG-142, "The SSO callback dropped ?next…"' },
  { kind: 'work', label: 'Bash', text: 'gh pr create --fill', result: 'github.com/acme/web/pull/418' },
  { kind: 'tool', tool: 'link', args: 'ENG-142, #418' },
  { kind: 'tool', tool: 'update_issue', args: 'ENG-142, status: "In Review"' },
];
// Each line keeps one key for its life on screen.
const script = lines.map((line, index) => ({ ...line, key: `line-${index}` }));

const STEP_MS = 1500;
const HOLD_MS = 4200;

function useScript(): number {
  const [step, setStep] = useState(script.length - 1);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let current = 0;
    setStep(0);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (current < script.length - 1) {
        current += 1;
        setStep(current);
        timer = setTimeout(tick, STEP_MS);
      } else {
        timer = setTimeout(() => {
          current = 0;
          setStep(0);
          timer = setTimeout(tick, STEP_MS);
        }, HOLD_MS);
      }
    };
    timer = setTimeout(tick, STEP_MS);
    return () => clearTimeout(timer);
  }, []);
  return step;
}

export function HeroScene() {
  const step = useScript();
  const status: 'todo' | 'progress' | 'review' = step < 2 ? 'todo' : step < 7 ? 'progress' : 'review';
  const working = step >= 2 && step < 7;
  const linked = step >= 6;
  return (
    // Side by side on a wide screen, the same height, so the terminal and the
    // window it drives read as one desk. Stacked on a narrow one.
    <div className="flex flex-col-reverse gap-4 lg:grid lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-stretch lg:gap-5">
      <div className="flex">
        <Terminal step={step} />
      </div>
      <AppWindow status={status} working={working} linked={linked} step={step} />
    </div>
  );
}

function Terminal({ step }: { step: number }) {
  return (
    <div
      aria-label="Claude Code working an Edict issue"
      role="img"
      className="flex w-full flex-col overflow-hidden rounded-xl bg-[oklch(0.17_0.008_260)] text-[oklch(0.9_0.005_255)] shadow-[0_0_0_1px_oklch(1_0_0/0.08),0_32px_80px_-24px_oklch(0_0_0/0.6)]"
    >
      <div className="flex h-9 items-center gap-2 border-b border-[oklch(1_0_0/0.07)] px-3.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-[oklch(1_0_0/0.16)]" />
          <i className="size-2.5 rounded-full bg-[oklch(1_0_0/0.16)]" />
          <i className="size-2.5 rounded-full bg-[oklch(1_0_0/0.16)]" />
        </span>
        <span className="ms-2 font-l-mono text-[11px] text-[oklch(0.65_0.01_255)]">claude — ~/acme/web</span>
      </div>
      <div className="flex min-h-[300px] flex-1 flex-col gap-2 overflow-hidden px-4 py-3.5 font-l-mono text-[12px] leading-[1.55]">
        {script.slice(0, step + 1).map((line) => (
          <TerminalLine key={line.key} line={line} />
        ))}
        <div className="flex items-center gap-2 text-[oklch(0.6_0.01_255)]">
          <span aria-hidden="true">›</span>
          <span className="l-pulse inline-block h-3.5 w-1.5 bg-[oklch(0.75_0.01_255)]" />
        </div>
      </div>
    </div>
  );
}

function TerminalLine({ line }: { line: Line }) {
  if (line.kind === 'prompt') {
    return (
      <p className="l-in text-[oklch(0.97_0.004_255)]">
        <span className="text-[oklch(0.6_0.01_255)]">› </span>
        {line.text}
      </p>
    );
  }
  const head =
    line.kind === 'tool' ? (
      <>
        <span className="font-semibold">edict · {line.tool}</span>
        <span className="text-[oklch(0.65_0.01_255)]"> ({line.args})</span>
      </>
    ) : (
      <>
        <span className="font-semibold">{line.label}</span>
        <span className="text-[oklch(0.65_0.01_255)]"> ({line.text})</span>
      </>
    );
  return (
    <div className="l-in">
      <p className="truncate">
        <span className={line.kind === 'tool' ? 'text-[oklch(0.72_0.16_293)]' : 'text-[oklch(0.78_0.14_155)]'}>⏺ </span>
        {head}
      </p>
      {line.result ? (
        <p className="truncate ps-4 text-[oklch(0.65_0.01_255)]">
          <span aria-hidden="true">⎿ </span>
          {line.result}
        </p>
      ) : null}
    </div>
  );
}

const rows = {
  review: [{ id: 'ENG-139', title: 'Rate limit the export endpoint', person: 'LK', agent: null, prio: 2 }],
  progress: [{ id: 'ENG-131', title: 'Board cards jump while dragging in Safari', person: 'LK', agent: null, prio: 3 }],
  todo: [
    { id: 'ENG-144', title: 'Empty state for saved views', person: 'MC', agent: null, prio: 1 },
    { id: 'ENG-145', title: 'Invite links expire after seven days', person: 'MC', agent: null, prio: 2 },
  ],
};

function AppWindow({
  status,
  working,
  linked,
  step,
}: {
  status: 'todo' | 'progress' | 'review';
  working: boolean;
  linked: boolean;
  step: number;
}) {
  const ours = { id: 'ENG-142', title: 'Keep ?next through SSO sign-in', person: 'MC', agent: 'CC', prio: 3 };
  const groups: { key: 'review' | 'progress' | 'todo'; name: string }[] = [
    { key: 'review', name: 'In Review' },
    { key: 'progress', name: 'In Progress' },
    { key: 'todo', name: 'Todo' },
  ];
  return (
    <div
      role="img"
      aria-label="Edict's issue list, where ENG-142 moves to In Progress and then In Review as the agent works"
      className="overflow-hidden rounded-xl bg-l-band shadow-l-window"
    >
      {/* The desktop app's top bar: traffic lights, then tabs. */}
      <div className="flex h-10 items-center gap-2 px-3.5">
        <span className="flex gap-1.5" aria-hidden="true">
          <i className="size-2.5 rounded-full bg-[#ff5f57]" />
          <i className="size-2.5 rounded-full bg-[#febc2e]" />
          <i className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="ms-[118px] hidden h-6 items-center rounded-md bg-l-bg px-3 text-[11px] text-l-ink shadow-[0_0_0_1px_var(--l-line)] sm:inline-flex">
          Engineering
        </span>
        <span className="hidden px-2 text-[11px] text-l-ink-3 sm:inline">My issues</span>
      </div>
      <div className="flex">
        <aside className="hidden w-[168px] shrink-0 flex-col gap-3 px-2 pb-3 text-[11.5px] sm:flex">
          <div className="flex flex-col gap-px">
            <RailItem label="Inbox" aside={<span className="font-semibold tabular-nums">{linked ? 4 : 3}</span>} />
            <RailItem label="My issues" />
            <RailItem label="Projects" />
          </div>
          <div className="flex flex-col gap-px">
            <p className="px-2 pb-0.5 text-[10.5px] font-semibold text-l-ink-3">Agents</p>
            <RailItem
              label="Claude Code (Maya)"
              lead={<Square>CC</Square>}
              aside={
                working ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-l-agent-wash px-1.5 text-[9.5px] font-medium text-l-agent-ink">
                    <i className="l-pulse size-1 rounded-full bg-l-agent" />
                    Working
                  </span>
                ) : (
                  <span className="text-l-ink-3">{status === 'review' ? 'Idle' : '1'}</span>
                )
              }
            />
            <RailItem label="Codex (Leo)" lead={<Square>CX</Square>} aside={<span className="text-l-ink-3">Idle</span>} />
          </div>
          <div className="flex flex-col gap-px">
            <p className="px-2 pb-0.5 text-[10.5px] font-semibold text-l-ink-3">Teams</p>
            <RailItem label="Engineering" active lead={<span className="rounded-[3px] bg-l-hover px-1 text-[9px] font-semibold text-l-ink-2">ENG</span>} />
          </div>
        </aside>
        <div className="relative mb-2 me-2 min-w-0 flex-1 overflow-hidden rounded-lg bg-l-bg shadow-[0_0_0_1px_var(--l-line)] max-sm:ms-2">
          <div className="flex h-10 items-center gap-2 border-b border-l-line px-4 text-[12px]">
            <span className="rounded-[3px] bg-l-hover px-1 text-[9.5px] font-semibold text-l-ink-2">ENG</span>
            <span className="font-semibold">Engineering</span>
            {working ? (
              <span className="l-in ms-1 inline-flex items-center gap-1.5 rounded-full bg-l-agent-wash px-2 py-0.5 text-[10.5px] font-medium text-l-agent-ink">
                <i className="l-pulse size-1.5 rounded-full bg-l-agent" />
                Claude Code is working
              </span>
            ) : null}
            <span className="ms-auto hidden rounded-md bg-l-ink px-2.5 py-1 text-[10.5px] font-semibold text-l-on-ink sm:inline">New issue</span>
          </div>
          <div className="flex min-h-[292px] flex-col gap-2.5 p-2 text-[12px]">
            {groups.map((group) => {
              const list = [...(status === group.key ? [ours] : []), ...rows[group.key]];
              return (
                <section key={group.key}>
                  <div className="flex h-7 items-center gap-2 rounded-md bg-l-hover px-2.5 text-[11px] font-semibold">
                    <StatusIcon status={group.key} />
                    {group.name}
                    <span className="font-normal text-l-ink-3 tabular-nums">{list.length}</span>
                  </div>
                  <ul className="mt-0.5">
                    {list.map((row) => {
                      const live = row.id === 'ENG-142';
                      return (
                        <li
                          key={`${row.id}-${group.key}`}
                          className={`relative flex h-8 items-center gap-2.5 rounded-md px-2.5 ${live ? 'l-in' : ''}`}
                        >
                          {live && working ? <i className="absolute inset-y-1.5 start-0 w-[2.5px] rounded-full bg-l-agent" /> : null}
                          <Priority level={row.prio} />
                          <span className="w-12 shrink-0 text-[10.5px] font-medium text-l-ink-3 tabular-nums">{row.id}</span>
                          <StatusIcon status={group.key} />
                          <span className="min-w-0 truncate">{row.title}</span>
                          {live && working ? (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-l-agent-wash px-1.5 text-[9.5px] font-medium text-l-agent-ink">
                              <i className="l-pulse size-1 rounded-full bg-l-agent" />
                              Working
                            </span>
                          ) : null}
                          <span className="ms-auto flex shrink-0 items-center gap-1.5">
                            {live && linked ? (
                              <span className="l-in hidden rounded-full px-1.5 text-[10px] text-l-ink-2 shadow-[0_0_0_1px_var(--l-line-2)] md:inline">
                                #418
                              </span>
                            ) : null}
                            <Circle>{row.person}</Circle>
                            {row.agent ? <Square>{row.agent}</Square> : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>
          {step >= 6 ? (
            <div className="l-in absolute end-3 bottom-3 flex items-center gap-2 rounded-lg bg-l-surface px-3 py-2 text-[11px] shadow-l-window">
              <Square>CC</Square>
              <span>
                <span className="font-medium">Claude Code (Maya)</span>
                <span className="text-l-ink-2"> linked #418 on ENG-142</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RailItem({ label, lead, aside, active }: { label: string; lead?: ReactNode; aside?: ReactNode; active?: boolean }) {
  return (
    <div className={`flex h-6 items-center gap-2 rounded-md px-2 ${active ? 'bg-l-hover font-medium' : ''}`}>
      {lead}
      <span className="min-w-0 truncate">{label}</span>
      {aside ? <span className="ms-auto shrink-0">{aside}</span> : null}
    </div>
  );
}

function Square({ children }: { children: string }) {
  return (
    <span className="grid size-[17px] shrink-0 place-items-center rounded-[5px] bg-l-agent text-[7.5px] font-bold text-white">
      {children}
    </span>
  );
}

function Circle({ children }: { children: string }) {
  return (
    <span className="grid size-[17px] shrink-0 place-items-center rounded-full text-[7.5px] font-bold text-l-ink-2 shadow-[inset_0_0_0_1px_var(--l-line-2)]">
      {children}
    </span>
  );
}

function Priority({ level }: { level: number }) {
  return (
    <svg viewBox="0 0 14 14" className="size-3 shrink-0" aria-hidden="true">
      {[0, 1, 2].map((bar) => (
        <rect
          key={bar}
          x={1.5 + bar * 4.2}
          y={9 - bar * 3}
          width="2.8"
          height={4 + bar * 3}
          rx="0.8"
          fill="currentColor"
          className={bar < level ? 'text-l-ink-2' : 'text-l-line-2'}
        />
      ))}
    </svg>
  );
}

function StatusIcon({ status }: { status: 'todo' | 'progress' | 'review' }) {
  const color = status === 'todo' ? 'text-l-ink-3' : status === 'progress' ? 'text-l-started' : 'text-l-review';
  const fill = status === 'progress' ? 0.5 : 0.75;
  const angle = fill * 2 * Math.PI;
  return (
    <svg viewBox="0 0 14 14" className={`size-3.5 shrink-0 ${color}`} aria-hidden="true">
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
