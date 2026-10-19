import { CheckSquare, ChevronDown, FolderKanban, Inbox, LogOut, Plus, Server, Settings, Trash2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Membership } from "@edicthq/client";
import { Link, NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router";
import { Avatar, Button, Count, Kbd, LogoMark, ProgressBadge, TeamKey, cn } from "@edicthq/ui";
import { CreateTeamDialog } from "../components/create-team-dialog.js";
import { InviteDialog } from "../components/invite-dialog.js";
import { CommandPalette } from "../components/palette.js";
import { cycleAccent, cycleTheme, isTyping, setOrganizationAccent } from "../lib/appearance.js";
import { UndoProvider } from "../components/undo.js";
import { VerifyBanner } from "../components/verify-banner.js";
import { AuthShell, Loading } from "../components/shell.js";
import { authClient, useSession } from "../lib/auth.js";
import { mod } from "../lib/labels.js";
import { useRealtime } from "../lib/realtime.js";
import type { Agent, Member } from "@edicthq/client";
import { agentState, connectionLine } from "../lib/agents.js";
import { useAgentQueue, useAgents, useInboxUnreadCount, useMembers, useMemberships, useTeams } from "../lib/queries.js";

export interface OrgContext {
  membership: Membership;
  orgId: string;
  slug: string;
  // The signed-in user is an Admin or Owner here.
  canManage: boolean;
  instanceAdmin: boolean;
  openCreateTeam: () => void;
  openInvite: () => void;
  openPalette: () => void;
  signOut: () => Promise<void>;
}

export function useOrg(): OrgContext {
  return useOutletContext<OrgContext>();
}

export function OrgLayout() {
  const { slug } = useParams();
  const memberships = useMemberships();
  const session = useSession();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"team" | "invite" | "palette" | null>(null);
  const current = memberships.data?.find((m) => m.organization.slug === slug);
  useRealtime(current?.organization.id);
  // Members who have not picked an agent color see the organization's.
  const orgAccent = current?.organization.defaultAccent;
  useEffect(() => {
    if (orgAccent) setOrganizationAccent(orgAccent);
  }, [orgAccent]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDialog((open) => (open === "palette" ? null : "palette"));
        return;
      }
      if (isTyping(event) || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key.toLowerCase() === "t") {
        event.preventDefault();
        cycleTheme();
      } else if (event.key.toLowerCase() === "g") {
        event.preventDefault();
        cycleAccent();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (memberships.isPending) return <Loading />;
  const membership = memberships.data?.find((m) => m.organization.slug === slug);
  if (!membership) {
    return (
      <AuthShell
        title="Organization not found"
        lead="It doesn't exist, or you aren't a member. Ask one of its admins for an invite."
      >
        <Link to="/" className="text-ui font-medium underline decoration-line-strong underline-offset-4">
          Go to your organizations
        </Link>
      </AuthShell>
    );
  }

  const canManage = membership.member.role === "owner" || membership.member.role === "admin";
  const context: OrgContext = {
    membership,
    orgId: membership.organization.id,
    slug: membership.organization.slug,
    canManage,
    instanceAdmin: (session.data?.user as { role?: string } | undefined)?.role === "admin",
    openCreateTeam: () => setDialog("team"),
    openInvite: () => setDialog("invite"),
    openPalette: () => setDialog("palette"),
    signOut: async () => {
      await authClient.signOut();
      navigate("/sign-in", { replace: true });
    },
  };

  return (
    <UndoProvider orgId={context.orgId}>
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-10 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Rail context={context} others={memberships.data ?? []} />
      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        <MobileBar context={context} />
        <VerifyBanner />
        <main id="main" className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <Outlet context={context} />
        </main>
      </div>
      {canManage ? (
        <>
          <CreateTeamDialog context={context} open={dialog === "team"} onClose={() => setDialog(null)} />
          <InviteDialog context={context} open={dialog === "invite"} onClose={() => setDialog(null)} />
        </>
      ) : null}
      <CommandPalette
        context={context}
        others={memberships.data ?? []}
        open={dialog === "palette"}
        onClose={() => setDialog(null)}
      />
    </div>
    </UndoProvider>
  );
}

function RailSection({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-0.5">
      <div className="flex items-center gap-2 px-1 pb-1">
        <h2 className="text-sm font-semibold text-ink-2">{title}</h2>
        {aside ? <div className="ms-auto flex items-center">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

const railLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "flex h-[30px] items-center gap-2 rounded-sm px-2 text-ui transition-[background-color,color] duration-[140ms] ease-standard",
    isActive
      ? "bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)]"
      : "text-ink-2 hover:text-ink",
  );

// Unread inbox count in the rail, none shown when the inbox is empty.
function InboxBadge({ orgId }: { orgId: string }) {
  const unread = useInboxUnreadCount(orgId);
  const count = unread.data?.unreadCount ?? 0;
  if (count) {
    return <span className="ms-auto rounded-full bg-agent-wash px-1.5 py-0.5 text-xs font-medium text-agent-ink tabular-nums">{count}</span>;
  }
  return null;
}

function Rail({ context, others }: { context: OrgContext; others: Membership[] }) {
  const { orgId, slug, canManage, membership, instanceAdmin } = context;
  const teams = useTeams(orgId);
  const members = useMembers(orgId);
  const humans = members.data?.filter((m) => m.kind === "human") ?? [];
  const agents = useAgents(orgId).data ?? [];

  return (
    <nav
      aria-label="Organization"
      className="sticky top-0 flex h-dvh w-[252px] shrink-0 flex-col gap-5 overflow-y-auto border-e border-line bg-rail px-3 py-4 max-md:hidden"
    >
      <div className="flex items-center gap-2 px-1">
        <LogoMark />
        <span className="text-body font-semibold tracking-[-0.01em]">Edict</span>
        <OrgSwitcher current={membership} others={others} />
      </div>

      <button
        type="button"
        onClick={context.openPalette}
        className="flex h-8 items-center justify-between rounded-sm bg-surface ps-2.5 pe-1.5 text-ui text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] transition-[color] duration-[140ms] ease-standard hover:text-ink"
      >
        <span>Search or command</span>
        <Kbd>{`${mod}K`}</Kbd>
      </button>

      <div className="flex flex-col gap-0.5">
        <NavLink to={`/${slug}/my-issues`} className={railLink}>
          <CheckSquare aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          My issues
        </NavLink>
        <NavLink to={`/${slug}/inbox`} className={railLink}>
          <Inbox aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          Inbox
          <InboxBadge orgId={orgId} />
        </NavLink>
        <NavLink to={`/${slug}/projects`} className={railLink}>
          <FolderKanban aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          Projects
        </NavLink>
      </div>

      <RailSection
        title="Teams"
        aside={
          canManage ? (
            <Button variant="ghost" aria-label="Create team" title="Create team" className="size-6 px-0" onClick={context.openCreateTeam}>
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </Button>
          ) : null
        }
      >
        {teams.data?.length ? (
          teams.data.map((team) => (
            <NavLink key={team.id} to={`/${slug}/teams/${team.id}`} className={railLink}>
              <TeamKey>{team.key}</TeamKey>
              <span className="truncate">{team.name}</span>
            </NavLink>
          ))
        ) : (
          <p className="px-2 text-sm text-ink-2">No teams yet.</p>
        )}
      </RailSection>

      <RailSection
        title="Agents"
        aside={
          <NavLink to={`/${slug}/agents`} aria-label="All agents" className="rounded-xs px-1 text-sm text-ink-2 hover:text-ink aria-[current=page]:text-ink">
            All
          </NavLink>
        }
      >
        {agents.length ? (
          agents.map((agent) => <AgentCard key={agent.id} agent={agent} members={members.data ?? []} slug={slug} orgId={orgId} />)
        ) : (
          <p className="px-2 text-sm text-ink-2 text-pretty">
            Agents join when someone{" "}
            <Link to={`/${slug}/connect`} className="underline decoration-line-strong underline-offset-2 hover:text-ink">
              connects an MCP client
            </Link>{" "}
            like Claude Code.
          </p>
        )}
      </RailSection>

      <RailSection
        title="Humans"
        aside={
          <NavLink to={`/${slug}/members`} className="rounded-xs px-1 text-sm text-ink-2 hover:text-ink aria-[current=page]:text-ink">
            {canManage ? "Manage" : "All"}
          </NavLink>
        }
      >
        {humans.map((human) => (
          <div key={human.id} className="flex min-h-[30px] items-center gap-2 px-2 text-ui">
            <Avatar name={human.name} />
            <span className="truncate">{human.name}</span>
            {human.id === membership.member.id ? <Count className="ms-auto">you</Count> : null}
          </div>
        ))}
      </RailSection>

      <div className="mt-auto flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <NavLink to={`/${slug}/trash`} className={railLink}>
            <Trash2 aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            Trash
          </NavLink>
          <NavLink to={`/${slug}/settings`} className={railLink}>
            <Settings aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
            Settings
          </NavLink>
          {instanceAdmin ? (
            <NavLink to={`/${slug}/instance`} className={railLink}>
              <Server aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
              Instance settings
            </NavLink>
          ) : null}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-1 pt-3">
          <Avatar name={membership.member.name} />
          <div className="min-w-0">
            <p className="truncate text-ui font-medium">{membership.member.name}</p>
            <p className="truncate text-sm text-ink-2">{membership.member.email}</p>
          </div>
          <Button variant="ghost" aria-label="Sign out" title="Sign out" className="ms-auto size-7 px-0" onClick={context.signOut}>
            <LogOut aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          </Button>
        </div>
      </div>
    </nav>
  );
}

// An agent in the rail, as the C2 concept shows it: how it connects, its
// state, and the open issues in its queue.
function AgentCard({ agent, members, slug, orgId }: { agent: Agent; members: Member[]; slug: string; orgId: string }) {
  const queue = useAgentQueue(orgId, agent.id).data ?? [];
  const states = queue.map((issue) => agentState(issue, agent));
  const working = states.includes("working");
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-sm px-2 py-1.5",
        working && "bg-surface shadow-[inset_0_0_0_1px_var(--agent-edge)]",
      )}
    >
      <NavLink to={`/${slug}/agents#${agent.id}`} className="flex items-start gap-2 text-ui">
        <Avatar name={agent.name} kind="agent" />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate font-medium">{agent.name}</span>
            {agent.pausedAt ? (
              <ProgressBadge state="paused" className="ms-auto" />
            ) : working ? (
              <ProgressBadge state="working" className="ms-auto" />
            ) : null}
          </span>
          <span className="block text-sm text-ink-2 text-pretty">{connectionLine(agent, members)}</span>
        </span>
      </NavLink>
      {queue.length ? (
        <ul className="flex flex-col">
          {queue.slice(0, 3).map((issue, index) => (
            <li key={issue.id}>
              <Link
                to={`/${slug}/issue/${issue.identifier}`}
                className="flex min-w-0 items-baseline gap-1.5 rounded-xs py-0.5 text-sm hover:text-ink"
              >
                <span className="shrink-0 font-medium text-ink-2 tabular-nums">{issue.identifier}</span>
                {states[index] === "needs_input" ? (
                  <span className="shrink-0 font-medium text-warn">Needs input</span>
                ) : states[index] === "blocked" ? (
                  <span className="shrink-0 font-medium text-danger">Blocked</span>
                ) : (
                  <span className="truncate text-ink">{issue.title}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function OrgSwitcher({ current, others }: { current: Membership; others: Membership[] }) {
  return (
    <details className="group relative ms-auto min-w-0">
      <summary
        className="flex h-6 cursor-pointer list-none items-center gap-1 rounded-sm px-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink [&::-webkit-details-marker]:hidden"
        aria-label={`Organization: ${current.organization.name}. Switch organization`}
      >
        <span className="truncate">{current.organization.slug}</span>
        <ChevronDown aria-hidden="true" className="size-3 shrink-0" strokeWidth={2} />
      </summary>
      <div className="absolute end-0 top-7 z-20 flex w-56 flex-col gap-0.5 rounded-md bg-surface p-1 shadow-overlay">
        {others.map((m) => (
          <NavLink
            key={m.organization.id}
            to={`/${m.organization.slug}`}
            className="flex h-8 items-center gap-2 rounded-sm px-2 text-ui hover:bg-hover aria-[current=page]:font-semibold"
            end
          >
            <span className="truncate">{m.organization.name}</span>
            <span className="ms-auto text-sm text-ink-2">{m.organization.slug}</span>
          </NavLink>
        ))}
        <NavLink to="/new" className="flex h-8 items-center gap-2 rounded-sm px-2 text-ui text-ink-2 hover:bg-hover hover:text-ink">
          <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
          New organization
        </NavLink>
      </div>
    </details>
  );
}

// Below the md breakpoint the rail becomes a bar above the page.
function MobileBar({ context }: { context: OrgContext }) {
  const { slug, membership, instanceAdmin } = context;
  const link = ({ isActive }: { isActive: boolean }) =>
    cn("flex h-8 items-center rounded-sm px-2.5 text-ui", isActive ? "bg-surface font-medium text-ink shadow-[inset_0_0_0_1px_var(--line)]" : "text-ink-2");
  return (
    <nav aria-label="Organization" className="flex flex-col gap-2 border-b border-line bg-rail px-4 pt-3 pb-2 md:hidden">
      <div className="flex items-center gap-2">
        <LogoMark />
        <span className="truncate text-ui font-semibold">{membership.organization.name}</span>
        <Button variant="ghost" aria-label="Search or command" className="ms-auto" onClick={context.openPalette}>
          Search
        </Button>
        <Button variant="ghost" aria-label="Sign out" className="size-8 px-0" onClick={context.signOut}>
          <LogOut aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Button>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        <NavLink to={`/${slug}`} end className={link}>
          Teams
        </NavLink>
        <NavLink to={`/${slug}/my-issues`} className={link}>
          My issues
        </NavLink>
        <NavLink to={`/${slug}/inbox`} className={link}>
          Inbox
        </NavLink>
        <NavLink to={`/${slug}/projects`} className={link}>
          Projects
        </NavLink>
        <NavLink to={`/${slug}/members`} className={link}>
          Members
        </NavLink>
        <NavLink to={`/${slug}/agents`} className={link}>
          Agents
        </NavLink>
        <NavLink to={`/${slug}/settings`} className={link}>
          Settings
        </NavLink>
        {instanceAdmin ? (
          <NavLink to={`/${slug}/instance`} className={link}>
            Instance
          </NavLink>
        ) : null}
      </div>
    </nav>
  );
}
