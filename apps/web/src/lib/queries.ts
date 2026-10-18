import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agent, AgentPower, Attachment, Comment, InboxItem, Issue, Label, paths, Project, ProjectProgress, ProjectStatus, RelationType, Role, SavedView, SavedViewQuery, SignUpMode, Webhook, WebLink } from "@edicthq/client";
import { ApiFailure, api, unwrap } from "./api.js";

export const keys = {
  memberships: ["memberships"] as const,
  instance: ["instance"] as const,
  teams: (orgId: string) => ["org", orgId, "teams"] as const,
  teamMembers: (orgId: string, teamId: string) => ["org", orgId, "teams", teamId, "members"] as const,
  members: (orgId: string) => ["org", orgId, "members"] as const,
  invites: (orgId: string) => ["org", orgId, "invites"] as const,
  invite: (token: string) => ["invite", token] as const,
  statuses: (orgId: string, teamId: string) => ["org", orgId, "teams", teamId, "statuses"] as const,
  issues: (orgId: string, teamId: string) => ["org", orgId, "teams", teamId, "issues"] as const,
  issue: (orgId: string, issueRef: string) => ["org", orgId, "issue", issueRef] as const,
  teamLabels: (orgId: string, teamId: string) => ["org", orgId, "teams", teamId, "labels"] as const,
  subIssues: (orgId: string, issueId: string) => ["org", orgId, "issue", issueId, "sub-issues"] as const,
  relations: (orgId: string, issueId: string) => ["org", orgId, "issue", issueId, "relations"] as const,
  comments: (orgId: string, issueId: string) => ["org", orgId, "issue", issueId, "comments"] as const,
  attachments: (orgId: string, issueId: string) => ["org", orgId, "issue", issueId, "attachments"] as const,
  progress: (orgId: string, issueId: string) => ["org", orgId, "issue", issueId, "progress"] as const,
  links: (orgId: string, issueId: string) => ["org", orgId, "issue", issueId, "links"] as const,
  agents: (orgId: string) => ["org", orgId, "agents"] as const,
  apiKeys: (orgId: string, agentId: string) => ["org", orgId, "agents", agentId, "api-keys"] as const,
  webhooks: (orgId: string) => ["org", orgId, "webhooks"] as const,
  deliveries: (orgId: string, webhookId: string) => ["org", orgId, "webhooks", webhookId, "deliveries"] as const,
  savedViews: (orgId: string, teamId: string) => ["org", orgId, "teams", teamId, "saved-views"] as const,
  projects: (orgId: string) => ["org", orgId, "projects"] as const,
  project: (orgId: string, projectRef: string) => ["org", orgId, "projects", projectRef] as const,
  projectIssues: (orgId: string, projectRef: string) => ["org", orgId, "projects", projectRef, "issues"] as const,
  myWork: (orgId: string, include?: "open" | "all") => ["org", orgId, "my-work", include ?? "open"] as const,
  inbox: (orgId: string, filter: "unread" | "all") => ["org", orgId, "inbox", filter] as const,
  inboxUnread: (orgId: string) => ["org", orgId, "inbox", "unread-count"] as const,
};

const org = (orgId: string) => ({ params: { path: { orgId } } });

export function useMemberships(enabled = true) {
  return useQuery({
    queryKey: keys.memberships,
    queryFn: () => unwrap(api.GET("/organizations")),
    enabled,
  });
}

export function useInstance() {
  return useQuery({ queryKey: keys.instance, queryFn: () => unwrap(api.GET("/instance")) });
}

export function useTeams(orgId: string) {
  return useQuery({
    queryKey: keys.teams(orgId),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/teams", org(orgId))),
  });
}

export function useTeamMembers(orgId: string, teamId: string) {
  return useQuery({
    queryKey: keys.teamMembers(orgId, teamId),
    queryFn: () =>
      unwrap(api.GET("/organizations/{orgId}/teams/{teamId}/members", { params: { path: { orgId, teamId } } })),
  });
}

export function useMembers(orgId: string) {
  return useQuery({
    queryKey: keys.members(orgId),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/members", org(orgId))),
  });
}

