import { useState } from "react";
import { MarkdownEditor } from "./markdown-editor.js";
import type { Agent, Label, Member, Priority, Status, Team } from "@edicthq/client";
import { Button, Dialog, Kbd, TeamKey } from "@edicthq/ui";
import { mod } from "../lib/labels.js";
import { useCreateIssue, useCreateLabel, useProjects, useTemplates } from "../lib/queries.js";
import { connectionLine } from "../lib/agents.js";
import { AssigneePicker, DelegatePicker, EstimatePicker, LabelPicker, PriorityPicker, ProjectPicker, StatusPicker } from "./issue-fields.js";
import { FormError } from "./shell.js";

export function CreateIssueDialog({
  orgId,
  team,
  statuses,
  members,
  labels,
  agents = [],
  orgMembers = [],
  parent,
  defaultProjectId,
  open,
  onClose,
  onCreated,
}: {
  orgId: string;
  team: Team;
  statuses: Status[];
  members: Member[];
  labels: Label[];
  // The agents one can delegate to, and everyone, to say how each connects.
  agents?: Agent[];
  orgMembers?: Member[];
  // Creates a sub-issue of this issue.
  parent?: { id: string; identifier: string };
  defaultProjectId?: string | null;
  open: boolean;
  onClose: () => void;
  onCreated: (identifier: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="create-issue-title" placement="top" className="w-[min(640px,calc(100vw-32px))]">
      <CreateIssueForm
        orgId={orgId}
        team={team}
        statuses={statuses}
        members={members}
        labels={labels}
        agents={agents}
        orgMembers={orgMembers}
        parent={parent}
        defaultProjectId={defaultProjectId}
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
  agents,
  orgMembers,
  parent,
  defaultProjectId,
  onDone,
  onCreated,
}: {
  orgId: string;
  team: Team;
  statuses: Status[];
  members: Member[];
  labels: Label[];
  agents: Agent[];
  orgMembers: Member[];
  parent?: { id: string; identifier: string };
  defaultProjectId?: string | null;
  onDone: () => void;
  onCreated: (identifier: string) => void;
}) {
  const create = useCreateIssue(orgId, team.id);
  const createLabel = useCreateLabel(orgId, team.id);
  const templates = useTemplates(orgId, team.id);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [statusId, setStatusId] = useState(() => statuses.find((s) => s.default)?.id ?? statuses[0]?.id ?? "");
  const [priority, setPriority] = useState<Priority>("none");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [delegateId, setDelegateId] = useState<string | null>(null);
  const delegate = agents.find((agent) => agent.id === delegateId);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId ?? null);
  const projects = useProjects(orgId);
  const [failure, setFailure] = useState<string | null>(null);

  // A template fills the title, description and labels the team agreed on.
  function applyTemplate(pick: { title: string; description: string; labelIds: string[] }) {
    setTitle(pick.title);
    setDescription(pick.description);
    setLabelIds(pick.labelIds);
  }

  const submit = async () => {
    if (!title.trim()) {
      setFailure("Give the issue a title.");
      return;
    }
    setFailure(null);
    try {
      const issue = await create.mutateAsync({ title, description, statusId, priority, assigneeId, delegateId, estimate, labelIds, parentId: parent?.id ?? null, projectId: projectId ?? null });
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
        {templates.data?.length ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Templates">
            <span className="text-sm text-ink-2">Start from</span>
            {templates.data.map((pick) => (
              <button
                key={pick.id}
                type="button"
                title={pick.title || pick.description || undefined}
                onClick={() => applyTemplate(pick)}
                className="rounded-full bg-hover px-2 py-0.5 text-sm font-medium text-ink transition-[background-color,color] duration-[140ms] ease-standard hover:bg-line"
              >
                {pick.name}
              </button>
            ))}
          </div>
        ) : null}
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
          onKeyDown={(event) => {
            // Enter goes on to the description; only ⌘↵ creates, so a stray
            // Enter after a shortcut opened the dialog creates nothing.
            if (event.key === "Enter" && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              document.getElementById("new-issue-description")?.focus();
            }
          }}
          className="bg-transparent text-xl font-semibold tracking-[-0.015em] text-ink placeholder:text-ink-3 focus-visible:outline-none"
        />
        <MarkdownEditor
          id="new-issue-description"
          label="Description"
          value={description}
          onChange={setDescription}
          placeholder="Add a description…"
          className="min-h-24"
        />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 px-5 pt-2 pb-4">
        <StatusPicker statuses={statuses} value={statusId} onChange={setStatusId} />
        <PriorityPicker value={priority} onChange={setPriority} />
        <AssigneePicker members={members} value={assigneeId} onChange={setAssigneeId} />
        {agents.length ? (
          <DelegatePicker agents={agents} members={orgMembers} value={delegateId} onChange={setDelegateId} />
        ) : null}
        <EstimatePicker value={estimate} onChange={setEstimate} />
        <ProjectPicker projects={projects.data ?? []} value={projectId} onChange={setProjectId} />
        <LabelPicker
          labels={labels}
          value={labelIds}
          onChange={setLabelIds}
          onCreate={(name) => createLabel.mutateAsync({ name })}
        />
      </div>
      {delegate ? (
        <p className="-mt-2 px-5 pb-4 text-sm text-ink-2">
          <span className="font-medium text-agent-ink">{delegate.name}</span> · {connectionLine(delegate, orgMembers)}
        </p>
      ) : null}
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
