import type { Member, Role } from "@edicthq/client";
import { Avatar, Badge, Button, Select } from "@edicthq/ui";
import { EmptyState, GroupHeader, Loading, PageBody, PageHeader, rowClass } from "../components/shell.js";
import { allRoles, roleLabel } from "../lib/labels.js";
import { useInvites, useMembers, useRemoveMember, useRevokeInvite, useUpdateMemberRole } from "../lib/queries.js";
import { useOrg } from "./org.js";

export function MembersPage() {
  const { orgId, canManage, membership, openInvite } = useOrg();
  const members = useMembers(orgId);
  const humans = members.data?.filter((m) => m.kind === "human") ?? [];
  const agents = members.data?.filter((m) => m.kind === "agent") ?? [];

  return (
    <>
      <PageHeader
        title="Members"
        actions={
          canManage ? (
            <Button variant="primary" onClick={openInvite}>
              Invite people
            </Button>
          ) : null
        }
      />
      <PageBody className="flex flex-col gap-6">
        {members.isPending ? (
          <Loading label="Loading members" />
        ) : (
          <>
            <section>
              <GroupHeader count={humans.length}>Humans</GroupHeader>
              <ul className="flex flex-col gap-px">
                {humans.map((member) => (
                  <MemberRow key={member.id} member={member} me={membership.member} canManage={canManage} />
                ))}
              </ul>
            </section>
            {canManage ? <OpenInvites /> : null}
            <section>
              <GroupHeader count={agents.length}>Agents</GroupHeader>
              {agents.length ? (
                <ul className="flex flex-col gap-px">
                  {agents.map((member) => (
                    <MemberRow key={member.id} member={member} me={membership.member} canManage={canManage} />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No agents yet"
                  body="When someone connects an MCP client such as Claude Code, Edict adds an agent for that connection, named after the client and the person. Admins add agents for agent runners under Agents."
                />
              )}
            </section>
          </>
        )}
      </PageBody>
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
    <li>
      <div className={rowClass}>
        <Avatar name={member.name} kind={member.kind} />
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <span className="truncate text-body">
            {member.name}
            {isMe ? <span className="text-ink-2"> (you)</span> : null}
          </span>
          {member.email ? <span className="truncate text-sm text-ink-2 max-sm:hidden">{member.email}</span> : null}
        </div>
        {canEdit ? (
          <label className="flex items-center">
            <span className="sr-only">Role of {member.name}</span>
            <Select
              className="w-[110px] text-ui sm:h-[28px] sm:text-ui"
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
        <p role="alert" className="ps-[52px] pb-2 text-sm text-ink">
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
    <section>
      <GroupHeader count={invites.data.length}>Open invites</GroupHeader>
      <ul className="flex flex-col gap-px">
        {invites.data.map((invite) => (
          <li key={invite.id} className={rowClass}>
            <span className="grid size-[22px] shrink-0 place-items-center rounded-full border border-dashed border-line-strong" aria-hidden="true" />
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
    </section>
  );
}
