import { Avatar, Button, Input, ProgressBadge, cn } from "@edicthq/ui";
import { Bot, Building2, Download, Server, SlidersHorizontal, Users } from "lucide-react";
import { NavLink, useParams } from "react-router";
import { PageHeader } from "../components/shell.js";
import { firstName } from "../lib/agents.js";
import { useToast } from "../components/toast.js";
import { type ReactNode, useState } from "react";
import { accentNames, accents, setAppearance, themes, useAppearance, type Accent, type Theme } from "../lib/appearance.js";
import { ApiFailure, api } from "../lib/api.js";
import { useUpdateOrganization } from "../lib/queries.js";
import { useOrg } from "./org.js";

const themeOptions: Record<Theme, { label: string; hint: string }> = {
  system: { label: "System", hint: "Follows your device." },
  light: { label: "Light", hint: "Always light." },
  dark: { label: "Dark", hint: "Always dark." },
};

// Settings in two places: yours (/settings), kept in this browser, and for
// Admins the organization's (/settings/organization). A subnav joins them with
// the other pages people manage: members, agents and the instance.
export function SettingsPage() {
  const { section } = useParams();
  const { canManage, slug, instanceAdmin } = useOrg();
  const organization = section === "organization" && canManage;
  const item = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex h-7 items-center gap-2 rounded-sm px-2 text-ui",
      isActive ? "bg-hover font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
    );
  return (
    <>
      <PageHeader title={organization ? "Organization settings" : "Preferences"} />
      <div className="grid min-h-0 grid-cols-1 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings" className="flex flex-col gap-4 border-line px-3 py-5 md:min-h-[calc(100dvh-48px)] md:border-e">
          <div className="flex flex-col gap-px">
            <h2 className="px-2 pb-1 text-sm font-semibold text-ink-2">You</h2>
            <NavLink to={`/${slug}/settings`} end className={item}>
              <SlidersHorizontal aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Preferences
            </NavLink>
          </div>
          <div className="flex flex-col gap-px">
            <h2 className="px-2 pb-1 text-sm font-semibold text-ink-2">Organization</h2>
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
            <div className="flex flex-col gap-px">
              <h2 className="flex items-baseline gap-1.5 px-2 pb-1 text-sm font-semibold text-ink-2">
                Instance <span className="text-meta font-normal">admin</span>
              </h2>
              <NavLink to={`/${slug}/instance`} className={item}>
                <Server aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
                Instance settings
              </NavLink>
            </div>
          ) : null}
        </nav>
        <div className="flex max-w-[720px] flex-col gap-8 px-6 pt-6 pb-28 md:px-10">
          {organization ? <OrganizationSettings /> : <Preferences />}
        </div>
      </div>
    </>
  );
}

// A card of settings rows: the name and what it does on the leading side,
// the control on the trailing side.
function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-ink-2">{title}</h2>
      <div className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">{children}</div>
    </section>
  );
}

function SettingRow({ id, title, description, children, below }: { id: string; title: string; description?: ReactNode; children?: ReactNode; below?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[220px] flex-1">
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

// Five swatches. The chosen one wears an ink ring: choosing is a human act,
// so it is ink, while each swatch shows its own agent color.
function AccentSwatches({ labelledBy, value, onPick, disabled }: { labelledBy: string; value: Accent; onPick: (accent: Accent) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex items-center gap-2">
      {accents.map((accent) => (
        <button
          key={accent}
          type="button"
          role="radio"
          aria-checked={value === accent}
          aria-label={accentNames[accent]}
          title={accentNames[accent]}
          data-accent={accent}
          disabled={disabled}
          onClick={() => onPick(accent)}
          className={cn(
            "grid size-7 place-items-center rounded-full transition-[box-shadow] duration-[140ms] ease-standard",
            value === accent ? "shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--ink)]" : "hover:shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--line-strong)]",
          )}
        >
          <span aria-hidden="true" className="size-6 rounded-full bg-agent" />
        </button>
      ))}
    </div>
  );
}

function Preferences() {
  const { theme, accent, chosenAccent } = useAppearance();
  const { membership } = useOrg();
  const orgDefaultAccent: Accent = membership.organization.defaultAccent;
  return (
    <>
      <p className="text-ui text-ink-2">Only you see these. They are kept in this browser.</p>
      <SettingsCard title="Interface">
        <SettingRow id="theme-heading" title="Theme" description={themeOptions[theme].hint}>
          <div role="radiogroup" aria-labelledby="theme-heading" className="inline-flex gap-0.5 rounded-sm bg-hover p-0.5">
            {themes.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => setAppearance({ theme: value })}
                className={cn(
                  "h-7 rounded-[5px] px-3 text-ui font-medium transition-[background-color,color] duration-[140ms] ease-standard",
                  theme === value ? "bg-surface text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-2 hover:text-ink",
                )}
              >
                {themeOptions[value].label}
              </button>
            ))}
          </div>
        </SettingRow>
        <SettingRow
          id="accent-heading"
          title="Agent color"
          description={
            <>
              Agents, and only agents, wear this color. Humans stay in ink.{" "}
              {chosenAccent ? (
                <button type="button" className="underline underline-offset-4 hover:text-ink" onClick={() => setAppearance({ accent: null })}>
                  Use the organization's, {accentNames[orgDefaultAccent]}
                </button>
              ) : (
                `You're using the organization's, ${accentNames[orgDefaultAccent]}.`
              )}
            </>
          }
          below={
            <div className="flex flex-col gap-2 rounded-sm border border-line bg-bg px-3 py-2.5 text-ui">
              <span className="flex items-center gap-2">
                <Avatar name="Claude Code" kind="agent" size={18} />
                <span className="font-medium text-agent-ink">Claude Code</span>
                <ProgressBadge state="working" />
                <span className="truncate text-ink-2">Writing the agents roster</span>
              </span>
              <span className="flex items-center gap-2">
                <Avatar name={membership.member.name} size={18} />
                <span className="font-medium">{firstName(membership.member.name)}</span>
                <span className="text-ink-2">assigned EDI-6 to Claude Code</span>
              </span>
            </div>
          }
        >
          <AccentSwatches labelledBy="accent-heading" value={accent} onPick={(value) => setAppearance({ accent: value })} />
        </SettingRow>
      </SettingsCard>
    </>
  );
}