export function useInvites(orgId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.invites(orgId),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/invites", org(orgId))),
    enabled,
  });
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: keys.invite(token),
    queryFn: () => unwrap(api.GET("/invites/{token}", { params: { path: { token } } })),
    retry: false,
  });
}

export function useCreateOrganization() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; slug: string }) => unwrap(api.POST("/organizations", { body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.memberships }),
  });
}

export function useCreateTeam(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; key: string; private: boolean }) =>
      unwrap(api.POST("/organizations/{orgId}/teams", { ...org(orgId), body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.teams(orgId) }),
  });
}

export function useAddTeamMember(orgId: string, teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      unwrap(
        api.POST("/organizations/{orgId}/teams/{teamId}/members", {
          params: { path: { orgId, teamId } },
          body: { memberId },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.teams(orgId) }),
  });
}

export function useRemoveTeamMember(orgId: string, teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      unwrap(
        api.DELETE("/organizations/{orgId}/teams/{teamId}/members/{memberId}", {
          params: { path: { orgId, teamId, memberId } },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.teams(orgId) }),
  });
}

export function useUpdateMemberRole(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: Role }) =>
      unwrap(
        api.PATCH("/organizations/{orgId}/members/{memberId}", {
          params: { path: { orgId, memberId } },
          body: { role },
        }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.members(orgId) });
      void client.invalidateQueries({ queryKey: keys.memberships });
    },
  });
}

export function useRemoveMember(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) =>
      unwrap(
        api.DELETE("/organizations/{orgId}/members/{memberId}", { params: { path: { orgId, memberId } } }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.members(orgId) });
      void client.invalidateQueries({ queryKey: keys.memberships });
    },
  });
}

export function useCreateInvite(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: Role; teamIds: string[] }) =>
      unwrap(api.POST("/organizations/{orgId}/invites", { ...org(orgId), body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.invites(orgId) }),
  });
}

export function useRevokeInvite(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (inviteId: string) =>
      unwrap(
        api.DELETE("/organizations/{orgId}/invites/{inviteId}", { params: { path: { orgId, inviteId } } }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.invites(orgId) }),
  });
}

export function useAcceptInvite(token: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST("/invites/{token}/accept", { params: { path: { token } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.memberships }),
  });
}

export function useSetSignUpMode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (signUpMode: SignUpMode) => unwrap(api.PATCH("/instance", { body: { signUpMode } })),
    onSuccess: (data) => client.setQueryData(keys.instance, data),
  });
}

// ---------- issues ----------

export function useStatuses(orgId: string, teamId: string) {
  return useQuery({
    queryKey: keys.statuses(orgId, teamId),
    queryFn: () =>
      unwrap(api.GET("/organizations/{orgId}/teams/{teamId}/statuses", { params: { path: { orgId, teamId } } })),
    staleTime: 5 * 60_000,
  });
}

// One issue by id or any identifier it has had. Used to resolve links; the
// team's list is the copy screens read and edit.
export function useIssue(orgId: string, issueRef: string | null) {
  return useQuery({
    queryKey: keys.issue(orgId, issueRef ?? ""),
    queryFn: () =>
      unwrap(api.GET("/organizations/{orgId}/issues/{issueRef}", { params: { path: { orgId, issueRef: issueRef! } } })),
    enabled: issueRef !== null,
  });
}

export function useCreateIssue(orgId: string, teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateIssueBody) =>
      unwrap(api.POST("/organizations/{orgId}/teams/{teamId}/issues", { params: { path: { orgId, teamId } }, body })),
    onSuccess: (issue) => {
      client.setQueryData<Issue[]>(keys.issues(orgId, teamId), (list) => (list ? [issue, ...list] : list));
      if (issue.parentId) void client.invalidateQueries({ queryKey: keys.subIssues(orgId, issue.parentId) });
    },
  });
}

type CreateIssueBody = NonNullable<paths["/organizations/{orgId}/teams/{teamId}/issues"]["post"]["requestBody"]>["content"]["application/json"];
export type IssueChanges = Omit<NonNullable<paths["/organizations/{orgId}/issues/{issueRef}"]["patch"]["requestBody"]>["content"]["application/json"], "version">;

