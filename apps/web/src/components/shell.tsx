import type { ReactNode } from "react";
import { Link } from "react-router";
import { LogoMark, cn } from "@edicthq/ui";
import { Minus, Square, X } from "lucide-react";
import { desktopShell, windowCommand } from "../lib/desktop.js";

// Sign-in, sign-up, onboarding and invite pages: one narrow column, centered,
// under a soft light from the top of the page. No card: the mark, the
// heading and the form rise in one after another the first time it shows.
export function AuthShell({ title, lead, children }: { title: string; lead?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-[radial-gradient(70%_45%_at_50%_0%,var(--glow),transparent_75%)] px-6">
      {desktopShell() ? (
        <div data-tauri-drag-region className="fixed inset-x-0 top-0 z-10 flex h-12 justify-end pe-2">
          <WindowControls />
        </div>
      ) : null}
      <main id="main" className="stagger mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-14 sm:py-20">
        <Link
          to="/"
          aria-label="Edict"
          className="mx-auto grid size-11 place-items-center rounded-[12px] bg-ink text-on-human shadow-[0_1px_2px_oklch(0_0_0/0.12)]"
        >
          <LogoMark size={24} className="text-on-human" />
        </Link>
        <div className="mt-6 text-center">
          <h1 className="text-2xl font-semibold text-balance">{title}</h1>
          {lead ? <p className="mt-2 text-body text-ink-2 text-pretty">{lead}</p> : null}
        </div>
        {children ? <div className="mt-8 [&>p]:text-center">{children}</div> : null}
      </main>
    </div>
  );
}

// The page bar: 48 high on a hairline, with the title (optionally led by a team
// key chip or a breadcrumb), a status such as a live agent, and the page's
// actions. It stays put while the page scrolls. In the desktop app it is also
// a handle to drag the window by, and on Windows and Linux it ends in the
// window controls.
export function PageHeader({
  title,
  lead,
  status,
  actions,
}: {
  title: ReactNode;
  lead?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header
      data-tauri-drag-region
      className="app-bar sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2.5 border-b border-line bg-bg ps-6 pe-4"
    >
      <div data-tauri-drag-region className="flex min-w-0 items-center gap-2">
        {lead}
        <h1 data-tauri-drag-region className="truncate text-body font-semibold tracking-[-0.005em]">
          {title}
        </h1>
      </div>
      {status ? <div className="flex min-w-0 items-center">{status}</div> : null}
      <div data-tauri-drag-region className="flex-1 self-stretch" />
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      <WindowControls />
    </header>
  );
}

// Minimize, maximize and close for the frameless desktop window on Windows and
// Linux. macOS keeps its own traffic lights, and browsers have their frame.
export function WindowControls() {
  if (desktopShell()?.titleBar !== "custom") return null;
  const control = "grid h-8 w-10 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink";
  return (
    <div className="-me-2 ms-1 flex items-center">
      <button type="button" aria-label="Minimize" className={control} onClick={() => windowCommand("minimize")}>
        <Minus aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
      <button type="button" aria-label="Maximize" className={control} onClick={() => windowCommand("toggle_maximize")}>
        <Square aria-hidden="true" className="size-3" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label="Close"
        className={cn(control, "hover:bg-danger hover:text-on-human")}
        onClick={() => windowCommand("close")}
      >
        <X aria-hidden="true" className="size-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}

// The body under a PageHeader: rows run almost edge to edge, like the list.
export function PageBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-3 pb-28", className)}>{children}</div>;
}

// The body of a page that reads as one document, like the trash or how to
// connect an agent: one centered column, so a wide window doesn't leave it
// stranded on one side.
export function PageColumn({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[960px] px-4 pt-6 pb-28 sm:px-6 md:pt-8", className)}>{children}</div>;
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
  "flex min-h-10 items-center gap-3 rounded-sm py-2 ps-4 pe-3 hover-fade hover:bg-hover";

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
