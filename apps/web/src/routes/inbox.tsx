import type { InboxItem } from "@edicthq/client";
import { Avatar, TeamKey, cn } from "@edicthq/ui";
import { useState } from "react";
import { Link } from "react-router";
import { Button } from "@edicthq/ui";
import { EmptyState, Loading, PageBody, PageHeader, rowClass } from "../components/shell.js";
import { useInbox, useMarkAllInboxRead, useMarkInboxItem } from "../lib/queries.js";
import { ago } from "../lib/issues.js";
import { useOrg } from "./org.js";

// One line about what happened first, then the issue itself. The wording is
// the sender's acting, so the sentence reads "Amirali assigned ENG-12".
const typeLine: Record<InboxItem["type"], string> = {
  assigned: "assigned",
  delegated: "delegated",
  comment_created: "commented on",
  mentioned: "mentioned you on",
  status_changed: "changed status on",
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
            <div className="flex items-center gap-1 rounded-sm border border-line bg-surface p-0.5 text-ui">
              <button
                type="button"
                onClick={() => setFilter("unread")}
                className={cn(
                  "rounded-xs px-2.5 py-1 text-sm font-medium transition-[background-color,color]",
                  filter === "unread" ? "bg-hover text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                Unread
              </button>
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "rounded-xs px-2.5 py-1 text-sm font-medium transition-[background-color,color]",
                  filter === "all" ? "bg-hover text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                All
              </button>
            </div>
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
                  to={`/${slug}/teams/${item.issue.teamId}?peek=${item.issue.identifier}`}
                  onClick={() => open(item)}
                  className={cn(rowClass, "min-w-0")}
                  aria-current={item.readAt ? undefined : "true"}
                >
                  {item.actor ? <Avatar name={item.actor.name} /> : null}
                  <span className="min-w-0 flex-1 truncate text-body font-medium text-ink">
                    <span className="font-semibold">{item.actor?.name ?? "Someone"}</span>{" "}
                    {typeLine[item.type]}{" "}
                    <TeamKey>{item.issue.identifier.split("-")[0]}</TeamKey>{" "}
                    <span className="font-medium text-ink">{item.issue.identifier}</span>{" "}
                    <span className={cn("text-ink-2 font-normal")}>{item.issue.title}</span>
                  </span>
                  {!item.readAt ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-accent" /> : null}
                  <time dateTime={item.createdAt} className="shrink-0 text-end text-sm text-ink-3">
                    {ago(item.createdAt)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Nothing here"
            body={
              filter === "unread"
                ? "No unread notifications. Work that involves you shows up here."
                : "You have no notifications about work yet."
            }
          />
        )}
      </PageBody>
    </>
  );
}
