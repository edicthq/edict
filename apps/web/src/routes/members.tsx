import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { CreatedInvite, Member, Role } from "@edicthq/client";
import { z } from "zod";
import { Avatar, Badge, Button, Field, Input, Select } from "@edicthq/ui";
import { FormError, Loading, PageHeader, SectionLabel } from "../components/shell.js";
import {
  useCreateInvite,
  useInvites,
  useMembers,
  useRemoveMember,
  useRevokeInvite,
  useTeams,
  useUpdateMemberRole,
} from "../lib/queries.js";
import { useOrg } from "./org.js";

export const roleLabel: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

const roleHint: Record<Role, string> = {
  owner: "Everything, including deleting the organization.",
  admin: "Manages members, teams, agents and settings.",
  member: "Works in every public team and their private ones.",
  guest: "Works only in the teams they're invited to.",
};

const allRoles: Role[] = ["owner", "admin", "member", "guest"];

export function MembersPage() {
  const { orgId, canManage, membership } = useOrg();
  const members = useMembers(orgId);
  const me = membership.member;

  return (
    <>
      <PageHeader title="Members" />
      <div className="mx-auto flex max-w-[760px] flex-col gap-10 px-6 py-8">
        {canManage ? <InviteSection /> : null}
        <section aria-labelledby="members" className="flex flex-col gap-3">
          <SectionLabel id="members">
            People and agents <span className="tabular-nums">{members.data?.length ?? ""}</span>
          </SectionLabel>
          {members.isPending ? (
            <Loading label="Loading members" />
          ) : (
            <ul className="flex flex-col">
              {members.data?.map((member) => (
                <MemberRow key={member.id} member={member} me={me} canManage={canManage} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

function MemberRow({ member, me, canManage }: { member: Member; me: Member; canManage: boolean }) {
  const { orgId } = useOrg();
  const updateRole = useUpdateMemberRole(orgId);
  const remove = useRemoveMember(orgId);
  const isMe = member.id === me.id;
  // Only Owners grant or take away the Owner role.
  const canEdit = canManage && (me.role === "owner" || member.role !== "owner");
  const roles = allRoles.filter((role) =>
    member.kind === "agent" ? role === "member" || role === "guest" : me.role === "owner" || role !== "owner",
  );
  const error = updateRole.error ?? remove.error;

  return (
    <li className="border-b border-line last:border-b-0">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 px-2 py-2">
        <Avatar name={member.name} kind={member.kind} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium">
            {member.name}
            {isMe ? <span className="font-normal text-ink-2"> (you)</span> : null}
          </p>
          {member.email ? <p className="truncate text-sm text-ink-2">{member.email}</p> : null}
        </div>
        {canEdit ? (
          <label className="flex items-center">
            <span className="sr-only">Role of {member.name}</span>
            <Select
              className="w-[120px] sm:h-8"
              value={member.role}
              disabled={updateRole.isPending}
              onChange={(event) => updateRole.mutate({ memberId: member.id, role: event.target.value as Role })}
            >
              {roles.map((role) => (
                <option key={role} value={role}>
                  {roleLabel[role]}
                </option>
              ))}
            </Select>
          </label>
        ) : (
          <Badge>{roleLabel[member.role]}</Badge>
        )}
        {canEdit || isMe ? (
          <Button
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              const question = isMe
                ? "Leave this organization? You'll need a new invite to come back."
                : `Remove ${member.name} from this organization? Their history stays.`;
              if (window.confirm(question)) remove.mutate(member.id);
            }}
          >
            {isMe ? "Leave" : "Remove"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="px-2 pb-2 text-sm text-ink">
          {error.message}
        </p>
      ) : null}
    </li>
  );
}

const InviteForm = z.object({
  email: z.email("Enter an email address, like name@example.com."),
  role: z.enum(["owner", "admin", "member", "guest"]),
  teamIds: z.array(z.string()),
});

function InviteSection() {
  const { orgId, membership } = useOrg();
  const teams = useTeams(orgId);
  const invites = useInvites(orgId, true);
  const create = useCreateInvite(orgId);
  const revoke = useRevokeInvite(orgId);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const form = useForm({
    resolver: zodResolver(InviteForm),
    defaultValues: { email: "", role: "member" as Role, teamIds: [] as string[] },
  });
  const role = form.watch("role");
  const roles = allRoles.filter((r) => membership.member.role === "owner" || r !== "owner");

  const onSubmit = form.handleSubmit(async (values) => {
    setCreated(null);
    try {
      setCreated(await create.mutateAsync(values));
      form.reset({ email: "", role: values.role, teamIds: [] });
    } catch {
      // Shown from create.error.
    }
  });

  return (
    <section aria-labelledby="invite" className="flex flex-col gap-4">
      <SectionLabel id="invite">Invite someone</SectionLabel>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-md border border-line bg-surface p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
          <Field label="Email" error={form.formState.errors.email?.message}>
            {(control) => (
              <Input {...control} type="email" autoComplete="off" placeholder="name@example.com" {...form.register("email")} />
            )}
          </Field>
          <Field label="Role" hint={roleHint[role]}>
            {(control) => (
              <Select {...control} {...form.register("role")}>
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel[r]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        {teams.data?.length ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-semibold text-ink-2">
              Teams to join{role === "guest" ? " (a guest sees only these)" : ""}
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {teams.data.map((team) => (
                <label key={team.id} className="flex items-center gap-2 text-ui">
                  <input
                    type="checkbox"
                    value={team.id}
                    className="size-4 accent-[var(--ink)]"
                    {...form.register("teamIds")}
                  />
                  {team.name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <FormError message={create.error?.message} />
        <div>
          <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating invite…" : "Create invite link"}
          </Button>
        </div>
        {created ? <InviteLink invite={created} /> : null}
      </form>

      {invites.data?.length ? (
        <div className="flex flex-col gap-2">
          <SectionLabel>
            Open invites <span className="tabular-nums">{invites.data.length}</span>
          </SectionLabel>
          <ul className="flex flex-col">
            {invites.data.map((invite) => (
              <li key={invite.id} className="flex h-11 items-center gap-3 border-b border-line px-2 last:border-b-0">
                <span className="truncate text-body">{invite.email}</span>
                <Badge>{roleLabel[invite.role]}</Badge>
                <span className="ms-auto text-sm text-ink-2 tabular-nums">
                  Expires {new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <Button variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(invite.id)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function InviteLink({ invite }: { invite: CreatedInvite }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="flex flex-col gap-2 border-t border-line pt-4">
      <p className="text-ui text-pretty">
        {invite.emailSent ? (
          <>
            Invite emailed to <span className="font-semibold">{invite.email}</span>. You can also send them this link.
          </>
        ) : (
          <>
            Send this link to <span className="font-semibold">{invite.email}</span>. This instance doesn't send email,
            so share it yourself.
          </>
        )}{" "}
        It works once, for that address, for seven days.
      </p>
      <div className="flex gap-2">
        <Input readOnly value={invite.url} className="font-code text-ui sm:text-ui" onFocus={(e) => e.target.select()} aria-label="Invite link" />
        <Button
          onClick={async () => {
            await navigator.clipboard.writeText(invite.url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Check aria-hidden="true" className="size-4" strokeWidth={2} /> : <Copy aria-hidden="true" className="size-4" strokeWidth={1.75} />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
