import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Role, SignUpMode } from "@edicthq/client";
import { api, unwrap } from "./api.js";

export const keys = {
  memberships: ["memberships"] as const,
  instance: ["instance"] as const,
  teams: (orgId: string) => ["org", orgId, "teams"] as const,
  teamMembers: (orgId: string, teamId: string) => ["org", orgId, "teams", teamId, "members"] as const,
  members: (orgId: string) => ["org", orgId, "members"] as const,
  invites: (orgId: string) => ["org", orgId, "invites"] as const,
  invite: (token: string) => ["invite", token] as const,
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
