import { type ReactNode, useState } from "react";
import { MarkdownEditor } from "./markdown-editor.js";
import { useNavigate } from "react-router";
import type { ProjectStatus } from "@edicthq/client";
import { Button, Dialog, Field, Input, SelectMenu } from "@edicthq/ui";
import { Calendar } from "lucide-react";
import { DateMenu, formatDay } from "./date-menu.js";
import { ApiFailure } from "../lib/api.js";
import { useCreateProject, useMembers } from "../lib/queries.js";
import { FormError } from "./shell.js";

function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function CreateProjectDialog({
  orgId,
  slug: orgSlug,
  open,
  onClose,
  onCreated,
}: {
  orgId: string;
  slug: string;
  open: boolean;
  onClose: () => void;
  onCreated?: (projectRef: string) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Create project">
      <CreateProjectForm
        orgId={orgId}
        orgSlug={orgSlug}
        onDone={onClose}
        onCreated={onCreated}
      />
    </Dialog>
  );
}

function CreateProjectForm({
  orgId,
  orgSlug,
  onDone,
  onCreated,
}: {
  orgId: string;
  orgSlug: string;
  onDone: () => void;
  onCreated?: (projectRef: string) => void;
}) {
  const navigate = useNavigate();
  const create = useCreateProject(orgId);
  const members = useMembers(orgId);
  const humans = members.data?.filter((m) => m.kind === "human") ?? [];

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planned");
  const [leadId, setLeadId] = useState<string>("");
  const [targetDate, setTargetDate] = useState("");
  const [failure, setFailure] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFailure("Give the project a name.");
      return;
    }
    setFailure(null);
    try {
      const project = await create.mutateAsync({
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        status,
        leadId: leadId || null,
        targetDate: targetDate ? new Date(targetDate).toISOString() : null,
      });
      onDone();
      if (onCreated) {
        onCreated(project.slug);
      } else {
        navigate(`/${orgSlug}/projects/${project.slug}`);
      }
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "conflict") {
        setFailure("A project with this slug already exists. Choose a different one.");
        return;
      }
      setFailure(error instanceof Error ? error.message : "Creating the project failed.");
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 p-5">
      <p className="text-ui text-ink-2 text-pretty">
        Projects coordinate issues across teams toward a single milestone or goal.
      </p>

      <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
        <Field label="Name">
          {(control) => (
            <Input
              {...control}
              autoFocus
              placeholder="Mobile App Redesign"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) {
                  setSlug(suggestSlug(e.target.value));
                }
              }}
            />
          )}
        </Field>
        <Field label="Slug">
          {(control) => (
            <Input
              {...control}
              placeholder="mobile-app"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <FieldMenu label="Status">
          <SelectMenu
            label="Status"
            value={status}
            onChange={setStatus}
            options={projectStatuses}
            className="h-9 w-full"
          />
        </FieldMenu>

        <FieldMenu label="Lead">
          <SelectMenu
            label="Lead"
            value={leadId}
            onChange={setLeadId}
            options={[{ value: "", label: "No lead" }, ...humans.map((h) => ({ value: h.id, label: h.name }))]}
            className="h-9 w-full"
          />
        </FieldMenu>

        <FieldMenu label="Target date">
          <DateMenu
            label="Target date"
            value={targetDate || null}
            onChange={(value) => setTargetDate(value ?? "")}
            trigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label={`Target date: ${targetDate ? formatDay(targetDate) : "none"}`}
                className="hover-fade inline-flex h-9 w-full items-center gap-2 rounded-sm px-2.5 text-ui shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-hover aria-expanded:bg-hover"
              >
                <Calendar aria-hidden="true" className="size-3.5 text-ink-2" strokeWidth={1.75} />
                <span className={targetDate ? "text-ink" : "text-ink-2"}>{targetDate ? formatDay(targetDate) : "No date"}</span>
              </button>
            )}
          />
        </FieldMenu>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-ui font-medium text-ink">Description</span>
        <div className="rounded-sm border border-line bg-surface p-2 focus-within:border-ink">
          <MarkdownEditor
            label="Description"
            value={description}
            onChange={setDescription}
            placeholder="What does this project deliver?"
            className="min-h-24 text-ui"
          />
        </div>
      </div>

      <FormError message={failure} />

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || !name.trim()}>
          {create.isPending ? "Creating..." : "Create project"}
        </Button>
      </div>
    </form>
  );
}

const projectStatuses: { value: ProjectStatus; label: string }[] = [
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In Progress" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Canceled" },
];

// A label over an app menu. Menus are buttons, so the label names them by
// sitting beside them rather than through htmlFor.
function FieldMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink-2">{label}</span>
      {children}
    </div>
  );
}
