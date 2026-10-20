import type { InboxItem } from "@edicthq/client";
import { Avatar, Tabs, cn } from "@edicthq/ui";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@edicthq/ui";
import { EmptyState, Loading, PageBody, PageHeader, rowClass } from "../components/shell.js";
import { useInbox, useMarkAllInboxRead, useMarkInboxItem } from "../lib/queries.js";
import { ago } from "../lib/issues.js";
import { useOrg } from "./org.js";

// One line about what happened first, then the issue itself. The wording is
// the sender's acting, so the sentence reads "Amirali assigned ENG-12".
export const typeLine: Record<InboxItem["type"], string> = {
  assigned: "assigned",
  delegated: "delegated",
  comment_created: "commented on",
  mentioned: "mentioned you on",
  status_changed: "changed status on",
  progress_posted: "posted progress on",
  webhook_disabled: "",
};

export const progressWords: Record<NonNullable<InboxItem["progressState"]>, string> = {
  working: "is working on",
  blocked: "is blocked on",
  needs_input: "needs input on",
  done: "finished",
};

export function InboxPage() {
  const { orgId, slug } = useOrg();
  const [filter, setFilter] = useState<"unread" | "all">("unread");

  const inbox = useInbox(orgId, filter);
  const items = inbox.data ?? [];
  const markItem = useMarkInboxItem(orgId);
  const markAll = useMarkAllInboxRead(orgId);

  function open(item: { id: string; readAt: string | null }) {
    if (!item.readAt) markItem.mutate({ itemId: item.id, read: true });
  }

  return (
    <>
      <PageHeader
        title="Inbox"
        actions={
          <>
            <Tabs
              label="Notifications"
              variant="segmented"
              value={filter}
              onChange={setFilter}
              items={[
                { value: "unread", label: "Unread" },
                { value: "all", label: "All" },
              ]}
            />
            <Button
              variant="ghost"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              Mark all read
            </Button>
          </>
        }
      />

      <PageBody>
        {inbox.isPending ? (
          <Loading label="Loading the inbox" />
        ) : items.length ? (
          <ul className="flex flex-col gap-px">
            {items.map((item) => (
              <li key={item.id}>
                <Link
                  to={
                    item.issue
                      ? `/${slug}/teams/${item.issue.teamId}?issue=${item.issue.identifier}`
                      : `/${slug}/agents`
                  }
                  onClick={() => open(item)}
                  className={cn(rowClass, "min-w-0")}
                  aria-current={item.readAt ? undefined : "true"}
                >
                  {item.actor && item.issue ? <Avatar name={item.actor.name} kind={item.actor.kind === "agent" ? "agent" : "human"} /> : null}
                  <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
                    {item.issue ? (
                      <>
                        <span className={cn("font-semibold", item.actor?.kind === "agent" && "text-agent-ink")}>{item.actor?.name ?? "Someone"}</span>{" "}
                        {item.progressState ? progressWords[item.progressState] : typeLine[item.type]}{" "}
                        <span className="font-medium text-ink">{item.issue.identifier}</span>{" "}
                        <span className={cn("text-ink-2 font-normal")}>{item.issue.title}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">A webhook turned itself off</span>{" "}
                        <span className="font-normal text-ink-2">
                          after its deliveries to {item.webhook?.url ?? "its URL"} failed for a day
                        </span>
                      </>
                    )}
                  </span>
                  {!item.readAt ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-ink" /> : null}
                  <time dateTime={item.createdAt} className="shrink-0 text-end text-sm text-ink-3">
                    {ago(item.createdAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            layout="page"
            icon={<Inbox aria-hidden="true" />}
            title={filter === "unread" ? "You're all caught up" : "Nothing here yet"}
            body={
              filter === "unread"
                ? "Mentions, assignments, delegations and agent progress land here."
                : "Work that involves you shows up here once someone assigns, delegates or mentions you."
            }
          />
        )}
      </PageBody>
    </>
  );
}
