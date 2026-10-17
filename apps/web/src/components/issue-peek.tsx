import { useEffect, useRef, useState } from "react";
import type { Issue, Label, LinkedIssue, Member, RelationType, Status, Team } from "@edicthq/client";
import { Avatar, Button, Dialog, Kbd, Menu, PriorityIcon, Select, StatusIcon, TeamKey } from "@edicthq/ui";
import { CornerLeftUp, Plus, X } from "lucide-react";
import { ApiFailure } from "../lib/api.js";
import { ago } from "../lib/issues.js";
import {
  useCreateLabel,
  useCreateRelation,
  useDeleteRelation,
  useIssue,
  useRelations,
  useSubIssues,
  useUpdateIssue,
  type IssueChanges,
} from "../lib/queries.js";
import { AssigneePicker, EstimatePicker, LabelPicker, NoAssignee, PriorityPicker, StatusPicker } from "./issue-fields.js";
import { useToast } from "./toast.js";

export type PeekMenu = "status" | "priority" | "assignee" | null;

// The issue over the list, from the right, as in the prototype. The list stays
// put behind it, and J/K move the peek through it.
export function IssuePeek({
  orgId,
  issue,
  statuses,
  members,
  orgMembers,
  labels,
  teams,
  menu,
  onMenu,
  onClose,
  onOpen,
  onAddSubIssue,
}: {
  orgId: string;
  issue: Issue;
  statuses: Status[];
  // Who can be the assignee.
  members: Member[];
  // Everyone, to name the creator and assignees of linked issues.
  orgMembers: Member[];
  // Labels the issue's team can use.
  labels: Label[];
  // Teams the issue can move to.
  teams: Team[];
  menu: PeekMenu;
  onMenu: (menu: PeekMenu) => void;
  onClose: () => void;
  // Opens another issue, maybe in another team.
  onOpen: (identifier: string) => void;
  onAddSubIssue: () => void;
}) {
  const update = useUpdateIssue(orgId);
  const createLabel = useCreateLabel(orgId, issue.teamId);
  const parent = useIssue(orgId, issue.parentId);
  const toast = useToast();
  const [merge, setMerge] = useState<{ field: "title" | "description"; mine: string; theirs: Issue } | null>(null);
  const creator = orgMembers.find((m) => m.id === issue.creatorId);

  const save = (changes: IssueChanges) =>
    update.mutate(
      { issue, changes },
      {
        onError: (error) => {
          if (!(error instanceof ApiFailure) || error.code !== "conflict") {
            toast(error.message);
            return;
          }
          const current = error.details.current as Issue;
          const field = (["description", "title"] as const).find((f) => f in changes);
          if (field) {
            // Text someone else changed meanwhile: let the human choose.
            setMerge({ field, mine: changes[field]!, theirs: current });
          } else {
            toast(`Someone changed this issue while you were editing. It now shows their change.`);
          }
        },
      },
    );

  return (
    <aside
      aria-label={`${issue.identifier} ${issue.title}`}
      className="absolute inset-2 z-20 flex flex-col overflow-hidden rounded-md bg-surface shadow-overlay outline outline-line md:start-auto md:w-[min(760px,calc(100%-96px))] motion-safe:animate-[peek-slide_220ms_cubic-bezier(0.2,0,0,1)]"
    >
      <header className="flex h-[46px] shrink-0 items-center gap-2 border-b border-line ps-6 pe-3">
        {parent.data ? (
          <>
            <button
              type="button"
              onClick={() => onOpen(parent.data.identifier)}
              title={parent.data.title}
              className="inline-flex items-center gap-1 text-sm text-ink-2 hover:text-ink"
            >
              <CornerLeftUp aria-hidden="true" className="size-3" strokeWidth={2} />
              {parent.data.identifier}
            </button>
            <span aria-hidden="true" className="text-sm text-ink-3">
              /
            </span>
          </>
        ) : null}
        <span className="text-sm font-semibold text-ink">{issue.identifier}</span>
        <Menu
          label="Move to team"
          items={teams
            .filter((team) => team.id !== issue.teamId)
            .map((team) => ({ value: team.id, label: team.name, keywords: team.key, icon: <TeamKey>{team.key}</TeamKey> }))}
          onSelect={(teamId) =>
            update.mutate(
              { issue, changes: { teamId } },
              {
                onSuccess: (moved) => {
                  toast(`Moved ${issue.identifier} to ${moved.identifier}. ${issue.identifier} still finds it.`);
                  onOpen(moved.identifier);
                },
                onError: (error) => toast(error.message),
              },
            )
          }
          trigger={(props) => (
            <Button variant="ghost" {...props}>
              Move
            </Button>
          )}
        />
        <span className="ms-auto hidden items-center gap-1 text-sm text-ink-2 sm:inline-flex">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          <span className="ms-0.5 me-2">next issue</span>
        </span>
        <Button variant="ghost" onClick={onClose}>
          Close <Kbd>Esc</Kbd>
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-24 sm:px-8">
        <TitleField key={`${issue.id}-title`} issue={issue} onSave={(title) => save({ title })} />
        <div className="mt-4 mb-6 flex flex-wrap items-center gap-1.5">
          <StatusPicker
            statuses={statuses}
            value={issue.statusId}
            onChange={(statusId) => save({ statusId })}
            open={menu === "status"}
            onOpenChange={(open) => onMenu(open ? "status" : null)}
          />
          <PriorityPicker
            value={issue.priority}
            onChange={(priority) => save({ priority })}
            open={menu === "priority"}
            onOpenChange={(open) => onMenu(open ? "priority" : null)}
          />
          <AssigneePicker
            members={members}
            value={issue.assigneeId}
            onChange={(assigneeId) => save({ assigneeId })}
            open={menu === "assignee"}
            onOpenChange={(open) => onMenu(open ? "assignee" : null)}
          />
          <EstimatePicker value={issue.estimate} onChange={(estimate) => save({ estimate })} />
          <LabelPicker
            labels={labels}
            value={issue.labelIds}
            onChange={(labelIds) => save({ labelIds })}
            onCreate={(name) => createLabel.mutateAsync({ name })}
          />
        </div>
        <DescriptionField key={`${issue.id}-description`} issue={issue} onSave={(description) => save({ description })} />

        <SubIssues orgId={orgId} issue={issue} orgMembers={orgMembers} onOpen={onOpen} onAdd={onAddSubIssue} />
        <Relations orgId={orgId} issue={issue} orgMembers={orgMembers} onOpen={onOpen} />

        <section className="mt-10" aria-labelledby="peek-activity">
          <h2 id="peek-activity" className="mb-3 text-body font-semibold">
            Activity
          </h2>
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <Avatar name={creator?.name ?? "?"} kind={creator?.kind} size={18} />
            <span>
              <b className="font-semibold text-ink">{creator?.name ?? "Someone"}</b> created the issue
            </span>
            <time dateTime={issue.createdAt} className="ms-auto" title={new Date(issue.createdAt).toLocaleString()}>
              {ago(issue.createdAt)}
            </time>
          </p>
        </section>
      </div>
      {merge ? (
        <MergeDialog
          field={merge.field}
          mine={merge.mine}
          theirs={merge.theirs}
          onKeepTheirs={() => setMerge(null)}
          onUseMine={() => {
            // The cache holds their version now, so this retries from it.
            save({ [merge.field]: merge.mine });
            setMerge(null);
          }}
        />
      ) : null}
    </aside>
  );
}