// Updates to one issue run one at a time, each sending the version in the
// cache when it starts, so quick edits to the same field never conflict with
// each other (ADR 0018).
const issueQueues = new Map<string, Promise<unknown>>();
function queued<T>(issueId: string, run: () => Promise<T>): Promise<T> {
  const next = (issueQueues.get(issueId) ?? Promise.resolve()).catch(() => undefined).then(run);
  issueQueues.set(issueId, next);
  return next;
}

function replaceIssue(list: Issue[] | undefined, issue: Issue): Issue[] | undefined {
  return list?.map((item) => (item.id === issue.id ? issue : item));
}

export function useUpdateIssue(orgId: string) {
  const client = useQueryClient();
  const listKey = (teamId: string) => keys.issues(orgId, teamId);
  return useMutation({
    mutationFn: ({ issue, changes }: { issue: Issue; changes: IssueChanges }) =>
      queued(issue.id, async () => {
        const cached = client.getQueryData<Issue[]>(listKey(issue.teamId))?.find((item) => item.id === issue.id);
        const updated = await unwrap(
          api.PATCH("/organizations/{orgId}/issues/{issueRef}", {
            params: { path: { orgId, issueRef: issue.id } },
            body: { version: cached?.version ?? issue.version, ...changes },
          }),
        );
        if (updated.teamId === issue.teamId) {
          client.setQueryData<Issue[]>(listKey(issue.teamId), (list) => replaceIssue(list, updated));
        } else {
          // Moved: it leaves this team's list and joins the other's.
          client.setQueryData<Issue[]>(listKey(issue.teamId), (list) => list?.filter((item) => item.id !== issue.id));
          void client.invalidateQueries({ queryKey: listKey(updated.teamId) });
        }
        // Lists of sub-issues show its title and status.
        void client.invalidateQueries({ queryKey: ["org", orgId, "issue"] });
        return updated;
      }),
    // Shows the change at once; the server's answer replaces it. A move waits
    // for the server, which picks the new number and status.
    onMutate: async ({ issue, changes }) => {
      if (changes.teamId) return {};
      await client.cancelQueries({ queryKey: listKey(issue.teamId) });
      const before = client.getQueryData<Issue[]>(listKey(issue.teamId))?.find((item) => item.id === issue.id);
      client.setQueryData<Issue[]>(listKey(issue.teamId), (list) =>
        list?.map((item) => (item.id === issue.id ? { ...item, ...changes } : item)),
      );
      return { before };
    },
    onError: (error, { issue }, context) => {
      // A conflict brings the current issue with it; anything else puts back
      // what was there.
      const current = error instanceof ApiFailure && error.code === "conflict" ? (error.details.current as Issue) : context?.before;
      if (current) client.setQueryData<Issue[]>(listKey(issue.teamId), (list) => replaceIssue(list, current));
    },
  });
}

export type BulkUpdateChanges = Omit<
  NonNullable<paths["/organizations/{orgId}/issues/bulk-update"]["post"]["requestBody"]>["content"]["application/json"],
  "issues"
>;

export function useBulkUpdateIssues(orgId: string) {
  const client = useQueryClient();
  const listKey = (teamId: string) => keys.issues(orgId, teamId);
  return useMutation({
    mutationFn: ({ targets, changes }: { targets: { id: string; version: number }[]; changes: BulkUpdateChanges }) =>
      unwrap(
        api.POST("/organizations/{orgId}/issues/bulk-update", {
          params: { path: { orgId } },
          body: { issues: targets, ...changes },
        }),
      ),
    onSuccess: (data) => {
      for (const updated of data.updated) {
        client.setQueryData<Issue[]>(listKey(updated.teamId), (list) => replaceIssue(list, updated));
      }
      void client.invalidateQueries({ queryKey: ["org", orgId] });
      return data;
    },
  });
}

