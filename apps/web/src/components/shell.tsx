import type { ReactNode } from "react";
import { Link } from "react-router";
import { cn } from "@edicthq/ui";
import { Logo } from "./logo.js";

// Sign-in, sign-up, onboarding and invite pages: one narrow column on the
// page background, no card.
export function AuthShell({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
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
        {children ? <div className="mt-8">{children}</div> : null}
      </main>
    </div>
  );
}

// The page title row from the prototype: a 24px title, optionally led by a
// team key chip, with actions on the trailing side.
export function PageHeader({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 pt-4 pb-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {lead}
        <h1 className="truncate text-2xl font-semibold tracking-[-0.02em]">{title}</h1>
      </div>
      {actions ? <div className="ms-auto flex items-center gap-2">{actions}</div> : null}
    </header>
  );
}

// The body under a PageHeader: rows run almost edge to edge, like the list.
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-3 pb-28", className)}>{children}</div>;
}

// A list group's heading row (34 high), like "In Progress 4".
export function GroupHeader({ children, count, actions }: { children: ReactNode; count?: number; actions?: ReactNode }) {
  return (
    <div className="flex h-[34px] items-center gap-2 px-3">
      <h2 className="text-sm font-semibold text-ink">{children}</h2>
      {count !== undefined ? <span className="text-sm text-ink-2 tabular-nums">{count}</span> : null}
      {actions ? <div className="ms-auto flex items-center gap-1">{actions}</div> : null}
    </div>
  );
}

// One list row: 40 high, 6 radius, hover fill.
export const rowClass =
  "flex min-h-10 items-center gap-3 rounded-sm py-2 ps-4 pe-3 transition-[background-color] duration-[140ms] ease-standard hover:bg-hover";

export function SectionLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h2 id={id} className="text-sm font-semibold text-ink-2">
      {children}
    </h2>
  );
}

// An empty page or list. `page` centers the message in the space it has and
// takes an icon; the default sits inline, as under a group heading.
export function EmptyState({
  icon,
  title,
  body,
  action,
  layout = "inline",
}: {
  icon?: ReactNode;
  title: string;
  body: ReactNode;
  action?: ReactNode;
  layout?: "inline" | "page";
}) {
  if (layout === "page") {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 py-10 text-center">
        {icon ? (
          <div
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-md bg-hover text-ink-3 [&_svg]:size-5"
          >
            {icon}
          </div>
        ) : null}
        <div className="max-w-[44ch]">
          <p className="text-body font-semibold">{title}</p>
          <p className="mt-1 text-ui text-ink-2 text-pretty">{body}</p>
        </div>
        {action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
      </div>
    );
  }
  return (
    <div className="flex max-w-[480px] flex-col items-start gap-3 px-3 py-8">
      <div className="flex items-start gap-3">
        {icon ? (
          <div
            aria-hidden="true"
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-hover text-ink-3 [&_svg]:size-4"
          >
            {icon}
          </div>
        ) : null}
        <div>
          <p className="text-body font-semibold">{title}</p>
          <p className="mt-1 text-ui text-ink-2 text-pretty">{body}</p>
        </div>
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