function TitleField({ issue, onSave }: { issue: Issue; onSave: (title: string) => void }) {
  const [draft, setDraft] = useState(issue.title);
  useEffect(() => setDraft(issue.title), [issue.title]);
  const commit = () => {
    const title = draft.trim();
    if (!title) setDraft(issue.title);
    else if (title !== issue.title) onSave(title);
  };
  return (
    <>
      <label htmlFor="peek-title" className="sr-only">
        Title
      </label>
      <textarea
        id="peek-title"
        value={draft}
        rows={1}
        maxLength={255}
        onChange={(event) => setDraft(event.target.value.replace(/\n/g, " "))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          } else if (event.key === "Escape") {
            event.stopPropagation();
            setDraft(issue.title);
            requestAnimationFrame(() => event.currentTarget?.blur());
          }
        }}
        className="field-sizing-content w-full resize-none bg-transparent text-2xl font-semibold text-ink text-balance focus-visible:outline-none"
      />
    </>
  );
}

// Markdown, edited as text until the Tiptap editor arrives.
function DescriptionField({ issue, onSave }: { issue: Issue; onSave: (description: string) => void }) {
  const [draft, setDraft] = useState(issue.description);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setDraft(issue.description);
  }, [issue.description]);
  return (
    <>
      <label htmlFor="peek-description" className="sr-only">
        Description
      </label>
      <textarea
        id="peek-description"
        value={draft}
        placeholder="Add a description… Markdown works."
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => (focused.current = true)}
        onBlur={() => {
          focused.current = false;
          if (draft !== issue.description) onSave(draft);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            event.currentTarget.blur();
          }
        }}
        className="field-sizing-content min-h-24 w-full max-w-[68ch] resize-none bg-transparent text-body leading-[1.62] text-ink placeholder:text-ink-3 focus-visible:outline-none"
      />
    </>
  );
}

