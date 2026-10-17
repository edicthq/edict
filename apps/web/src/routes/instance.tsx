import type { SignUpMode } from "@edicthq/client";
import { cn } from "@edicthq/ui";
import { FormError, GroupHeader, Loading, PageBody, PageHeader } from "../components/shell.js";
import { useInstance, useSetSignUpMode } from "../lib/queries.js";

const modes: { value: SignUpMode; label: string; description: string }[] = [
  { value: "open", label: "Open", description: "Anyone who can reach this instance can create an account." },
  {
    value: "invite_only",
    label: "Invite only",
    description: "Only people with an open invite to an organization here can create an account.",
  },
];

export function InstancePage() {
  const instance = useInstance();
  const setMode = useSetSignUpMode();

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
                    onChange={() => setMode.mutate(mode.value)}
                    className="mt-0.5 size-4 accent-[var(--ink)]"
                  />
                  <span>
                    <span className="block text-body font-medium">{mode.label}</span>
                    <span className="block text-ui text-ink-2 text-pretty">{mode.description}</span>
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
