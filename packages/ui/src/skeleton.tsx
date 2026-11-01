import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { cn } from "./cn.js";
import { skeletonClock } from "./skeleton-timing.js";

// One pulse, in ms (tokens.css, skeleton-pulse). Every skeleton pulses in step
// with the clock, so one that takes another's place carries on the same beat.
const PULSE_MS = 1600;

const phase = () => `${-(performance.now() % PULSE_MS)}ms`;

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// A block in the shape of something still loading: a line of text, an avatar,
// an icon. It sits inside a SkeletonGroup, which says what is loading.
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={skeletonBlockClass(className)} style={style} />;
}

// A block is a 12px line, slightly rounded, unless its class gives a height,
// a size or a radius of its own: the classes would otherwise fight, and
// Tailwind's order, not the class list's, would pick the winner.
export function skeletonBlockClass(className = ""): string {
  const given = (utility: string) => new RegExp(`(^|\\s)([\\w-]+:)*(${utility})-`).test(className);
  return cn("skeleton-block block", !given("h|size") && "h-3", !given("rounded") && "rounded-xs", className);
}

// A page's or a list's skeleton: a status that screen readers hear by its
// label, around blocks shaped like what will replace it. It stays invisible
// for the first 150 ms, so a fast load never flashes, then fades in while its
// blocks pulse, and fades out over whatever takes its place. Under reduced
// motion it appears and leaves at once and stands still.
export function SkeletonGroup({
  label,
  className,
  children,
}: {
  // What is loading, as a screen reader hears it: "Loading issues".
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<"fade" | "whole" | null>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    node?.style.setProperty("--skeleton-phase", phase());
    let revealed = false;
    const end = skeletonClock.begin((whole) => {
      revealed = true;
      setShown(whole || reducedMotion() ? "whole" : "fade");
    });
    return () => {
      end();
      if (revealed && node) fadeOutOver(node);
    };
  }, []);

  return (
    <div ref={ref} role="status" data-shown={shown ?? undefined} className={cn("skeleton", className)}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

// The crossfade: a copy of the skeleton, on the background it sat on, fades
// out over the content that replaced it. React runs this before it removes
// the skeleton, so the copy is taken while the skeleton is still in place, and
// it is put up before the next paint only if the skeleton really went.
function fadeOutOver(node: HTMLElement) {
  if (reducedMotion() || typeof document === "undefined") return;
  const rect = node.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const copy = node.cloneNode(true) as HTMLElement;
  copy.removeAttribute("role");
  copy.setAttribute("aria-hidden", "true");
  copy.setAttribute("data-skeleton-leaving", "");
  copy.inert = true;
  Object.assign(copy.style, {
    position: "fixed",
    top: `${rect.top}px`,
    left: `${rect.left}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    margin: "0",
    overflow: "hidden",
    boxSizing: "border-box",
    pointerEvents: "none",
    zIndex: "20",
    background: backgroundUnder(node),
  } satisfies Partial<CSSStyleDeclaration>);
  copy.style.setProperty("--skeleton-phase", phase());
  queueMicrotask(() => {
    if (node.isConnected) return;
    document.body.append(copy);
    const remove = () => copy.remove();
    copy.addEventListener("animationend", (event) => {
      if (event.target === copy) remove();
    });
    // In case the animation never runs, as in a background tab.
    setTimeout(remove, 600);
  });
}

// The first opaque background at or above the node: what the skeleton was
// drawn on, so the copy hides the content under it as it starts to fade.
function backgroundUnder(node: HTMLElement): string {
  for (let el: HTMLElement | null = node; el; el = el.parentElement) {
    const color = getComputedStyle(el).backgroundColor;
    if (opaque(color)) return color;
  }
  return "var(--bg)";
}

// A color with no alpha, or a full one: "oklch(0.99 0 0)", not "rgba(0, 0, 0, 0)"
// or "oklch(0.2 0 0 / 0.5)".
export function opaque(color: string): boolean {
  if (!color || color === "transparent") return false;
  const alpha = /\/\s*([\d.]+)(%?)\s*\)$/.exec(color) ?? /^rgba\((?:[^,]+,){3}\s*([\d.]+)(%?)\s*\)$/.exec(color);
  if (!alpha) return true;
  const value = Number(alpha[1]) / (alpha[2] ? 100 : 1);
  return value >= 1;
}
