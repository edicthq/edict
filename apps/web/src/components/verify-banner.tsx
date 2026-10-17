import { useState } from "react";
import { Button } from "@edicthq/ui";
import { authClient, useSession } from "../lib/auth.js";
import { useInstance } from "../lib/queries.js";

// Shown until the signed-in person verifies their email, when the instance
// sends email. Verification is what lets them accept invites.
export function VerifyBanner() {
  const session = useSession();
  const instance = useInstance();
  const [sent, setSent] = useState(false);
  const user = session.data?.user;
  if (!user || user.emailVerified || !instance.data?.sendsEmail) return null;

  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-6 py-2 text-ui">
      <span className="text-pretty">
        Verify <span className="font-semibold">{user.email}</span>: open the link Edict emailed you.
      </span>
      <Button
        variant="ghost"
        className="ms-auto"
        disabled={sent}
        onClick={async () => {
          await authClient.sendVerificationEmail({ email: user.email, callbackURL: window.location.pathname });
          setSent(true);
        }}
      >
        {sent ? "Sent. Check your inbox" : "Send it again"}
      </Button>
    </div>
  );
}
