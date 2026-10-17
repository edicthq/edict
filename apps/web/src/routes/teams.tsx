import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronRight, Lock } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useParams } from "react-router";
import type { z } from "zod";
import { CreateTeam } from "@edicthq/schema";
import { Avatar, Badge, Button, Field, Input, Select, TeamKey } from "@edicthq/ui";
import { EmptyState, FormError, Loading, PageHeader, SectionLabel } from "../components/shell.js";
import { ApiFailure } from "../lib/api.js";
import {
  useAddTeamMember,
  useCreateTeam,
  useMembers,
  useRemoveTeamMember,
  useTeamMembers,
  useTeams,
} from "../lib/queries.js";
import { roleLabel } from "./members.js";
import { useOrg } from "./org.js";

// A first guess at a team key from its name: "Engineering" → "ENG",
// "Customer Success" → "CS".
export function suggestKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const key = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3);
  return key.replace(/^[0-9]+/, "").slice(0, 7);
}

export function TeamsPage() {
  const { orgId, canManage, membership } = useOrg();
  const teams = useTeams(orgId);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Teams"
        actions={
          canManage && !creating && teams.data?.length ? (
            <Button variant="primary" onClick={() => setCreating(true)}>
              Create team
            </Button>
          ) : null
        }
      />
      <div className="mx-auto flex max-w-[760px] flex-col gap-8 px-6 py-8">
        {creating ? <CreateTeamForm onDone={() => setCreating(false)} /> : null}
        {teams.isPending ? (
          <Loading label="Loading teams" />
        ) : teams.data?.length ? (
          <ul className="flex flex-col">
            {teams.data.map((team) => (
              <li key={team.id} className="border-b border-line last:border-b-0">
                <Link
                  to={`/${membership.organization.slug}/teams/${team.id}`}
                  className="group flex h-10 items-center gap-3 rounded-sm px-2 hover:bg-hover"
                >
                  <TeamKey>{team.key}</TeamKey>
                  <span className="truncate text-body font-medium tracking-[-0.005em]">{team.name}</span>
                  {team.private ? (
                    <Badge className="gap-1">
                      <Lock aria-hidden="true" className="size-3" strokeWidth={2} />
                      Private
                    </Badge>
                  ) : null}
                  <ChevronRight aria-hidden="true" className="ms-auto size-4 text-ink-3" strokeWidth={1.75} />
                </Link>
              </li>
            ))}
          </ul>
        ) : !creating ? (
          <EmptyState
            title="No teams yet"
            body={
              canManage
                ? "A team owns its issues and gives them their identifier, like ENG-12. Start with the team you work in."
                : "An admin hasn't created a team you can see yet."
            }
            action={
              canManage ? (
                <Button variant="primary" onClick={() => setCreating(true)}>
                  Create team
                </Button>
              ) : null
            }
          />
        ) : null}
      </div>
    </>
  );
}

function CreateTeamForm({ onDone }: { onDone: () => void }) {
  const { orgId } = useOrg();
  const create = useCreateTeam(orgId);
  const [failure, setFailure] = useState<string | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const form = useForm<z.input<typeof CreateTeam>, unknown, z.output<typeof CreateTeam>>({
    resolver: zodResolver(CreateTeam),
    defaultValues: { name: "", key: "", private: false },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      await create.mutateAsync(values);
      onDone();
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "conflict") {
        form.setError("key", { message: "Another team uses this key. Choose a different one." });
        return;
      }
      setFailure(error instanceof Error ? error.message : "Creating the team failed.");
    }
  });

  return (
    <section aria-labelledby="create-team" className="rounded-md border border-line bg-surface p-4">
      <SectionLabel id="create-team">New team</SectionLabel>
      <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Name" error={form.formState.errors.name?.message}>
            {(control) => (
              <Input
                {...control}
                autoFocus
                placeholder="Engineering"
                {...form.register("name", {
                  onChange: (event: { target: { value: string } }) => {
                    if (!keyTouched) form.setValue("key", suggestKey(event.target.value));
                  },
                })}
              />
            )}
          </Field>
          <Field
            label="Key"
            hint="In identifiers, like ENG-12."
            error={form.formState.errors.key && (form.formState.errors.key.message?.startsWith("Another") ? form.formState.errors.key.message : "2–7 capital letters or digits, starting with a letter.")}
          >
            {(control) => (
              <Input
                {...control}
                className="font-code uppercase"
                autoCapitalize="characters"
                maxLength={7}
                placeholder="ENG"
                {...form.register("key", {
                  setValueAs: (value: string) => value.toUpperCase(),
                  onChange: () => setKeyTouched(true),
                })}
              />
            )}
          </Field>
        </div>
        <label className="flex items-start gap-2 text-ui">
          <input type="checkbox" className="mt-0.5 size-4 accent-[var(--ink)]" {...form.register("private")} />
          <span>
            <span className="font-medium">Private team</span>
            <span className="block text-ink-2">Only its members and admins can see it.</span>
          </span>
        </label>
        <FormError message={failure} />
        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Creating…" : "Create team"}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}

export function TeamPage() {
  const { teamId = "" } = useParams();
  const { orgId, canManage, membership } = useOrg();
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
      <div className="px-6 py-8">
        <EmptyState title="Team not found" body="It doesn't exist, or it's a private team you aren't in." />
      </div>
    );
  }

  const me = membership.member.id;
  const inTeam = new Set(teamMembers.data?.map((m) => m.id));
  const candidates = (orgMembers.data ?? []).filter((m) => !inTeam.has(m.id));
  const error = add.error ?? remove.error;

  return (
    <>
      <PageHeader
        title={team.name}
        meta={
          <>
            <TeamKey>{team.key}</TeamKey>
            {team.private ? <Badge>Private</Badge> : null}
          </>
        }
        actions={
          !canManage && !inTeam.has(me) && !team.private ? (
            <Button variant="primary" disabled={add.isPending} onClick={() => add.mutate(me)}>
              Join team
            </Button>
          ) : null
        }
      />
      <div className="mx-auto flex max-w-[760px] flex-col gap-4 px-6 py-8">
        <div className="flex items-center gap-3">
          <SectionLabel>
            Members <span className="tabular-nums">{teamMembers.data?.length ?? 0}</span>
          </SectionLabel>
        </div>
        <FormError message={error?.message} />
        <ul className="flex flex-col">
          {teamMembers.data?.map((member) => (
            <li key={member.id} className="flex h-12 items-center gap-3 border-b border-line px-2 last:border-b-0">
              <Avatar name={member.name} kind={member.kind} />
              <div className="min-w-0">
                <p className="truncate text-body font-medium">
                  {member.name}
                  {member.id === me ? <span className="font-normal text-ink-2"> (you)</span> : null}
                </p>
              </div>
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
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (adding) add.mutate(adding, { onSuccess: () => setAdding("") });
            }}
          >
            <Field label="Add a member" className="flex-1">
              {(control) => (
                <Select {...control} value={adding} onChange={(event) => setAdding(event.target.value)}>
                  <option value="">Choose someone…</option>
                  {candidates.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Button type="submit" disabled={!adding || add.isPending}>
              Add to team
            </Button>
          </form>
        ) : null}
      </div>
    </>
  );
}
