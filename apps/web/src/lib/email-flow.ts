// How long someone waits before asking for the same email again.
export const RESEND_COOLDOWN_SECONDS = 60;

// Where to go after an email flow, from a ?next= that came through a link:
// only a path on this site, never another origin.
export function safeNext(next: string | null | undefined): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}

// The callbackURL a verification link carries: the "Email verified" screen,
// which then sends the person on to next.
export function verifiedCallback(next: string): string {
  return `/email-verified?next=${encodeURIComponent(safeNext(next))}`;
}

// Whole seconds left of a cooldown that started at startedAt, never below 0.
export function secondsLeft(startedAt: number | null, now: number, seconds = RESEND_COOLDOWN_SECONDS): number {
  if (startedAt === null) return 0;
  return Math.max(0, Math.ceil((startedAt + seconds * 1000 - now) / 1000));
}
