import { useEffect, useRef, useState } from "react";
import type { Issue, Member, Status } from "@edicthq/client";
import { Avatar, Button, Dialog, Kbd } from "@edicthq/ui";
import { ApiFailure } from "../lib/api.js";
import { ago } from "../lib/issues.js";
import { useUpdateIssue, type IssueChanges } from "../lib/queries.js";
import { AssigneePicker, EstimatePicker, PriorityPicker, StatusPicker } from "./issue-fields.js";
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
  menu,
  onMenu,
  onClose,
}: {
  orgId: string;
  issue: Issue;
  statuses: Status[];
  // Who can be the assignee.
  members: Member[];
  // Everyone, to name the creator.
  orgMembers: Member[];
  menu: PeekMenu;
  onMenu: (menu: PeekMenu) => void;
  onClose: () => void;
}) {
  const update = useUpdateIssue(orgId);
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
        <span className="text-sm font-semibold text-ink">{issue.identifier}</span>
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
        </div>
        <DescriptionField key={`${issue.id}-description`} issue={issue} onSave={(description) => save({ description })} />

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
