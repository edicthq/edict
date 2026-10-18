import { oauthProviderClient } from "@better-auth/oauth-provider/client";
import { createAuthClient } from "better-auth/react";

// Sign-in, sign-up and sessions go to Better Auth at /api/auth, outside the
// versioned API. The OAuth provider's plugin carries an MCP client's pending
// authorization through sign-in, so it resumes afterwards (ADR 0021).
export const authClient = createAuthClient({ plugins: [oauthProviderClient()] });

export function useSession() {
  return authClient.useSession();
}
