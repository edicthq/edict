import type { SignInProviders } from "../env.js";
import { DEFAULT_MAX_ATTACHMENT_BYTES } from "../env.js";
import { localDiskStorage } from "../storage.js";
import { agentRoutes } from "./agents.js";
import { attachmentRoutes, type AttachmentDeps } from "./attachments.js";
import { changeRoutes } from "./changes.js";
import { connectionRoutes } from "./connections.js";
import { commentRoutes } from "./comments.js";
import { identify, router } from "./context.js";
import { eventRoutes } from "./events.js";
import { exportRoutes } from "./export.js";
import { instanceRoutes } from "./instance.js";
import { inviteRoutes } from "./invites.js";
import { issueRoutes } from "./issues.js";
import { labelRoutes } from "./labels.js";
import { linkRoutes } from "./links.js";
import { organizationRoutes } from "./organizations.js";
import { progressRoutes } from "./progress.js";
import { projectRoutes } from "./projects.js";
import { relationRoutes } from "./relations.js";
import { savedViewRoutes } from "./saved-views.js";
import { searchRoutes } from "./search.js";
import { statusRoutes } from "./statuses.js";
import { teamRoutes } from "./teams.js";
import { templateRoutes } from "./templates.js";
import { trashRoutes } from "./trash.js";
import { webhookRoutes, type WebhookDeps } from "./webhooks.js";
import { inboxRoutes } from "./inbox.js";

export type { ApiDeps, SessionUser } from "./context.js";
export { fileRoutes, type AttachmentDeps } from "./attachments.js";
export { consentOrganization } from "./connections.js";

// The public API, mounted at /api/v1. Its OpenAPI document is served at
// /api/v1/openapi.json.
export function createApi(deps: AttachmentDeps & WebhookDeps & { signIn?: SignInProviders; releasesUrl?: string }) {
  const api = router();

  api.use(identify(deps));

  api.route("/", organizationRoutes(deps));
  api.route("/", teamRoutes(deps));
  api.route("/", statusRoutes(deps));
  api.route("/", projectRoutes(deps));
  api.route("/", issueRoutes(deps));
  api.route("/", progressRoutes(deps));
  api.route("/", linkRoutes(deps));
  api.route("/", searchRoutes(deps));
  api.route("/", attachmentRoutes(deps));
  api.route("/", commentRoutes(deps));
  api.route("/", trashRoutes(deps));
  api.route("/", changeRoutes(deps));
  api.route("/", labelRoutes(deps));
  api.route("/", relationRoutes(deps));
  api.route("/", agentRoutes(deps));
  api.route("/", connectionRoutes(deps));
  api.route("/", inviteRoutes(deps));
  api.route("/", eventRoutes(deps));
  api.route("/", webhookRoutes(deps));
  api.route("/", inboxRoutes(deps));
  api.route("/", savedViewRoutes(deps));
  api.route("/", templateRoutes(deps));
  api.route("/", exportRoutes(deps));
  api.route("/", instanceRoutes(deps));

  api.doc31("/openapi.json", documentConfig);

  return api;
}

const documentConfig = {
  openapi: "3.1.0",
  info: { title: "Edict API", version: "1" },
  servers: [{ url: "/api/v1" }],
};

// The document without a running server. Building routes touches no
// dependency, so stubs are enough. scripts/openapi.ts writes it to
// packages/client, which generates the typed client from it.
export function openApiDocument() {
  return createApi({
    db: undefined as never,
    getUser: async () => null,
    storage: localDiskStorage(""),
    maxAttachmentBytes: DEFAULT_MAX_ATTACHMENT_BYTES,
  }).getOpenAPI31Document(documentConfig);
}
