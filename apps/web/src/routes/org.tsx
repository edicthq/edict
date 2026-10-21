import {
  ArrowLeftRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  FolderKanban,
  Inbox,
  LogOut,
  Menu as MenuIcon,
  Plug,
  Plus,
  Search,
  Server,
  Settings,
  SquarePen,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import type { Membership } from "@edicthq/client";
import { Link, NavLink, Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router";
import { type AgentState, Avatar, Kbd, LogoMark, ProgressBadge, TeamKey, cn } from "@edicthq/ui";
import { CreateTeamDialog } from "../components/create-team-dialog.js";
import { InviteDialog } from "../components/invite-dialog.js";
import { CommandPalette } from "../components/palette.js";
import { desktopShell, openSwitcher, useDesktopBridge } from "../lib/desktop.js";
import { cycleAccent, cycleTheme, isTyping, setOrganizationAccent } from "../lib/appearance.js";
import { UndoProvider } from "../components/undo.js";
import { VerifyBanner } from "../components/verify-banner.js";
import { AuthShell, Loading } from "../components/shell.js";
import { authClient, useSession } from "../lib/auth.js";
import { mod } from "../lib/labels.js";
import { useRealtime } from "../lib/realtime.js";
import type { Agent, Member, Team } from "@edicthq/client";
import { agentState, connectionLine } from "../lib/agents.js";
import { useNow } from "../lib/live.js";
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

// The desktop app's hotkey, deep links and notifications (lib/desktop.ts).
function DesktopBridge({ slug, orgId }: { slug: string; orgId: string }) {
  useDesktopBridge(slug, orgId);
  return null;
}

export function OrgLayout() {
  const { slug } = useParams();
  const memberships = useMemberships();
  const session = useSession();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"team" | "invite" | "palette" | null>(null);
  // The rail, opened as a drawer on a phone.
  const [drawer, setDrawer] = useState(false);
  const location = useLocation();
  // biome-ignore lint/correctness/useExhaustiveDependencies: closes on every navigation
  useEffect(() => setDrawer(false), [location.pathname, location.search]);
  useEffect(() => {
    if (!drawer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawer]);
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
        <p>
          <Link to="/" className="text-ui font-medium underline decoration-line-strong underline-offset-4">
            Go to your organizations
          </Link>
        </p>
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
    <DesktopBridge slug={context.slug} orgId={context.orgId} />
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-10 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Rail context={context} others={memberships.data ?? []} drawer={drawer} />
      {drawer ? (
        <div aria-hidden="true" className="motion-fade fixed inset-0 z-30 bg-scrim md:hidden" onClick={() => setDrawer(false)} />
      ) : null}
      <div className="flex h-dvh min-w-0 flex-1 flex-col">
        <MobileBar context={context} others={memberships.data ?? []} onMenu={() => setDrawer(true)} />
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
      <NewIssueButton slug={context.slug} orgId={context.orgId} />
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
    <section className="flex flex-col gap-px">
      <div className="flex h-7 items-center gap-2 ps-2 pe-1">
        <h2 className="text-sm font-semibold text-ink-2">{title}</h2>
        {aside ? <div className="ms-auto flex items-center">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

const railItem = "hover-fade flex h-[30px] items-center gap-2 rounded-sm px-2 text-ui";
const railLink = ({ isActive }: { isActive: boolean }) =>
  // The current page takes the selected-row fill, as team pages do.
  cn(railItem, isActive ? "bg-hover font-medium text-ink" : "text-ink hover:bg-hover");

// Unread inbox count in the rail, in ink: a count of things for a human.
function InboxBadge({ orgId }: { orgId: string }) {
  const unread = useInboxUnreadCount(orgId);
  const count = unread.data?.unreadCount ?? 0;
  if (!count) return null;
  return <span className="ms-auto text-sm font-semibold text-ink tabular-nums">{count}</span>;
}

// The desktop app's title strip: room for the macOS traffic lights, back and
// forward, and a handle to drag the window by. Browsers show none of it.
function TitleStrip() {
  const navigate = useNavigate();
  if (!desktopShell()) return null;
  const arrow = "grid size-7 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink";
  return (
    <div data-tauri-drag-region className="-mx-2 -mt-2.5 mb-1 flex h-12 shrink-0 items-center gap-0.5 px-2 [[data-title-bar=overlay]_&]:ps-[84px]">
      <button type="button" aria-label="Back" title={`Back (${mod}[)`} className={arrow} onClick={() => navigate(-1)}>
        <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
      <button type="button" aria-label="Forward" title={`Forward (${mod}])`} className={arrow} onClick={() => navigate(1)}>
        <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
      </button>
    </div>
  );
}

function Rail({ context, others, drawer }: { context: OrgContext; others: Membership[]; drawer: boolean }) {
  const { orgId, slug, canManage, membership, instanceAdmin } = context;
  const teams = useTeams(orgId);
  const members = useMembers(orgId);
  const agents = useAgents(orgId).data ?? [];
  const navigate = useNavigate();
  const { teamId: currentTeam } = useParams();
  const newIssue = () => {
    const teamId = currentTeam ?? teams.data?.[0]?.id;
    if (teamId) navigate(`/${slug}/teams/${teamId}?create=1`);
  };

  return (
    <nav
      aria-label="Organization"
      className={cn(
        "sticky top-0 flex h-dvh w-[240px] shrink-0 flex-col gap-4 overflow-y-auto border-e border-line bg-rail px-2 pt-2.5 pb-2",
        drawer ? "motion-drawer max-md:fixed max-md:inset-y-0 max-md:start-0 max-md:z-40 max-md:w-[min(280px,85vw)] max-md:shadow-overlay" : "max-md:hidden",
      )}
    >
      <div className="flex flex-col gap-2">
        <TitleStrip />
        <div className="flex items-center gap-1">
          <Workspace context={context} others={others} />
          {teams.data?.length ? (
            <button
              type="button"
              aria-label="New issue"
              title="New issue (C)"
              onClick={newIssue}
              className="grid size-7 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"
            >
              <SquarePen aria-hidden="true" className="size-4" strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          onClick={context.openPalette}
          className="flex h-[30px] items-center gap-2 rounded-sm bg-surface ps-2 pe-1.5 text-ui text-ink-2 shadow-[inset_0_0_0_1px_var(--line)] transition-[color] duration-(--duration-fast) ease-standard hover:text-ink"
        >
          <Search aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          <span>Search or command</span>
          <Kbd className="ms-auto">{`${mod}K`}</Kbd>
        </button>
      </div>

      <div className="flex flex-col gap-px">
        <NavLink to={`/${slug}/inbox`} className={railLink}>
          <Inbox aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
          Inbox
          <InboxBadge orgId={orgId} />
        </NavLink>
        <NavLink to={`/${slug}/my-issues`} className={railLink}>
          <CircleUserRound aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
          My issues
        </NavLink>
        <NavLink to={`/${slug}/projects`} className={railLink}>
          <FolderKanban aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
          Projects
        </NavLink>
      </div>

      <RailSection
        title="Agents"
        aside={
          <NavLink to={`/${slug}/agents`} aria-label="All agents" className="rounded-xs px-1 text-sm text-ink-2 hover:text-ink aria-[current=page]:text-ink">
            All
          </NavLink>
        }
      >
        {agents.length ? (
          agents.map((agent) => <AgentRow key={agent.id} agent={agent} members={members.data ?? []} slug={slug} orgId={orgId} />)
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
        title="Teams"
        aside={
          canManage ? (
            <button
              type="button"
              aria-label="Create team"
              title="Create team"
              onClick={context.openCreateTeam}
              className="grid size-6 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"
            >
              <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
            </button>
          ) : null
        }
      >
        {teams.data?.length ? (
          teams.data.map((team) => (
            <TeamItem key={team.id} slug={slug} team={team} current={team.id === currentTeam} />
          ))
        ) : (
          <p className="px-2 text-sm text-ink-2">No teams yet.</p>
        )}
      </RailSection>

      <div className="mt-auto flex flex-col gap-px">
        <NavLink to={`/${slug}/connect`} className={railLink}>
          <Plug aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
          Connect an agent
        </NavLink>
        <NavLink to={`/${slug}/members`} className={railLink}>
          <Users aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
          Members
        </NavLink>
        <NavLink to={`/${slug}/trash`} className={railLink}>
          <Trash2 aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
          Trash
        </NavLink>
        <NavLink to={`/${slug}/settings`} className={railLink}>
          <Settings aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
          Settings
        </NavLink>
        {instanceAdmin ? (
          <NavLink to={`/${slug}/instance`} className={railLink}>
            <Server aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />
            Instance settings
          </NavLink>
        ) : null}
        <div className="mt-2 flex items-center gap-2 border-t border-line px-2 pt-2.5">
          <Avatar name={membership.member.name} />
          <p className="min-w-0 truncate text-ui font-medium" title={membership.member.email ?? undefined}>
            {membership.member.name}
          </p>
          <button
            type="button"
            aria-label="Sign out"
            title="Sign out"
            onClick={context.signOut}
            className="ms-auto grid size-7 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink"
          >
            <LogOut aria-hidden="true" className="size-3.5" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </nav>
  );
}

// A team, with its Issues, Board and Members under it while it is the one on
// screen or someone opened it. Only the page you are on is marked.
function TeamItem({ slug, team, current }: { slug: string; team: Team; current: boolean }) {
  const location = useLocation();
  const [open, setOpen] = useState(current);
  useEffect(() => {
    if (current) setOpen(true);
  }, [current]);
  const onList = current && location.pathname === `/${slug}/teams/${team.id}`;
  const board = onList && new URLSearchParams(location.search).get("view") === "board";
  const onMembers = current && location.pathname === `/${slug}/teams/${team.id}/members`;
  const sub = (active: boolean) =>
    cn(railItem, "ps-[34px]", active ? "bg-hover font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink");
  return (
    <div className="flex flex-col gap-px">
      <div className="group/team relative flex items-center">
        <NavLink to={`/${slug}/teams/${team.id}`} end className={({ isActive }) => cn(railItem, "flex-1 pe-8 text-ink hover:bg-hover", isActive && !open && "bg-hover font-medium")}>
          <TeamKey>{team.key}</TeamKey>
          <span className="truncate">{team.name}</span>
        </NavLink>
        <button
          type="button"
          aria-label={open ? `Collapse ${team.name}` : `Expand ${team.name}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="absolute end-1 grid size-6 place-items-center rounded-xs text-ink-3 hover:text-ink"
        >
          <ChevronDown aria-hidden="true" className={cn("size-3.5 transition-transform duration-(--duration-fast)", !open && "-rotate-90")} strokeWidth={2} />
        </button>
      </div>
      {open ? (
        <>
          <Link to={`/${slug}/teams/${team.id}`} className={sub(onList && !board)} aria-current={onList && !board ? "page" : undefined}>
            Issues
          </Link>
          <Link to={`/${slug}/teams/${team.id}?view=board`} className={sub(board)} aria-current={board ? "page" : undefined}>
            Board
          </Link>
          <Link
            to={`/${slug}/teams/${team.id}/members`}
            aria-label={`${team.name} members`}
            className={sub(onMembers)}
            aria-current={onMembers ? "page" : undefined}
          >
            Members
          </Link>
        </>
      ) : null}
    </div>
  );
}

// An agent on one line: its name in the agent color, what it is doing or how
// much is waiting for it, and the issue it works on now.
function AgentRow({ agent, members, slug, orgId }: { agent: Agent; members: Member[]; slug: string; orgId: string }) {
  const queue = useAgentQueue(orgId, agent.id).data ?? [];
  // Lit while the Agents page shows this agent's panel, not for every agent.
  const location = useLocation();
  const open =
    location.pathname === `/${slug}/agents` &&
    (new URLSearchParams(location.search).get("agent") ?? location.hash.slice(1)) === agent.id;
  const now = useNow();
  const states = queue.map((issue) => agentState(issue, agent, now));
  const live = queue.find((_, index) => states[index] === "working");
  const state: AgentState | null = agent.pausedAt
    ? "paused"
    : states.includes("blocked")
      ? "blocked"
      : states.includes("needs_input")
        ? "needs_input"
        : live
          ? "working"
          : null;
  return (
    <div className="flex flex-col">
      <Link
        to={`/${slug}/agents?agent=${agent.id}`}
        title={connectionLine(agent, members)}
        aria-current={open ? "page" : undefined}
        className={cn(railItem, open ? "bg-hover" : "hover:bg-hover")}
      >
        <Avatar name={agent.name} kind="agent" size={18} />
        <span className="min-w-0 truncate font-medium text-agent-ink">{agent.name}</span>
        {state ? (
          <ProgressBadge state={state} className="ms-auto h-[18px] px-1.5" />
        ) : (
          <span className="ms-auto text-sm text-ink-2 tabular-nums">{queue.length || "Idle"}</span>
        )}
      </Link>
      {live ? (
        <Link
          to={`/${slug}/issue/${live.identifier}`}
          className="flex min-w-0 items-baseline gap-1.5 rounded-xs ps-[34px] pe-2 pb-1 text-sm text-ink-2 hover:text-ink"
        >
          <span className="shrink-0 font-medium text-agent-ink tabular-nums">{live.identifier}</span>
          <span className="truncate">{live.title}</span>
        </Link>
      ) : null}
    </div>
  );
}

// The workspace button: the organization on screen, the others to switch to,
// and in the desktop app the instance switcher (ADR 0028).
function Workspace({ context, others }: { context: OrgContext; others: Membership[] }) {
  const current = context.membership;
  const inApp = Boolean(desktopShell());
  return (
    <details className="group relative min-w-0 flex-1">
      <summary
        className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-sm px-1.5 hover:bg-hover [&::-webkit-details-marker]:hidden"
        aria-label={`Organization: ${current.organization.name}. Switch organization`}
      >
        <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-ink text-on-human">
          <LogoMark size={14} className="text-on-human" />
        </span>
        <span className="truncate text-ui font-semibold">{current.organization.name}</span>
        <ChevronDown aria-hidden="true" className="size-3 shrink-0 text-ink-3" strokeWidth={2} />
      </summary>
      <div className="motion-pop absolute start-0 top-9 z-20 flex w-60 origin-top-left flex-col gap-0.5 rounded-md bg-raised p-1 shadow-overlay">
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
        {inApp ? (
          <button
            type="button"
            onClick={openSwitcher}
            className="flex h-8 items-center gap-2 rounded-sm border-t border-line px-2 text-ui text-ink-2 hover:bg-hover hover:text-ink"
          >
            <ArrowLeftRight aria-hidden="true" className="size-3.5" strokeWidth={2} />
            Switch instance…
            <Kbd className="ms-auto">{`${mod}⇧O`}</Kbd>
          </button>
        ) : null}
      </div>
    </details>
  );
}

// Below the md breakpoint the rail becomes a bar above the page.
// A phone's top bar: the organization, search, the inbox and the menu that
// opens the rail as a drawer.
function MobileBar({ context, others, onMenu }: { context: OrgContext; others: Membership[]; onMenu: () => void }) {
  const unread = useInboxUnreadCount(context.orgId).data?.unreadCount ?? 0;
  const icon = "relative grid size-9 shrink-0 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink";
  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-line bg-rail ps-2 pe-1.5 md:hidden">
      <Workspace context={context} others={others} />
      <button type="button" aria-label="Search or command" className={icon} onClick={context.openPalette}>
        <Search aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      </button>
      <Link to={`/${context.slug}/inbox`} aria-label={unread ? `Inbox, ${unread} unread` : "Inbox"} className={icon}>
        <Inbox aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
        {unread ? (
          <span className="absolute end-0 top-0.5 h-[15px] min-w-[15px] rounded-full bg-ink px-1 text-center text-[10px] leading-[15px] font-semibold text-on-human tabular-nums shadow-[0_0_0_2px_var(--rail)]">
            {unread}
          </span>
        ) : null}
      </Link>
      <button type="button" aria-label="Open menu" className={icon} onClick={onMenu}>
        <MenuIcon aria-hidden="true" className="size-[18px]" strokeWidth={1.75} />
      </button>
    </header>
  );
}

// A phone's New issue button, floating over the lists where issues are made.
function NewIssueButton({ slug, orgId }: { slug: string; orgId: string }) {
  const { teamId } = useParams();
  const location = useLocation();
  const teams = useTeams(orgId);
  const navigate = useNavigate();
  const target = teamId ?? teams.data?.[0]?.id;
  const path = location.pathname.slice(slug.length + 1);
  const onList = /^\/(teams\/[^/]+|my-issues|inbox|projects\/[^/]+)$/.test(path);
  if (!target || !onList || new URLSearchParams(location.search).has("issue")) return null;
  return (
    <button
      type="button"
      aria-label="New issue"
      onClick={() => navigate(`/${slug}/teams/${target}?create=1`)}
      className="fixed end-4 bottom-6 z-20 grid size-[52px] place-items-center rounded-full bg-ink text-on-human shadow-overlay md:hidden"
    >
      <SquarePen aria-hidden="true" className="size-5" strokeWidth={1.75} />
    </button>
  );
}