// ADR 0018: a human whose text edit went stale picks which version stays.
function MergeDialog({
  field,
  mine,
  theirs,
  onKeepTheirs,
  onUseMine,
}: {
  field: "title" | "description";
  mine: string;
  theirs: Issue;
  onKeepTheirs: () => void;
  onUseMine: () => void;
}) {
  return (
    <Dialog open onClose={onKeepTheirs} title={`The ${field} changed while you were editing`} className="w-[min(720px,calc(100vw-32px))]">
      <div className="flex flex-col gap-4 p-5">
        <p className="text-ui text-ink-2 text-pretty">
          Someone saved a new {field} after you started. Pick the one to keep. The other is not saved.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Version label="Theirs, saved now" text={theirs[field]} />
          <Version label="Yours" text={mine} />
        </div>
        <div className="flex justify-end gap-2">
          <Button onClick={onKeepTheirs}>Keep theirs</Button>
          <Button variant="primary" onClick={onUseMine}>
            Use mine
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Version({ label, text }: { label: string; text: string }) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      <figcaption className="text-sm font-semibold text-ink-2">{label}</figcaption>
      <pre className="max-h-64 overflow-auto rounded-sm bg-bg p-3 font-sans text-ui whitespace-pre-wrap shadow-[inset_0_0_0_1px_var(--line)]">
        {text || "(empty)"}
      </pre>
    </figure>
  );
}

// Another issue as a short row: status, identifier, title, assignee. From the
// prototype's sub-issue and relation lists.
function LinkedRow({
  linked,
  orgMembers,
  onOpen,
}: {
  linked: LinkedIssue;
  orgMembers: Member[];
  onOpen: (identifier: string) => void;
}) {
  const assignee = orgMembers.find((m) => m.id === linked.assigneeId);
  return (
    <button
      type="button"
      onClick={() => onOpen(linked.identifier)}
      className="grid h-[34px] w-full min-w-0 grid-cols-[16px_14px_56px_minmax(0,1fr)_auto] items-center gap-2 rounded-sm px-2 text-start hover:bg-hover"
    >
      <span title={linked.status.name}>
        <StatusIcon category={linked.status.category} />
      </span>
      <PriorityIcon priority={linked.priority} />
      <span className="text-sm font-medium text-ink-2 tabular-nums">{linked.identifier}</span>
      <span className="truncate text-ui">{linked.title}</span>
      {assignee ? <Avatar name={assignee.name} size={18} /> : <NoAssignee />}
    </button>
  );
}

function SectionHeading({ id, children, aside }: { id: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <h2 id={id} className="text-body font-semibold">
        {children}
      </h2>
      {aside}
    </div>
  );
}

