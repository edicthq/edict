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
  // An agent went over a rate limit; Retry-After says when to try again.
  "rate_limited",
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

// The agent color presets (docs/design/tokens.md). A member picks one; an
// organization sets the one new members start from.
export const Accent = z.enum(["violet", "blue", "teal", "pink", "lime"]).meta({ id: "Accent" });
export type Accent = z.infer<typeof Accent>;

export const Organization = z
  .object({
    id: Id,
    name: z.string(),
    slug: OrganizationSlug,
    // Anyone with a verified address at this domain may join as a Member.
    // Null: people join by invite only.
    joinDomain: z.string().nullable(),
    defaultAccent: Accent,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Organization" });
export type Organization = z.infer<typeof Organization>;

// A domain like acme.com, stored lowercase.
export const EmailDomain = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "A domain like acme.com");

export const UpdateOrganization = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    joinDomain: EmailDomain.nullable().optional(),
    defaultAccent: Accent.optional(),
  })
  .meta({ id: "UpdateOrganization" });

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
    // Whether the agent has an active webhook, which wakes its agent runner
    // when work is delegated to it. Without one it picks work up when asked.
    webhook: z.boolean(),
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

const WebhookUrl = z.url({ protocol: /^https?$/ }).max(2000);
const EventTypes = z.array(z.string().regex(/^[a-z_]+\.[a-z_]+$/, "an event type, like issue.updated")).max(50);

// ADR 0022.
export const Webhook = z
  .object({
    id: Id,
    url: z.string(),
    // An agent's webhook also gets every event about issues delegated to it.
    agentId: Id.nullable(),
    // Empty sends every type.
    eventTypes: z.array(z.string()),
    // Set when deliveries ran out of retries or the agent was paused.
    disabledAt: z.iso.datetime().nullable(),
    disabledReason: z.string().nullable(),
    version: Version,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Webhook" });
export type Webhook = z.infer<typeof Webhook>;

export const CreateWebhook = z
  .object({
    url: WebhookUrl,
    agentId: Id.nullable().default(null),
    eventTypes: EventTypes.default([]),
  })
  .meta({ id: "CreateWebhook" });

export const CreatedWebhook = z
  .object({
    webhook: Webhook,
    // Shown only here and when rotated. Verify Edict-Signature with it.
    secret: z.string(),
  })
  .meta({ id: "CreatedWebhook" });

export const UpdateWebhook = z
  .object({
    version: Version,
    url: WebhookUrl.optional(),
    eventTypes: EventTypes.optional(),
    // true turns a disabled webhook back on.
    enabled: z.boolean().optional(),
  })
  .meta({ id: "UpdateWebhook" });

export const WebhookDelivery = z
  .object({
    id: Id,
    webhookId: Id,
    eventId: Id,
    eventType: z.string(),
    redeliveryOf: Id.nullable(),
    status: z.enum(["pending", "delivered", "failed"]),
    requestBody: z.string(),
    attempts: z.number().int(),
    responseStatus: z.number().int().nullable(),
    responseBody: z.string().nullable(),
    durationMs: z.number().int().nullable(),
    lastAttemptAt: z.iso.datetime().nullable(),
    deliveredAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "WebhookDelivery" });
export type WebhookDelivery = z.infer<typeof WebhookDelivery>;

// The consent page's choice of organization for an MCP client being connected
// through OAuth (ADR 0021).
export const ConnectionOrganization = z.object({ orgId: Id }).meta({ id: "ConnectionOrganization" });

// ADR 0002, GLOSSARY.md
export const ProjectStatus = z
  .enum(["planned", "in_progress", "paused", "completed", "canceled"])
  .meta({ id: "ProjectStatus" });
export type ProjectStatus = z.infer<typeof ProjectStatus>;

export const ProjectSlug = z
  .string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,46}[a-z0-9])?$/, "1-48 lowercase letters, digits and dashes")
  .meta({ id: "ProjectSlug" });

export const ProjectRef = z.string().min(1).max(64).meta({
  description: "The project's id or slug",
});

export const ProjectProgress = z
  .object({
    total: z.number().int(),
    completed: z.number().int(),
    percentage: z.number().int().min(0).max(100),
    byCategory: z.object({
      backlog: z.number().int(),
      todo: z.number().int(),
      in_progress: z.number().int(),
      done: z.number().int(),
      canceled: z.number().int(),
    }),
    estimate: z.object({
      total: z.number().int(),
      completed: z.number().int(),
    }),
  })
  .meta({ id: "ProjectProgress" });
