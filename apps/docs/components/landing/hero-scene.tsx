'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

// The hero: Claude Code works ENG-142 through Edict's MCP tools, and Edict
// answers each call. On a wide screen the scene is driven by scroll: it
// tilts up into view, then holds still while each step of scrolling plays one
// step of the work, and every MCP call travels as a pulse from the terminal
// line that made it to the issue it changes. On a phone it plays by itself;
// with reduced motion it shows where the work ends.

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
const script = lines.map((line, index) => ({ ...line, key: `line-${index}` }));
const LAST = script.length - 1;

const captions = [
  'You ask Claude Code to work on ENG-142.',
  'It reads the issue through Edict’s MCP server.',
  'It picks the issue up. Edict shows it working, live.',
  'It writes the fix in your repository.',
  'It says what it found, as a comment on the issue.',
  'It opens a pull request.',
  'It links the pull request to the issue.',
  'It hands the issue to review. Maya hears about it in her inbox.',
];

const isCall = (step: number) => script[step]?.kind === 'tool';
// How long a pulse takes to cross from the terminal to Edict.
const TRAVEL_MS = 620;

type Mode = 'scroll' | 'auto' | 'still';

function useMode(): Mode {
  const [mode, setMode] = useState<Mode>('still');
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const wide = window.matchMedia('(min-width: 1024px)');
    const pick = () => setMode(reduce.matches ? 'still' : wide.matches ? 'scroll' : 'auto');
    pick();
    wide.addEventListener('change', pick);
    reduce.addEventListener('change', pick);
    return () => {
      wide.removeEventListener('change', pick);
      reduce.removeEventListener('change', pick);
    };
  }, []);
  return mode;
}

// What Edict shows trails the terminal by a pulse's travel: a call lands
// before it changes anything. Going back (scrolling up) shows at once.
function useLanded(step: number) {
  const [landed, setLanded] = useState(step);
  useEffect(() => {
    if (step < landed || !isCall(step)) {
      setLanded(step);
      return;
    }
    const timer = setTimeout(() => setLanded(step), TRAVEL_MS);
    return () => clearTimeout(timer);
  }, [step, landed]);
  return landed;
}

export function HeroScene() {
  const mode = useMode();
  if (mode === 'scroll') return <ScrollScene />;
  return <PlayingScene still={mode === 'still'} />;
}

// --- Scroll-driven, on a wide screen -------------------------------------

// The nav is 56 high; the pinned scene centres in what is left below it.
const NAV = 56;
const SCROLL_LENGTH = 1500;
// Scroll spent rising flat before the first step plays.
const RISE = 180;

function ScrollScene() {
  const track = useRef<HTMLDivElement>(null);
  const pinned = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [{ step, rise }, setProgress] = useState({ step: 0, rise: 0 });
  const [pinTop, setPinTop] = useState(88);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      if (!track.current || !pinned.current) return;
      const height = pinned.current.offsetHeight;
      const pin = Math.max(NAV + 24, Math.round(NAV + (window.innerHeight - NAV - height) / 2));
      setPinTop(pin);
      const top = track.current.getBoundingClientRect().top;
      const scrolled = window.scrollY;
      // The scroll at which it pins, plus a little for it to finish rising.
      const begin = Math.max(0, top + scrolled - pin) + RISE;
      // Tilted back at first; flat by the time the story starts.
      const rise = Math.min(1, Math.max(0, scrolled / begin));
      const distance = track.current.offsetHeight - height - RISE;
      const played = Math.min(1, Math.max(0, (scrolled - begin) / distance));
      const step = Math.min(LAST, Math.floor(played * (LAST + 1)));
      setProgress((last) => (last.step === step && Math.abs(last.rise - rise) < 0.002 ? last : { step, rise }));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const landed = useLanded(step);
  const tilt = 1 - rise;
  return (
    // The track is as tall as the pinned scene plus the scroll it plays over.
    <div ref={track} className="relative" style={{ height: 500 + RISE + SCROLL_LENGTH }}>
      <div ref={pinned} className="sticky" style={{ top: pinTop }}>
        <div style={{ perspective: 1800 }}>
          <div
            ref={stage}
            className="relative grid grid-cols-[minmax(0,340px)_minmax(0,1fr)] gap-24 will-change-transform"
            style={{
              transform: `translateY(${tilt * 20}px) rotateX(${tilt * 14}deg) scale(${0.95 + rise * 0.05})`,
              transformOrigin: '50% 0%',
              opacity: 0.8 + rise * 0.2,
            }}
          >
            <Terminal step={step} active={rise > 0.98 && isCall(step) ? step : null} />
            <AppWindow step={landed} hit={rise > 0.98 && isCall(step) ? step : null} />
            {rise > 0.98 ? <Connector stage={stage} step={step} /> : null}
          </div>
        </div>
        <Caption step={step} hint={step === 0} />
      </div>
    </div>
  );
}

