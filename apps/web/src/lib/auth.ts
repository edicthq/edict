import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

// Sign-in, sign-up and sessions go to Better Auth at /api/auth, outside the
// versioned API. The OAuth provider's plugin carries an MCP client's pending
// authorization through sign-in, so it resumes afterwards (ADR 0021).
// Magic links and Google, GitHub or OpenID Connect sign-in work when the
// instance offers them (GET /api/v1/instance, signInMethods).
export const authClient = createAuthClient({ plugins: [oauthProviderClient(), magicLinkClient()] });

export function useSession() {
  return authClient.useSession();
}