function OrganizationSettings() {
  const { orgId, membership } = useOrg();
  const updateOrganization = useUpdateOrganization(orgId);
  const toast = useToast();
  const orgDefaultAccent: Accent = membership.organization.defaultAccent;
  return (
    <>
      <p className="text-ui text-ink-2">Owners and admins manage these for everyone in {membership.organization.name}.</p>
      <SettingsCard title="General">
        <SettingRow id="org-accent-heading" title="Organization default agent color" description="The agent color everyone here sees until they pick their own.">
          <AccentSwatches
            labelledBy="org-accent-heading"
            value={orgDefaultAccent}
            disabled={updateOrganization.isPending}
            onPick={(value) => updateOrganization.mutate({ defaultAccent: value }, { onError: (error) => toast(error.message) })}
          />
        </SettingRow>
        <JoinDomainSection />
      </SettingsCard>
      <SettingsCard title="Data">
        <OrganizationExportSection orgId={orgId} />
      </SettingsCard>
    </>
  );
}

// Owners and admins can download the organization as a zip: one JSON document
// plus every attachment. The web cannot open the zip itself, so it hands the
// browser the response's own file name.
// The domain rule: anyone who verifies an address at this domain may join
// as a Member, without an invite.
function JoinDomainSection() {
  const { orgId, membership } = useOrg();
  const update = useUpdateOrganization(orgId);
  const toast = useToast();
  const [value, setValue] = useState<string | null>(null);
  const current = membership.organization.joinDomain ?? "";
  const text = value ?? current;

  return (
    <SettingRow
      id="join-heading"
      title="Joining by domain"
      description="Anyone who verifies an email address at this domain can join as a Member, without an invite. Leave it empty for invites only."
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate(
            { joinDomain: text.trim() || null },
            { onSuccess: () => toast(text.trim() ? `People at ${text.trim()} can join` : "Joining by domain is off"), onError: (error) => toast(error.message) },
          );
        }}
      >
        <Input aria-label="Domain" placeholder="acme.com" value={text} onChange={(event) => setValue(event.target.value)} className="w-44" />
        <Button type="submit" disabled={update.isPending || text.trim() === current}>
          Save
        </Button>
      </form>
    </SettingRow>
  );
}

function OrganizationExportSection({ orgId }: { orgId: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const download = async () => {
    setBusy(true);
    try {
      // parseAs: the zip is not JSON, and openapi-fetch's default parse
      // assumes it is.
      const { data: blob, response } = await api.GET("/organizations/{orgId}/export", {
        params: { path: { orgId } },
        parseAs: "blob",
      });
      if (!response.ok || blob === undefined) throw new ApiFailure(response.status, "unknown", `The server answered ${response.status}.`);
      const name =
        response.headers.get("content-disposition")?.match(/filename="(.+)"/)?.[1] ?? "edict-export.zip";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      URL.revokeObjectURL(url);
      toast("Export downloaded");
    } catch (error) {
      toast(error instanceof Error ? error.message : "The export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingRow
      id="export-heading"
      title="Export"
      description="The whole organization as a zip: a JSON document of your teams, issues, comments and settings, plus every attachment. Secrets are not included."
    >
      <Button onClick={download} disabled={busy}>
        <Download aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        {busy ? "Preparing…" : "Download export"}
      </Button>
    </SettingRow>
  );
}
