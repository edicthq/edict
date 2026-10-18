import type { TrashedIssue } from "@edicthq/client";
import { Avatar, Button, TeamKey } from "@edicthq/ui";
import { EmptyState, Loading, PageBody, PageHeader, rowClass } from "../components/shell.js";
import { useOfferUndo } from "../components/undo.js";
import { useToast } from "../components/toast.js";
import { ago } from "../lib/issues.js";
import { useMembers, useRestoreIssue, useTrash } from "../lib/queries.js";
import { useOrg } from "./org.js";

// Deleted issues in teams you can see, kept 30 days (ADR 0019). Restoring
// one brings back everything its delete trashed.
export function TrashPage() {
  const { orgId } = useOrg();
  const trash = useTrash(orgId);
  const members = useMembers(orgId);

  return (
    <>
      <PageHeader title="Trash" />
      <PageBody>
        {trash.isPending ? (
          <Loading label="Loading the trash" />
        ) : trash.data?.length ? (
          <ul className="flex flex-col gap-px">
            {trash.data.map((issue) => (
              <TrashRow key={issue.id} issue={issue} by={members.data?.find((m) => m.id === issue.deletedById)?.name} />
            ))}
          </ul>
        ) : (
          <EmptyState title="The trash is empty" body="Deleted issues wait here for 30 days, then go for good." />
        )}
      </PageBody>
    </>
  );
}

function TrashRow({ issue, by }: { issue: TrashedIssue; by?: string }) {
  const { orgId } = useOrg();
  const restore = useRestoreIssue(orgId);
  const offerUndo = useOfferUndo();
  const toast = useToast();
  const [key] = issue.identifier.split("-");

  return (
    <li>
      <div className={rowClass}>
        <TeamKey>{key!}</TeamKey>
        <span className="font-mono text-sm text-ink-2 tabular-nums">{issue.identifier}</span>
        <span className="min-w-0 flex-1 truncate text-body">{issue.title}</span>
        <span className="flex items-center gap-1.5 text-sm text-ink-2 max-sm:hidden">
          <Avatar name={by ?? "?"} size={18} />
          <span>
            {by ?? "Someone"} deleted it{" "}
            <time dateTime={issue.deletedAt} title={new Date(issue.deletedAt).toLocaleString()}>
              {ago(issue.deletedAt)}
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
