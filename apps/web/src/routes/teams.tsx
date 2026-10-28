import { Lock } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import type { Team } from "@edicthq/client";
import { Avatar, Badge, Button, SelectMenu, TeamKey, cn } from "@edicthq/ui";
import { SettingRow, SettingsCard } from "../components/settings-frame.js";
import { EmptyState, FormError, Loading, PageBody, PageColumn, PageHeader } from "../components/shell.js";
import { roleLabel } from "../lib/labels.js";
import { useToast } from "../components/toast.js";
import { useOfferUndo } from "../components/undo.js";
import {
  useAddTeamMember,
  useAgents,
  useDeleteTeam,
  useMembers,
  useRemoveTeamMember,
  useTeamMembers,
  useTeamOverview,
  useTeams,
  useUpdateTeam,
} from "../lib/queries.js";
import { useOrg } from "./org.js";

const teamGrid =
  "grid grid-cols-[minmax(0,1fr)_56px] items-center gap-4 px-3 sm:grid-cols-[minmax(0,1fr)_56px_minmax(0,180px)] md:grid-cols-[minmax(0,1fr)_56px_84px_84px_minmax(0,180px)] lg:grid-cols-[minmax(0,1fr)_56px_84px_84px_minmax(0,180px)_minmax(0,160px)]";

function Count({ value, label, className }: { value: number | undefined; label: [string, string]; className?: string }) {
  return (
    <span className={cn("text-end text-ui tabular-nums", !value && "text-ink-2", className)}>
      {value === undefined ? "" : value}
      {value === undefined ? null : <span className="sr-only"> {label[value === 1 ? 0 : 1]}</span>}
    </span>
  );
}

// Up to five faces, then "+N". Agents are rounded squares in the accent.
function Stack({ names, kind, label, className }: { names: string[]; kind: "human" | "agent"; label: [string, string]; className?: string }) {
  const shown = names.slice(0, 5);
  return (
    <span className={cn("flex min-w-0 items-center", className)} title={names.join(", ")}>
      {names.length === 0 ? (
        <span className="text-sm text-ink-2">None</span>
      ) : (
        <>
          <span className="sr-only">
            {names.length} {label[names.length === 1 ? 0 : 1]}: {names.join(", ")}
          </span>
          <span className="flex gap-1">
            {shown.map((name) => (
              <Avatar key={name} name={name} kind={kind} />
            ))}
          </span>
          {names.length > shown.length ? (
            <span className="ms-1.5 text-sm text-ink-2 tabular-nums">+{names.length - shown.length}</span>
          ) : null}
        </>
      )}
    </span>
  );
}

