import { Lock } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Team } from "@edicthq/client";
import { Avatar, Badge, Button, Select, TeamKey } from "@edicthq/ui";
import { EmptyState, FormError, GroupHeader, Loading, PageBody, PageHeader, rowClass } from "../components/shell.js";
import { roleLabel } from "../lib/labels.js";
import { useToast } from "../components/toast.js";
import { useOfferUndo } from "../components/undo.js";
import {
  useAddTeamMember,
  useDeleteTeam,
  useMembers,
  useRemoveTeamMember,
  useTeamMembers,
  useTeams,
  useUpdateTeam,
} from "../lib/queries.js";
import { useOrg } from "./org.js";

export function TeamsPage() {
  const { orgId, canManage, slug, openCreateTeam } = useOrg();
  const teams = useTeams(orgId);

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
          <>
            <GroupHeader count={teams.data.length}>All teams</GroupHeader>
            <ul className="flex flex-col gap-px">
              {teams.data.map((team) => (
                <li key={team.id}>
                  <Link to={`/${slug}/teams/${team.id}`} className={rowClass}>
                    <TeamKey>{team.key}</TeamKey>
                    <span className="truncate text-body tracking-[-0.005em]">{team.name}</span>
                    {team.private ? (
                      <Badge>
                        <Lock aria-hidden="true" className="size-3" strokeWidth={2} />
                        Private
                      </Badge>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </>
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
  const [adding, setAdding] = useState("");

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
      <PageBody>
        <GroupHeader count={teamMembers.data?.length ?? 0}>Members</GroupHeader>
        <FormError message={error?.message} />
        <ul className="flex flex-col gap-px">
          {teamMembers.data?.map((member) => (
            <li key={member.id} className={rowClass}>
              <Avatar name={member.name} kind={member.kind} />
              <span className="truncate text-body">
                {member.name}
                {member.id === me ? <span className="text-ink-2"> (you)</span> : null}
              </span>
              <Badge className="ms-auto">{roleLabel[member.role]}</Badge>
              {canManage || member.id === me ? (
                <Button variant="ghost" disabled={remove.isPending} onClick={() => remove.mutate(member.id)}>
                  {member.id === me ? "Leave" : "Remove"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage && candidates.length ? (
          <form
            className="mt-3 flex items-center gap-2 px-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (adding) add.mutate(adding, { onSuccess: () => setAdding("") });
            }}
          >
            <label className="flex flex-1 items-center gap-2">
              <span className="sr-only">Member to add</span>
              <Select className="max-w-[280px] sm:h-[30px]" value={adding} onChange={(event) => setAdding(event.target.value)}>
                <option value="">Add a member…</option>
                {candidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </label>
            <Button type="submit" disabled={!adding || add.isPending}>
              Add to team
            </Button>
          </form>
        ) : null}
        {canManage ? <TeamSettings team={team} /> : null}
      </PageBody>
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
    <section aria-labelledby="team-settings" className="mt-8 flex flex-col gap-4">
      <GroupHeader>
        <span id="team-settings">Settings</span>
      </GroupHeader>
      <label className="flex flex-wrap items-center gap-3 px-3 text-ui">
        <span className="min-w-56 text-ink">Archive closed issues</span>
        <Select
          className="max-w-[200px] sm:h-[30px]"
          value={current}
          disabled={update.isPending}
          onChange={(event) =>
            update.mutate(
              { teamId: team.id, version: team.version, archiveAfterDays: event.target.value === "never" ? null : Number(event.target.value) },
              { onError: (error) => toast(error.message) },
            )
          }
        >
          {choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.label}
            </option>
          ))}
        </Select>
      </label>
      <div className="flex flex-wrap items-center gap-3 px-3 text-ui">
        <span className="min-w-56 text-ink-2">
          Deleting the team sends it to the trash with all its issues for 30 days. Its key stays reserved until then.
        </span>
        <Button
          variant="ghost"
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
      </div>
    </section>
  );
}

