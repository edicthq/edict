import { Search, SquarePen } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import type { Membership } from "@edicthq/client";
import { useNavigate, useParams } from "react-router";
import { Dialog, Kbd, TeamKey, cn } from "@edicthq/ui";
import { PriorityIcon } from "@edicthq/ui";
import { accentNames, accents, cycleAccent, cycleTheme, setAppearance, themes } from "../lib/appearance.js";
import { useProjects, useSearchIssues, useTeams } from "../lib/queries.js";
import { recentIssues } from "../lib/recent.js";
import type { OrgContext } from "../routes/org.js";

interface Command {
  id: string;
  group: string;
  label: string;
  lead?: React.ReactNode;
  hint?: string;
  run: () => void;
}

// ⌘K. Empty, it leads with what you are likely to do next: create an issue,
// go back to one you just had open, or go somewhere. Typing searches issues
// across teams and narrows the commands.
export function CommandPalette({
  context,
  others,
  open,
  onClose,
}: {
  context: OrgContext;
  others: Membership[];
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="palette-input" className="mt-[12vh] mb-auto w-[min(600px,calc(100vw-32px))]">
      <PaletteBody context={context} others={others} onClose={onClose} />
    </Dialog>
  );
}

function PaletteBody({ context, others, onClose }: { context: OrgContext; others: Membership[]; onClose: () => void }) {
  const navigate = useNavigate();
  const teams = useTeams(context.orgId);
  const projects = useProjects(context.orgId);
  const [query, setQuery] = useState("");
  const searchResults = useSearchIssues(context.orgId, { q: query.trim() }, query.trim().length > 0);
  const [active, setActive] = useState(0);

  const { teamId: currentTeam } = useParams();
  // Read once per opening: the list changes only when an issue is opened.
  const [recent] = useState(() => recentIssues(context.orgId));

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      onClose();
      navigate(path);
    };
    const list: Command[] = [];
    const newIssueTeam = currentTeam ?? teams.data?.[0]?.id;
    if (newIssueTeam) {
      list.push({
        id: "new-issue",
        group: "Actions",
        label: "New issue",
        lead: <SquarePen aria-hidden="true" className="size-4 text-ink-2" strokeWidth={1.75} />,
        hint: "C",
        run: go(`/${context.slug}/teams/${newIssueTeam}?create=1`),
      });
    }
    if (context.canManage) {
      list.push(
        { id: "create-team", group: "Actions", label: "Create team", run: () => context.openCreateTeam() },
        { id: "invite", group: "Actions", label: "Invite people", run: () => context.openInvite() },
      );
    }
    for (const issue of recent) {
      list.push({
        id: `recent-${issue.id}`,
        group: "Recent issues",
        label: `${issue.identifier} ${issue.title}`,
        lead: <PriorityIcon priority={issue.priority} />,
        run: go(`/${context.slug}/teams/${issue.teamId}?issue=${issue.identifier}`),
      });
    }
    list.push(
      { id: "my-issues", group: "Go to", label: "My issues", run: go(`/${context.slug}/my-issues`) },
      { id: "inbox", group: "Go to", label: "Inbox", run: go(`/${context.slug}/inbox`) },
      { id: "projects", group: "Go to", label: "Projects", run: go(`/${context.slug}/projects`) },
      { id: "agents", group: "Go to", label: "Agents", run: go(`/${context.slug}/agents`) },
      { id: "teams", group: "Go to", label: "All teams", run: go(`/${context.slug}`) },
      { id: "members", group: "Go to", label: "Members", run: go(`/${context.slug}/members`) },
      { id: "settings", group: "Go to", label: "Settings", run: go(`/${context.slug}/settings`) },
    );
    if (context.instanceAdmin) {
      list.push({ id: "instance", group: "Go to", label: "Instance settings", run: go(`/${context.slug}/instance`) });
    }
    list.push(
      ...(teams.data ?? []).map((team) => ({
        id: `team-${team.id}`,
        group: "Teams",
        label: team.name,
        lead: <TeamKey>{team.key}</TeamKey>,
        run: go(`/${context.slug}/teams/${team.id}`),
      })),
      ...(projects.data ?? []).map((project) => ({
        id: `project-${project.id}`,
        group: "Projects",
        label: project.name,
        hint: project.slug,
        run: go(`/${context.slug}/projects/${project.slug}`),
      })),
    );
    for (const m of others) {
      if (m.organization.id !== context.orgId) {
        list.push({
          id: `org-${m.organization.id}`,
          group: "Organizations",
          label: `Switch to ${m.organization.name}`,
          run: go(`/${m.organization.slug}`),
        });
      }
    }
    list.push({ id: "new-org", group: "Organizations", label: "Create organization", run: go("/new") });

    list.push(
      { id: "toggle-theme", group: "Appearance", label: "Toggle theme", hint: "T", run: cycleTheme },
      { id: "cycle-accent", group: "Appearance", label: "Cycle agent color", hint: "G", run: cycleAccent },
    );
    for (const theme of themes) {
      list.push({
        id: `theme-${theme}`,
        group: "Appearance",
        label: `Theme: ${theme[0]!.toUpperCase()}${theme.slice(1)}`,
        run: () => setAppearance({ theme }),
      });
    }
    for (const accent of accents) {
      list.push({
        id: `accent-${accent}`,
        group: "Appearance",
        label: `Agent color: ${accentNames[accent]}`,
        lead: <span data-accent={accent} className="size-3 rounded-full bg-agent" />,
        run: () => setAppearance({ accent }),
      });
    }
    list.push({ id: "sign-out", group: "You", label: "Sign out", run: () => void context.signOut() });
    return list;
  }, [teams.data, projects.data, recent, currentTeam, context, others, navigate, onClose]);

  const issueCommands = useMemo<Command[]>(() => {
    return (searchResults.data ?? []).map((issue) => ({
      id: `issue-${issue.id}`,
      group: "Issues",
      label: `${issue.identifier} ${issue.title}`,
      lead: <PriorityIcon priority={issue.priority} />,
      run: () => {
        onClose();
        navigate(`/${context.slug}/teams/${issue.teamId}?issue=${issue.identifier}`);
      },
    }));
  }, [searchResults.data, context.slug, navigate, onClose]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const staticMatches = commands.filter((c) => c.label.toLowerCase().includes(q));
    if (q.length > 0) {
      // A recent issue the search also found is listed once, as a result.
      const found = new Set(issueCommands.map((c) => c.id.replace("issue-", "recent-")));
      return [...issueCommands, ...staticMatches.filter((c) => !found.has(c.id))];
    }
    return staticMatches;
  }, [commands, issueCommands, query]);
  const current = Math.min(active, Math.max(matches.length - 1, 0));

  const run = (command: Command | undefined) => {
    if (!command) return;
    // Actions that open a dialog replace the palette rather than stack on it.
    onClose();
    command.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((current + 1) % Math.max(matches.length, 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current - 1 + matches.length) % Math.max(matches.length, 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(matches[current]);
    }
  };

  let lastGroup = "";
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search aria-hidden="true" className="size-4 text-ink-3" strokeWidth={1.75} />
        <input
          id="palette-input"
          aria-label="Search or command"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-activedescendant={matches[current] ? `cmd-${matches[current].id}` : undefined}
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search issues or type a command…"
          className="h-12 flex-1 bg-transparent text-lg tracking-[-0.01em] outline-none placeholder:text-ink-2"
        />
        <Kbd>Esc</Kbd>
      </div>
      {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: the ARIA combobox pattern; focus stays in the input, which points here with aria-activedescendant */}
      <ul id="palette-list" role="listbox" aria-label="Commands" className="max-h-[min(420px,60dvh)] overflow-y-auto p-2">
        {matches.length === 0 ? (
          <li className="px-3 py-6 text-center text-ui text-ink-2">
            {searchResults.isFetching ? "Searching…" : `Nothing matches “${query}”.`}
          </li>
        ) : (
          matches.map((command, index) => {
            const header = command.group !== lastGroup;
            lastGroup = command.group;
            return (
              <li key={command.id} role="presentation">
                {header ? <p className="px-3 pt-2 pb-1 text-sm font-semibold text-ink-2">{command.group}</p> : null}
                {/* biome-ignore lint/a11y/useKeyWithClickEvents: the input handles the keys (aria-activedescendant) */}
                {/* biome-ignore lint/a11y/useFocusableInteractive: options are reached from the input, not focused */}
                <div
                  id={`cmd-${command.id}`}
                  role="option"
                  aria-selected={index === current}
                  onMouseMove={() => setActive(index)}
                  onClick={() => run(command)}
                  className={cn(
                    "flex h-9 cursor-pointer items-center gap-2.5 rounded-sm px-3 text-ui",
                    index === current && "bg-hover",
                  )}
                >
                  {command.lead}
                  <span className="truncate">{command.label}</span>
                  {command.hint ? <Kbd className="ms-auto">{command.hint}</Kbd> : null}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
