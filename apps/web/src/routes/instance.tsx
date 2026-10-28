import type { SignUpMode } from "@edicthq/client";
import { Avatar, Badge, Button, Input, Radio, Switch, cn } from "@edicthq/ui";
import { type ReactNode, useState } from "react";
import { SettingRow, SettingsCard, SettingsFrame, SettingsLead } from "../components/settings-frame.js";
import { FormError, Loading } from "../components/shell.js";
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
    <SettingsFrame title="Instance settings">
      <SettingsLead>These settings cover every organization on this instance. Only instance admins see them.</SettingsLead>
      {instance.isPending ? (
        <Loading />
      ) : (
        <fieldset disabled={setMode.isPending} className="contents">
          <SettingsCard title="Who can sign up">
            {modes.map((mode) => {
              const checked = instance.data?.signUpMode === mode.value;
              const unavailable = mode.value === "domain" && !instance.data?.sendsEmail;
              return (
                <div key={mode.value} className="flex flex-col gap-3 px-5 py-4">
                  <label className={cn("flex items-start gap-3", unavailable ? "cursor-default" : "cursor-pointer")}>
                    <Radio
                      name="sign-up-mode"
                      value={mode.value}
                      checked={checked}
                      disabled={unavailable}
                      onChange={() =>
                        setMode.mutate(mode.value === "domain" ? { signUpMode: "domain", signUpDomains: parsedDomains } : { signUpMode: mode.value })
                      }
                      className="mt-px"
                    />
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span className={cn("text-ui font-medium", unavailable && "text-ink-2")}>{mode.label}</span>
                      <span className="text-sm text-ink-2 text-pretty">
                        {mode.description}
                        {unavailable ? " It needs email set up, so Edict can verify each address." : ""}
                      </span>
                    </span>
                  </label>
                  {mode.value === "domain" && instance.data?.sendsEmail ? (
                    <div className="flex flex-wrap items-center gap-2 ps-7">
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
                    </div>
                  ) : null}
                </div>
              );
            })}
          </SettingsCard>
        </fieldset>
      )}
      <FormError message={setMode.error?.message} />
      <InstanceStatusSection />
      <UpdatesSection />
      <TelemetrySection />
      <InstanceUsersSection />
    </SettingsFrame>
  );
}

