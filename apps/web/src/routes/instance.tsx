import type { SignUpMode } from "@edicthq/client";
import { Button, Input, cn } from "@edicthq/ui";
import { useState } from "react";
import { FormError, GroupHeader, Loading, PageBody, PageHeader } from "../components/shell.js";
import { ago } from "../lib/issues.js";
import { useCheckForUpdate, useInstance, useInstanceStatus, useInstanceUsers, useUpdateInstance } from "../lib/queries.js";

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
        <InstanceStatusSection />
        <UpdatesSection />
        <TelemetrySection />
        <InstanceUsersSection />
      </PageBody>
    </>
  );
}

// How email and attachment storage are set up. Both come from the server's
// environment (docker/compose.yml), so they show here and change there.
function InstanceStatusSection() {
  const status = useInstanceStatus(true);
  if (!status.data) return null;
  const rows: [string, string][] = [
    [
      "Email",
      status.data.email.configured
        ? `Sends from ${status.data.email.from ?? "the configured sender"}`
        : "Off. Invites are links to share by hand, and there is no password reset. Set SMTP_URL and EMAIL_FROM to turn it on.",
    ],
    [
      "Attachments",
      status.data.storage.kind === "s3"
        ? `S3 bucket ${status.data.storage.location}`
        : `Local disk at ${status.data.storage.location}. Several replicas need S3 or a shared volume.`,
    ],
    ["Version", status.data.version],
  ];
  return (
    <section aria-labelledby="status-heading" className="flex flex-col gap-2">
      <GroupHeader>
        <span id="status-heading">Setup</span>
      </GroupHeader>
      <dl className="mx-3 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-ui">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="font-medium text-ink">{term}</dt>
            <dd className="text-ink-2 text-pretty">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function checkedAgo(iso: string): string {
  const since = ago(iso);
  return since === "now" ? "just now" : `${since} ago`;
}

// Whether a newer Edict is out, from the daily check of GitHub's releases.
function UpdatesSection() {
  const status = useInstanceStatus(true);
  const update = useUpdateInstance();
  const checkNow = useCheckForUpdate();
  // The switch's new state until the change settles.
  const [pendingCheck, setPendingCheck] = useState<boolean | null>(null);
  if (!status.data) return null;
  const { version } = status.data;
  const updates = { ...status.data.updates, check: pendingCheck ?? status.data.updates.check };
  let summary: string;
  if (!updates.check) summary = "Off. Edict does not look for new releases.";
  else if (updates.available && updates.latest) summary = `Edict ${updates.latest.version} is out. This instance runs ${version}.`;
  else if (updates.latest) summary = `Up to date: ${version} is the latest release.`;
  else summary = "Not checked yet.";
  return (
    <section aria-labelledby="updates-heading" className="flex flex-col gap-2">
      <GroupHeader>
        <span id="updates-heading">Updates</span>
      </GroupHeader>
      <div className="mx-3 flex flex-col gap-3 text-ui">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--ink)]"
            checked={updates.check}
            disabled={update.isPending}
            onChange={(event) => {
              setPendingCheck(event.target.checked);
              update.mutate({ updateCheck: event.target.checked }, { onSettled: () => setPendingCheck(null) });
            }}
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium text-ink">Check for new releases</span>
            <span className="text-ink-2 text-pretty">
              Once a day, Edict asks GitHub for its latest release. The request carries nothing about this instance.
            </span>
          </span>
        </label>
        <p className="text-ink-2 text-pretty" aria-live="polite">
          {summary}
          {updates.check && updates.checkedAt ? ` Checked ${checkedAgo(updates.checkedAt)}.` : ""}
          {updates.available && updates.latest ? (
            <>
              {" "}
              <a href={updates.latest.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
                Release notes
              </a>
              . Upgrade with <code className="font-code text-sm">docker compose pull && docker compose up -d</code>.
            </>
          ) : null}
        </p>
        {updates.check && updates.error ? <p className="text-ink-2">The last check failed: {updates.error}</p> : null}
        {updates.check ? (
          <span>
            <Button type="button" variant="ghost" disabled={checkNow.isPending} onClick={() => checkNow.mutate()}>
              {checkNow.isPending ? "Checking…" : "Check now"}
            </Button>
          </span>
        ) : null}
        <FormError message={update.error?.message ?? checkNow.error?.message} />
      </div>
    </section>
  );
}

// Opt-in telemetry (ADR 0026): the switch, and the exact payload it sends.
function TelemetrySection() {
  const status = useInstanceStatus(true);
  const update = useUpdateInstance();
  const [pending, setPending] = useState<boolean | null>(null);
  if (!status.data) return null;
  const { telemetry } = status.data;
  const enabled = pending ?? telemetry.enabled;
  return (
    <section aria-labelledby="telemetry-heading" className="flex flex-col gap-2">
      <GroupHeader>
        <span id="telemetry-heading">Telemetry</span>
      </GroupHeader>
      <div className="mx-3 flex flex-col gap-3 text-ui">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--ink)]"
            checked={enabled}
            disabled={update.isPending}
            onChange={(event) => {
              setPending(event.target.checked);
              update.mutate({ telemetry: event.target.checked }, { onSettled: () => setPending(null) });
            }}
          />
          <span className="flex flex-col gap-1">
            <span className="font-medium text-ink">Share usage numbers with Edict</span>
            <span className="text-ink-2 text-pretty">
              Off unless you turn it on. Once a day, Edict sends exactly this to telemetry.edict.dev: no instance id, no
              address, and the collector keeps no IP addresses. It helps the project see which versions are in use.
            </span>
          </span>
        </label>
        <figure className="flex flex-col gap-1">
          <figcaption className="text-ink-2">The payload, as sent</figcaption>
          <pre className="rounded-md border border-line bg-surface px-3 py-2 font-code text-sm text-ink">
            {JSON.stringify(telemetry.payload, null, 2)}
          </pre>
        </figure>
        {enabled && telemetry.sentAt ? <p className="text-ink-2">Last sent {checkedAgo(telemetry.sentAt)}.</p> : null}
        {enabled && telemetry.error ? <p className="text-ink-2">The last ping failed: {telemetry.error}</p> : null}
        <FormError message={update.error?.message} />
      </div>
    </section>
  );
}

