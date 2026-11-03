import { Skeleton, SkeletonGroup, cn } from "@edicthq/ui";
import { desktopShell } from "../lib/desktop.js";
import { useRail, useRailState } from "../lib/rail.js";

// Skeletons the pages share, each laid out like the thing it stands in for, so
// nothing moves when the content arrives. A page's own skeleton lives beside
// the page when only that page has its shape.

// Title widths that read as a list of real titles rather than a barcode.
const titleWidths = ["62%", "48%", "71%", "40%", "56%", "66%", "44%", "52%"];
export const widthAt = (index: number) => titleWidths[index % titleWidths.length];

// 0 to n - 1, for rows of blocks keyed by their place.
export const range = (n: number) => Array.from({ length: n }, (_, i) => i);

// The app's frame while it starts: the rail with its blocks and the page
// panel beside it, an empty page bar on top. Sized as OrgLayout draws them.
export function AppSkeleton() {
  const collapsed = useRailState().collapsed;
  const desktop = Boolean(desktopShell());
  return (
    <SkeletonGroup label="Loading Edict" className="flex min-h-dvh flex-col bg-rail">
      {desktop ? <div className="h-11 shrink-0 max-md:hidden" /> : null}
      <div className="flex min-h-0 flex-1">
        <div className={cn("shrink-0 overflow-hidden max-md:hidden", collapsed ? "md:w-0" : "md:w-[240px]")}>
          <div className={cn("flex w-[240px] flex-col gap-4 px-2 pt-2.5 pb-2", desktop && "md:pt-1")}>
            <div className="flex flex-col gap-2">
              <div className="flex h-8 items-center gap-2 px-1.5">
                <Skeleton className="size-5 rounded-[5px]" />
                <Skeleton className="w-24" />
              </div>
              <Skeleton className="h-[30px] rounded-sm" />
            </div>
            <div className="flex flex-col gap-px">
              {["w-12", "w-20", "w-16"].map((width) => (
                <div key={width} className="flex h-[30px] items-center gap-2 px-2">
                  <Skeleton className="size-4 rounded-xs" />
                  <Skeleton className={width} />
                </div>
              ))}
            </div>
            {([[2, 0], [3, 1]] as const).map(([rows, section]) => (
              <div key={rows} className="flex flex-col gap-px">
                <div className="flex h-7 items-center ps-2">
                  <Skeleton className={section ? "w-12" : "w-14"} />
                </div>
                {range(rows).map((row) => (
                  <div key={row} className="flex h-[30px] items-center gap-2 px-2">
                    <Skeleton className={cn("size-4", section ? "rounded-xs" : "rounded-[5px]")} />
                    <Skeleton style={{ width: `${48 + ((row * 23 + section * 11) % 40)}%` }} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div
          className={cn(
            "flex h-dvh min-w-0 flex-1 flex-col bg-bg md:me-2 md:mb-2 md:overflow-hidden md:rounded-md md:shadow-panel",
            desktop ? "md:h-[calc(100dvh-52px)]" : "md:mt-2 md:h-[calc(100dvh-16px)]",
            collapsed && "md:ms-2",
          )}
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-rail ps-3.5 pe-1.5 md:hidden">
            <Skeleton className="size-5 rounded-[5px]" />
            <Skeleton className="w-24" />
          </div>
          <PageBarSkeleton />
        </div>
      </div>
    </SkeletonGroup>
  );
}

// The page bar while the page's own title is unknown: 48 high on a hairline,
// as PageHeader draws it.
export function PageBarSkeleton({ lead = false, actions = 0 }: { lead?: boolean; actions?: number }) {
  const collapsed = useRail()?.collapsed ?? false;
  return (
    <div className={cn("flex h-12 shrink-0 items-center gap-2.5 border-b border-line bg-bg ps-6 pe-4", collapsed && "md:ps-3")}>
      {collapsed ? <span className="size-7 shrink-0 max-md:hidden" /> : null}
      {lead ? <Skeleton className="h-[18.5px] w-9 rounded-xs" /> : null}
      <Skeleton className="h-3.5 w-32" />
      <div className="flex-1" />
      {range(actions).map((index) => (
        <Skeleton key={index} className={cn("h-8 rounded-sm", index === actions - 1 ? "w-28" : "w-20")} />
      ))}
    </div>
  );
}

// Sign-in, invite, onboarding and connect pages: a narrow column with the
// mark, a heading and the form or card under it, as AuthShell lays them out.
export function AuthSkeleton({ label = "Loading", body = "form" }: { label?: string; body?: "form" | "card" }) {
  return (
    <SkeletonGroup
      label={label}
      className="flex min-h-dvh flex-col bg-bg bg-[radial-gradient(70%_45%_at_50%_0%,var(--glow),transparent_75%)] px-6"
    >
      <div className="mx-auto flex w-full max-w-[360px] flex-1 flex-col justify-center py-14 sm:py-20">
        <Skeleton className="mx-auto size-11 rounded-[12px]" />
        <div className="mt-6 flex flex-col items-center">
          <Skeleton className="my-[4px] h-5 w-56" />
          <Skeleton className="mt-3.5 h-3 w-72 max-w-full" />
          <Skeleton className="mt-2 h-3 w-48" />
        </div>
        <div className="mt-8 flex flex-col gap-4">
          {body === "form" ? (
            [0, 1].map((field) => (
              <div key={field} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-10 rounded-sm sm:h-9" />
              </div>
            ))
          ) : (
            <div className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
              {[0, 1].map((row) => (
                <div key={row} className="flex min-h-12 items-center gap-3 px-4 py-2.5">
                  <Skeleton className="w-20" />
                  <Skeleton className="ms-auto w-28" />
                </div>
              ))}
            </div>
          )}
          <Skeleton className="mt-2 h-10 rounded-sm" />
        </div>
      </div>
    </SkeletonGroup>
  );
}

// Rows of issues, cell for cell like IssueRowCells: priority, identifier,
// status, title, people and when it changed.
export function IssueRowSkeleton({ index }: { index: number }) {
  return (
    <div className="grid min-h-10 grid-cols-[16px_58px_16px_minmax(0,1fr)_auto_30px] items-center gap-x-3 px-3 py-2 max-sm:grid-cols-[14px_16px_auto_minmax(0,1fr)_auto] max-sm:gap-x-2 max-sm:gap-y-1.5 max-sm:border-b max-sm:border-line max-sm:py-3 max-sm:pe-4">
      <Skeleton className="size-3.5 rounded-xs max-sm:col-start-2 max-sm:row-start-2" />
      <Skeleton className="w-11 max-sm:col-start-3 max-sm:row-start-2" />
      <Skeleton className="size-3.5 rounded-full max-sm:col-start-1 max-sm:row-start-1 max-sm:mt-[3px]" />
      <span className="flex min-w-0 items-center max-sm:col-span-4 max-sm:col-start-2 max-sm:row-start-1">
        <Skeleton className="h-3.5" style={{ width: widthAt(index) }} />
      </span>
      <Skeleton className="size-[22px] rounded-full max-sm:col-start-5 max-sm:row-start-2" />
      <Skeleton className="ms-auto w-6 max-sm:hidden" />
    </div>
  );
}

// A group's band over its rows, as the team list and a project draw it.
export function GroupBandSkeleton({ width = "w-20" }: { width?: string }) {
  return (
    <div className="flex h-[34px] items-center gap-2 rounded-sm bg-hover/60 px-3">
      <Skeleton className="size-3.5 rounded-full" />
      <Skeleton className={width} />
    </div>
  );
}

// A team's list: groups under their bands, rows under each.
export function IssueListSkeleton({ label = "Loading issues" }: { label?: string }) {
  return (
    <SkeletonGroup label={label}>
      <ListBody />
    </SkeletonGroup>
  );
}

// A team's board: columns of cards, as IssueBoard lays them out.
export function IssueBoardSkeleton({ label = "Loading issues" }: { label?: string }) {
  return (
    <SkeletonGroup label={label} className="h-full">
      <BoardBody />
    </SkeletonGroup>
  );
}

// A team's page before the team is known: its bar, its toolbar, then the
// list or the board the address asks for.
export function TeamIssuesSkeleton({ view, label = "Loading issues" }: { view: "list" | "board"; label?: string }) {
  return (
    <SkeletonGroup label={label} className="relative flex h-full min-h-0 flex-col">
      <PageBarSkeleton lead actions={2} />
      <div className="flex min-h-11 shrink-0 items-center gap-1 border-b border-line px-6 py-1.5 max-md:hidden">
        <Skeleton className="h-7 w-[144px] rounded-sm" />
        <Skeleton className="ms-4 w-12" />
        <Skeleton className="ms-6 w-12" />
        <Skeleton className="ms-6 w-20" />
        <div className="ms-auto" />
        <Skeleton className="me-2 h-7 w-44 rounded-md" />
        <Skeleton className="w-14" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{view === "board" ? <BoardBody /> : <ListBody />}</div>
    </SkeletonGroup>
  );
}

// The list and board bodies, inside whichever skeleton holds them.
function ListBody() {
  return (
    <div className="px-3 pt-2">
      {([[5, 0], [3, 1]] as const).map(([rows, group]) => (
        <div key={group} className="mb-4">
          <GroupBandSkeleton width={group ? "w-12" : "w-20"} />
          <div className="mt-1 flex flex-col gap-px">
            {range(rows).map((row) => (
              <IssueRowSkeleton key={row} index={row + group * 5} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function BoardBody() {
  return (
    <div className="flex h-full gap-3 overflow-hidden px-3">
      {([[3, 0], [2, 1], [4, 2], [1, 3]] as const).map(([cards, column]) => (
        <div key={column} className="flex w-64 shrink-0 flex-col">
          <div className="flex h-[34px] items-center gap-2 ps-3.5 pe-3">
            <Skeleton className="size-3.5 rounded-full" />
            <Skeleton className={column % 2 ? "w-12" : "w-20"} />
          </div>
          <div className="flex flex-col gap-2 px-0.5 pt-0.5">
            {range(cards).map((card) => (
              <div key={card} className="flex flex-col gap-2 rounded-md bg-surface px-3 pt-2.5 pb-3 shadow-card">
                <span className="flex h-[18px] items-center gap-2">
                  <Skeleton className="size-3.5 rounded-xs" />
                  <Skeleton className="w-11" />
                  <Skeleton className="ms-auto size-[18px] rounded-full" />
                </span>
                <span className="flex flex-col gap-2 py-[3px]">
                  <Skeleton className="h-3.5" style={{ width: card % 2 ? "70%" : "88%" }} />
                  {card % 2 ? null : <Skeleton className="h-3.5 w-1/2" />}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Plain rows, like the inbox's or the trash's: an optional avatar or key, a
// line of text, and what sits at the end of the row.
export function RowsSkeleton({
  label,
  rows = 6,
  avatar = false,
  identifier = false,
  meta = false,
  end = "time",
  className,
}: {
  label: string;
  rows?: number;
  avatar?: boolean;
  identifier?: boolean;
  // A note before the end, like who deleted it and when.
  meta?: boolean;
  end?: "time" | "button";
  className?: string;
}) {
  return (
    <SkeletonGroup label={label} className={cn("flex flex-col gap-px", className)}>
      {range(rows).map((row) => (
        <div key={row} className="flex min-h-10 items-center gap-3 px-3 py-2">
          {avatar ? <Skeleton className="size-[22px] rounded-full" /> : null}
          {identifier ? <Skeleton className="w-[58px] shrink-0" /> : null}
          <span className="flex min-w-0 flex-1">
            <Skeleton className="h-3.5" style={{ width: widthAt(row) }} />
          </span>
          {meta ? <Skeleton className="w-40 max-sm:hidden" /> : null}
          {end === "time" ? <Skeleton className="w-8" /> : <Skeleton className="h-[26px] w-16 rounded-sm" />}
        </div>
      ))}
    </SkeletonGroup>
  );
}

// A settings card, as SettingsCard draws it: the title over a bordered card
// of rows. Each row is a setting (its name, a line about it and a control), a
// person (an avatar, a name and an email, a role) or a choice (a radio, a name
// and a line about it).
export function SettingsCardSkeleton({ rows = 3, kind = "setting" }: { rows?: number; kind?: "setting" | "person" | "choice" }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center">
        <Skeleton className="w-24" />
      </div>
      <div className="flex flex-col divide-y divide-line rounded-md border border-line bg-surface">
        {range(rows).map((row) =>
          kind === "person" ? (
            <div key={row} className="flex min-h-14 items-center gap-3 px-4 py-2.5">
              <Skeleton className="size-8 rounded-full" />
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton style={{ width: `${28 + ((row * 17) % 24)}%` }} />
                <Skeleton className="h-2.5" style={{ width: `${36 + ((row * 13) % 20)}%` }} />
              </span>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          ) : kind === "choice" ? (
            <div key={row} className="flex items-start gap-3 px-5 py-4">
              <Skeleton className="mt-0.5 size-4 rounded-full" />
              <span className="flex flex-1 flex-col gap-2 pt-0.5">
                <Skeleton style={{ width: `${12 + ((row * 7) % 10)}%` }} />
                <Skeleton className="h-2.5" style={{ width: `${55 + ((row * 17) % 30)}%` }} />
              </span>
            </div>
          ) : (
            <div key={row} className="flex items-center gap-6 px-5 py-4">
              <span className="flex min-w-[200px] flex-1 flex-col gap-2">
                <Skeleton style={{ width: `${24 + ((row * 19) % 20)}%` }} />
                <Skeleton className="h-2.5" style={{ width: `${50 + ((row * 23) % 30)}%` }} />
              </span>
              <Skeleton className="h-8 w-24 rounded-sm" />
            </div>
          ),
        )}
      </div>
    </div>
  );
}
