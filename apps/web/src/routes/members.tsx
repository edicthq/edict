import type { Member, Role } from "@edicthq/client";
import { Avatar, Badge, Button, SelectMenu, cn } from "@edicthq/ui";
import { SettingsCard, SettingsFrame } from "../components/settings-frame.js";
import { Loading } from "../components/shell.js";
import { allRoles, roleLabel } from "../lib/labels.js";
import { useInvites, useMembers, useRemoveMember, useRevokeInvite, useUpdateMemberRole } from "../lib/queries.js";
import { useOrg } from "./org.js";

export function MembersPage() {
  const { orgId, canManage, membership, openInvite } = useOrg();
  const members = useMembers(orgId);
  const humans = members.data?.filter((m) => m.kind === "human") ?? [];
  const agents = members.data?.filter((m) => m.kind === "agent") ?? [];

  return (
    <SettingsFrame
      title="Members"
      actions={
        canManage ? (
          <Button variant="primary" onClick={openInvite}>
            Invite people
          </Button>
        ) : null
      }
    >
      {members.isPending ? (
        <Loading label="Loading members" />
      ) : (
        <>
          <SettingsCard title="Humans" count={humans.length}>
            <ul className="flex flex-col divide-y divide-line">
              {humans.map((member) => (
                <MemberRow key={member.id} member={member} me={membership.member} canManage={canManage} />
              ))}
            </ul>
          </SettingsCard>
          {canManage ? <OpenInvites /> : null}
          {/* Agents join on their own when someone connects a client, so with
              none there is nothing to show here. */}
          {agents.length ? (
            <SettingsCard title="Agents" count={agents.length}>
              <ul className="flex flex-col divide-y divide-line">
                {agents.map((member) => (
                  <MemberRow key={member.id} member={member} me={membership.member} canManage={canManage} />
                ))}
              </ul>
            </SettingsCard>
          ) : null}
        </>
      )}
    </SettingsFrame>
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
    <li>
      <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
        <Avatar name={member.name} kind={member.kind} size={32} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className={cn("truncate text-ui font-medium", member.kind === "agent" && "text-agent-ink")}>
            {member.name}
            {isMe ? <span className="font-normal text-ink-2"> (you)</span> : null}
          </span>
          {member.email ? <span className="truncate text-sm text-ink-2">{member.email}</span> : null}
        </div>
        {canEdit ? (
          <SelectMenu
            label={`Role of ${member.name}`}
            align="end"
            className="w-[104px]"
            value={member.role}
            disabled={updateRole.isPending}
            options={roles.map((role) => ({ value: role, label: roleLabel[role] }))}
            onChange={(role: Role) => updateRole.mutate({ memberId: member.id, role })}
          />
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
        <p role="alert" className="ps-[60px] pb-2.5 text-sm text-ink">
          {error.message}
        </p>
      ) : null}
    </li>
  );
}

function OpenInvites() {
  const { orgId } = useOrg();
  const invites = useInvites(orgId, true);
  const revoke = useRevokeInvite(orgId);
  if (!invites.data?.length) return null;
  return (
    <SettingsCard title="Open invites" count={invites.data.length}>
      <ul className="flex flex-col divide-y divide-line">
        {invites.data.map((invite) => (
          <li key={invite.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-line-strong" aria-hidden="true" />
            <span className="truncate text-body">{invite.email}</span>
            <Badge>{roleLabel[invite.role]}</Badge>
            <span className="ms-auto text-sm text-ink-2 tabular-nums max-sm:hidden">
              Expires {new Date(invite.expiresAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            </span>
            <Button variant="ghost" disabled={revoke.isPending} onClick={() => revoke.mutate(invite.id)}>
              Revoke
            </Button>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
