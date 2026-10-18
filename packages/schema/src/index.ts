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
  // An upload is larger than ATTACHMENT_MAX_BYTES (ADR 0020).
  "too_large",
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

// ADR 0018. Every mutable resource carries one, and every update sends back the
// version it read.
export const Version = z.number().int().min(1);

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

// What agents cannot do until an admin grants it (ADR 0021).
export const AgentPower = z
  .enum(["delete", "settings", "members", "agents"])
  .meta({ id: "AgentPower", description: "delete: move things to the trash. settings: change teams, workflows, labels and the organization. members: invite and manage members. agents: create and manage agents." });
export type AgentPower = z.infer<typeof AgentPower>;

const AgentRole = z.enum(["member", "guest"]);

export const Agent = z
  .object({
    id: Id,
    name: z.string(),
    description: z.string(),
    // Member or Guest. A connected agent's team access is its human's.
    role: AgentRole,
    grants: z.array(AgentPower),
    // A connected agent's human (ADR 0015). Null for agents an admin created.
    connectedBy: Id.nullable(),
    // The MCP client a connected agent connected as, e.g. "Claude Code".
    clientName: z.string().nullable(),
    pausedAt: z.iso.datetime().nullable(),
    version: Version,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Agent" });
export type Agent = z.infer<typeof Agent>;

export const CreateAgent = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().max(2000).default(""),
    role: AgentRole.default("member"),
    teamIds: z.array(Id).max(50).default([]),
    grants: z.array(AgentPower).default([]),
  })
  .meta({ id: "CreateAgent" });

export const UpdateAgent = z
  .object({
    version: Version,
    name: z.string().trim().min(1).max(80).optional(),
    description: z.string().max(2000).optional(),
    role: AgentRole.optional(),
    grants: z.array(AgentPower).optional(),
  })
  .meta({ id: "UpdateAgent" });

export const ApiKey = z
  .object({
    id: Id,
    agentId: Id,
    name: z.string(),
    // The secret's first characters.
    prefix: z.string(),
    // The teams the key narrows the agent to. Null: all of the agent's teams.
    teamIds: z.array(Id).nullable(),
    createdAt: z.iso.datetime(),
    lastUsedAt: z.iso.datetime().nullable(),
  })
  .meta({ id: "ApiKey" });
export type ApiKey = z.infer<typeof ApiKey>;

export const CreateApiKey = z
  .object({
    name: z.string().trim().min(1).max(80),
    teamIds: z.array(Id).max(50).nullable().default(null),
  })
  .meta({ id: "CreateApiKey" });

export const CreatedApiKey = z
  .object({
    apiKey: ApiKey,
    // Shown only in this response. Send it as `Authorization: Bearer <secret>`.
    secret: z.string(),
  })
  .meta({ id: "CreatedApiKey" });

// The consent page's choice of organization for an MCP client being connected
// through OAuth (ADR 0021).
export const ConnectionOrganization = z.object({ orgId: Id }).meta({ id: "ConnectionOrganization" });

export const TeamKey = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{1,6}$/, "2-7 uppercase letters and digits, starting with a letter");