export function useBulkDeleteIssues(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (issueIds: string[]) =>
      unwrap(
        api.POST("/organizations/{orgId}/issues/bulk-delete", {
          params: { path: { orgId } },
          body: { issueIds },
        }),
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["org", orgId] });
    },
  });
}

export function useSearchIssues(orgId: string, query: { q?: string; limit?: number }, enabled = true) {
  return useQuery({
    queryKey: ["org", orgId, "search-issues", query] as const,
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/issues", {
          params: { path: { orgId }, query: { ...query, limit: query.limit ?? 20 } },
        }),
      ),
    enabled: enabled && Boolean(query.q && query.q.trim().length > 0),
  });
}

export function useTeamLabels(orgId: string, teamId: string) {
  return useQuery({
    queryKey: keys.teamLabels(orgId, teamId),
    queryFn: () =>
      unwrap(api.GET("/organizations/{orgId}/teams/{teamId}/labels", { params: { path: { orgId, teamId } } })),
    staleTime: 5 * 60_000,
  });
}

// A new label for one team, from the label picker.
export function useCreateLabel(orgId: string, teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string }) =>
      unwrap(api.POST("/organizations/{orgId}/teams/{teamId}/labels", { params: { path: { orgId, teamId } }, body })),
    onSuccess: (label) =>
      client.setQueryData<Label[]>(keys.teamLabels(orgId, teamId), (list) =>
        list ? [...list, label].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })) : list,
      ),
  });
}

export function useSubIssues(orgId: string, issueId: string) {
  return useQuery({
    queryKey: keys.subIssues(orgId, issueId),
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/issues/{issueRef}/sub-issues", { params: { path: { orgId, issueRef: issueId } } }),
      ),
  });
}

export function useRelations(orgId: string, issueId: string) {
  return useQuery({
    queryKey: keys.relations(orgId, issueId),
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/issues/{issueRef}/relations", { params: { path: { orgId, issueRef: issueId } } }),
      ),
  });
}

// Relations show on both issues, so a change refreshes every open relation list.
export function useCreateRelation(orgId: string, issueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { type: RelationType; issue: string }) =>
      unwrap(
        api.POST("/organizations/{orgId}/issues/{issueRef}/relations", {
          params: { path: { orgId, issueRef: issueId } },
          body,
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["org", orgId, "issue"] }),
  });
}

export function useDeleteRelation(orgId: string, issueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (relationId: string) =>
      unwrap(
        api.DELETE("/organizations/{orgId}/issues/{issueRef}/relations/{relationId}", {
          params: { path: { orgId, issueRef: issueId, relationId } },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: ["org", orgId, "issue"] }),
  });
}

// ---------- comments and attachments ----------

export function useComments(orgId: string, issueId: string) {
  return useQuery({
    queryKey: keys.comments(orgId, issueId),
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/issues/{issueRef}/comments", { params: { path: { orgId, issueRef: issueId } } }),
      ),
  });
}

export function useCreateComment(orgId: string, issueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { body: string }) =>
      unwrap(
        api.POST("/organizations/{orgId}/issues/{issueRef}/comments", {
          params: { path: { orgId, issueRef: issueId } },
          body,
        }),
      ),
    onSuccess: (comment) => client.setQueryData(keys.comments(orgId, issueId), (list: Comment[] | undefined) => [...(list ?? []), comment]),
  });
}

// A comment compares the whole version (ADR 0018). A conflict carries the
// current comment, which goes into the cache, so saving again replaces it.
export function useUpdateComment(orgId: string, issueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ comment, body }: { comment: Comment; body: string }) =>
      unwrap(
        api.PATCH("/organizations/{orgId}/comments/{commentId}", {
          params: { path: { orgId, commentId: comment.id } },
          body: { version: comment.version, body },
        }),
      ),
    onSuccess: (updated) => replaceComment(updated),
    onError: (error) => {
      if (error instanceof ApiFailure && error.code === "conflict") {
        replaceComment(error.details.current as Comment);
      }
    },
  });

  function replaceComment(updated: Comment) {
    client.setQueryData(keys.comments(orgId, issueId), (list: Comment[] | undefined) =>
      list?.map((item) => (item.id === updated.id ? updated : item)),
    );
  }
}