function SubIssues({
  orgId,
  issue,
  orgMembers,
  onOpen,
  onAdd,
}: {
  orgId: string;
  issue: Issue;
  orgMembers: Member[];
  onOpen: (identifier: string) => void;
  onAdd: () => void;
}) {
  const subs = useSubIssues(orgId, issue.id);
  const list = subs.data ?? [];
  const done = list.filter((s) => s.status.category === "done").length;
  return (
    <section className="mt-8" aria-labelledby="peek-subs">
      <SectionHeading
        id="peek-subs"
        aside={
          <>
            {list.length ? (
              <span className="text-sm text-ink-2 tabular-nums">
                {done}/{list.length}
              </span>
            ) : null}
            <Button variant="ghost" className="ms-auto" onClick={onAdd}>
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
              Add sub-issue
            </Button>
          </>
        }
      >
        Sub-issues
      </SectionHeading>
      {list.length ? (
        <ul className="flex flex-col">
          {list.map((sub) => (
            <li key={sub.id}>
              <LinkedRow linked={sub} orgMembers={orgMembers} onOpen={onOpen} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-2">No sub-issues.</p>
      )}
    </section>
  );
}

const relationLabel: Record<RelationType, string> = {
  blocked_by: "Blocked by",
  blocks: "Blocks",
  related: "Related",
  duplicate_of: "Duplicate of",
  duplicated_by: "Duplicated by",
};
const relationOrder: RelationType[] = ["blocked_by", "blocks", "related", "duplicate_of", "duplicated_by"];

function Relations({
  orgId,
  issue,
  orgMembers,
  onOpen,
}: {
  orgId: string;
  issue: Issue;
  orgMembers: Member[];
  onOpen: (identifier: string) => void;
}) {
  const relations = useRelations(orgId, issue.id);
  const create = useCreateRelation(orgId, issue.id);
  const remove = useDeleteRelation(orgId, issue.id);
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [type, setType] = useState<RelationType>("blocks");
  const [other, setOther] = useState("");
  const list = [...(relations.data ?? [])].sort(
    (a, b) => relationOrder.indexOf(a.type) - relationOrder.indexOf(b.type),
  );

  return (
    <section className="mt-8" aria-labelledby="peek-relations">
      <SectionHeading
        id="peek-relations"
        aside={
          <Button variant="ghost" className="ms-auto" onClick={() => setAdding(true)}>
            <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
            Add relation
          </Button>
        }
      >
        Relations
      </SectionHeading>
      {list.length ? (
        <ul className="flex flex-col">
          {list.map((relation) => (
            <li key={relation.id} className="group grid grid-cols-[96px_minmax(0,1fr)_26px] items-center">
              <span className="text-sm text-ink-2">{relationLabel[relation.type]}</span>
              <LinkedRow linked={relation.issue} orgMembers={orgMembers} onOpen={onOpen} />
              <Button
                variant="ghost"
                className="size-[26px] px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Remove: ${relationLabel[relation.type].toLowerCase()} ${relation.issue.identifier}`}
                onClick={() => remove.mutate(relation.id, { onError: (error) => toast(error.message) })}
              >
                <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
              </Button>
            </li>
          ))}
        </ul>
      ) : !adding ? (
        <p className="text-sm text-ink-2">No relations.</p>
      ) : null}
      {adding ? (
        <form
          className="mt-2 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!other.trim()) return;
            create.mutate(
              { type, issue: other.trim() },
              {
                onSuccess: () => {
                  setOther("");
                  setAdding(false);
                },
                onError: (error) => toast(error.message),
              },
            );
          }}
        >
          <label className="sr-only" htmlFor="relation-type">
            Relation
          </label>
          <Select
            id="relation-type"
            className="w-36 sm:h-[30px]"
            value={type}
            onChange={(event) => setType(event.target.value as RelationType)}
          >
            {relationOrder.map((t) => (
              <option key={t} value={t}>
                {relationLabel[t]}
              </option>
            ))}
          </Select>
          <label className="sr-only" htmlFor="relation-issue">
            Issue
          </label>
          <input
            id="relation-issue"
            autoFocus
            value={other}
            onChange={(event) => setOther(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setAdding(false);
              }
            }}
            placeholder="Identifier, like ENG-12"
            className="h-[30px] w-44 rounded-sm bg-surface px-2.5 text-ui shadow-[inset_0_0_0_1px_var(--line-strong)] placeholder:text-ink-2 focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] focus-visible:outline-none"
          />
          <Button type="submit" disabled={create.isPending}>
            Add
          </Button>
          <Button variant="ghost" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : null}
    </section>
  );
}
