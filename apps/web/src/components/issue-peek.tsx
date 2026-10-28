import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { Agent, Attachment, Comment, Issue, Label, LinkedIssue, Member, RelationType, Status, Team } from "@edicthq/client";
import { Avatar, Button, Dialog, Kbd, Menu, PriorityIcon, StatusIcon, TeamKey, SelectMenu } from "@edicthq/ui";
import { ArrowLeftRight, CornerDownRight, CornerLeftUp, Link2, Paperclip, Trash2, X } from "lucide-react";
import { ApiFailure } from "../lib/api.js";
import { ago, priorityLabel } from "../lib/issues.js";
import {
  useAttachments,
  useComments,
  useCreateAttachment,
  useCreateComment,
  useCreateLabel,
  useCreateRelation,
  useDeleteComment,
  useArchiveIssue,
  useDeleteIssue,
  useDeleteRelation,
  useAddLink,
  useIssue,
  useLinks,
  useProjects,
  useRelations,
  useRemoveLink,
  useSubIssues,
  useUpdateComment,
  useUpdateIssue,
  type IssueChanges,
} from "../lib/queries.js";
import { AgentLane } from "./agent-lane.js";
import { AssigneePicker, DelegatePicker, EstimatePicker, LabelPicker, NoAssignee, PriorityPicker, ProjectPicker, StatusPicker } from "./issue-fields.js";
import { Markdown } from "./markdown.js";
import { blurActive, MarkdownEditor } from "./markdown-editor.js";
import { useToast } from "./toast.js";
import { useOfferUndo } from "./undo.js";

export type PeekMenu = "status" | "priority" | "assignee" | "delegate" | null;