// The path from the terminal to Edict. A call draws it bright and sends a
// pulse with the tool's name along it; the rest of the time it rests faint.
function Connector({ stage, step }: { stage: RefObject<HTMLDivElement | null>; step: number }) {
  const [geometry, setGeometry] = useState<{ path: string; mid: { x: number; y: number }; width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const box = stage.current;
    if (!box) return;
    const measure = () => {
      const area = box.getBoundingClientRect();
      const terminal = box.querySelector<HTMLElement>('[data-card="terminal"]')?.getBoundingClientRect();
      const app = box.querySelector<HTMLElement>('[data-card="app"]')?.getBoundingClientRect();
      const line = box.querySelector<HTMLElement>(`[data-line="${step}"]`)?.getBoundingClientRect();
      const row = box.querySelector<HTMLElement>('[data-row="ENG-142"]')?.getBoundingClientRect();
      if (!terminal || !app || !line || !row) return;
      const start = { x: terminal.right - area.left, y: line.top + line.height / 2 - area.top };
      const end = { x: app.left - area.left, y: row.top + row.height / 2 - area.top };
      const bend = (end.x - start.x) * 0.55;
      setGeometry({
        path: `M ${start.x} ${start.y} C ${start.x + bend} ${start.y}, ${end.x - bend} ${end.y}, ${end.x} ${end.y}`,
        mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
        width: area.width,
        height: area.height,
      });
    };
    measure();
    // The row may still be moving to its new group; measure again once it has.
    const later = setTimeout(measure, TRAVEL_MS + 60);
    return () => clearTimeout(later);
  }, [stage, step]);
  if (!geometry) return null;
  const call = script[step];
  const calling = call?.kind === 'tool';
  return (
    <>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-visible"
        width={geometry.width}
        height={geometry.height}
      >
        <defs>
          <filter id="l-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <path d={geometry.path} fill="none" stroke="var(--l-line-2)" strokeWidth="1.5" strokeDasharray="3 5" />
        {calling ? (
          // Drawn, travelled, then gone: once the call has landed only the
          // faint path rests between them.
          <g key={step}>
            <animate attributeName="opacity" values="1;1;0" keyTimes="0;0.7;1" dur={`${TRAVEL_MS + 500}ms`} fill="freeze" />
            <path d={geometry.path} fill="none" stroke="var(--l-agent)" strokeWidth="2" pathLength={1} className="l-draw" />
            <circle r="7" fill="var(--l-agent)" opacity="0.45" filter="url(#l-glow)">
              <animateMotion dur={`${TRAVEL_MS}ms`} fill="freeze" path={geometry.path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1" />
            </circle>
            <circle r="3.5" fill="var(--l-agent)">
              <animateMotion dur={`${TRAVEL_MS}ms`} fill="freeze" path={geometry.path} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1" />
            </circle>
          </g>
        ) : null}
      </svg>
      {calling ? (
        <span
          key={`label-${step}`}
          className="l-tag pointer-events-none absolute -translate-x-1/2 -translate-y-[150%] rounded-full bg-l-surface px-2 py-0.5 font-l-mono text-[11px] text-l-agent-ink shadow-[0_0_0_1px_var(--l-line-2),0_6px_16px_-8px_oklch(0_0_0/0.35)]"
          style={{ left: geometry.mid.x, top: geometry.mid.y }}
        >
          {call.tool}
        </span>
      ) : null}
    </>
  );
}

function Caption({ step, hint }: { step: number; hint: boolean }) {
  return (
    <div className="mt-8 flex items-center gap-5">
      <ol aria-hidden="true" className="flex shrink-0 gap-1.5">
        {script.map((line, index) => (
          <li
            key={line.key}
            className={`h-1 rounded-full transition-[width,background-color] duration-300 ${
              index === step ? 'w-6 bg-l-ink' : index < step ? 'w-2.5 bg-l-ink-3' : 'w-2.5 bg-l-line-2'
            }`}
          />
        ))}
      </ol>
      <p key={step} className="l-in min-w-0 text-[15px] text-l-ink-2" aria-live="polite">
        {captions[step]}
      </p>
      {hint ? <span className="ms-auto shrink-0 text-[13px] text-l-ink-3">Scroll to watch it work ↓</span> : null}
    </div>
  );
}

// --- Playing by itself, on a phone or tablet ------------------------------

const STEP_MS = 1600;
const HOLD_MS = 4000;

