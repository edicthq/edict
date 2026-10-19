import { useState } from "react";
import { MarkdownEditor } from "./markdown-editor.js";
import { useNavigate } from "react-router";
import type { ProjectStatus } from "@edicthq/client";
import { Button, Dialog, Field, Input, Select } from "@edicthq/ui";
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
        <Field label="Status">
          {(control) => (
            <Select
              {...control}
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="canceled">Canceled</option>
            </Select>
          )}
        </Field>

        <Field label="Lead">
          {(control) => (
            <Select
              {...control}
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
            >
              <option value="">No lead</option>
              {humans.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="Target date">
          {(control) => (
            <Input
              {...control}
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
          )}
        </Field>
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