export function useAttachments(orgId: string, issueId: string) {
  return useQuery({
    queryKey: keys.attachments(orgId, issueId),
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/issues/{issueRef}/attachments", { params: { path: { orgId, issueRef: issueId } } }),
      ),
  });
}

// openapi-fetch passes a FormData body untouched, so the upload goes out as
// multipart with the browser's boundary. The generated type says the field is
// a string ("format: binary"); FormData satisfies it at the call.
type AttachmentForm = NonNullable<paths["/organizations/{orgId}/issues/{issueRef}/attachments"]["post"]["requestBody"]>["content"]["multipart/form-data"];

export function useCreateAttachment(orgId: string, issueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return unwrap(
        api.POST("/organizations/{orgId}/issues/{issueRef}/attachments", {
          params: { path: { orgId, issueRef: issueId } },
          body: form as unknown as AttachmentForm,
        }),
      );
    },
    onSuccess: (attachment) =>
      client.setQueryData(keys.attachments(orgId, issueId), (list: Attachment[] | undefined) => [...(list ?? []), attachment]),
  });
}

// ---------- trash (ADR 0019) ----------

export function useTrash(orgId: string) {
  return useQuery({
    queryKey: ["org", orgId, "trash"] as const,
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/trash", org(orgId))),
  });
}

// Trashing an issue takes its sub-issues with it, so every issue list and
// lane refetches.
export function useDeleteIssue(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (issue: Issue) =>
      unwrap(api.DELETE("/organizations/{orgId}/issues/{issueRef}", { params: { path: { orgId, issueRef: issue.id } } })),
    onSuccess: (_, issue) => {
      client.setQueryData<Issue[]>(keys.issues(orgId, issue.teamId), (list) => list?.filter((item) => item.id !== issue.id));
      void client.invalidateQueries({ queryKey: ["org", orgId] });
    },
  });
}

export function useRestoreIssue(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (issueRef: string) =>
      unwrap(api.POST("/organizations/{orgId}/issues/{issueRef}/restore", { params: { path: { orgId, issueRef } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: ["org", orgId] }),
  });
}

export function useDeleteComment(orgId: string, issueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (comment: Comment) =>
      unwrap(api.DELETE("/organizations/{orgId}/comments/{commentId}", { params: { path: { orgId, commentId: comment.id } } })),
    onSuccess: (_, comment) =>
      client.setQueryData(keys.comments(orgId, issueId), (list: Comment[] | undefined) =>
        list?.filter((item) => item.id !== comment.id),
      ),
  });
}

// ---------- agents (ADR 0008, ADR 0015, ADR 0021) ----------

export function useAgents(orgId: string) {
  return useQuery({
    queryKey: keys.agents(orgId),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/agents", org(orgId))),
  });
}

// Agents are members too, so the member lists refresh with them.
function useAgentsChanged(orgId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.agents(orgId) });
    void client.invalidateQueries({ queryKey: keys.members(orgId) });
  };
}

export function useCreateAgent(orgId: string) {
  const changed = useAgentsChanged(orgId);
  return useMutation({
    mutationFn: (body: { name: string; description: string; role: "member" | "guest"; teamIds: string[]; grants: AgentPower[] }) =>
      unwrap(api.POST("/organizations/{orgId}/agents", { ...org(orgId), body })),
    onSuccess: changed,
  });
}

export function useUpdateAgent(orgId: string) {
  const changed = useAgentsChanged(orgId);
  return useMutation({
    mutationFn: ({ agent, changes }: { agent: Agent; changes: { name?: string; description?: string; grants?: AgentPower[] } }) =>
      unwrap(
        api.PATCH("/organizations/{orgId}/agents/{agentId}", {
          params: { path: { orgId, agentId: agent.id } },
          body: { version: agent.version, ...changes },
        }),
      ),
    onSuccess: changed,
  });
}