// The issue over the list, from the right, as in the prototype. The list stays
// put behind it, and J/K move the peek through it.
export function IssuePeek({
  orgId,
  slug,
  myId,
  issue,
  statuses,
  members,
  orgMembers,
  labels,
  teams,
  agents,
  menu,
  onMenu,
  onClose,
  onOpen,
  onAddSubIssue,
  leaving = false,
}: {
  orgId: string;
  slug: string;
  // The signed-in member, so the peek knows which comments are theirs.
  myId: string;
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
  // Who can be the delegate.
  agents: Agent[];
  menu: PeekMenu;
  onMenu: (menu: PeekMenu) => void;
  onClose: () => void;
  // Opens another issue, maybe in another team.
  onOpen: (identifier: string) => void;
  onAddSubIssue: () => void;
  // Closed, and sliding out: it takes no input.
  leaving?: boolean;
}) {
  const update = useUpdateIssue(orgId);
  const remove = useDeleteIssue(orgId);
  const archive = useArchiveIssue(orgId);
  const projects = useProjects(orgId);
  const createLabel = useCreateLabel(orgId, issue.teamId);
  const parent = useIssue(orgId, issue.parentId);
  const toast = useToast();
  const offerUndo = useOfferUndo();

  // What the toast says for the changes the concept offers to undo there.
  // Text edits stay quiet; ⌘Z still undoes them.
  const said = (changes: IssueChanges): string | undefined => {
    if (changes.statusId) return `${issue.identifier} moved to ${statuses.find((s) => s.id === changes.statusId)?.name ?? "a new status"}`;
    if (changes.priority) return `${issue.identifier} set to ${priorityLabel[changes.priority]}`;
    if (changes.delegateId !== undefined) {
      const name = agents.find((a) => a.id === changes.delegateId)?.name;
      return name ? `${issue.identifier} delegated to ${name}` : `${issue.identifier} no longer delegated`;
    }
    if (changes.assigneeId !== undefined) {
      const name = members.find((m) => m.id === changes.assigneeId)?.name;
      return name ? `${issue.identifier} assigned to ${name}` : `${issue.identifier} unassigned`;
    }
    return undefined;
  };
  const [merge, setMerge] = useState<{ field: "title" | "description"; mine: string; theirs: Issue } | null>(null);
  // The relation or link being added; another issue starts with neither.
  const [adding, setAdding] = useState<"relation" | "link" | null>(null);
  const [addingFor, setAddingFor] = useState(issue.id);
  if (addingFor !== issue.id) {
    setAddingFor(issue.id);
    setAdding(null);
  }
  // Opens the file picker of the Files section, which owns the upload.
  const pickFile = useRef<() => void>(() => {});

  const save = (changes: IssueChanges) =>
    update.mutate(
      { issue, changes },
      {
        onSuccess: () => {
          const message = said(changes);
          if (message) offerUndo(message);
        },
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

  // A click on the page outside the peek closes it. Menus and dialogs render
  // in portals or <dialog>, outside the page, and a click on another issue row
  // opens that issue instead, so neither counts. It listens for click rather
  // than pointerdown, so a field being edited has blurred and saved first.
  const panel = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = leaving ? () => {} : onClose;
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target?.isConnected || panel.current?.contains(target)) return;
      if (!target.closest("#main, nav")) return;
      if (target.closest('dialog, [role="dialog"], [role="toolbar"], [id^="issue-"], [data-opens-issue]')) return;
      close.current();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return (
    <aside
      ref={panel}
      aria-label={`${issue.identifier} ${issue.title}`}
      data-leaving={leaving || undefined}
      inert={leaving || undefined}
      aria-hidden={leaving || undefined}
      className="motion-slide absolute inset-2 z-20 flex flex-col overflow-hidden rounded-md bg-raised shadow-overlay md:start-auto md:w-[min(760px,calc(100%-96px))] lg:w-[min(1100px,calc(100%-96px))]"
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
                  offerUndo(`Moved ${issue.identifier} to ${moved.identifier}. ${issue.identifier} still finds it.`);
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
        {issue.archivedAt || issue.closedAt ? (
          <Button
            variant="ghost"
            disabled={archive.isPending}
            onClick={() =>
              archive.mutate(
                { issue, archive: !issue.archivedAt },
                {
                  onSuccess: () => offerUndo(issue.archivedAt ? `Unarchived ${issue.identifier}` : `Archived ${issue.identifier}`),
                  onError: (error) => toast(error.message),
                },
              )
            }
          >
            {issue.archivedAt ? "Unarchive" : "Archive"}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          aria-label={`Delete ${issue.identifier}`}
          title="Delete"
          className="size-7 px-0"
          disabled={remove.isPending}
          // The delete takes the row away before the response answers, which
          // tears this peek down; callbacks passed to mutate die with it, so
          // the promise is awaited instead.
          onClick={() =>
            void remove
              .mutateAsync(issue)
              .then(() => {
                offerUndo(`Moved ${issue.identifier} to the trash`);
                onClose();
              })
              .catch((error: Error) => toast(error.message))
          }
        >
          <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
        </Button>
        <span className="ms-auto hidden items-center gap-1 text-sm text-ink-2 sm:inline-flex">
          <Kbd>J</Kbd>
          <Kbd>K</Kbd>
          <span className="ms-0.5 me-2">next issue</span>
        </span>
        <Button variant="ghost" onClick={onClose}>
          Close <Kbd>Esc</Kbd>
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      <div className="px-6 pt-6 pb-24 sm:px-8 lg:min-w-0 lg:flex-1 lg:overflow-y-auto">
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
          <DelegatePicker
            agents={agents}
            members={orgMembers}
            value={issue.delegateId}
            onChange={(delegateId) => save({ delegateId })}
            open={menu === "delegate"}
            onOpenChange={(open) => onMenu(open ? "delegate" : null)}
          />
          <EstimatePicker value={issue.estimate} onChange={(estimate) => save({ estimate })} />
          <ProjectPicker projects={projects.data ?? []} value={issue.projectId} onChange={(projectId) => save({ projectId })} />
          <LabelPicker
            labels={labels}
            value={issue.labelIds}
            onChange={(labelIds) => save({ labelIds })}
            onCreate={(name) => createLabel.mutateAsync({ name })}
          />
        </div>
        <DescriptionField key={`${issue.id}-description`} issue={issue} onSave={(description) => save({ description })} />

        {/* One row of quiet actions instead of a heading per empty section. A
        section shows once it has something in it, or while one is added. */}
        <div className="mt-4 -ms-2 flex flex-wrap items-center gap-0.5">
          <Button variant="ghost" aria-label="Add sub-issue" onClick={onAddSubIssue}>
            <CornerDownRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            Sub-issue
          </Button>
          <Button variant="ghost" aria-label="Add relation" onClick={() => setAdding("relation")}>
            <ArrowLeftRight aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            Relation
          </Button>
          <Button variant="ghost" aria-label="Add link" onClick={() => setAdding("link")}>
            <Link2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            Link
          </Button>
          <Button variant="ghost" aria-label="Attach file" onClick={() => pickFile.current()}>
            <Paperclip aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            File
          </Button>
        </div>

        <SubIssues orgId={orgId} issue={issue} orgMembers={orgMembers} onOpen={onOpen} />
        <Relations
          orgId={orgId}
          issue={issue}
          orgMembers={orgMembers}
          onOpen={onOpen}
          adding={adding === "relation"}
          onAdding={(open) => setAdding(open ? "relation" : null)}
        />
        <Links orgId={orgId} issue={issue} adding={adding === "link"} onAdding={(open) => setAdding(open ? "link" : null)} />
        <Attachments orgId={orgId} issue={issue} pick={pickFile} />
        <Discussion orgId={orgId} myId={myId} issue={issue} orgMembers={orgMembers} />
      </div>
      <AgentLane
        orgId={orgId}
        slug={slug}
        issue={issue}
        agents={agents}
        members={orgMembers}
        onDelegate={(delegateId) => save({ delegateId })}
      />
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

function growToText(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}

function TitleField({ issue, onSave }: { issue: Issue; onSave: (title: string) => void }) {
  const [draft, setDraft] = useState(issue.title);
  useEffect(() => setDraft(issue.title), [issue.title]);
  // Grows with the title. WebKit has no field-sizing, so the height is set
  // here: when the text changes, and when the peek's width does.
  const field = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text, which the field holds rather than this closure
  useLayoutEffect(() => {
    if (field.current) growToText(field.current);
  }, [draft]);
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    let width = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      growToText(element);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
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
        ref={field}
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
            // Escape puts the title back; Enter saves it.
            event.stopPropagation();
            setDraft(issue.title);
            const field = event.currentTarget;
            requestAnimationFrame(() => field.blur());
          }
        }}
        className="block w-full resize-none overflow-hidden bg-transparent text-2xl font-semibold text-ink text-balance focus-visible:outline-none"
      />
    </>
  );
}

// Saved when the field is left; Escape leaves it too.
function DescriptionField({ issue, onSave }: { issue: Issue; onSave: (description: string) => void }) {
  return (
    <MarkdownEditor
      id="peek-description"
      label="Description"
      value={issue.description}
      placeholder="Add a description…"
      onBlur={(description) => {
        if (description !== issue.description) onSave(description);
      }}
      onEscape={blurActive}
      className="min-h-24 max-w-[68ch] leading-[1.62]"
    />
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
}: {
  orgId: string;
  issue: Issue;
  orgMembers: Member[];
  onOpen: (identifier: string) => void;
}) {
  const subs = useSubIssues(orgId, issue.id);
  const list = subs.data ?? [];
  if (list.length === 0) return null;
  const done = list.filter((s) => s.status.category === "done").length;
  return (
    <section className="mt-8" aria-labelledby="peek-subs">
      <SectionHeading
        id="peek-subs"
        aside={
          <span className="text-sm text-ink-2 tabular-nums">
            {done}/{list.length}
          </span>
        }
      >
        Sub-issues
      </SectionHeading>
      <ul className="flex flex-col">
        {list.map((sub) => (
          <li key={sub.id}>
            <LinkedRow linked={sub} orgMembers={orgMembers} onOpen={onOpen} />
          </li>
        ))}
      </ul>
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
  adding,
  onAdding,
}: {
  orgId: string;
  issue: Issue;
  orgMembers: Member[];
  onOpen: (identifier: string) => void;
  adding: boolean;
  onAdding: (adding: boolean) => void;
}) {
  const relations = useRelations(orgId, issue.id);
  const create = useCreateRelation(orgId, issue.id);
  const remove = useDeleteRelation(orgId, issue.id);
  const toast = useToast();
  const setAdding = onAdding;
  const [type, setType] = useState<RelationType>("blocks");
  const [other, setOther] = useState("");
  const list = [...(relations.data ?? [])].sort(
    (a, b) => relationOrder.indexOf(a.type) - relationOrder.indexOf(b.type),
  );

  if (list.length === 0 && !adding) return null;
  return (
    <section className="mt-8" aria-labelledby="peek-relations">
      <SectionHeading id="peek-relations">Relations</SectionHeading>
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
          <SelectMenu
            label="Relation"
            className="h-[30px] w-36"
            value={type}
            onChange={setType}
            options={relationOrder.map((t) => ({ value: t, label: relationLabel[t] }))}
          />
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
          <Button variant="ghost" size="md" onClick={() => setAdding(false)}>
            Cancel
          </Button>
        </form>
      ) : null}
    </section>
  );
}

