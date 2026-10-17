import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Attachment, Comment, Issue, Label, paths, RelationType, Role, SignUpMode } from "@edicthq/client";
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

export function useTeamIssues(orgId: string, teamId: string) {
  return useQuery({
    queryKey: keys.issues(orgId, teamId),
    queryFn: () =>
      unwrap(api.GET("/organizations/{orgId}/teams/{teamId}/issues", { params: { path: { orgId, teamId } } })),
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