export function TeamsPage() {
  const { orgId, canManage, slug, openCreateTeam } = useOrg();
  const teams = useTeams(orgId);
  const overview = useTeamOverview(orgId);
  const members = useMembers(orgId);
  const agents = useAgents(orgId);

  return (
    <>
      <PageHeader
        title="Teams"
        actions={
          canManage && teams.data?.length ? (
            <Button variant="primary" onClick={openCreateTeam}>
              Create team
            </Button>
          ) : null
        }
      />
      <PageBody>
        {teams.isPending ? (
          <Loading label="Loading teams" />
        ) : teams.data?.length ? (
          <div className="pt-1">
            <div aria-hidden="true" className={cn(teamGrid, "h-9 text-sm font-medium text-ink-2")}>
              <span>Team</span>
              <span className="text-end">Open</span>
              <span className="text-end max-md:hidden">In progress</span>
              <span className="text-end max-md:hidden">With agents</span>
              <span className="ps-4 max-sm:hidden">Members</span>
              <span className="max-lg:hidden">Agents</span>
            </div>
            <ul aria-label="Teams" className="flex flex-col gap-px">
              {teams.data.map((team) => {
                const row = overview.data?.find((o) => o.teamId === team.id);
                const ids = new Set(row?.memberIds ?? []);
                const people = (members.data ?? []).filter((m) => ids.has(m.id) && m.kind === "human");
                // Connected agents work in their human's teams.
                const teamAgents = (agents.data ?? []).filter(
                  (agent) => !agent.pausedAt && (ids.has(agent.id) || (agent.connectedBy !== null && ids.has(agent.connectedBy))),
                );
                return (
                  <li key={team.id}>
                    <Link
                      to={`/${slug}/teams/${team.id}`}
                      className={cn(teamGrid, "min-h-12 rounded-sm py-1.5 hover-fade hover:bg-hover")}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <TeamKey>{team.key}</TeamKey>
                        <span className="truncate text-body font-medium tracking-[-0.005em]">{team.name}</span>
                        {team.private ? (
                          <Badge>
                            <Lock aria-hidden="true" className="size-3" strokeWidth={2} />
                            Private
                          </Badge>
                        ) : null}
                      </span>
                      <Count value={row?.open} label={["open issue", "open issues"]} />
                      <Count value={row?.inProgress} label={["in progress", "in progress"]} className="max-md:hidden" />
                      <Count value={row?.delegated} label={["delegated to an agent", "delegated to agents"]} className="max-md:hidden" />
                      <Stack names={people.map((m) => m.name)} kind="human" label={["member", "members"]} className="ps-4 max-sm:hidden" />
                      <Stack names={teamAgents.map((a) => a.name)} kind="agent" label={["agent", "agents"]} className="max-lg:hidden" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <EmptyState
            title="No teams yet"
            body={
              canManage
                ? "A team owns its issues and gives them their identifier, like ENG-12. Start with the team you work in."
                : "An admin hasn't created a team you can see yet."
            }
            action={
              canManage ? (
                <Button variant="primary" onClick={openCreateTeam}>
                  Create team
                </Button>
              ) : null
            }
          />
        )}
      </PageBody>
    </>
  );
}

export function TeamMembersPage() {
  const { teamId = "" } = useParams();
  const { orgId, canManage, membership, slug } = useOrg();
  const teams = useTeams(orgId);
  const teamMembers = useTeamMembers(orgId, teamId);
  const orgMembers = useMembers(orgId);
  const add = useAddTeamMember(orgId, teamId);
  const remove = useRemoveTeamMember(orgId, teamId);

  const team = teams.data?.find((t) => t.id === teamId);
  if (teams.isPending || teamMembers.isPending) return <Loading />;
  if (!team) {
    return (
      <PageBody className="pt-6">
        <EmptyState title="Team not found" body="It doesn't exist, or it's a private team you aren't in." />
      </PageBody>
    );
  }

  const me = membership.member.id;
  const inTeam = new Set(teamMembers.data?.map((m) => m.id));
  const candidates = (orgMembers.data ?? []).filter((m) => !inTeam.has(m.id));
  const error = add.error ?? remove.error;

  return (
    <>
      <PageHeader
        lead={<TeamKey>{team.key}</TeamKey>}
        title={team.name}
        actions={
          <>
            {team.private ? (
              <Badge>
                <Lock aria-hidden="true" className="size-3" strokeWidth={2} />
                Private
              </Badge>
            ) : null}
            <Link
              to={`/${slug}/teams/${team.id}`}
              className="inline-flex h-8 items-center rounded-sm px-2 text-ui text-ink-2 hover:bg-hover hover:text-ink"
            >
              Issues
            </Link>
            {!canManage && !inTeam.has(me) && !team.private ? (
              <Button variant="primary" disabled={add.isPending} onClick={() => add.mutate(me)}>
                Join team
              </Button>
            ) : null}
          </>
        }
      />
      <PageColumn className="flex max-w-[760px] flex-col gap-8">
        <SettingsCard
          title="Members"
          count={teamMembers.data?.length ?? 0}
          actions={
            canManage && candidates.length ? (
              <SelectMenu
                label="Add a member"
                value=""
                onChange={(id) => {
                  if (id) add.mutate(id);
                }}
                options={[{ value: "", label: "Add a member…" }, ...candidates.map((m) => ({ value: m.id, label: m.name }))]}
                align="end"
                className="h-7 w-[160px]"
              />
            ) : null
          }
        >
          <ul className="flex flex-col divide-y divide-line">
            {teamMembers.data?.map((member) => (
              <li key={member.id} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
                <Avatar name={member.name} kind={member.kind} size={32} />
                <span className="min-w-0 flex-1 truncate text-ui font-medium">
                  {member.name}
                  {member.id === me ? <span className="font-normal text-ink-2"> (you)</span> : null}
                </span>
                <Badge>{roleLabel[member.role]}</Badge>
                {canManage || member.id === me ? (
                  <Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(member.id)}>
                    {member.id === me ? "Leave" : "Remove"}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </SettingsCard>
        <FormError message={error?.message} />
        {canManage ? <TeamSettings team={team} /> : null}
      </PageColumn>
    </>
  );
}

const archiveChoices: { value: string; label: string }[] = [
  { value: "7", label: "After 1 week" },
  { value: "30", label: "After 1 month" },
  { value: "90", label: "After 3 months" },
  { value: "180", label: "After 6 months" },
  { value: "never", label: "Never" },
];

// What an Admin changes about a team itself: when its closed issues archive
// (ADR 0025), and sending it to the trash (ADR 0019).
function TeamSettings({ team }: { team: Team }) {
  const { orgId, slug } = useOrg();
  const update = useUpdateTeam(orgId);
  const remove = useDeleteTeam(orgId);
  const offerUndo = useOfferUndo();
  const toast = useToast();
  const navigate = useNavigate();
  const current = team.archiveAfterDays === null ? "never" : String(team.archiveAfterDays);
  const choices = archiveChoices.some((c) => c.value === current)
    ? archiveChoices
    : [{ value: current, label: `After ${current} days` }, ...archiveChoices];

  return (
    <SettingsCard title="Settings">
      <SettingRow id="team-archive" title="Archive closed issues" description="Done and canceled issues leave the team's lists after this long. They stay searchable.">
        <SelectMenu
          label="Archive closed issues"
          className="w-[160px]"
          value={current}
          disabled={update.isPending}
          options={choices}
          align="end"
          onChange={(value) =>
            update.mutate(
              { teamId: team.id, version: team.version, archiveAfterDays: value === "never" ? null : Number(value) },
              { onError: (error) => toast(error.message) },
            )
          }
        />
      </SettingRow>
      <SettingRow
        id="team-delete"
        title="Delete team"
        description="Sends the team to the trash with all its issues for 30 days. Its key stays reserved until then."
      >
        <Button
          disabled={remove.isPending}
          onClick={() => {
            if (!window.confirm(`Move ${team.key} ${team.name} and all its issues to the trash?`)) return;
            remove.mutate(team.id, {
              onSuccess: () => {
                offerUndo(`Moved ${team.key} to the trash`);
                navigate(`/${slug}/teams`);
              },
              onError: (error) => toast(error.message),
            });
          }}
        >
          Delete team
        </Button>
      </SettingRow>
    </SettingsCard>
  );
}