// Attached files (ADR 0020). Uploading keeps the bytes under the issue, so
// descriptions and comments can link at /files paths, and markdown shows
// images by their path.
// URLs attached to the issue, such as pull requests agents link.
function Links({
  orgId,
  issue,
  adding,
  onAdding: setAdding,
}: {
  orgId: string;
  issue: Issue;
  adding: boolean;
  onAdding: (adding: boolean) => void;
}) {
  const links = useLinks(orgId, issue.id);
  const add = useAddLink(orgId, issue.id);
  const remove = useRemoveLink(orgId, issue.id);
  const toast = useToast();
  const [url, setUrl] = useState("");
  const list = links.data ?? [];
  if (list.length === 0 && !adding) return null;
  return (
    <section className="mt-8" aria-labelledby="peek-links">
      <SectionHeading id="peek-links">Links</SectionHeading>
      <ul className="mt-2 flex flex-col gap-px">
        {list.map((link) => (
          <li key={link.id} className="group flex min-h-9 items-center gap-2 rounded-sm px-2 hover:bg-hover">
            <Link2 aria-hidden="true" className="size-3.5 shrink-0 text-ink-2" strokeWidth={2} />
            <a href={link.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-ui font-medium hover:underline">
              {link.title ?? link.url}
            </a>
            {link.title ? <span className="min-w-0 truncate text-sm text-ink-2">{new URL(link.url).host}</span> : null}
            <Button
              variant="ghost"
              aria-label={`Remove link ${link.title ?? link.url}`}
              className="ms-auto size-7 px-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => remove.mutate(link.id, { onError: (error) => toast(error.message) })}
            >
              <X aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </Button>
          </li>
        ))}
      </ul>
      {adding ? (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            add.mutate(
              { url: url.trim() },
              {
                onSuccess: () => {
                  setUrl("");
                  setAdding(false);
                },
                onError: (error) => toast(error.message),
              },
            );
          }}
        >
          <input
            autoFocus
            type="url"
            required
            aria-label="Link URL"
            placeholder="https://github.com/…/pull/318"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                setAdding(false);
              }
            }}
            className="h-8 min-w-0 flex-1 rounded-sm bg-surface px-2.5 text-ui shadow-[inset_0_0_0_1px_var(--line-strong)] outline-none focus-visible:shadow-[inset_0_0_0_1.5px_var(--ink)]"
          />
          <Button type="submit" disabled={add.isPending}>
            Add
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function Attachments({ orgId, issue, pick }: { orgId: string; issue: Issue; pick: React.MutableRefObject<() => void> }) {
  const attachments = useAttachments(orgId, issue.id);
  const create = useCreateAttachment(orgId, issue.id);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const list = attachments.data ?? [];

  const upload = (files: FileList | null) => {
    for (const file of Array.from(files ?? [])) {
      if (file.size === 0) {
        toast(`${file.name} is empty.`);
        continue;
      }
      create.mutateAsync(file).catch((error: Error) => toast(`${file.name}: ${error.message}`));
    }
    if (input.current) input.current.value = "";
  };

  pick.current = () => input.current?.click();
  const picker = (
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          if (create.isPending) {
            event.target.value = "";
            toast("Finish uploading first.");
            return;
          }
          upload(event.target.files);
        }}
      />
  );
  if (list.length === 0 && !create.isPending) return picker;
  return (
    <section className="mt-8" aria-labelledby="peek-attachments">
      <SectionHeading id="peek-attachments">Files</SectionHeading>
      {picker}
      {create.isPending ? <p className="text-sm text-ink-2">Uploading…</p> : null}
      <ul className="flex flex-col gap-1.5">
        {list.map((attachment) => (
          <li key={attachment.id}>
            <FileRow attachment={attachment} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function FileRow({ attachment }: { attachment: Attachment }) {
  const image = attachment.contentType.startsWith("image/");
  return (
    <a
      href={attachment.path}
      target="_blank"
      rel="noreferrer"
      title={attachment.name}
      className="group grid max-w-[min(24rem,100%)] grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-3 rounded-sm p-1.5 ps-2 text-start hover:bg-hover"
    >
      <span className="size-12 overflow-hidden rounded-[4px] bg-bg shadow-[inset_0_0_0_1px_var(--line)]">
        {image ? (
          <img src={attachment.path} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <span className="grid size-full place-items-center font-code text-[10px] text-ink-2 uppercase">
            {extension(attachment)}
          </span>
        )}
      </span>
      <span className="min-w-0 truncate text-ui text-ink">{attachment.name}</span>
      <span className="text-sm text-ink-2 tabular-nums">{size(attachment.sizeBytes)}</span>
    </a>
  );
}

function extension(attachment: Attachment): string {
  const subtype = attachment.contentType.split("/")[1];
  if (!subtype) return "file";
  return subtype.split("+")[0]!.slice(0, 6);
}

function size(bytes: number): string {
  // One decimal below 10 units ("4.2 MB"), none above ("56 KB").
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 10 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

// Who created the issue, then each comment in order, then the composer.
// Agents' progress updates join this lane in M3.
function Discussion({
  orgId,
  myId,
  issue,
  orgMembers,
}: {
  orgId: string;
  myId: string;
  issue: Issue;
  orgMembers: Member[];
}) {
  const comments = useComments(orgId, issue.id);
  const create = useCreateComment(orgId, issue.id);
  const update = useUpdateComment(orgId, issue.id);
  const remove = useDeleteComment(orgId, issue.id);
  const [draft, setDraft] = useState("");
  const toast = useToast();
  const offerUndo = useOfferUndo();
  const creator = orgMembers.find((m) => m.id === issue.creatorId);

  const send = () => {
    const body = draft.trim();
    if (!body) return;
    create.mutate(
      { body },
      {
        onSuccess: () => setDraft(""),
        onError: (error) => toast(error.message),
      },
    );
  };

  return (
    <section className="mt-10" aria-labelledby="peek-discussion">
      <h2 id="peek-discussion" className="mb-3 text-body font-semibold">
        Discussion
      </h2>
      <div className="flex flex-col gap-5">
        <p className="flex items-center gap-2 text-sm text-ink-2">
          <Avatar name={creator?.name ?? "?"} kind={creator?.kind} size={22} />
          <span>
            <b className="font-semibold text-ink">{creator?.name ?? "Someone"}</b> created the issue
          </span>
          <time dateTime={issue.createdAt} className="ms-auto" title={new Date(issue.createdAt).toLocaleString()}>
            {ago(issue.createdAt)}
          </time>
        </p>
        {(comments.data ?? []).map((comment) => (
          <CommentRow
            key={comment.id}
            myId={myId}
            comment={comment}
            orgMembers={orgMembers}
            onUpdate={async (body) => {
              await update.mutateAsync({ comment, body });
            }}
            onDelete={() =>
              void remove.mutateAsync(comment).then(
                () => offerUndo("Comment deleted"),
                (error: Error) => toast(error.message),
              )
            }
          />
        ))}
        <Composer value={draft} onChange={setDraft} onSend={send} pending={create.isPending} />
      </div>
    </section>
  );
}

// One comment: avatar, name, time, markdown body (the concept's grid), and
// an Edit button for its creator, the only one the server lets edit it.
function CommentRow({
  comment,
  myId,
  orgMembers,
  onUpdate,
  onDelete,
}: {
  comment: Comment;
  myId: string;
  orgMembers: Member[];
  onUpdate: (body: string) => Promise<void>;
  onDelete: () => void;
}) {
  const author = orgMembers.find((m) => m.id === comment.creatorId);
  const mine = comment.creatorId === myId;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [saving, setSaving] = useState(false);
  const editId = useId();
  const toast = useToast();

  if (editing) {
    return (
      <form
        className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-3"
        onSubmit={(event) => {
          event.preventDefault();
          const body = draft.trim();
          if (!body || saving) return;
          setSaving(true);
          onUpdate(body)
            .then(() => setEditing(false))
            .catch((error: Error) =>
              // On a conflict the newer comment is already in place; the
              // draft stays, and saving again replaces it.
              toast(
                error instanceof ApiFailure && error.code === "conflict"
                  ? "This comment changed somewhere else. Save again to replace it with yours."
                  : error.message,
              ),
            )
            .finally(() => setSaving(false));
        }}
      >
        <div />
        <div className="rounded-md p-2.5 shadow-[inset_0_0_0_1px_var(--line-strong)] focus-within:shadow-[inset_0_0_0_1px_var(--ink)]">
          <MarkdownEditor
            id={editId}
            label="Edit your comment"
            autoFocus
            value={draft}
            onChange={setDraft}
            onSubmit={() => (document.getElementById(editId)?.closest("form") as HTMLFormElement | null)?.requestSubmit()}
            onEscape={() => {
              setDraft(comment.body);
              setEditing(false);
            }}
            className="min-h-10 max-h-64 overflow-y-auto"
          />
          <div className="flex justify-end gap-2 pt-1.5">
            <Button
              variant="ghost"
              size="md"
              type="button"
              onClick={() => {
                setDraft(comment.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!draft.trim() || saving}>
              Save
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <article className="group grid grid-cols-[22px_minmax(0,1fr)] gap-x-3">
      <Avatar name={author?.name ?? "?"} kind={author?.kind} size={22} className="mt-0.5" />
      <div className="min-w-0">
        <header className="flex items-baseline gap-2">
          <b className="font-semibold text-ink">{author?.name ?? "Someone"}</b>
          <time
            dateTime={comment.createdAt}
            title={new Date(comment.createdAt).toLocaleString()}
            className="text-sm text-ink-3"
          >
            {ago(comment.createdAt)}
          </time>
          {comment.updatedAt !== comment.createdAt ? <span className="text-xs text-ink-3">(edited)</span> : null}
          {mine ? (
            <span className="ms-auto flex gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
              <Button
                variant="ghost"
                className="h-6 px-2 text-sm"
                onClick={() => {
                  setDraft(comment.body);
                  setEditing(true);
                }}
              >
                Edit
              </Button>
              <Button variant="ghost" className="h-6 px-2 text-sm" onClick={onDelete}>
                Delete
              </Button>
            </span>
          ) : null}
        </header>
        <Markdown text={comment.body} />
      </div>
    </article>
  );
}

// The new-record box, per the concept: a bordered field with the send
// button, bottom right. ⌘/Ctrl-Enter sends, as the button's hint says.
function Composer({
  value,
  onChange,
  onSend,
  pending,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  pending: boolean;
}) {
  const mod = typeof navigator !== "undefined" && /Mac|iP/.test(navigator.platform) ? "⌘" : "Ctrl";
  return (
    <form
      className="rounded-md p-2.5 pb-2 shadow-[inset_0_0_0_1px_var(--line-strong)] focus-within:shadow-[inset_0_0_0_1px_var(--ink)]"
      onSubmit={(event) => {
        event.preventDefault();
        onSend();
      }}
    >
      <MarkdownEditor
        id="peek-comment"
        label="Add a comment"
        value={value}
        placeholder="Add a comment…"
        onChange={onChange}
        onSubmit={onSend}
        onEscape={blurActive}
        className="min-h-10 max-h-64 overflow-y-auto"
      />
      <div className="flex justify-end pt-1.5">
        <Button type="submit" variant="primary" disabled={!value.trim() || pending} className="text-sm">
          Comment <Kbd>{`${mod}↵`}</Kbd>
        </Button>
      </div>
    </form>
  );
}