export function usePauseAgent(orgId: string) {
  const changed = useAgentsChanged(orgId);
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, pause }: { agentId: string; pause: boolean }) =>
      unwrap(
        pause
          ? api.POST("/organizations/{orgId}/agents/{agentId}/pause", { params: { path: { orgId, agentId } } })
          : api.POST("/organizations/{orgId}/agents/{agentId}/resume", { params: { path: { orgId, agentId } } }),
      ),
    onSuccess: (_, { agentId }) => {
      changed();
      void client.invalidateQueries({ queryKey: keys.apiKeys(orgId, agentId) });
      void client.invalidateQueries({ queryKey: keys.webhooks(orgId) });
    },
  });
}

export function useApiKeys(orgId: string, agentId: string, enabled = true) {
  return useQuery({
    queryKey: keys.apiKeys(orgId, agentId),
    queryFn: () =>
      unwrap(api.GET("/organizations/{orgId}/agents/{agentId}/api-keys", { params: { path: { orgId, agentId } } })),
    enabled,
  });
}

export function useCreateApiKey(orgId: string, agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; teamIds: string[] | null }) =>
      unwrap(api.POST("/organizations/{orgId}/agents/{agentId}/api-keys", { params: { path: { orgId, agentId } }, body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.apiKeys(orgId, agentId) }),
  });
}

export function useRevokeApiKey(orgId: string, agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (keyId: string) =>
      unwrap(
        api.DELETE("/organizations/{orgId}/agents/{agentId}/api-keys/{keyId}", { params: { path: { orgId, agentId, keyId } } }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.apiKeys(orgId, agentId) }),
  });
}

// ---------- progress updates and links ----------

export function useProgress(orgId: string, issueId: string) {
  return useQuery({
    queryKey: keys.progress(orgId, issueId),
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/issues/{issueRef}/progress", {
          params: { path: { orgId, issueRef: issueId }, query: { limit: 100 } },
        }),
      ),
    // Agents post while the peek is open.
    refetchInterval: 5000,
  });
}

export function useLinks(orgId: string, issueId: string) {
  return useQuery({
    queryKey: keys.links(orgId, issueId),
    queryFn: () =>
      unwrap(api.GET("/organizations/{orgId}/issues/{issueRef}/links", { params: { path: { orgId, issueRef: issueId } } })),
  });
}

export function useAddLink(orgId: string, issueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: WebLink) =>
      unwrap(api.POST("/organizations/{orgId}/issues/{issueRef}/links", { params: { path: { orgId, issueRef: issueId } }, body })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.links(orgId, issueId) }),
  });
}

export function useRemoveLink(orgId: string, issueId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) =>
      unwrap(
        api.DELETE("/organizations/{orgId}/issues/{issueRef}/links/{linkId}", {
          params: { path: { orgId, issueRef: issueId, linkId } },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.links(orgId, issueId) }),
  });
}

// ---------- webhooks (ADR 0022) ----------

export function useWebhooks(orgId: string, enabled = true) {
  return useQuery({
    queryKey: keys.webhooks(orgId),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/webhooks", org(orgId))),
    enabled,
  });
}

function useWebhooksChanged(orgId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.webhooks(orgId) });
    void client.invalidateQueries({ queryKey: keys.agents(orgId) });
  };
}

export function useCreateWebhook(orgId: string) {
  const changed = useWebhooksChanged(orgId);
  return useMutation({
    mutationFn: (body: { url: string; agentId: string | null; eventTypes: string[] }) =>
      unwrap(api.POST("/organizations/{orgId}/webhooks", { ...org(orgId), body })),
    onSuccess: changed,
  });
}

export function useUpdateWebhook(orgId: string) {
  const changed = useWebhooksChanged(orgId);
  return useMutation({
    mutationFn: ({ webhook, changes }: { webhook: Webhook; changes: { url?: string; eventTypes?: string[]; enabled?: boolean } }) =>
      unwrap(
        api.PATCH("/organizations/{orgId}/webhooks/{webhookId}", {
          params: { path: { orgId, webhookId: webhook.id } },
          body: { version: webhook.version, ...changes },
        }),
      ),
    onSuccess: changed,
  });
}