function InstanceUsersSection() {
  const [page, setPage] = useState(0);
  const users = useInstanceUsers(page, true);
  if (!users.data) return null;
  const pages = Math.max(1, Math.ceil(users.data.total / 50));
  return (
    <section aria-labelledby="users-heading" className="flex flex-col gap-2">
      <GroupHeader count={users.data.total}>
        <span id="users-heading">Users</span>
      </GroupHeader>
      <ul className="flex flex-col gap-px">
        {users.data.users.map((person) => (
          <li key={person.id} className="flex min-h-9 items-center gap-3 rounded-sm px-3 text-ui">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium text-ink">{person.name}</span> <span className="text-ink-2">{person.email}</span>
            </span>
            {person.instanceAdmin ? <span className="text-sm text-ink-2">Instance admin</span> : null}
            {!person.emailVerified ? <span className="text-sm text-ink-2">Unverified</span> : null}
            <span className="w-28 shrink-0 text-end text-sm text-ink-2 tabular-nums">
              {person.organizations} {person.organizations === 1 ? "organization" : "organizations"}
            </span>
            <time dateTime={person.createdAt} className="w-20 shrink-0 text-end text-sm text-ink-2">
              {ago(person.createdAt)}
            </time>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <div className="flex items-center gap-2 px-3 text-sm text-ink-2">
          <Button variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span className="tabular-nums">
            {page + 1} of {pages}
          </span>
          <Button variant="ghost" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      ) : null}
    </section>
  );
}

