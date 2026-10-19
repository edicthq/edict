import { Button, Input, cn } from "@edicthq/ui";
import { GroupHeader, PageBody, PageHeader } from "../components/shell.js";
import { useToast } from "../components/toast.js";
import { useState } from "react";
import { accentNames, accents, getOrgDefaultAccent, setAppearance, setOrgDefaultAccent, themes, useAppearance, type Accent, type Theme } from "../lib/appearance.js";
import { ApiFailure, api } from "../lib/api.js";
import { useUpdateOrganization } from "../lib/queries.js";
import { useOrg } from "./org.js";

const themeOptions: Record<Theme, { label: string; hint: string }> = {
  system: { label: "System", hint: "Follows your device." },
  light: { label: "Light", hint: "Always light." },
  dark: { label: "Dark", hint: "Always dark." },
};

// Personal settings. Appearance is saved in this browser for now; where it is
// stored for a person or an organization is still open (docs/design/tokens.md).
export function SettingsPage() {
  const { theme, accent } = useAppearance();
  const { canManage, orgId } = useOrg();
  const [orgDefaultAccent, setOrgDefaultAccentState] = useState<Accent>(() => getOrgDefaultAccent(orgId));

  return (
    <>
      <PageHeader title="Settings" />
      <PageBody className="flex max-w-[720px] flex-col gap-6">
        <section aria-labelledby="theme-heading" className="flex flex-col gap-2">
          <GroupHeader>
            <span id="theme-heading">Theme</span>
          </GroupHeader>
          <div role="radiogroup" aria-labelledby="theme-heading" className="mx-3 inline-flex w-fit gap-0.5 rounded-md bg-hover p-[3px]">
            {themes.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={theme === value}
                onClick={() => setAppearance({ theme: value })}
                className={cn(
                  "h-7 rounded-[7px] px-3 text-ui font-medium transition-[background-color,color] duration-[140ms] ease-standard",
                  theme === value
                    ? "bg-surface text-ink shadow-[0_0_0_1px_var(--line)]"
                    : "text-ink-2 hover:text-ink",
                )}
              >
                {themeOptions[value].label}
              </button>
            ))}
          </div>
          <p className="px-3 text-sm text-ink-2">{themeOptions[theme].hint}</p>
        </section>

        <section aria-labelledby="accent-heading" className="flex flex-col gap-2">
          <GroupHeader>
            <span id="accent-heading">Agent color</span>
          </GroupHeader>
          <p className="max-w-[60ch] px-3 text-ui text-ink-2 text-pretty">
            Agents, and only agents, wear this color: their avatars, their names and their live work. Humans stay in
            ink.
          </p>
          <div role="radiogroup" aria-labelledby="accent-heading" className="flex flex-wrap gap-2 px-3 pt-1">
            {accents.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={accent === value}
                data-accent={value}
                onClick={() => setAppearance({ accent: value })}
                className={cn(
                  "flex h-9 items-center gap-2 rounded-sm px-3 text-ui transition-[background-color,box-shadow] duration-[140ms] ease-standard",
                  accent === value
                    ? "bg-surface font-medium text-ink shadow-[inset_0_0_0_1.5px_var(--agent)]"
                    : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:text-ink",
                )}
              >
                <span aria-hidden="true" className="size-4 rounded-[5px] bg-agent" />
                {accentNames[value]}
              </button>
            ))}
          </div>
        </section>
        {canManage ? (
          <section aria-labelledby="org-accent-heading" className="flex flex-col gap-2">
            <GroupHeader>
              <span id="org-accent-heading">Organization default agent color</span>
            </GroupHeader>
            <p className="max-w-[60ch] px-3 text-ui text-ink-2 text-pretty">
              The default accent color for new members joining this organization.
            </p>
            <div role="radiogroup" aria-labelledby="org-accent-heading" className="flex flex-wrap gap-2 px-3 pt-1">
              {accents.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={orgDefaultAccent === value}
                  data-accent={value}
                  onClick={() => {
                    setOrgDefaultAccent(orgId, value);
                    setOrgDefaultAccentState(value);
                  }}
                  className={cn(
                    "flex h-9 items-center gap-2 rounded-sm px-3 text-ui transition-[background-color,box-shadow] duration-[140ms] ease-standard",
                    orgDefaultAccent === value
                      ? "bg-surface font-medium text-ink shadow-[inset_0_0_0_1.5px_var(--agent)]"
                      : "text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] hover:bg-hover hover:text-ink",
                  )}
                >
                  <span aria-hidden="true" className="size-4 rounded-[5px] bg-agent" />
                  {accentNames[value]}
                </button>
              ))}
            </div>
          </section>
        ) : null}
        {canManage ? <JoinDomainSection /> : null}
        {canManage ? <OrganizationExportSection orgId={orgId} /> : null}
      </PageBody>
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
    <section aria-labelledby="join-heading" className="flex flex-col gap-2">
      <GroupHeader>
        <span id="join-heading">Joining by domain</span>
      </GroupHeader>
      <p className="max-w-[60ch] px-3 text-ui text-ink-2 text-pretty">
        Anyone who verifies an email address at this domain can join as a Member, without an invite. Leave it empty
        to let people in by invite only.
      </p>
      <form
        className="flex flex-wrap items-center gap-2 px-3"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate(
            { joinDomain: text.trim() || null },
            { onSuccess: () => toast(text.trim() ? `People at ${text.trim()} can join` : "Joining by domain is off"), onError: (error) => toast(error.message) },
          );
        }}
      >
        <Input aria-label="Domain" placeholder="acme.com" value={text} onChange={(event) => setValue(event.target.value)} className="max-w-[280px]" />
        <Button type="submit" disabled={update.isPending || text.trim() === current}>
          Save
        </Button>
      </form>
    </section>
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
    <section aria-labelledby="export-heading" className="flex flex-col gap-2">
      <GroupHeader>
        <span id="export-heading">Export</span>
      </GroupHeader>
      <p className="max-w-[60ch] px-3 text-ui text-ink-2 text-pretty">
        Download the whole organization as a zip: a JSON document of your teams, issues, comments and
        settings, plus every attachment. Secrets are not included.
      </p>
      <div className="px-3">
        <button
          type="button"
          onClick={download}
          disabled={busy}
          className={cn(
            "h-8 rounded-[7px] bg-surface px-3 text-ui font-medium shadow-[0_0_0_1px_var(--line)] transition hover:bg-hover disabled:opacity-50",
          )}
        >
          {busy ? "Preparing…" : "Download export"}
        </button>
      </div>
    </section>
  );
}
