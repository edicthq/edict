import type { Role } from "@edicthq/client";

export const roleLabel: Record<Role, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
  guest: "Guest",
};

export const roleHint: Record<Role, string> = {
  owner: "Everything, including deleting the organization.",
  admin: "Manages members, teams, agents and settings.",
  member: "Works in every public team and their private ones.",
  guest: "Works only in the teams they're invited to.",
};

export const allRoles: Role[] = ["owner", "admin", "member", "guest"];

// Command-key label for this platform.
export const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl ";
