// The desktop app (apps/desktop, ADR 0004) loads this web app from the server
// and reaches it through Tauri's global API, which exists only there. It sends
// two events: quick-create, from its global hotkey and tray, and open-link,
// for an edict:// link (ADR 0027). This page sends notifications back. In a
// browser none of this runs.
import type { InboxItem } from "@edicthq/client";
import { useCallback, useEffect, useRef } from "react";
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

// What the shell says about itself, set before any page script runs. On macOS
// the traffic lights float over the page ("overlay"); on Windows and Linux the
// window has no frame and the page draws its own controls ("custom").
export interface DesktopShell {
  platform: "macos" | "windows" | "linux";
  titleBar: "overlay" | "custom";
  version?: string;
}

export function desktopShell(): DesktopShell | undefined {
  const shell = (window as { __EDICT_DESKTOP__?: DesktopShell }).__EDICT_DESKTOP__;
  return shell && tauri() ? shell : undefined;
}

// Marks the root so CSS can give the desktop app its chrome: the title strip,
// unselectable chrome and the default cursor.
export function markDesktop(): void {
  const shell = desktopShell();
  if (!shell) return;
  document.documentElement.dataset.desktop = shell.platform;
  document.documentElement.dataset.titleBar = shell.titleBar;
}

// The window controls a frameless window draws itself (Windows and Linux).
export function windowCommand(command: "minimize" | "toggle_maximize" | "close"): void {
  void tauri()
    ?.core.invoke(`plugin:window|${command}`, { label: "main" })
    .catch(() => undefined);
}

// Opens the shell's instance switcher (ADR 0028). It returns nothing, so a
// page never learns which other instances are saved.
export function openSwitcher(): void {
  void tauri()?.core.invoke("open_switcher").catch(() => undefined);
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

  // The team on screen, or the first one, with its new-issue dialog open.
  const quickCreate = useCallback(() => {
    const { slug, pathname, search, teams } = latest.current;
    const onTeam = new RegExp(`^/${slug}/teams/([^/]+)$`).exec(pathname)?.[1];
    const teamId = onTeam ?? teams?.[0]?.id;
    if (!teamId) return;
    const params = new URLSearchParams(onTeam ? search : "");
    params.set("create", "1");
    navigate(`/${slug}/teams/${teamId}?${params}`);
  }, [navigate]);

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
      shell.event.listen("quick-create", () => quickCreate()),
    ];
    void shell.core.invoke("plugin:notification|request_permission").catch(() => undefined);
    return () => {
      for (const off of offs) void off.then((stop) => stop());
    };
  }, [navigate, quickCreate]);

  // The desktop app's own shortcuts: back and forward, settings, a new issue.
  // Browsers keep these keys for themselves, so only the app takes them.
  useEffect(() => {
    if (!desktopShell()) return;
    const onKey = (event: KeyboardEvent) => {
      const command = event.metaKey || event.ctrlKey;
      if (!command || event.altKey) return;
      const { slug } = latest.current;
      if (event.key === "[") {
        event.preventDefault();
        navigate(-1);
      } else if (event.key === "]") {
        event.preventDefault();
        navigate(1);
      } else if (event.key === ",") {
        event.preventDefault();
        navigate(`/${slug}/settings`);
      } else if (event.key.toLowerCase() === "n" && !event.shiftKey) {
        event.preventDefault();
        quickCreate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, quickCreate]);

  const seen = useRef<number | undefined>(undefined);
  const count = unread.data?.unreadCount;
  // The unread count on the dock or taskbar icon.
  useEffect(() => {
    if (count === undefined || !desktopShell()) return;
    void tauri()
      ?.core.invoke("plugin:window|set_badge_count", { label: "main", value: count > 0 ? count : null })
      .catch(() => undefined);
  }, [count]);
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
