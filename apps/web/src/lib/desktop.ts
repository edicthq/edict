// The desktop app (apps/desktop, ADR 0004) loads this web app from the server
// and reaches it through Tauri's global API, which exists only there. It sends
// two events: quick-create, from its global hotkey and tray, and open-link,
// for an edict:// link (ADR 0027). This page sends notifications back. In a
// browser none of this runs.
import type { InboxItem } from "@edicthq/client";
import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { progressWords, typeLine } from "../routes/inbox.js";
import { api, unwrap } from "./api.js";
import { useInboxUnreadCount, useTeams } from "./queries.js";

interface TauriGlobal {
  core: { invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown> };
  event: { listen: (event: string, handler: (event: { payload: unknown }) => void) => Promise<() => void> };
}

export function tauri(): TauriGlobal | undefined {
  return (window as { __TAURI__?: TauriGlobal }).__TAURI__;
}

// Where an edict:// link opens in an organization: the same URIs as the MCP
// resources, edict://issue/ENG-123 and edict://project/<slug>.
export function deepLinkPath(link: string, slug: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "edict:") return null;
  const ref = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!ref || ref.includes("/")) return null;
  if (url.hostname === "issue") return `/${slug}/issue/${encodeURIComponent(ref)}`;
  if (url.hostname === "project") return `/${slug}/projects/${encodeURIComponent(ref)}`;
  return null;
}

const PENDING = "edict.desktop.open";

// A deep link that launched the app arrives as ?open= on the first page, before
// any organization is known. Keep it for the organization layout to follow.
export function rememberDeepLink(): void {
  const params = new URLSearchParams(window.location.search);
  const link = params.get("open");
  if (!link) return;
  try {
    sessionStorage.setItem(PENDING, link);
  } catch {
    // Storage is off; the link is lost, the app still opens.
  }
  params.delete("open");
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
}

function takeDeepLink(): string | null {
  try {
    const link = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
    return link;
  } catch {
    return null;
  }
}

export function notificationFor(
  item: Pick<InboxItem, "type" | "progressState" | "issue" | "webhook"> & { actor: { name: string } | null },
): { title: string; body: string } {
  const actor = item.actor?.name ?? "Edict";
  if (item.type === "webhook_disabled") {
    return { title: "A webhook turned itself off", body: item.webhook?.url ?? "" };
  }
  const verb =
    item.type === "progress_posted" && item.progressState ? progressWords[item.progressState] : typeLine[item.type];
  const issue = item.issue ? `${item.issue.identifier} ${item.issue.title}` : "";
  return { title: `${actor} ${verb} ${item.issue?.identifier ?? ""}`.trim(), body: issue };
}

// Follows the desktop app's events in an organization, and notifies when the
// inbox gains an item while the window is in the background.
export function useDesktopBridge(slug: string, orgId: string): void {
  const navigate = useNavigate();
  const location = useLocation();
  const teams = useTeams(orgId);
  const unread = useInboxUnreadCount(orgId);
  const latest = useRef({ slug, pathname: location.pathname, search: location.search, teams: teams.data });
  latest.current = { slug, pathname: location.pathname, search: location.search, teams: teams.data };

  useEffect(() => {
    const link = takeDeepLink();
    const path = link ? deepLinkPath(link, slug) : null;
    if (path) navigate(path);
  }, [slug, navigate]);

  useEffect(() => {
    const shell = tauri();
    if (!shell) return;
    const offs = [
      shell.event.listen("open-link", ({ payload }) => {
        const path = deepLinkPath(String(payload), latest.current.slug);
        if (path) navigate(path);
      }),
      // The team on screen, or the first one, with its new-issue dialog open.
      shell.event.listen("quick-create", () => {
        const { slug, pathname, search, teams } = latest.current;
        const onTeam = new RegExp(`^/${slug}/teams/([^/]+)$`).exec(pathname)?.[1];
        const teamId = onTeam ?? teams?.[0]?.id;
        if (!teamId) return;
        const params = new URLSearchParams(onTeam ? search : "");
        params.set("create", "1");
        navigate(`/${slug}/teams/${teamId}?${params}`);
      }),
    ];
    void shell.core.invoke("plugin:notification|request_permission").catch(() => undefined);
    return () => {
      for (const off of offs) void off.then((stop) => stop());
    };
  }, [navigate]);

  const seen = useRef<number | undefined>(undefined);
  const count = unread.data?.unreadCount;
  useEffect(() => {
    if (count === undefined) return;
    const before = seen.current;
    seen.current = count;
    const shell = tauri();
    if (!shell || before === undefined || count <= before || document.hasFocus()) return;
    void unwrap(api.GET("/organizations/{orgId}/inbox", { params: { path: { orgId }, query: { filter: "unread" } } }))
      .then((items) => {
        const item = items[0];
        if (item) return shell.core.invoke("plugin:notification|notify", { options: notificationFor(item) });
      })
      .catch(() => undefined);
  }, [count, orgId]);
}
