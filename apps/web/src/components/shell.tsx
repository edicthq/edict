import type { ReactNode } from "react";
import { Link } from "react-router";
import { Logo } from "./logo.js";

// Sign-in, sign-up, onboarding and invite pages: one narrow column on the
// page background, no card.
export function AuthShell({ title, lead, children }: { title: string; lead?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col px-6">
      <header className="mx-auto flex w-full max-w-[360px] pt-10 pb-12 sm:pt-16">
        <Link to="/" className="rounded-sm">
          <Logo />
        </Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-[360px] pb-16">
        <h1 className="text-2xl font-semibold text-balance">{title}</h1>
        {lead ? <p className="mt-2 text-body text-ink-2 text-pretty">{lead}</p> : null}
        <div className="mt-8">{children}</div>
      </main>
    </div>
  );
}

export function PageHeader({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-3">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="truncate text-lg font-semibold">{title}</h1>
        {meta}
      </div>
      {actions ? <div className="ms-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function SectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-sm font-semibold text-ink-2">
      {children}
    </h2>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-md border border-dashed border-line-strong px-6 py-8">
      <div>
        <p className="text-body font-semibold">{title}</p>
        <p className="mt-1 max-w-[52ch] text-ui text-ink-2 text-pretty">{body}</p>
      </div>
      {action}
    </div>
  );
}

// An error that is not tied to one field, such as a failed request.
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-sm bg-hover px-3 py-2 text-ui text-ink">
      {message}
    </p>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <p role="status" className="px-6 py-8 text-ui text-ink-2">
      {label}…
    </p>
  );
}