export type ProjectProgress = z.infer<typeof ProjectProgress>;

export const Project = z
  .object({
    id: Id,
    name: z.string(),
    slug: ProjectSlug,
    description: z.string(),
    status: ProjectStatus,
    leadId: Id.nullable(),
    startDate: z.iso.datetime().nullable(),
    targetDate: z.iso.datetime().nullable(),
    progress: ProjectProgress,
    version: Version,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Project" });
export type Project = z.infer<typeof Project>;

export const CreateProject = z
  .object({
    name: z.string().trim().min(1).max(80),
    slug: ProjectSlug.optional(),
    description: z.string().max(20_000).optional().default(""),
    status: ProjectStatus.optional().default("planned"),
    leadId: Id.nullable().optional().default(null),
    startDate: z.iso.datetime().nullable().optional().default(null),
    targetDate: z.iso.datetime().nullable().optional().default(null),
  })
  .meta({ id: "CreateProject" });
export type CreateProject = z.infer<typeof CreateProject>;

export const UpdateProject = z
  .object({
    version: Version,
    name: z.string().trim().min(1).max(80).optional(),
    slug: ProjectSlug.optional(),
    description: z.string().max(20_000).optional(),
    status: ProjectStatus.optional(),
    leadId: Id.nullable().optional(),
    startDate: z.iso.datetime().nullable().optional(),
    targetDate: z.iso.datetime().nullable().optional(),
  })
  .meta({ id: "UpdateProject" });
export type UpdateProject = z.infer<typeof UpdateProject>;

export const ProjectConflict = z
  .object({
    error: z.object({
      code: z.literal("conflict"),
      message: z.string(),
      fields: z.array(z.string()),
      current: Project,
    }),
  })
  .meta({ id: "ProjectConflict" });

export const TrashedProject = z
  .object({
    id: Id,
    name: z.string(),
    slug: ProjectSlug,
    deletedAt: z.iso.datetime(),
    deletedById: Id,
    changeId: Id,
  })
  .meta({ id: "TrashedProject" });
export type TrashedProject = z.infer<typeof TrashedProject>;

export const TeamKey = z
  .string()
  .regex(/^[A-Z][A-Z0-9]{1,6}$/, "2-7 uppercase letters and digits, starting with a letter");

export const Team = z
  .object({
    id: Id,
    name: z.string(),
    key: TeamKey,
    private: z.boolean(),
    // Closed issues archive this many days after closing; null keeps them
    // until someone archives them by hand.
    archiveAfterDays: z.number().int().nullable(),
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
    archiveAfterDays: z.number().int().min(1).max(3650).nullable().optional(),
  })
  .meta({ id: "UpdateTeam" });

// A team in the trash, with everything in it.
export const TrashedTeam = z
  .object({
    id: Id,
    name: z.string(),
    key: TeamKey,
    deletedAt: z.iso.datetime(),
    deletedById: Id,
    changeId: Id,
  })
  .meta({ id: "TrashedTeam" });
export type TrashedTeam = z.infer<typeof TrashedTeam>;

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
// open: anyone. invite_only: people with an invite. domain: people with an
// invite, or a verified address at one of the instance's sign-up domains.
export const SignUpMode = z.enum(["open", "invite_only", "domain"]).meta({ id: "SignUpMode" });
export type SignUpMode = z.infer<typeof SignUpMode>;

export const InstanceSettings = z
  .object({
    signUpMode: SignUpMode,
    // False until the first user signs up and becomes the instance admin.
    setUp: z.boolean(),
    // Whether the instance has email set up. Without it there is no email
    // verification or password reset, and invites are links to share by hand.
    sendsEmail: z.boolean(),
    // Domains the "domain" sign-up mode lets in, lowercase.
    signUpDomains: z.array(z.string()),
    // How people can sign in besides email and password, which is always on.
    signInMethods: z.object({
      // A link by email; on when the instance sends email.
      magicLink: z.boolean(),
      google: z.boolean(),
      github: z.boolean(),
      // A generic OpenID Connect provider, like Authentik or Keycloak, by the
      // name its sign-in button shows.
      oidc: z.object({ name: z.string() }).nullable(),
    }),
  })
  .meta({ id: "InstanceSettings" });

// How the instance is set up, for its admins.
export const InstanceStatus = z
  .object({
    email: z.object({ configured: z.boolean(), from: z.string().nullable() }),
    storage: z.object({
      kind: z.enum(["disk", "s3"]),
      // The directory, or the bucket and its endpoint.
      location: z.string(),
    }),
    version: z.string(),
  })
  .meta({ id: "InstanceStatus" });

export const InstanceUser = z
  .object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    emailVerified: z.boolean(),
    instanceAdmin: z.boolean(),
    // How many organizations they are a member of.
    organizations: z.number().int(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "InstanceUser" });

export const InstanceUsers = z
  .object({ users: z.array(InstanceUser), total: z.number().int() })
  .meta({ id: "InstanceUsers" });

export const UpdateInstanceSettings = z
  .object({ signUpMode: SignUpMode, signUpDomains: z.array(EmailDomain).max(50) })
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

export const ProgressState = z
  .enum(["working", "blocked", "needs_input", "done"])
  .meta({ id: "ProgressState", description: "working: under way. blocked: cannot go on. needs_input: waiting on a person. done: finished." });
export type ProgressState = z.infer<typeof ProgressState>;

export const WebLink = z
  .object({
    url: z.url({ protocol: /^https?$/ }).max(2000),
    title: z.string().trim().max(200).optional(),
  })
  .meta({ id: "WebLink" });

// A structured report an agent posts on an issue.
export const ProgressUpdate = z
  .object({
    id: Id,
    issueId: Id,
    agentId: Id,
    state: ProgressState,
    // Markdown.
    message: z.string(),
    links: z.array(WebLink),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "ProgressUpdate" });
export type ProgressUpdate = z.infer<typeof ProgressUpdate>;

export const PostProgress = z
  .object({
    state: ProgressState,
    message: z.string().trim().min(1).max(20_000),
    links: z.array(WebLink).max(10).default([]),
  })
  .meta({ id: "PostProgress" });

// A URL attached to an issue, such as a pull request.
export const Link = z
  .object({
    id: Id,
    issueId: Id,
    url: z.string(),
    title: z.string().nullable(),
    creatorId: Id,
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "Link" });
export type Link = z.infer<typeof Link>;

export const Issue = z
  .object({
    id: Id,
    // The current one. Old identifiers keep resolving to this issue.
    identifier: Identifier,
    number: z.number().int(),
    teamId: Id,
    projectId: Id.nullable(),
    title: z.string(),
    // Markdown.
    description: z.string(),
    statusId: Id,
    priority: Priority,
    estimate: z.number().int().nullable(),
    // The human who answers for the issue.
    assigneeId: Id.nullable(),
    // The agent doing the work. The assignee still answers for it.
    delegateId: Id.nullable(),
    // The delegate's or another agent's most recent progress update.
    latestProgress: z.union([ProgressUpdate, z.null()]),
    // Organization labels and labels of the issue's team.
    labelIds: z.array(Id),
    // Set on a sub-issue. The parent can be in any team.
    parentId: Id.nullable(),
    creatorId: Id,
    // When the issue last moved into Done or Canceled; null while open.
    closedAt: z.iso.datetime().nullable(),
    // Set while the issue is archived: out of active views, still found by
    // its identifier and by search.
    archivedAt: z.iso.datetime().nullable(),
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
    delegateId: Id.nullable().default(null),
    projectId: Id.nullable().optional(),
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
    // An agent who can see the issue's team.
    delegateId: Id.nullable().optional(),
    projectId: Id.nullable().optional(),
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

export const BulkIssueTarget = z
  .object({
    id: Id,
    version: Version,
  })
  .meta({ id: "BulkIssueTarget" });
export type BulkIssueTarget = z.infer<typeof BulkIssueTarget>;

export const BulkUpdateIssues = z
  .object({
    issues: z.array(BulkIssueTarget).min(1).max(100),
    statusId: Id.optional(),
    priority: Priority.optional(),
    assigneeId: Id.nullable().optional(),
    delegateId: Id.nullable().optional(),
    projectId: Id.nullable().optional(),
    labelIds: LabelIds.optional(),
    teamId: Id.optional(),
  })
  .meta({ id: "BulkUpdateIssues" });
export type BulkUpdateIssues = z.infer<typeof BulkUpdateIssues>;

export const BulkUpdateResult = z
  .object({
    updated: z.array(Issue),
  })
  .meta({ id: "BulkUpdateResult" });
export type BulkUpdateResult = z.infer<typeof BulkUpdateResult>;

export const BulkDeleteIssues = z
  .object({
    issueIds: z.array(Id).min(1).max(100),
  })
  .meta({ id: "BulkDeleteIssues" });
export type BulkDeleteIssues = z.infer<typeof BulkDeleteIssues>;


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

// ADR 0023. A saved view holds exactly the team page's URL view. The server
// stores and validates this query but never interprets it: the client code
// that applies the URL applies a view too.
export const SavedViewQuery = z
  .object({
    q: z.string().max(120).optional(),
    // Team-defined status names.
    statuses: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
    priorities: z.array(Priority).max(Priority.options.length).optional(),
    assignees: z.array(Id).max(20).optional(),
    labels: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    groupBy: z.enum(["status", "priority", "assignee"]).optional(),
    sortBy: z.enum(["priority", "updated", "created", "title"]).optional(),
    dir: z.enum(["asc", "desc"]).optional(),
  })
  .meta({ id: "SavedViewQuery" });
export type SavedViewQuery = z.infer<typeof SavedViewQuery>;

export const SavedView = z
  .object({
    id: Id,
    teamId: Id,
    memberId: Id,
    name: z.string(),
    query: SavedViewQuery,
    version: Version,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "SavedView" });
export type SavedView = z.infer<typeof SavedView>;

export const CreateSavedView = z
  .object({
    name: z.string().trim().min(1).max(80),
    query: SavedViewQuery,
  })
  .meta({ id: "CreateSavedView" });

export const UpdateSavedView = z
  .object({
    version: Version,
    name: z.string().trim().min(1).max(80).optional(),
    query: SavedViewQuery.optional(),
  })
  .meta({ id: "UpdateSavedView" });

// What an inbox item tells its recipient: an issue was assigned or delegated
// to them, moved by someone else, commented on, they were mentioned, an agent
// posted progress on their issue, or a webhook turned itself off (Admins).
export const InboxItemType = z
  .enum(["assigned", "delegated", "status_changed", "comment_created", "mentioned", "progress_posted", "webhook_disabled"])
  .meta({ id: "InboxItemType" });
export type InboxItemType = z.infer<typeof InboxItemType>;

export const InboxIssue = z
  .object({
    id: Id,
    identifier: Identifier,
    title: z.string(),
    teamId: Id,
  })
  .meta({ id: "InboxIssue" });
export type InboxIssue = z.infer<typeof InboxIssue>;

export const InboxItem = z
  .object({
    id: Id,
    type: InboxItemType,
    actor: Member.nullable(),
    // The issue it is about. Null only for webhook_disabled.
    issue: InboxIssue.nullable(),
    // The webhook that turned itself off, for webhook_disabled.
    webhook: z.object({ id: Id, url: z.string() }).nullable(),
    commentId: Id.nullable(),
    // For progress_posted: the state the agent reported.
    progressState: ProgressState.nullable(),
    readAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: "InboxItem" });
export type InboxItem = z.infer<typeof InboxItem>;

export const InboxSummary = z
  .object({
    unreadCount: z.number().int().min(0),
  })
  .meta({ id: "InboxSummary" });
export type InboxSummary = z.infer<typeof InboxSummary>;

export const UpdateInboxItem = z
  .object({
    read: z.boolean(),
  })
  .meta({ id: "UpdateInboxItem" });
export type UpdateInboxItem = z.infer<typeof UpdateInboxItem>;

export const Template = z
  .object({
    id: Id,
    teamId: Id,
    name: z.string(),
    title: z.string(),
    description: z.string(),
    labelIds: z.array(Id),
    version: Version,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: "Template" });
export type Template = z.infer<typeof Template>;

export const CreateTemplate = z
  .object({
    name: z.string().trim().min(1).max(80),
    title: z.string().trim().max(255).default(""),
    description: z.string().max(100_000).default(""),
    labelIds: z.array(Id).max(50).default([]),
  })
  .meta({ id: "CreateTemplate" });
export type CreateTemplate = z.infer<typeof CreateTemplate>;

export const UpdateTemplate = z
  .object({
    version: Version,
    name: z.string().trim().min(1).max(80).optional(),
    title: z.string().trim().max(255).optional(),
    description: z.string().max(100_000).optional(),
    labelIds: z.array(Id).max(50).optional(),
  })
  .meta({ id: "UpdateTemplate" });
export type UpdateTemplate = z.infer<typeof UpdateTemplate>;