export const Team = z
  .object({
    id: Id,
    name: z.string(),
    key: TeamKey,
    private: z.boolean(),
    version: Version,
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

// A new key keeps the old one resolving in identifiers, and the old key stays
// reserved to this team.
export const UpdateTeam = z
  .object({
    version: Version,
    name: z.string().trim().min(1).max(80).optional(),
    key: TeamKey.optional(),
    private: z.boolean().optional(),
  })
  .meta({ id: "UpdateTeam" });

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
    // Shared by every event one change wrote. Undo works on changes.
    changeId: Id,
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

// The five fixed meanings every status maps to, in workflow order.
export const StatusCategory = z
  .enum(["backlog", "todo", "in_progress", "done", "canceled"])
  .meta({ id: "StatusCategory" });
export type StatusCategory = z.infer<typeof StatusCategory>;

const StatusName = z.string().trim().min(1).max(40);

export const Status = z
  .object({
    id: Id,
    teamId: Id,
    name: z.string(),
    category: StatusCategory,
    // Order within the category.
    position: z.number().int(),
    // Whether new issues start in this status. One per team.
    default: z.boolean(),
    version: Version,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Status" });
export type Status = z.infer<typeof Status>;

export const CreateStatus = z
  .object({
    name: StatusName,
    category: StatusCategory,
    // Defaults to after the category's last status.
    position: z.number().int().min(0).optional(),
  })
  .meta({ id: "CreateStatus" });

export const UpdateStatus = z
  .object({
    version: Version,
    name: StatusName.optional(),
    category: StatusCategory.optional(),
    position: z.number().int().min(0).optional(),
    // Makes this the team's status for new issues. To move the default, set it
    // on another status.
    default: z.literal(true).optional(),
  })
  .meta({ id: "UpdateStatus" });

export const Priority = z.enum(["none", "urgent", "high", "medium", "low"]).meta({ id: "Priority" });
export type Priority = z.infer<typeof Priority>;

// A team key and a number, like ENG-123.
export const Identifier = z.string().regex(/^[A-Z][A-Z0-9]{1,6}-[1-9][0-9]*$/);

// An issue's UUID or any identifier it has had, in any case.
export const IssueRef = z.string().min(1).max(64).meta({
  description: "The issue's id or any identifier it has had, like ENG-123",
});

const IssueTitle = z.string().trim().min(1).max(255);
const LabelIds = z.array(Id).max(50);
const Description = z.string().max(100_000);
const Estimate = z.number().int().min(0).max(1000);

export const Issue = z
  .object({
    id: Id,
    // The current one. Old identifiers keep resolving to this issue.
    identifier: Identifier,
    number: z.number().int(),
    teamId: Id,
    title: z.string(),
    // Markdown.
    description: z.string(),
    statusId: Id,
    priority: Priority,
    estimate: z.number().int().nullable(),
    // The human who answers for the issue.
    assigneeId: Id.nullable(),
    // Organization labels and labels of the issue's team.
    labelIds: z.array(Id),
    // Set on a sub-issue. The parent can be in any team.
    parentId: Id.nullable(),
    creatorId: Id,
    version: Version,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Issue" });
export type Issue = z.infer<typeof Issue>;

export const CreateIssue = z
  .object({
    title: IssueTitle,
    description: Description.default(""),
    // Defaults to the team's default status.
    statusId: Id.optional(),
    priority: Priority.default("none"),
    estimate: Estimate.nullable().default(null),
    assigneeId: Id.nullable().default(null),
    labelIds: LabelIds.default([]),
    parentId: Id.nullable().default(null),
  })
  .meta({ id: "CreateIssue" });

// Send only the fields to change, with the version the change started from.
export const UpdateIssue = z
  .object({
    version: Version,
    title: IssueTitle.optional(),
    description: Description.optional(),
    statusId: Id.optional(),
    priority: Priority.optional(),
    estimate: Estimate.nullable().optional(),
    assigneeId: Id.nullable().optional(),
    // Replaces the whole set.
    labelIds: LabelIds.optional(),
    parentId: Id.nullable().optional(),
    // Moves the issue to another team: it gets that team's next number, and its
    // old identifier keeps resolving. Its status maps to the status with the
    // same name there, or else the first one in the same category; send
    // statusId to choose. The old team's labels come off.
    teamId: Id.optional(),
  })
  .meta({ id: "UpdateIssue" });
export type UpdateIssue = z.infer<typeof UpdateIssue>;

// A stale update: fields it changes were changed after the version it sent.
// Re-read, then retry or merge.
export const IssueConflict = z
  .object({
    error: z.object({
      code: z.literal("conflict"),
      message: z.string(),
      fields: z.array(z.string()),
      current: Issue,
    }),
  })
  .meta({ id: "IssueConflict" });

const LabelName = z.string().trim().min(1).max(40);
// The label dot's hue on the color wheel.
const Hue = z.number().int().min(0).max(359);

export const Label = z
  .object({
    id: Id,
    name: z.string(),
    hue: Hue,
    // Null for an organization label, which every team can use.
    teamId: Id.nullable(),
    version: Version,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Label" });
export type Label = z.infer<typeof Label>;

export const CreateLabel = z
  .object({
    name: LabelName,
    // Picked from the name when left out.
    hue: Hue.optional(),
  })
  .meta({ id: "CreateLabel" });

export const UpdateLabel = z
  .object({ version: Version, name: LabelName.optional(), hue: Hue.optional() })
  .meta({ id: "UpdateLabel" });

// Another issue as a sub-issue or relation shows it: enough to draw a row.
export const LinkedIssue = z
  .object({
    id: Id,
    identifier: Identifier,
    title: z.string(),
    teamId: Id,
    status: z.object({ id: Id, name: z.string(), category: StatusCategory }),
    priority: Priority,
    assigneeId: Id.nullable(),
  })
  .meta({ id: "LinkedIssue" });
export type LinkedIssue = z.infer<typeof LinkedIssue>;

// Read from the issue in the path: "blocks" means it blocks the other issue,
// "blocked_by" that the other issue blocks it.
export const RelationType = z
  .enum(["blocks", "blocked_by", "related", "duplicate_of", "duplicated_by"])
  .meta({ id: "RelationType" });
export type RelationType = z.infer<typeof RelationType>;

export const Relation = z
  .object({
    id: Id,
    type: RelationType,
    issue: LinkedIssue,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Relation" });
export type Relation = z.infer<typeof Relation>;

export const CreateRelation = z
  .object({
    type: RelationType,
    // The other issue's id or identifier.
    issue: IssueRef,
  })
  .meta({ id: "CreateRelation" });

// A markdown comment on an issue (ADR 0009). Agents read and write it in
// markdown; the web shows it rendered.
const CommentBody = z.string().trim().min(1).max(10_000);

export const Comment = z
  .object({
    id: Id,
    issueId: Id,
    creatorId: Id,
    // Markdown (ADR 0009).
    body: z.string(),
    version: Version,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Comment" });
export type Comment = z.infer<typeof Comment>;

export const CreateComment = z.object({ body: CommentBody }).meta({ id: "CreateComment" });

// A comment compares the whole version (ADR 0018): it is small, and two people
// rarely edit one at once.
export const UpdateComment = z.object({ version: Version, body: CommentBody }).meta({ id: "UpdateComment" });

// A stale comment update. Re-read, then retry.
export const CommentConflict = z
  .object({
    error: z.object({
      code: z.literal("conflict"),
      message: z.string(),
      current: Comment,
    }),
  })
  .meta({ id: "CommentConflict" });

// An issue in the trash (ADR 0019). Restoring it, or undoing changeId, brings
// back everything that change trashed.
export const TrashedIssue = z
  .object({
    id: Id,
    identifier: Identifier,
    title: z.string(),
    teamId: Id,
    deletedAt: z.iso.datetime(),
    deletedById: Id,
    changeId: Id,
  })
  .meta({ id: "TrashedIssue" });
export type TrashedIssue = z.infer<typeof TrashedIssue>;

// What undoing a change did (ADR 0019): changeId is the new change, which
// can itself be undone to redo.
export const UndoResult = z.object({ changeId: Id, undoes: Id }).meta({ id: "UndoResult" });

// A file attached to an issue (ADR 0020). The bytes live outside Postgres,
// under the attachment's id; this row is what the data-access layer guards.
export const Attachment = z
  .object({
    id: Id,
    issueId: Id,
    name: z.string(),
    // The relative path descriptions and comments link to.
    path: z.string().startsWith("/files/"),
    contentType: z.string(),
    sizeBytes: z.number().int().positive(),
    creatorId: Id,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Attachment" });
export type Attachment = z.infer<typeof Attachment>;
