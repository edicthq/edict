import { ChevronsUpDown, LogOut, Plus, Settings2, Users, UsersRound } from "lucide-react";
import type { Membership } from "@edicthq/client";
import { NavLink, Outlet, useNavigate, useOutletContext, useParams } from "react-router";
import { Avatar, Button, cn } from "@edicthq/ui";
import { Logo } from "../components/logo.js";
import { AuthShell, Loading } from "../components/shell.js";
import { authClient, useSession } from "../lib/auth.js";
import { useMemberships } from "../lib/queries.js";

export interface OrgContext {
  membership: Membership;
  orgId: string;
  // The signed-in user is an Admin or Owner here.
  canManage: boolean;
}

export function useOrg(): OrgContext {
  return useOutletContext<OrgContext>();
}

export function OrgLayout() {
  const { slug } = useParams();
  const memberships = useMemberships();
  if (memberships.isPending) return <Loading />;
  const membership = memberships.data?.find((m) => m.organization.slug === slug);
  if (!membership) {
    return (
      <AuthShell
        title="Organization not found"
        lead="It doesn't exist, or you aren't a member. Ask one of its admins for an invite."
      >
        <NavLink to="/" className="text-ui font-medium underline decoration-line-strong underline-offset-4">
          Go to your organizations
        </NavLink>
      </AuthShell>
    );
  }
  const context: OrgContext = {
    membership,
    orgId: membership.organization.id,
    canManage: membership.member.role === "owner" || membership.member.role === "admin",
  };
  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-10 focus:rounded-sm focus:bg-surface focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <Rail membership={membership} others={memberships.data ?? []} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileBar membership={membership} />
        <main id="main" className="min-w-0 flex-1">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}

function useRailState() {
  const session = useSession();
  const navigate = useNavigate();
  return {
    instanceAdmin: (session.data?.user as { role?: string } | undefined)?.role === "admin",
    signOut: async () => {
      await authClient.signOut();
      navigate("/sign-in", { replace: true });
    },
  };
}

// Below the md breakpoint the rail becomes a bar above the page.
function MobileBar({ membership }: { membership: Membership }) {
  const { instanceAdmin, signOut } = useRailState();
  const slug = membership.organization.slug;
  const link = ({ isActive }: { isActive: boolean }) =>
    cn("flex h-8 items-center rounded-sm px-2.5 text-ui", isActive ? "bg-hover font-medium text-ink" : "text-ink-2");
  return (
    <nav aria-label="Organization" className="flex flex-col gap-2 border-b border-line bg-rail px-4 pt-3 pb-2 md:hidden">
      <div className="flex items-center gap-2">
        <span className="truncate text-ui font-semibold">{membership.organization.name}</span>
        <Button variant="ghost" aria-label="Sign out" className="ms-auto size-8 px-0" onClick={signOut}>
          <LogOut aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Button>
      </div>
      <div className="flex gap-1 overflow-x-auto">
        <NavLink to={`/${slug}`} end className={link}>
          Teams
        </NavLink>
        <NavLink to={`/${slug}/members`} className={link}>
          Members
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

function Rail({ membership, others }: { membership: Membership; others: Membership[] }) {
  const { instanceAdmin, signOut } = useRailState();
  const slug = membership.organization.slug;

  return (
    <nav
      aria-label="Organization"
      className="sticky top-0 flex h-dvh w-[252px] shrink-0 flex-col gap-5 border-e border-line bg-rail px-3 py-4 max-md:hidden"
    >
      <div className="px-2">
        <Logo className="text-body" />
      </div>

      <details className="group relative">
        <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-sm px-2 hover:bg-hover [&::-webkit-details-marker]:hidden">
          <span className="truncate text-ui font-semibold">{membership.organization.name}</span>
          <ChevronsUpDown aria-hidden="true" className="ms-auto size-3.5 text-ink-3" strokeWidth={2} />
        </summary>
        <div className="absolute inset-x-0 top-10 z-10 flex flex-col gap-0.5 rounded-md border border-line bg-surface p-1 shadow-overlay">
          {others.map((m) => (
            <NavLink
              key={m.organization.id}
              to={`/${m.organization.slug}`}
              className="flex h-8 items-center rounded-sm px-2 text-ui hover:bg-hover aria-[current=page]:font-semibold"
              end
            >
              <span className="truncate">{m.organization.name}</span>
            </NavLink>
          ))}
          <NavLink to="/new" className="flex h-8 items-center gap-2 rounded-sm px-2 text-ui text-ink-2 hover:bg-hover hover:text-ink">
            <Plus aria-hidden="true" className="size-3.5" strokeWidth={2} />
            New organization
          </NavLink>
        </div>
      </details>

      <ul className="flex flex-col gap-0.5">
        <RailLink to={`/${slug}`} icon={UsersRound} end>
          Teams
        </RailLink>
        <RailLink to={`/${slug}/members`} icon={Users}>
          Members
        </RailLink>
        {instanceAdmin ? (
          <RailLink to={`/${slug}/instance`} icon={Settings2}>
            Instance
          </RailLink>
        ) : null}
      </ul>

      <div className="mt-auto flex items-center gap-2 border-t border-line px-2 pt-3">
        <Avatar name={membership.member.name} />
        <div className="min-w-0">
          <p className="truncate text-ui font-medium">{membership.member.name}</p>
          <p className="truncate text-sm text-ink-2">{membership.member.email}</p>
        </div>
        <Button
          variant="ghost"
          aria-label="Sign out"
          title="Sign out"
          className="ms-auto size-8 px-0"
          onClick={signOut}
        >
          <LogOut aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </Button>
      </div>
    </nav>
  );
}

function RailLink({
  to,
  icon: Icon,
  end,
  children,
}: {
  to: string;
  icon: typeof Users;
  end?: boolean;
  children: string;
}) {
  return (
    <li>
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            "flex h-8 items-center gap-2 rounded-sm px-2 text-ui transition-[background-color,color] duration-[140ms] ease-standard",
            isActive ? "bg-hover font-medium text-ink" : "text-ink-2 hover:bg-hover hover:text-ink",
          )
        }
      >
        <Icon aria-hidden="true" className="size-4" strokeWidth={1.75} />
        {children}
      </NavLink>
    </li>
  );
}
