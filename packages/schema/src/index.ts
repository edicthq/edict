import { z } from "zod";

// The source of truth for the /api/v1 contract (ADR 0010). The server turns
// these into OpenAPI; clients get types from that spec.

export const ErrorCode = z.enum([
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "gone",
  "invalid_request",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ErrorResponse = z
  .object({
    error: z.object({
      code: ErrorCode,
      message: z.string(),
    }),
  })
  .meta({ id: "Error" });

export const Id = z.uuid();

// Highest first. A member can do everything the roles below theirs can.
export const Role = z.enum(["owner", "admin", "member", "guest"]).meta({ id: "Role" });
export type Role = z.infer<typeof Role>;

export const MemberKind = z.enum(["human", "agent"]).meta({ id: "MemberKind" });
export type MemberKind = z.infer<typeof MemberKind>;

export const OrganizationSlug = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/, "1-48 lowercase letters, digits and dashes");

export const Organization = z
  .object({
    id: Id,
    name: z.string(),
    slug: OrganizationSlug,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Organization" });
export type Organization = z.infer<typeof Organization>;

export const CreateOrganization = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: OrganizationSlug,
  })
  .meta({ id: "CreateOrganization" });

export const Member = z
  .object({
    id: Id,
    kind: MemberKind,
    role: Role,
    name: z.string(),
    // Humans only. Agents have no sign-in identity.
    email: z.email().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Member" });
export type Member = z.infer<typeof Member>;

export const UpdateMember = z.object({ role: Role }).meta({ id: "UpdateMember" });

// An organization the caller belongs to, with the caller's member in it.
export const Membership = z
  .object({
    organization: Organization,
    member: Member,
  })
  .meta({ id: "Membership" });
export type Membership = z.infer<typeof Membership>;

export const TeamKey = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{1,6}$/, "2-7 uppercase letters and digits, starting with a letter");

export const Team = z
  .object({
    id: Id,
    name: z.string(),
    key: TeamKey,
    private: z.boolean(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Team" });
export type Team = z.infer<typeof Team>;

export const CreateTeam = z
  .object({
    name: z.string().trim().min(1).max(80),
    key: TeamKey,
    private: z.boolean().default(false),
  })
  .meta({ id: "CreateTeam" });

export const AddTeamMember = z.object({ memberId: Id }).meta({ id: "AddTeamMember" });

export const Invite = z
  .object({
    id: Id,
    email: z.email(),
    role: Role,
    teamIds: z.array(Id),
    invitedBy: Id,
    expiresAt: z.iso.datetime(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Invite" });
export type Invite = z.infer<typeof Invite>;

export const CreateInvite = z
  .object({
    email: z.email(),
    role: Role.default("member"),
    teamIds: z.array(Id).max(50).default([]),
  })
  .meta({ id: "CreateInvite" });

// Returned once, when the invite is made. Only a hash of the token is stored.
export const CreatedInvite = Invite.extend({
  url: z.url(),
  // Whether the link was emailed to the invitee. When false, share it by hand.
  emailSent: z.boolean(),
}).meta({ id: "CreatedInvite" });

// What the invite link shows before the invitee accepts.
export const InvitePreview = z
  .object({
    organization: z.object({ name: z.string(), slug: OrganizationSlug }),
    email: z.email(),
    role: Role,
    invitedBy: z.object({ name: z.string() }),
    expiresAt: z.iso.datetime(),
  })
  .meta({ id: "InvitePreview" });

export const Event = z
  .object({
    id: Id,
    type: z.string(),
    actorId: Id,
    onBehalfOfId: Id.nullable(),
    subjectId: Id,
    data: z.record(z.string(), z.unknown()),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Event" });
export type Event = z.infer<typeof Event>;

// Who can create a user on this instance: anyone, or only people with an open
// invite. The first user can always sign up.
export const SignUpMode = z.enum(["open", "invite_only"]).meta({ id: "SignUpMode" });
export type SignUpMode = z.infer<typeof SignUpMode>;

export const InstanceSettings = z
  .object({
    signUpMode: SignUpMode,
    // False until the first user signs up and becomes the instance admin.
    setUp: z.boolean(),
    // Whether the instance has email set up. Without it there is no email
    // verification or password reset, and invites are links to share by hand.
    sendsEmail: z.boolean(),
  })
  .meta({ id: "InstanceSettings" });

export const UpdateInstanceSettings = z
  .object({ signUpMode: SignUpMode })
  .partial()
  .meta({ id: "UpdateInstanceSettings" });
