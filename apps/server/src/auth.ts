import { createHash } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin, genericOAuth, magicLink } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { count, eq } from "drizzle-orm";
import { schema, type Database } from "@edicthq/db";
import { magicLinkEmail, passwordResetEmail, verificationEmail, type Mailer } from "./email.js";
import type { SignInProviders } from "./env.js";
import { maySignUp } from "./instance.js";

export interface AuthConfig {
  secret: string;
  baseURL?: string;
  // See ServerConfig.trustedProxies. The server puts the socket address at the
  // end of X-Forwarded-For before Better Auth reads it (app.ts).
  trustedProxies?: string[];
  // On by default; tests that sign several people up from one address turn it
  // off.
  rateLimit?: boolean;
  // Google, GitHub and OpenID Connect sign-in, each when configured.
  signIn?: SignInProviders;
}

export type EdictAuth = ReturnType<typeof createAuth>;

// What MCP clients get from OAuth (ADR 0021). Neither prefix is stored: the
// provider strips it before hashing.
export const OAUTH_ACCESS_TOKEN_PREFIX = "edict_at_";
export const OAUTH_REFRESH_TOKEN_PREFIX = "edict_rt_";

// How OAuth tokens are stored, so the API finds one with a single lookup.
export function hashOAuthToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Reads the organization the signed-in user chose on the consent page, for
// the grant's reference. Returns undefined when it is not theirs.
export type ConsentOrganization = (userId: string, orgId: string | undefined) => Promise<string | undefined>;

// Without a mailer there is no email verification and no password reset: an
// instance admin sets a new password instead.
export function createAuth(
  config: AuthConfig,
  db: Database,
  mailer?: Mailer,
  consentOrganization: ConsentOrganization = async () => undefined,
) {
  return betterAuth({
    secret: config.secret,
    baseURL: config.baseURL,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      sendResetPassword: mailer
        ? async ({ user, url }) => mailer.send(passwordResetEmail({ to: user.email, url }))
        : undefined,
    },
    socialProviders: {
      ...(config.signIn?.google ? { google: config.signIn.google } : {}),
      ...(config.signIn?.github ? { github: config.signIn.github } : {}),
    },
    // Google and GitHub vouch for the addresses they report, so signing in
    // with one joins the user who already has that address.
    account: { accountLinking: { enabled: true, trustedProviders: ["google", "github"] } },
    emailVerification: mailer
      ? {
          sendOnSignUp: true,
          autoSignInAfterVerification: true,
          sendVerificationEmail: async ({ user, url }) => mailer.send(verificationEmail({ to: user.email, url })),
        }
      : undefined,
    // Better Auth turns the rate limiter on in production and off elsewhere;
    // tests may switch it off explicitly.
    ...(config.rateLimit === false ? { rateLimit: { enabled: false } } : {}),
    session: {
      additionalFields: {
        // The organization an MCP client being connected joins (ADR 0021).
        // Set by the API's consent step, read when the grant is recorded.
        oauthOrgId: { type: "string", required: false, input: false },
      },
    },
    plugins: [
      admin(),
      // A link by email, which also verifies the address. Without email, off.
      ...(mailer
        ? [magicLink({ sendMagicLink: async ({ email, url }) => mailer.send(magicLinkEmail({ to: email, url })) })]
        : []),
      ...(config.signIn?.oidc
        ? [
            genericOAuth({
              config: [
                {
                  providerId: "oidc",
                  name: config.signIn.oidc.name,
                  discoveryUrl: `${config.signIn.oidc.issuer.replace(/\/$/, "")}/.well-known/openid-configuration`,
                  clientId: config.signIn.oidc.clientId,
                  clientSecret: config.signIn.oidc.clientSecret,
                  scopes: ["openid", "email", "profile"],
                  pkce: true,
                },
              ],
            }),
          ]
        : []),
      oauthProvider({
        loginPage: "/sign-in",
        consentPage: "/oauth/consent",
        // MCP clients register themselves (RFC 7591) and use PKCE.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        clientRegistrationDefaultApplicationType: "infer",
        // Opaque tokens, so pausing an agent revokes them at once.
        disableJwtPlugin: true,
        storeTokens: { hash: hashOAuthToken },
        prefix: { opaqueAccessToken: OAUTH_ACCESS_TOKEN_PREFIX, refreshToken: OAUTH_REFRESH_TOKEN_PREFIX },
        // The /mcp resource is registered at boot when the public URL is
        // known, else on the first request that names it (mcp.ts).
        resources: config.baseURL ? [mcpResource(config.baseURL)] : [],
        enforcePerClientResources: false,
        // The consent page first asks which organization the client joins,
        // then continues here, then asks for consent.
        postLogin: {
          page: "/oauth/consent",
          shouldRedirect: async ({ user, session, isContinuation }) =>
            !isContinuation || !(await consentOrganization(user.id, session.oauthOrgId as string | undefined)),
          consentReferenceId: async ({ user, session }) => {
            const orgId = await consentOrganization(user.id, session.oauthOrgId as string | undefined);
            if (!orgId) {
              throw new APIError("BAD_REQUEST", {
                error: "invalid_request",
                error_description: "Choose an organization to connect on the consent page.",
              });
            }
            return orgId;
          },
        },
        ...(config.rateLimit === false
          ? {
              rateLimit: {
                token: false,
                authorize: false,
                introspect: false,
                revoke: false,
                register: false,
                userinfo: false,
              },
            }
          : {}),
      }),
    ],
    advanced: {
      ipAddress: {
        ipAddressHeaders: ["x-forwarded-for"],
        trustedProxies: config.trustedProxies ?? [],
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Runs for every way a user can be created, so the sign-up mode holds
          // for social and OIDC sign-in too once they arrive. An instance
          // admin creating a user directly is not signing up.
          before: async (user, ctx) => {
            if (ctx?.path === "/admin/create-user") {
              return;
            }
            if (!(await maySignUp(db, user.email))) {
              throw new APIError("FORBIDDEN", {
                message: "This instance is invite-only. Ask an admin for an invite.",
              });
            }
          },
          after: async (user) => {
            // The first user to sign up becomes the instance admin (see ADR 0014).
            const [row] = await db.select({ n: count() }).from(schema.user);
            if (row?.n === 1) {
              await db
                .update(schema.user)
                .set({ role: "admin" })
                .where(eq(schema.user.id, user.id));
            }
          },
        },
      },
    },
  });
}

// The resource identifier MCP clients ask tokens for (RFC 8707).
export function mcpResource(origin: string): string {
  return `${origin.replace(/\/$/, "")}/mcp`;
}