export function useDeleteWebhook(orgId: string) {
  const changed = useWebhooksChanged(orgId);
  return useMutation({
    mutationFn: (webhookId: string) =>
      unwrap(api.DELETE("/organizations/{orgId}/webhooks/{webhookId}", { params: { path: { orgId, webhookId } } })),
    onSuccess: changed,
  });
}

export function useRotateWebhookSecret(orgId: string) {
  return useMutation({
    mutationFn: (webhookId: string) =>
      unwrap(api.POST("/organizations/{orgId}/webhooks/{webhookId}/rotate-secret", { params: { path: { orgId, webhookId } } })),
  });
}

export function useDeliveries(orgId: string, webhookId: string) {
  return useQuery({
    queryKey: keys.deliveries(orgId, webhookId),
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/webhooks/{webhookId}/deliveries", {
          params: { path: { orgId, webhookId }, query: { limit: 50 } },
        }),
      ),
    refetchInterval: 5000,
  });
}

export function useRedeliver(orgId: string, webhookId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (deliveryId: string) =>
      unwrap(
        api.POST("/organizations/{orgId}/webhooks/{webhookId}/deliveries/{deliveryId}/redeliver", {
          params: { path: { orgId, webhookId, deliveryId } },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.deliveries(orgId, webhookId) }),
  });
}

// The organization an MCP client being connected joins (ADR 0021).
export function useChooseConnectionOrganization() {
  return useMutation({
    mutationFn: (orgId: string) => unwrap(api.POST("/oauth/organization", { body: { orgId } })),
  });
}

// An agent's open queue: issues delegated to it, most pressing first.
export function useAgentQueue(orgId: string, agentId: string) {
  return useQuery({
    queryKey: ["org", orgId, "agents", agentId, "queue"] as const,
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/issues", {
          params: { path: { orgId }, query: { delegateId: agentId, include: "open", limit: 5 } },
        }),
      ),
    refetchInterval: 15_000,
  });
}

// ---------- saved views (ADR 0023) ----------

export function useSavedViews(orgId: string, teamId: string, enabled = true) {
  return useQuery({
    queryKey: keys.savedViews(orgId, teamId),
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/teams/{teamId}/saved-views", { params: { path: { orgId, teamId } } }),
      ),
    enabled,
  });
}

export function useCreateSavedView(orgId: string, teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; query: SavedViewQuery }) =>
      unwrap(
        api.POST("/organizations/{orgId}/teams/{teamId}/saved-views", { params: { path: { orgId, teamId } }, body }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.savedViews(orgId, teamId) }),
  });
}

export function useUpdateSavedView(orgId: string, teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ view, changes }: { view: SavedView; changes: { name?: string; query?: SavedViewQuery } }) =>
      unwrap(
        api.PATCH("/organizations/{orgId}/teams/{teamId}/saved-views/{savedViewId}", {
          params: { path: { orgId, teamId, savedViewId: view.id } },
          body: { version: view.version, ...changes },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.savedViews(orgId, teamId) }),
  });
}

export function useDeleteSavedView(orgId: string, teamId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (savedViewId: string) =>
      unwrap(
        api.DELETE("/organizations/{orgId}/teams/{teamId}/saved-views/{savedViewId}", {
          params: { path: { orgId, teamId, savedViewId } },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.savedViews(orgId, teamId) }),
  });
}

// ---------- projects (Milestone 5) ----------

export function useProjects(orgId: string) {
  return useQuery({
    queryKey: keys.projects(orgId),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/projects", org(orgId))),
  });
}

export function useProject(orgId: string, projectRef: string | null | undefined) {
  return useQuery({
    queryKey: keys.project(orgId, projectRef ?? ""),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/projects/{projectRef}", { params: { path: { orgId, projectRef: projectRef! } } })),
    enabled: Boolean(projectRef),
  });
}

export function useProjectIssues(orgId: string, projectRef: string | null | undefined) {
  return useQuery({
    queryKey: keys.projectIssues(orgId, projectRef ?? ""),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/projects/{projectRef}/issues", { params: { path: { orgId, projectRef: projectRef! } } })),
    enabled: Boolean(projectRef),
  });
}

