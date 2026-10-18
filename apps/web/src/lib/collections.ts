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

export function issuesCollection(orgId: string, teamId: string): IssuesCollection {
  const id = `issues:${orgId}:${teamId}`;
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
        staleTime: 30_000,
        // Agents' progress shows up without a reload until realtime arrives.
        refetchInterval: 10_000,
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
    if (!id.startsWith(`${orgId}:`)) continue;
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
  const issueId = event.subjectId;
  const version = typeof event.data.version === "number" ? event.data.version : undefined;
  switch (event.type) {
    case "issue.created":
    case "issue.restored": {
      const issue = await fetchIssue(orgId, issueId);
      if (!issue) return;
      await collections.get(`${orgId}:${issue.teamId}`)?.utils.writeUpsert([issue]);
      return;
    }
    case "issue.updated": {
      const changes = event.data.changes as Partial<Issue> | undefined;
      const found = rowOf(orgId, issueId);
      if (!found || typeof changes !== "object" || changes === null) return;
      const { collection, issue } = found;
      // A move leaves this team's list and joins the other's.
      if (typeof changes.teamId === "string" && changes.teamId !== issue.teamId) {
        const target = collections.get(`${orgId}:${changes.teamId}`);
        if (target) {
          const moved = await fetchIssue(orgId, issueId);
          if (moved) await target.utils.writeUpsert([moved]);
        }
        await collection.utils.writeDelete([issueId]);
        return;
      }
      await collection.utils.writeUpdate([{ id: issueId, ...changes, ...(version ? { version } : {}) }]);
      return;
    }
    case "issue.deleted": {
      const found = rowOf(orgId, issueId);
      if (found) await found.collection.utils.writeDelete([issueId]);
      return;
    }
    case "progress.posted": {
      const issue = await fetchIssue(orgId, issueId);
      if (!issue) return;
      await collections.get(`${orgId}:${issue.teamId}`)?.utils.writeUpsert([issue]);
      return;
    }
  }
}
