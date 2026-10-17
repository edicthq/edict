import createClient, { type ClientOptions } from "openapi-fetch";
import type { components, paths } from "./schema.js";

export type { components, paths } from "./schema.js";

type Schemas = components["schemas"];
export type Organization = Schemas["Organization"];
export type Member = Schemas["Member"];
export type Membership = Schemas["Membership"];
export type Role = Schemas["Role"];
export type Team = Schemas["Team"];
export type Invite = Schemas["Invite"];
export type CreatedInvite = Schemas["CreatedInvite"];
export type InvitePreview = Schemas["InvitePreview"];
export type Event = Schemas["Event"];
export type InstanceSettings = Schemas["InstanceSettings"];
export type SignUpMode = Schemas["SignUpMode"];
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
