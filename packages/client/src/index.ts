import createClient, { type ClientOptions } from "openapi-fetch";
import type { components, paths } from "./schema.js";

export type { components, paths } from "./schema.js";

type Schemas = components["schemas"];
export type Organization = Schemas["Organization"];
export type Accent = Schemas["Accent"];
export type Member = Schemas["Member"];
export type Membership = Schemas["Membership"];
export type Role = Schemas["Role"];
export type Project = Schemas["Project"];
export type ProjectStatus = Schemas["ProjectStatus"];
export type ProjectProgress = Schemas["ProjectProgress"];
export type ProjectConflict = Schemas["ProjectConflict"]["error"];
export type TrashedProject = Schemas["TrashedProject"];
export type TrashedTeam = Schemas["TrashedTeam"];
export type Team = Schemas["Team"];
export type TeamOverview = Schemas["TeamOverview"];
export type Invite = Schemas["Invite"];
export type CreatedInvite = Schemas["CreatedInvite"];
export type InvitePreview = Schemas["InvitePreview"];
export type Event = Schemas["Event"];
export type InstanceSettings = Schemas["InstanceSettings"];
export type InstanceStatus = Schemas["InstanceStatus"];
export type UpdateCheck = Schemas["UpdateCheck"];
export type Telemetry = Schemas["Telemetry"];
export type TelemetryPing = Schemas["TelemetryPing"];
export type SignUpMode = Schemas["SignUpMode"];
export type Status = Schemas["Status"];
export type StatusCategory = Schemas["StatusCategory"];
export type Issue = Schemas["Issue"];
export type Priority = Schemas["Priority"];
export type IssueConflict = Schemas["IssueConflict"]["error"];
export type Label = Schemas["Label"];
export type LinkedIssue = Schemas["LinkedIssue"];
export type Relation = Schemas["Relation"];
export type RelationType = Schemas["RelationType"];
export type Comment = Schemas["Comment"];
export type CommentConflict = Schemas["CommentConflict"]["error"];
export type Attachment = Schemas["Attachment"];
export type TrashedIssue = Schemas["TrashedIssue"];
export type UndoResult = Schemas["UndoResult"];
export type Agent = Schemas["Agent"];
export type AgentPower = Schemas["AgentPower"];
export type ApiKey = Schemas["ApiKey"];
export type CreatedApiKey = Schemas["CreatedApiKey"];
export type ProgressUpdate = Schemas["ProgressUpdate"];
export type ProgressState = Schemas["ProgressState"];
export type WebLink = Schemas["WebLink"];
export type Link = Schemas["Link"];
export type Webhook = Schemas["Webhook"];
export type CreatedWebhook = Schemas["CreatedWebhook"];
export type WebhookDelivery = Schemas["WebhookDelivery"];
export type SavedView = Schemas["SavedView"];
export type SavedViewQuery = Schemas["SavedViewQuery"];
export type ApiError = Schemas["Error"]["error"];

export type EdictClient = ReturnType<typeof createEdictClient>;

// A client for one Edict instance. baseUrl is the instance's URL; leave it
// empty in a browser served by the instance itself. Browser requests carry the
// session cookie.
export function createEdictClient(baseUrl = "", options: Omit<ClientOptions, "baseUrl"> = {}) {
  return createClient<paths>({
    baseUrl: `${baseUrl.replace(/\/$/, "")}/api/v1`,
    credentials: "include",
    ...options,
  });
}

export type InboxItem = Schemas["InboxItem"];
export type InboxItemType = Schemas["InboxItemType"];
export type InboxIssue = Schemas["InboxIssue"];
export type InboxSummary = Schemas["InboxSummary"];
export type UpdateInboxItem = Schemas["UpdateInboxItem"];
