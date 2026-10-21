import type { ReactNode } from "react";
import { cn } from "@edicthq/ui";
import { Bot, Building2, Server, SlidersHorizontal, Users } from "lucide-react";
import { NavLink } from "react-router";
import { useOrg } from "../routes/org.js";
import { PageHeader } from "./shell.js";

// The frame of everything people set up: their preferences, the
// organization, its members and the instance. A subnav on the leading side,
// one column of settings cards beside it, so moving between them keeps the
// page still.
export function SettingsFrame({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) {
  const { canManage, slug, instanceAdmin } = useOrg();
  const item = ({ isActive }: { isActive: boolean }) =>
    cn(
      "hover-fade flex h-8 items-center gap-2 rounded-sm px-2 text-ui",
      isActive ? "bg-hover font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
    );
  return (
    <>
      <PageHeader title={title} actions={actions} />
      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[208px_minmax(0,1fr)]">
        <nav
          aria-label="Settings"
          className="flex gap-4 border-line px-3 py-3 max-md:overflow-x-auto max-md:border-b md:min-h-[calc(100dvh-48px)] md:flex-col md:border-e md:py-5"
        >
          <div className="flex shrink-0 gap-px md:flex-col">
            <h2 className="px-2 pb-1 text-sm font-semibold text-ink-2 max-md:sr-only">You</h2>
            <NavLink to={`/${slug}/settings`} end className={item}>
              <SlidersHorizontal aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Preferences
            </NavLink>
          </div>
          <div className="flex shrink-0 gap-px md:flex-col">
            <h2 className="px-2 pb-1 text-sm font-semibold text-ink-2 max-md:sr-only">Organization</h2>
            {canManage ? (
              <NavLink to={`/${slug}/settings/organization`} className={item}>
                <Building2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                General
              </NavLink>
            ) : null}
            <NavLink to={`/${slug}/members`} className={item}>
              <Users aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Members
            </NavLink>
            <NavLink to={`/${slug}/agents`} className={item}>
              <Bot aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Agents and webhooks
            </NavLink>
          </div>
          {instanceAdmin ? (
            <div className="flex shrink-0 gap-px md:flex-col">
              <h2 className="flex items-baseline gap-1.5 px-2 pb-1 text-sm font-semibold text-ink-2 max-md:sr-only">
                Instance <span className="text-meta font-normal">admin</span>
              </h2>
              <NavLink to={`/${slug}/instance`} className={item}>
                <Server aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                Instance settings
              </NavLink>
            </div>
          ) : null}
        </nav>
        <div className="flex w-full max-w-[760px] flex-col gap-8 px-4 pt-6 pb-28 sm:px-6 md:px-10 md:pt-8">{children}</div>
      </div>
    </>
  );
}

// A card of settings rows: the name and what it does on the leading side,
// the control on the trailing side.
export function SettingsCard({ title, count, actions, children }: { title: string; count?: number; actions?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center gap-2">
        <h2 className="text-sm font-semibold text-ink-2">{title}</h2>
        {count !== undefined ? <span className="text-sm text-ink-2 tabular-nums">{count}</span> : null}
        {actions ? <div className="ms-auto flex items-center gap-1">{actions}</div> : null}
      </div>
      <div className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">{children}</div>
    </section>
  );
}

export function SettingRow({
  id,
  title,
  description,
  children,
  below,
}: {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  below?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[200px] flex-1">
          <h3 id={id} className="text-ui font-medium">
            {title}
          </h3>
          {description ? <div className="mt-0.5 max-w-[52ch] text-sm text-ink-2 text-pretty">{description}</div> : null}
        </div>
        {children}
      </div>
      {below}
    </div>
  );
}

// The lead line under a settings page's bar: who these settings are for.
export function SettingsLead({ children }: { children: ReactNode }) {
  return <p className="max-w-[60ch] text-ui text-ink-2 text-pretty">{children}</p>;
}
