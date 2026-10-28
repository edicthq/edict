import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { cn } from "@edicthq/ui";
import { desktopShell, tauri, windowCommand } from "../lib/desktop.js";
import { mod } from "../lib/labels.js";
import { useRail } from "../lib/rail.js";
import { bindingOf } from "../lib/shortcuts.js";
import {
  activateTab,
  closeTab,
  followPath,
  initTabs,
  moveTab,
  openTab,
  stepTab,
  setActiveTitle,
  useTabs,
  type Tab,
} from "../lib/tabs.js";
import { WindowControls } from "./shell.js";

// The desktop app's top bar, 44 high, one line from edge to edge: on macOS the
// traffic lights, then back and forward over the rail, then the tabs over the
// page, and on Windows and Linux the window buttons in the corner. The bar is
// the handle to drag the window by, wherever nothing sits on it.
export function DesktopBar({ slug }: { slug: string }) {
  const shell = desktopShell();
  const rail = useRail();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname + location.search;
  const [ready] = useState(() => {
    initTabs(path);
    return true;
  });
  const tabs = useTabs();
  const home = `/${slug}/my-issues`;

  // The tab in front goes wherever the page goes.
  useEffect(() => {
    if (ready) followPath(path);
  }, [ready, path]);

  // Its title is the page bar's, as the page draws it.
  useEffect(() => {
    const main = document.getElementById("main");
    if (!main) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const title = main.querySelector("header h1")?.textContent?.trim();
        if (title) setActiveTitle(title);
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(main, { childList: true, subtree: true, characterData: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const show = (tab: Tab | null) => {
    if (tab) navigate(tab.path);
  };
  const newTab = (to = home) => show(openTab(to));
  const close = (id: string) => {
    if ((tabs?.tabs.length ?? 0) <= 1) {
      windowCommand("close");
      return;
    }
    show(closeTab(id));
  };

  // ⌘T, ⌘W, ⌃Tab and ⌘⇧] / ⌘⇧[. On macOS the menu bar takes ⌘T and ⌘W and
  // sends them here as events.
  const latest = useRef({ newTab, close, show, active: tabs?.active });
  latest.current = { newTab, close, show, active: tabs?.active };
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const binding = bindingOf(event);
      const { active, show } = latest.current;
      let handled = true;
      if (binding === "mod+t") latest.current.newTab();
      else if (binding === "mod+w" && active) latest.current.close(active);
      // ⌃Tab is "ctrl+tab" on a Mac and "mod+tab" elsewhere.
      else if (binding === "ctrl+tab" || binding === "mod+tab" || binding === "mod+shift+]") show(stepTab(1));
      else if (binding === "ctrl+shift+tab" || binding === "mod+shift+tab" || binding === "mod+shift+[") show(stepTab(-1));
      else handled = false;
      if (handled) event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    const shellApi = tauri();
    const offs = shellApi
      ? [
          shellApi.event.listen("new-tab", () => latest.current.newTab()),
          shellApi.event.listen("close-tab", () => {
            const { active } = latest.current;
            if (active) latest.current.close(active);
          }),
        ]
      : [];
    return () => {
      window.removeEventListener("keydown", onKey);
      for (const off of offs) void off.then((stop) => stop());
    };
  }, []);

  // ⌘-click or a middle click on a link opens it in a new tab.
  useEffect(() => {
    const onClick = (event: globalThis.MouseEvent) => {
      const opensTab = event.button === 1 || (event.button === 0 && (event.metaKey || event.ctrlKey));
      if (!opensTab) return;
      const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      event.preventDefault();
      event.stopPropagation();
      latest.current.newTab(url.pathname + url.search);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("auxclick", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("auxclick", onClick, true);
    };
  }, []);

  // Reordering by pointer: press a tab, move it past a few pixels and it
  // follows the pointer through the strip. The desktop webview keeps HTML
  // drag and drop for itself (dropped files), so it can't be used here.
  const strip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; moved: boolean } | null>(null);
  const dragged = useRef(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const pointerDown = (id: string) => (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    drag.current = { id, startX: event.clientX, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const current = drag.current;
    if (!current || !strip.current) return;
    if (!current.moved) {
      if (Math.abs(event.clientX - current.startX) < 4) return;
      current.moved = true;
      setDragging(current.id);
    }
    // Its place is after every other tab whose middle the pointer has passed.
    const others = [...strip.current.querySelectorAll<HTMLElement>("[data-tab-id]")].filter(
      (element) => element.dataset.tabId !== current.id,
    );
    const to = others.filter((element) => {
      const box = element.getBoundingClientRect();
      return event.clientX > box.left + box.width / 2;
    }).length;
    moveTab(current.id, to);
  };
  const pointerEnd = () => {
    if (drag.current?.moved) dragged.current = true;
    drag.current = null;
    setDragging(null);
  };
  if (!shell || !tabs) return null;
  const macos = shell.titleBar === "overlay";
  const collapsed = rail?.collapsed ?? false;
  const arrow = "grid size-7 place-items-center rounded-sm text-ink-2 hover:bg-hover hover:text-ink";

  return (
    <div data-tauri-drag-region className="flex h-11 shrink-0 select-none items-center bg-rail max-md:hidden">
      {/* Over the rail: room for the traffic lights, then back and forward.
          It narrows with the rail, so the tabs always start over the page. */}
      <div
        data-tauri-drag-region
        className={cn(
          "flex h-full shrink-0 items-center gap-0.5 transition-[width] duration-(--duration-slow) ease-standard motion-reduce:transition-none",
          macos ? "ps-[84px]" : "ps-2",
          collapsed ? (macos ? "w-[150px]" : "w-[76px]") : "w-[240px]",
        )}
      >
        <button type="button" aria-label="Back" title={`Back (${mod}[)`} className={arrow} onClick={() => navigate(-1)}>
          <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
        <button type="button" aria-label="Forward" title={`Forward (${mod}])`} className={arrow} onClick={() => navigate(1)}>
          <ChevronRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      <div ref={strip} data-tauri-drag-region role="tablist" aria-label="Tabs" className="flex h-full min-w-0 flex-1 items-center gap-1 pe-2">
        {tabs.tabs.map((tab) => {
          const active = tab.id === tabs.active;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              className={cn(
                "group/tab relative flex h-7 min-w-[72px] flex-[0_1_200px] items-center rounded-sm text-ui transition-[background-color,color] duration-(--duration-fast) ease-standard",
                active ? "bg-bg text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-2 hover:bg-hover hover:text-ink",
                dragging === tab.id && "z-[1] shadow-[0_0_0_1px_var(--line-strong),0_4px_12px_-4px_oklch(0_0_0/0.4)]",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={active}
                title={tab.title || "Edict"}
                onClick={() => {
                  // The click that ends a drag only drops the tab.
                  if (dragged.current) {
                    dragged.current = false;
                    return;
                  }
                  show(activateTab(tab.id));
                }}
                // A middle click closes it.
                onAuxClick={(event: MouseEvent) => {
                  if (event.button === 1) close(tab.id);
                }}
                onPointerDown={pointerDown(tab.id)}
                onPointerMove={pointerMove}
                onPointerUp={pointerEnd}
                onPointerCancel={pointerEnd}
                className={cn("h-full min-w-0 flex-1 truncate ps-3 pe-7 text-start", dragging === tab.id && "cursor-grabbing")}
              >
                {tab.title || "Edict"}
              </button>
              {tabs.tabs.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Close ${tab.title || "tab"}`}
                  title={`Close tab (${mod}W)`}
                  onClick={() => close(tab.id)}
                  className={cn(
                    "absolute end-1 grid size-5 place-items-center rounded-xs text-ink-2 hover:bg-hover hover:text-ink",
                    active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100 focus-visible:opacity-100",
                  )}
                >
                  <X aria-hidden="true" className="size-3" strokeWidth={2} />
                </button>
              ) : null}
            </div>
          );
        })}
        <button type="button" aria-label="New tab" title={`New tab (${mod}T)`} className={cn(arrow, "shrink-0")} onClick={() => newTab()}>
          <Plus aria-hidden="true" className="size-4" strokeWidth={1.75} />
        </button>
      </div>

      {shell.titleBar === "custom" ? <WindowControls bar /> : null}
    </div>
  );
}
