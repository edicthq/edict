import type { SignUpMode } from "@edicthq/client";
import { Button, Input, cn } from "@edicthq/ui";
import { useState } from "react";
import { FormError, GroupHeader, Loading, PageBody, PageHeader } from "../components/shell.js";
import { useInstance, useUpdateInstance } from "../lib/queries.js";

const modes: { value: SignUpMode; label: string; description: string }[] = [
  { value: "open", label: "Open", description: "Anyone who can reach this instance can sign up." },
  {
    value: "invite_only",
    label: "Invite only",
    description: "Only people with an open invite to an organization here can sign up.",
  },
  {
    value: "domain",
    label: "Domain",
    description: "People with an invite, and anyone who verifies an address at one of these domains.",
  },
];

export function InstancePage() {
  const instance = useInstance();
  const setMode = useUpdateInstance();
  const [domains, setDomains] = useState<string | null>(null);
  const domainText = domains ?? instance.data?.signUpDomains.join(", ") ?? "";
  const parsedDomains = domainText.split(/[\s,]+/).filter(Boolean);

  return (
    <>
      <PageHeader title="Instance" />
      <PageBody className="flex max-w-[720px] flex-col gap-4">
        <p className="max-w-[60ch] px-3 text-body text-ink-2 text-pretty">
          These settings cover every organization on this instance. Only instance admins see them.
        </p>
        {instance.isPending ? (
          <Loading />
        ) : (
          <fieldset className="flex flex-col gap-2" disabled={setMode.isPending}>
            <legend className="contents">
              <GroupHeader>Who can sign up</GroupHeader>
            </legend>
            {modes.map((mode) => {
              const checked = instance.data?.signUpMode === mode.value;
              return (
                <label
                  key={mode.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-[border-color,background-color] duration-[140ms] ease-standard",
                    checked ? "border-ink bg-surface" : "border-line hover:bg-hover",
                    "mx-3",
                  )}
                >
                  <input
                    type="radio"
                    name="sign-up-mode"
                    value={mode.value}
                    checked={checked}
                    disabled={mode.value === "domain" && !instance.data?.sendsEmail}
                    onChange={() =>
                      setMode.mutate(mode.value === "domain" ? { signUpMode: "domain", signUpDomains: parsedDomains } : { signUpMode: mode.value })
                    }
                    className="mt-0.5 size-4 accent-[var(--ink)]"
                  />
                  <span className="flex flex-1 flex-col gap-2">
                    <span className="block text-body font-medium">{mode.label}</span>
                    <span className="block text-ui text-ink-2 text-pretty">
                      {mode.description}
                      {mode.value === "domain" && !instance.data?.sendsEmail
                        ? " It needs email set up, so Edict can verify each address."
                        : ""}
                    </span>
                    {mode.value === "domain" && instance.data?.sendsEmail ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <Input
                          aria-label="Domains"
                          placeholder="acme.com, acme.dev"
                          value={domainText}
                          onChange={(event) => setDomains(event.target.value)}
                          className="max-w-[320px]"
                        />
                        <Button
                          type="button"
                          disabled={setMode.isPending || parsedDomains.length === 0}
                          onClick={() => setMode.mutate({ signUpDomains: parsedDomains, ...(checked ? {} : { signUpMode: "domain" }) })}
                        >
                          Save domains
                        </Button>
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <FormError message={setMode.error?.message} />
      </PageBody>
    </>
  );
}