function PlayingScene({ still }: { still: boolean }) {
  const [step, setStep] = useState(still ? LAST : 0);
  useEffect(() => {
    if (still) {
      setStep(LAST);
      return;
    }
    let current = 0;
    setStep(0);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (current < LAST) {
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
  }, [still]);
  const landed = useLanded(step);
  return (
    <div>
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-6">
        <div className="order-2 lg:order-1">
          <Terminal step={step} active={null} />
        </div>
        <div className="order-1 min-w-0 lg:order-2">
          <AppWindow step={landed} hit={isCall(step) ? step : null} />
        </div>
      </div>
      <p key={step} className="l-in mt-4 text-[14px] text-l-ink-2" aria-live="polite">
        {captions[step]}
      </p>
    </div>
  );
}

// --- The two windows -------------------------------------------------------

function Terminal({ step, active }: { step: number; active: number | null }) {
  return (
    <div
      data-card="terminal"
      role="img"
      aria-label="Claude Code working an Edict issue"
      className="flex h-full flex-col overflow-hidden rounded-xl bg-l-band text-l-ink shadow-l-window"
    >
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-l-line px-3.5">
        <TrafficLights />
        <span className="ms-2 font-l-mono text-[11px] text-l-ink-3">claude — ~/acme/web</span>
      </div>
      <div className="flex min-h-[320px] flex-1 flex-col gap-1 overflow-hidden px-2.5 py-3 font-l-mono text-[12px] leading-[1.55]">
        {script.slice(0, step + 1).map((line, index) => (
          <TerminalLine key={line.key} line={line} index={index} active={index === active} />
        ))}
        <div className="flex items-center gap-2 px-1.5 text-l-ink-3">
          <span aria-hidden="true">›</span>
          <span className="l-pulse inline-block h-3.5 w-1.5 bg-l-ink-2" />
        </div>
      </div>
    </div>
  );
}

function TerminalLine({ line, index, active }: { line: Line; index: number; active: boolean }) {
  const frame = `l-in rounded-md px-1.5 py-0.5 transition-colors duration-500 ${active ? 'bg-l-agent-wash' : ''}`;
  if (line.kind === 'prompt') {
    return (
      <p data-line={index} className={frame}>
        <span className="text-l-ink-3">› </span>
        {line.text}
      </p>
    );
  }
  return (
    <div data-line={index} className={frame}>
      <p className="truncate">
        <span className={line.kind === 'tool' ? 'text-l-agent' : 'text-l-review'}>⏺ </span>
        <span className="font-semibold">{line.kind === 'tool' ? `edict · ${line.tool}` : line.label}</span>
        <span className="text-l-ink-3"> ({line.kind === 'tool' ? line.args : line.text})</span>
      </p>
      {line.result ? (
        <p className="truncate ps-4 text-l-ink-3">
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

const groups: { key: 'review' | 'progress' | 'todo'; name: string }[] = [
  { key: 'review', name: 'In Review' },
  { key: 'progress', name: 'In Progress' },
  { key: 'todo', name: 'Todo' },
];

// Edict as it stands after `step`, with the row flashing when a call lands
// on it (`hit`).
function AppWindow({ step, hit }: { step: number; hit: number | null }) {
  const status: 'todo' | 'progress' | 'review' = step < 2 ? 'todo' : step < 7 ? 'progress' : 'review';
  const working = step >= 2 && step < 7;
  const linked = step >= 6;
  const commented = step >= 4;
  const ours = { id: 'ENG-142', title: 'Keep ?next through SSO sign-in', person: 'MC', agent: 'CC', prio: 3 };
  return (
    <div
      data-card="app"
      role="img"
      aria-label="Edict's issue list, where ENG-142 moves to In Progress and then In Review as the agent works"
      className="overflow-hidden rounded-xl bg-l-band shadow-l-window"
    >
      <div className="flex h-10 items-center gap-2 border-b border-l-line px-3.5">
        <TrafficLights />
        <span className="ms-[118px] hidden h-6 items-center rounded-md bg-l-bg px-3 text-[11px] text-l-ink shadow-[0_0_0_1px_var(--l-line)] sm:inline-flex">
          Engineering
        </span>
        <span className="hidden px-2 text-[11px] text-l-ink-3 sm:inline">My issues</span>
      </div>
      <div className="flex pt-2">
        <aside className="hidden w-[168px] shrink-0 flex-col gap-3 px-2 pb-3 text-[11.5px] sm:flex">
          <div className="flex flex-col gap-px">
            <RailItem label="Inbox" aside={<span className="font-semibold tabular-nums">{step >= 7 ? 4 : 3}</span>} />
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
                          data-row={row.id}
                          className={`relative flex h-8 items-center gap-2.5 rounded-md px-2.5 ${live ? 'l-in' : ''}`}
                        >
                          {/* A call landing: the row lights up in the agent's color. */}
                          {live && hit !== null ? (
                            <i
                              key={`hit-${hit}`}
                              className="l-hit pointer-events-none absolute inset-0 rounded-md"
                              style={{ animationDelay: `${TRAVEL_MS - 80}ms` }}
                            />
                          ) : null}
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
                            {live && commented ? (
                              <span className="l-in hidden text-[10px] text-l-ink-3 tabular-nums md:inline">1 comment</span>
                            ) : null}
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
                <span className="text-l-ink-2"> {step >= 7 ? 'moved ENG-142 to In Review' : 'linked #418 on ENG-142'}</span>
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function TrafficLights() {
  return (
    <span className="flex gap-1.5" aria-hidden="true">
      <i className="size-2.5 rounded-full bg-[#ff5f57]" />
      <i className="size-2.5 rounded-full bg-[#febc2e]" />
      <i className="size-2.5 rounded-full bg-[#28c840]" />
    </span>
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
