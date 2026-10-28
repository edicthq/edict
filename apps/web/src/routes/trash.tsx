import type { TrashedIssue, TrashedTeam } from "@edicthq/client";
import { Avatar, Button, TeamKey } from "@edicthq/ui";
import { EmptyState, GroupHeader, Loading, PageColumn, PageHeader, rowClass } from "../components/shell.js";
import { useOfferUndo } from "../components/undo.js";
import { useToast } from "../components/toast.js";
import { ago } from "../lib/issues.js";
import { useMembers, useRestoreIssue, useRestoreTeam, useTrash, useTrashedTeams } from "../lib/queries.js";
import { useOrg } from "./org.js";

// Deleted issues in teams you can see, kept 30 days (ADR 0019). Restoring
// one brings back everything its delete trashed.
export function TrashPage() {
  const { orgId, canManage } = useOrg();
  const trash = useTrash(orgId);
  const teams = useTrashedTeams(orgId, canManage);
  const members = useMembers(orgId);
  const nameOf = (id: string) => members.data?.find((m) => m.id === id)?.name;

  return (
    <>
      <PageHeader title="Trash" />
      <PageColumn>
        <p className="mb-4 px-3 text-ui text-ink-2">Deleted issues and teams wait here for 30 days, then go for good.</p>
        {teams.data?.length ? (
          <section aria-label="Trashed teams" className="mb-6">
            <GroupHeader count={teams.data.length}>Teams</GroupHeader>
            <ul className="flex flex-col gap-px">
              {teams.data.map((team) => (
                <TeamRow key={team.id} team={team} by={nameOf(team.deletedById)} />
              ))}
            </ul>
          </section>
        ) : null}
        {trash.isPending ? (
          <Loading label="Loading the trash" />
        ) : trash.data?.length ? (
          <ul aria-label="Trashed issues" className="flex flex-col gap-px">
            {trash.data.map((issue) => (
              <TrashRow key={issue.id} issue={issue} by={nameOf(issue.deletedById)} />
            ))}
          </ul>
        ) : (
          <EmptyState title="The trash is empty" body="Nothing has been deleted in the last 30 days." />
        )}
      </PageColumn>
    </>
  );
}

// A trashed team comes back with every issue it held.
function TeamRow({ team, by }: { team: TrashedTeam; by?: string }) {
  const { orgId } = useOrg();
  const restore = useRestoreTeam(orgId);
  const offerUndo = useOfferUndo();
  const toast = useToast();
  return (
    <li>
      <div className={rowClass}>
        <TeamKey>{team.key}</TeamKey>
        <span className="min-w-0 flex-1 truncate text-body">{team.name}</span>
        <span className="text-sm text-ink-2 max-sm:hidden">
          {by ?? "Someone"} deleted it{" "}
          <time dateTime={team.deletedAt} title={new Date(team.deletedAt).toLocaleString()}>
            {ago(team.deletedAt)} ago
          </time>
        </span>
        <Button
          variant="ghost"
          disabled={restore.isPending}
          onClick={() =>
            restore.mutate(team.id, {
              onSuccess: () => offerUndo(`Restored ${team.key}`),
              onError: (error) => toast(error.message),
            })
          }
        >
          Restore
        </Button>
      </div>
    </li>
  );
}

function TrashRow({ issue, by }: { issue: TrashedIssue; by?: string }) {
  const { orgId } = useOrg();
  const restore = useRestoreIssue(orgId);
  const offerUndo = useOfferUndo();
  const toast = useToast();
  return (
    <li>
      <div className={rowClass}>
        <span className="w-[58px] shrink-0 text-sm font-medium text-ink-2 tabular-nums">{issue.identifier}</span>
        <span className="min-w-0 flex-1 truncate text-body">{issue.title}</span>
        <span className="flex items-center gap-1.5 text-sm text-ink-2 max-sm:hidden">
          <Avatar name={by ?? "?"} size={18} />
          <span>
            {by ?? "Someone"} deleted it{" "}
            <time dateTime={issue.deletedAt} title={new Date(issue.deletedAt).toLocaleString()}>
              {ago(issue.deletedAt)} ago
            </time>
          </span>
        </span>
        <Button
          variant="ghost"
          disabled={restore.isPending}
          onClick={() =>
            restore.mutate(issue.id, {
              onSuccess: () => offerUndo(`Restored ${issue.identifier}`),
              onError: (error) => toast(error.message),
            })
          }
        >
          Restore
        </Button>
      </div>
    </li>
  );
}
