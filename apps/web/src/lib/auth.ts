import { createAuthClient } from "better-auth/react";

// Sign-in, sign-up and sessions go to Better Auth at /api/auth, outside the
// versioned API.
export const authClient = createAuthClient();

export function useSession() {
  return authClient.useSession();
}
