import { cn } from "@edicthq/ui";
import { GroupHeader, PageBody, PageHeader } from "../components/shell.js";
import { useState } from "react";
import { accentNames, accents, getOrgDefaultAccent, setAppearance, setOrgDefaultAccent, themes, useAppearance, type Accent, type Theme } from "../lib/appearance.js";
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
      </PageBody>
    </>
  );
}
