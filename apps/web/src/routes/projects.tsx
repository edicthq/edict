import { useState } from "react";
import { MarkdownEditor } from "../components/markdown-editor.js";
import { Markdown, plainText } from "../components/markdown.js";
import { Link, useNavigate, useParams } from "react-router";
import type { ProjectStatus } from "@edicthq/client";
import { Avatar, Button, ProgressBar, ProjectStatusBadge, PriorityIcon, StatusIcon, Tabs, TeamKey, cn } from "@edicthq/ui";
import { ArrowLeft, Calendar, FolderKanban, Plus, Trash2 } from "lucide-react";
import { CreateProjectDialog } from "../components/create-project-dialog.js";
import { EmptyState, GroupHeader, Loading, PageBody, PageHeader, rowClass } from "../components/shell.js";
import {
  useDeleteProject,
  useMembers,
  useProject,
  useProjectIssues,
  useProjects,
  useTeams,
  useUpdateProject,
} from "../lib/queries.js";
import { useOrg } from "./org.js";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "No date";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ProjectsPage() {
  const { orgId, slug, membership } = useOrg();
  const projects = useProjects(orgId);
  const members = useMembers(orgId);
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");

  const memberMap = new Map((members.data ?? []).map((m) => [m.id, m]));

  const filtered = (projects.data ?? []).filter((p) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "active") return p.status === "in_progress" || p.status === "planned";
    return p.status === statusFilter;
  });

  return (
    <>
      <PageHeader
        title="Projects"
        actions={
          // Guests work only in their teams' issues, not on projects.
          membership.member.role === "guest" ? null : (
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
              New project
            </Button>
          )
        }
      />

      <PageBody>
        {projects.isPending ? (
          <Loading label="Loading projects" />
        ) : projects.data?.length ? (
          <div className="flex flex-col gap-4">
            <Tabs
              label="Project status"
              value={statusFilter}
              onChange={setStatusFilter}
              items={[
                { value: "all", label: "All", count: projects.data.length },
                { value: "active", label: "Active" },
                { value: "completed", label: "Completed" },
              ]}
            />

            <ul className="flex flex-col gap-2">
              {filtered.map((proj) => {
                const lead = proj.leadId ? memberMap.get(proj.leadId) : null;
                const { total, completed, percentage } = proj.progress;
                return (
                  <li key={proj.id}>
                    <Link
                      to={`/${slug}/projects/${proj.slug}`}
                      className="group flex flex-col gap-3 rounded-md border border-line bg-surface p-4 transition-[border-color,background-color] hover:border-line-strong hover:bg-hover/50"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="truncate text-base font-semibold tracking-[-0.01em] text-ink">
                            {proj.name}
                          </span>
                          <span className="text-sm text-ink-3">#{proj.slug}</span>
                          <ProjectStatusBadge status={proj.status} />
                        </div>
                        <div className="flex items-center gap-4 text-sm text-ink-2">
                          {lead ? (
                            <div className="flex items-center gap-1.5" title={`Lead: ${lead.name}`}>
                              <Avatar name={lead.name} />
                              <span className="truncate max-w-[120px]">{lead.name}</span>
                            </div>
                          ) : null}
                          {proj.targetDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar aria-hidden="true" className="size-3.5 text-ink-3" />
                              <span>{formatDate(proj.targetDate)}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>

                      {proj.description ? (
                        <p className="line-clamp-2 text-ui text-ink-2 text-pretty">
                          {plainText(proj.description)}
                        </p>
                      ) : null}

                      <div className="flex items-center gap-3 pt-1">
                        <div className="w-48 max-w-full">
                          <ProgressBar percentage={percentage} />
                        </div>
                        <span className="text-sm text-ink-2 tabular-nums font-medium">
                          {percentage}%
                        </span>
                        <span className="text-sm text-ink-3 tabular-nums">
                          {completed} of {total} {total === 1 ? "issue" : "issues"}
                        </span>
                        {proj.progress.estimate.total > 0 ? (
                          <span className="ms-auto text-sm text-ink-3 tabular-nums">
                            {proj.progress.estimate.completed}/{proj.progress.estimate.total} pts
                          </span>
                        ) : null}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <EmptyState
            layout="page"
            icon={<FolderKanban aria-hidden="true" />}
            title="No projects yet"
            body="Projects group issues from across teams toward high-level milestones and product launches."
            action={
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
                Create project
              </Button>
            }
          />
        )}
      </PageBody>

      <CreateProjectDialog
        orgId={orgId}
        slug={slug}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
    </>
  );
}

export function ProjectDetailPage() {
  const { projectRef = "" } = useParams();
  const { orgId, slug, canManage } = useOrg();
  const navigate = useNavigate();
  const projectQuery = useProject(orgId, projectRef);
  const issuesQuery = useProjectIssues(orgId, projectRef);
  const members = useMembers(orgId);
  const teams = useTeams(orgId);
  const updateProject = useUpdateProject(orgId, projectRef);
  const deleteProject = useDeleteProject(orgId);

  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");

  const project = projectQuery.data;
  const issues = issuesQuery.data ?? [];
  const humans = (members.data ?? []).filter((m) => m.kind === "human");
  const memberMap = new Map((members.data ?? []).map((m) => [m.id, m]));
  const teamMap = new Map((teams.data ?? []).map((t) => [t.id, t]));

  if (projectQuery.isPending) return <Loading label="Loading project" />;
  if (!project) {
    return (
      <PageBody className="pt-6">
        <EmptyState
          layout="page"
          icon={<FolderKanban aria-hidden="true" />}
          title="Project not found"
          body="It may have been deleted, moved, or the address is mistyped."
          action={
            <Link to={`/${slug}/projects`}>
              <Button variant="ghost">Back to projects</Button>
            </Link>
          }
        />
      </PageBody>
    );
  }

  const handleStatusChange = async (nextStatus: ProjectStatus) => {
    await updateProject.mutateAsync({
      version: project.version,
      status: nextStatus,
    });
  };

  const handleLeadChange = async (leadId: string) => {
    await updateProject.mutateAsync({
      version: project.version,
      leadId: leadId || null,
    });
  };

  const handleTargetDateChange = async (dateStr: string) => {
    await updateProject.mutateAsync({
      version: project.version,
      targetDate: dateStr ? new Date(dateStr).toISOString() : null,
    });
  };

  const handleSaveDescription = async () => {
    await updateProject.mutateAsync({
      version: project.version,
      description: descDraft,
    });
    setIsEditingDesc(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Move "${project.name}" to trash?`)) return;
    await deleteProject.mutateAsync(project.id);
    navigate(`/${slug}/projects`);
  };

  const { total, completed, percentage, byCategory, estimate } = project.progress;

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-line px-6 pt-5 pb-4">
        <div className="flex items-center gap-2 text-sm text-ink-2">
          <Link to={`/${slug}/projects`} className="hover:text-ink flex items-center gap-1">
            <ArrowLeft aria-hidden="true" className="size-3.5" />
            Projects
          </Link>
          <span className="text-ink-3">/</span>
          <span className="text-ink font-medium">{project.name}</span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{project.name}</h1>
            <span className="text-ui text-ink-3">#{project.slug}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Picker */}
            <select
              value={project.status}
              onChange={(e) => void handleStatusChange(e.target.value as ProjectStatus)}
              className="h-8 rounded-sm border border-line bg-surface px-2.5 text-ui font-medium text-ink outline-none hover:border-line-strong cursor-pointer"
            >
              <option value="planned">Planned</option>
              <option value="in_progress">In Progress</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="canceled">Canceled</option>
            </select>

            {/* Lead Picker */}
            <select
              value={project.leadId ?? ""}
              onChange={(e) => void handleLeadChange(e.target.value)}
              className="h-8 rounded-sm border border-line bg-surface px-2.5 text-ui text-ink-2 outline-none hover:border-line-strong cursor-pointer"
            >
              <option value="">No lead</option>
              {humans.map((h) => (
                <option key={h.id} value={h.id}>
                  Lead: {h.name}
                </option>
              ))}
            </select>

            {/* Target Date Picker */}
            <input
              type="date"
              value={project.targetDate ? project.targetDate.slice(0, 10) : ""}
              onChange={(e) => void handleTargetDateChange(e.target.value)}
              className="h-8 rounded-sm border border-line bg-surface px-2 text-ui text-ink-2 outline-none hover:border-line-strong cursor-pointer"
              title="Target date"
            />

            {canManage ? (
              <Button
                variant="ghost"
                title="Move to trash"
                aria-label="Move to trash"
                className="size-8 px-0 text-ink-3 hover:text-danger"
                onClick={() => void handleDelete()}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <PageBody className="pt-5 flex flex-col gap-6">
        {/* Progress & Metrics Card */}
        <section className="rounded-md border border-line bg-surface p-5 flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">Progress</h2>
            <div className="flex items-center gap-3 text-sm">
              <span className="font-semibold text-ink tabular-nums">{percentage}% completed</span>
              <span className="text-ink-2 tabular-nums">
                ({completed} of {total} issues)
              </span>
              {estimate.total > 0 ? (
                <span className="text-ink-3 tabular-nums">
                  · {estimate.completed} of {estimate.total} points
                </span>
              ) : null}
            </div>
          </div>

          <ProgressBar percentage={percentage} className="h-2" />

          <dl className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-5">
            {(
              [
                ["backlog", "Backlog"],
                ["todo", "Todo"],
                ["in_progress", "In Progress"],
                ["done", "Done"],
                ["canceled", "Canceled"],
              ] as const
            ).map(([category, name]) => (
              <div key={category} className="flex flex-col gap-1 rounded-sm border border-line px-3 py-2.5">
                <dt className="flex items-center gap-1.5 text-sm text-ink-2">
                  <StatusIcon category={category} />
                  {name}
                </dt>
                <dd className={cn("text-lg font-semibold tabular-nums", category === "canceled" ? "text-ink-2" : "text-ink")}>
                  {byCategory[category]}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Description */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Description</h2>
            {!isEditingDesc ? (
              <button
                type="button"
                onClick={() => {
                  setDescDraft(project.description ?? "");
                  setIsEditingDesc(true);
                }}
                className="text-sm text-ink-2 hover:text-ink underline underline-offset-2"
              >
                {project.description ? "Edit" : "Add description"}
              </button>
            ) : null}
          </div>

          {isEditingDesc ? (
            <div className="flex flex-col gap-2">
              <div className="rounded-md border border-line bg-surface p-3 focus-within:border-ink">
                <MarkdownEditor
                  label="Project description"
                  autoFocus
                  value={descDraft}
                  onChange={setDescDraft}
                  onSubmit={() => void handleSaveDescription()}
                  onEscape={() => setIsEditingDesc(false)}
                  placeholder="What is this project aiming to accomplish?"
                  className="min-h-24 text-ui"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setIsEditingDesc(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => void handleSaveDescription()}>
                  Save
                </Button>
              </div>
            </div>
          ) : project.description ? (
            <div className="rounded-md border border-line/60 bg-surface/50 p-4">
              <Markdown text={project.description} />
            </div>
          ) : (
            <p className="text-sm text-ink-3 italic">No description provided.</p>
          )}
        </section>

        {/* Cross-Team Issues */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <GroupHeader count={issues.length}>Issues</GroupHeader>
          </div>

          {issuesQuery.isPending ? (
            <Loading label="Loading issues" />
          ) : issues.length ? (
            <ul className="flex flex-col gap-px">
              {issues.map((issue) => {
                const team = teamMap.get(issue.teamId);
                const assignee = issue.assigneeId ? memberMap.get(issue.assigneeId) : null;
                return (
                  <li key={issue.id}>
                    <Link
                      to={`/${slug}/teams/${issue.teamId}?issue=${issue.identifier}`}
                      className={cn(rowClass, "grid grid-cols-[auto_16px_minmax(0,1fr)_auto_auto] items-center gap-3")}
                    >
                      <div className="flex items-center gap-2">
                        {team ? <TeamKey>{team.key}</TeamKey> : null}
                        <span className="text-sm font-medium text-ink-2 tabular-nums">
                          {issue.identifier}
                        </span>
                      </div>

                      <PriorityIcon priority={issue.priority} />

                      <span className="truncate text-body tracking-[-0.005em] text-ink font-medium">
                        {issue.title}
                      </span>

                      {assignee ? (
                        <div className="flex items-center gap-1.5 text-sm text-ink-2" title={`Assignee: ${assignee.name}`}>
                          <Avatar name={assignee.name} />
                          <span className="truncate max-w-[100px] hidden sm:inline">{assignee.name}</span>
                        </div>
                      ) : null}

                      {issue.estimate !== null ? (
                        <span className="text-xs text-ink-3 tabular-nums font-mono">
                          {issue.estimate} pts
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title="No issues in this project yet"
              body="Issues from any team can be linked to this project by selecting it in the issue's project field."
            />
          )}
        </section>
      </PageBody>
    </>
  );
}