// How email and attachment storage are set up. Both come from the server's
// environment (docker/compose.yml), so they show here and change there.
function InstanceStatusSection() {
  const status = useInstanceStatus(true);
  if (!status.data) return null;
  const rows: [string, ReactNode][] = [
    [
      "Email",
      status.data.email.configured ? (
        `Sends from ${status.data.email.from ?? "the configured sender"}`
      ) : (
        <>
          Off. Invites are links to share by hand, and there is no password reset. Set <Code>SMTP_URL</Code> and{" "}
          <Code>EMAIL_FROM</Code> to turn it on.
        </>
      ),
    ],
    [
      "Attachments",
      status.data.storage.kind === "s3" ? (
        `S3 bucket ${status.data.storage.location}`
      ) : (
        <>
          Local disk at <Code>{status.data.storage.location}</Code>. Several replicas need S3 or a shared volume.
        </>
      ),
    ],
    ["Version", status.data.version],
  ];
  return (
    <SettingsCard title="Setup">
      <dl className="flex flex-col divide-y divide-line">
        {rows.map(([term, value]) => (
          <div key={term} className="grid gap-x-6 gap-y-1 px-5 py-3.5 text-ui sm:grid-cols-[120px_minmax(0,1fr)]">
            <dt className="font-medium text-ink">{term}</dt>
            <dd className="min-w-0 text-ink-2 text-pretty [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
    </SettingsCard>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-xs bg-hover px-1 py-px font-code text-code font-medium text-ink">{children}</code>;
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
    <SettingsCard title="Updates">
      <SettingRow
        id="updates-check"
        title="Check for new releases"
        description="Once a day, Edict asks GitHub for its latest release. The request carries nothing about this instance."
        below={
          <div className="flex flex-col gap-2 text-ui">
            <p className="text-ink-2 text-pretty" aria-live="polite">
              {summary}
              {updates.check && updates.checkedAt ? ` Checked ${checkedAgo(updates.checkedAt)}.` : ""}
              {updates.available && updates.latest ? (
                <>
                  {" "}
                  <a href={updates.latest.url} target="_blank" rel="noreferrer" className="text-ink underline underline-offset-2">
                    Release notes
                  </a>
                  . Upgrade with <Code>docker compose pull && docker compose up -d</Code>.
                </>
              ) : null}
            </p>
            {updates.check && updates.error ? <p className="text-ink-2">The last check failed: {updates.error}</p> : null}
            {updates.check ? (
              <span>
                <Button type="button" disabled={checkNow.isPending} onClick={() => checkNow.mutate()}>
                  {checkNow.isPending ? "Checking…" : "Check now"}
                </Button>
              </span>
            ) : null}
            <FormError message={update.error?.message ?? checkNow.error?.message} />
          </div>
        }
      >
        <Switch
          aria-labelledby="updates-check"
          checked={updates.check}
          disabled={update.isPending}
          onChange={(event) => {
            setPendingCheck(event.target.checked);
            update.mutate({ updateCheck: event.target.checked }, { onSettled: () => setPendingCheck(null) });
          }}
        />
      </SettingRow>
    </SettingsCard>
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
    <SettingsCard title="Telemetry">
      <SettingRow
        id="telemetry-share"
        title="Share usage numbers with Edict"
        description="Off unless you turn it on. Once a day, Edict sends exactly this to telemetry.edict.dev: no instance id, no address, and the collector keeps no IP addresses. It helps the project see which versions are in use."
        below={
          <div className="flex flex-col gap-2 text-ui">
            <figure className="flex flex-col gap-1.5">
              <figcaption className="text-sm text-ink-2">The payload, as sent</figcaption>
              <pre className="overflow-x-auto rounded-sm bg-bg px-3 py-2 font-code text-sm text-ink shadow-[inset_0_0_0_1px_var(--line)]">
                {JSON.stringify(telemetry.payload, null, 2)}
              </pre>
            </figure>
            {enabled && telemetry.sentAt ? <p className="text-ink-2">Last sent {checkedAgo(telemetry.sentAt)}.</p> : null}
            {enabled && telemetry.error ? <p className="text-ink-2">The last ping failed: {telemetry.error}</p> : null}
            <FormError message={update.error?.message} />
          </div>
        }
      >
        <Switch
          aria-labelledby="telemetry-share"
          checked={enabled}
          disabled={update.isPending}
          onChange={(event) => {
            setPending(event.target.checked);
            update.mutate({ telemetry: event.target.checked }, { onSettled: () => setPending(null) });
          }}
        />
      </SettingRow>
    </SettingsCard>
  );
}

function InstanceUsersSection() {
  const [page, setPage] = useState(0);
  const users = useInstanceUsers(page, true);
  if (!users.data) return null;
  const pages = Math.max(1, Math.ceil(users.data.total / 50));
  return (
    <SettingsCard title="Users" count={users.data.total}>
      <ul className="flex flex-col divide-y divide-line">
        {users.data.users.map((person) => (
          <li key={person.id} className="flex min-h-12 items-center gap-3 px-4 py-2 text-ui">
            <Avatar name={person.name} size={22} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-medium text-ink">{person.name}</span>
              <span className="truncate text-sm text-ink-2">{person.email}</span>
            </span>
            {person.instanceAdmin ? <Badge>Instance admin</Badge> : null}
            {!person.emailVerified ? <Badge>Unverified</Badge> : null}
            <span className="shrink-0 text-end text-sm text-ink-2 tabular-nums max-sm:hidden">
              {person.organizations} {person.organizations === 1 ? "organization" : "organizations"}
            </span>
            <time dateTime={person.createdAt} className="w-10 shrink-0 text-end text-sm text-ink-2 tabular-nums">
              {ago(person.createdAt)}
            </time>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <div className="flex items-center gap-2 px-4 py-2 text-sm text-ink-2">
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
    </SettingsCard>
  );
}
