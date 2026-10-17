import { useState } from "react";
import type { Label, Member, Priority, Status, Team } from "@edicthq/client";
import { Button, Dialog, Kbd, TeamKey } from "@edicthq/ui";
import { mod } from "../lib/labels.js";
import { useCreateIssue, useCreateLabel } from "../lib/queries.js";
import { AssigneePicker, EstimatePicker, LabelPicker, PriorityPicker, StatusPicker } from "./issue-fields.js";
import { FormError } from "./shell.js";

export function CreateIssueDialog({
  orgId,
  team,
  statuses,
  members,
  labels,
  parent,
  open,
  onClose,
  onCreated,
}: {
  orgId: string;
  team: Team;
  statuses: Status[];
  members: Member[];
  labels: Label[];
  // Creates a sub-issue of this issue.
  parent?: { id: string; identifier: string };
  open: boolean;
  onClose: () => void;
  onCreated: (identifier: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="create-issue-title" className="w-[min(640px,calc(100vw-32px))]">
      <CreateIssueForm
        orgId={orgId}
        team={team}
        statuses={statuses}
        members={members}
        labels={labels}
        parent={parent}
        onDone={onClose}
        onCreated={onCreated}
      />
    </Dialog>
  );
}

function CreateIssueForm({
  orgId,
  team,
  statuses,
  members,
  labels,
  parent,
  onDone,
  onCreated,
}: {
  orgId: string;
  team: Team;
  statuses: Status[];
  members: Member[];
  labels: Label[];
  parent?: { id: string; identifier: string };
  onDone: () => void;
  onCreated: (identifier: string) => void;
}) {
  const create = useCreateIssue(orgId, team.id);
  const createLabel = useCreateLabel(orgId, team.id);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState(() => statuses.find((s) => s.default)?.id ?? statuses[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("none");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const submit = async () => {
    if (!title.trim()) {
      setFailure("Give the issue a title.");
      return;
    }
    setFailure(null);
    try {
      const issue = await create.mutateAsync({ title, description, statusId, priority, assigneeId, estimate, labelIds, parentId: parent?.id ?? null });
      onDone();
      onCreated(issue.identifier);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "Creating the issue failed.");
    }
  };

  return (
    <form
      noValidate
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          void submit();
        }
      }}
    >
      <div className="flex items-center gap-2 px-5 pt-4">
        <TeamKey>{team.key}</TeamKey>
        <h2 id="create-issue-title" className="text-ui font-semibold text-ink-2">
          {parent ? `New sub-issue of ${parent.identifier}` : "New issue"}
        </h2>
      </div>
      <div className="flex flex-col gap-2 px-5 pt-3">
        <label className="sr-only" htmlFor="new-issue-title">
          Title
        </label>
        <input
          id="new-issue-title"
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Issue title"
          maxLength={255}
          className="bg-transparent text-xl font-semibold tracking-[-0.015em] text-ink placeholder:text-ink-3 focus-visible:outline-none"
        />
        <label className="sr-only" htmlFor="new-issue-description">
          Description
        </label>
        <textarea
          id="new-issue-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Add a description… Markdown works."
          rows={5}
          className="field-sizing-content min-h-24 resize-none bg-transparent text-body text-ink placeholder:text-ink-3 focus-visible:outline-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-5 pt-2 pb-4">
        <StatusPicker statuses={statuses} value={statusId} onChange={setStatusId} />
        <PriorityPicker value={priority} onChange={setPriority} />
        <AssigneePicker members={members} value={assigneeId} onChange={setAssigneeId} />
        <EstimatePicker value={estimate} onChange={setEstimate} />
        <LabelPicker
          labels={labels}
          value={labelIds}
          onChange={setLabelIds}
          onCreate={(name) => createLabel.mutateAsync({ name })}
        />
      </div>
      <div className="flex flex-col gap-3 border-t border-line px-5 py-3">
        <FormError message={failure} />
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" className="h-8 text-ui" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create issue"}
            <Kbd>{`${mod}↵`}</Kbd>
          </Button>
        </div>
      </div>
    </form>
  );
}