type CreateProjectBody = NonNullable<paths["/organizations/{orgId}/projects"]["post"]["requestBody"]>["content"]["application/json"];

export function useCreateProject(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CreateProjectBody> & { name: string }) =>
      unwrap(
        api.POST("/organizations/{orgId}/projects", {
          ...org(orgId),
          body: {
            description: "",
            leadId: null,
            startDate: null,
            targetDate: null,
            ...body,
          },
        }),
      ),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.projects(orgId) }),
  });
}

export function useUpdateProject(orgId: string, projectRef: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { version: number; name?: string; description?: string; status?: ProjectStatus; leadId?: string | null; startDate?: string | null; targetDate?: string | null }) =>
      unwrap(api.PATCH("/organizations/{orgId}/projects/{projectRef}", { params: { path: { orgId, projectRef } }, body })),
    onSuccess: (updated) => {
      client.setQueryData(keys.project(orgId, projectRef), updated);
      client.setQueryData(keys.project(orgId, updated.id), updated);
      client.setQueryData(keys.project(orgId, updated.slug), updated);
      void client.invalidateQueries({ queryKey: keys.projects(orgId) });
    },
  });
}

export function useDeleteProject(orgId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (projectRef: string) =>
      unwrap(api.DELETE("/organizations/{orgId}/projects/{projectRef}", { params: { path: { orgId, projectRef } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.projects(orgId) }),
  });
}

export function useMyWork(orgId: string, include: "open" | "all" = "open") {
  return useQuery({
    queryKey: keys.myWork(orgId, include),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/my-work", { params: { path: { orgId }, query: { include } } })),
  });
}

// ---------- inbox ----------

export function useInbox(orgId: string, filter: "unread" | "all") {
  return useQuery({
    queryKey: keys.inbox(orgId, filter),
    queryFn: () =>
      unwrap(
        api.GET("/organizations/{orgId}/inbox", { params: { path: { orgId }, query: { filter } } }),
      ),
  });
}

export function useInboxUnreadCount(orgId: string) {
  return useQuery({
    queryKey: keys.inboxUnread(orgId),
    queryFn: () => unwrap(api.GET("/organizations/{orgId}/inbox/unread-count", org(orgId))),
    refetchInterval: 15_000,
  });
}

// Both lists and the badge change on the same action.
function useInboxChanged(orgId: string) {
  const client = useQueryClient();
  return () => {
    void client.invalidateQueries({ queryKey: keys.inbox(orgId, "unread") });
    void client.invalidateQueries({ queryKey: keys.inbox(orgId, "all") });
    void client.invalidateQueries({ queryKey: keys.inboxUnread(orgId) });
  };
}

export function useMarkInboxItem(orgId: string) {
  const client = useQueryClient();
  const changed = useInboxChanged(orgId);
  return useMutation({
    mutationFn: ({ itemId, read }: { itemId: string; read: boolean }) =>
      unwrap(
        api.PATCH("/organizations/{orgId}/inbox/{itemId}", {
          params: { path: { orgId, itemId } },
          body: { read },
        }),
      ),
    onSettled: changed,
    // Opening an issue from a row reads instantly even if the request is slow.
    onMutate: ({ itemId, read }) => {
      for (const filter of ["unread", "all"] as const) {
        client.setQueryData(keys.inbox(orgId, filter), (list: InboxItem[] | undefined) =>
          list?.map((item) =>
            item.id === itemId ? { ...item, readAt: read ? (item.readAt ?? new Date().toISOString()) : null } : item,
          ),
        );
      }
    },
  });
}

export function useMarkAllInboxRead(orgId: string) {
  const client = useQueryClient();
  const changed = useInboxChanged(orgId);
  return useMutation({
    mutationFn: () => unwrap(api.POST("/organizations/{orgId}/inbox/read-all", org(orgId))),
    onSettled: changed,
    onMutate: () => {
      client.setQueryData(keys.inbox(orgId, "unread"), []);
      client.setQueryData(keys.inbox(orgId, "all"), (list: InboxItem[] | undefined) =>
        list?.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
      );
    },
  });
}
