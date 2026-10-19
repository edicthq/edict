import { collectionOptions, useLiveQuery, type Collection } from "@tanstack/react-db";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import type { QueryClient } from "@tanstack/react-query";
import type { Issue } from "@edicthq/client";
import { ApiFailure, api, unwrap } from "./api.js";
import { db } from "./db.js";
import { keys } from "./queries.js";

// A team's issues live in one query collection per team: TanStack Query loads
// it, screens read it through live queries, and realtime patches it so
// another person's (or an agent's) change shows up without a round trip.
// Creates stay, updates and deletes run against the shared query cache, which
// the collection observes, so their optimistic writes flow through unchanged.

type IssuesCollection = Collection<Issue, string | number>;

const collections = new Map<string, IssuesCollection>();

const collectionId = (orgId: string, teamId: string) => `issues:${orgId}:${teamId}`;

export function issuesCollection(orgId: string, teamId: string): IssuesCollection {
  const id = collectionId(orgId, teamId);
  const known = collections.get(id);
  if (known) return known;
  const collection = db.collection(
    collectionOptions(id, (client) =>
      queryCollectionOptions<Issue>({
        id,
        queryKey: keys.issues(orgId, teamId),
        queryClient: client.requireDependency<QueryClient>("queryClient"),
        queryFn: () =>
          unwrap(api.GET("/organizations/{orgId}/teams/{teamId}/issues", { params: { path: { orgId, teamId } } })),
        getKey: (issue) => issue.id,
        // Realtime patches the collection as events arrive (lib/realtime.ts).
        staleTime: 30_000,
      }),
    ),
  );
  collections.set(id, collection);
  return collection;
}

export function useTeamIssues(orgId: string, teamId: string) {
  return useLiveQuery({
    query: (q) => q.from({ issue: issuesCollection(orgId, teamId) }).orderBy(({ issue }) => issue.number, "asc"),
  });
}

interface RealtimeIssueEvent {
  type: string;
  subjectId: string;
  organizationId: string;
  data: Record<string, unknown>;
}

// The team of a collection entry this event touches, searching the teams whose
// lists this browser has loaded.
function rowOf(orgId: string, issueId: string): { collection: IssuesCollection; issue: Issue } | undefined {
  for (const [id, collection] of collections) {
    if (!id.startsWith(`issues:${orgId}:`)) continue;
    const issue = collection.get(issueId);
    if (issue) return { collection, issue: issue as Issue };
  }
}

async function fetchIssue(orgId: string, issueRef: string): Promise<Issue | undefined> {
  try {
    return await unwrap(
      api.GET("/organizations/{orgId}/issues/{issueRef}", { params: { path: { orgId, issueRef } } }),
    );
  } catch (error) {
    if (!(error instanceof ApiFailure && error.status === 404)) throw error;
  }
}

// Applies one realtime event to the team's collections. Events that name a
// change to issue fields patch rows in place; those that only carry an id
// fetch the issue, which has everything a row needs. When no list holds the
// issue this browser has nothing to patch, and the server keeps nothing.
export async function patchIssues(event: RealtimeIssueEvent): Promise<void> {
  const orgId = event.organizationId;
  // Progress events name the update; the issue is in their data.
  const issueId = event.type === "progress.posted" && typeof event.data.issueId === "string" ? event.data.issueId : event.subjectId;
  const version = typeof event.data.version === "number" ? event.data.version : undefined;
  const upsert = async () => {
    const issue = await fetchIssue(orgId, issueId);
    if (!issue) return;
    await collections.get(collectionId(orgId, issue.teamId))?.utils.writeUpsert([issue]);
  };
  switch (event.type) {
    case "issue.created":
    case "issue.restored":
    case "issue.unarchived":
    case "progress.posted":
      return upsert();
    case "issue.updated": {
      // Each change is { from, to }; the row takes the new values.
      const changes = event.data.changes as Record<string, { to: unknown }> | undefined;
      const found = rowOf(orgId, issueId);
      if (!found || typeof changes !== "object" || changes === null) return;
      const { collection, issue } = found;
      const next = Object.fromEntries(Object.entries(changes).map(([field, change]) => [field, change.to])) as Partial<Issue>;
      // A move leaves this team's list and joins the other's.
      if (typeof next.teamId === "string" && next.teamId !== issue.teamId) {
        const target = collections.get(collectionId(orgId, next.teamId));
        if (target) {
          const moved = await fetchIssue(orgId, issueId);
          if (moved) await target.utils.writeUpsert([moved]);
        }
        await collection.utils.writeDelete([issueId]);
        return;
      }
      // What a field change implies elsewhere, like when it closed, comes with
      // the issue itself.
      if ("statusId" in next) return upsert();
      await collection.utils.writeUpdate([{ id: issueId, ...next, ...(version ? { version } : {}) }]);
      return;
    }
    case "issue.deleted":
    case "issue.archived": {
      const found = rowOf(orgId, issueId);
      if (found) await found.collection.utils.writeDelete([issueId]);
      return;
    }
  }
}
