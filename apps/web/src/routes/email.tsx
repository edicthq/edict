import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Button, buttonClass } from "@edicthq/ui";
import { ResendButton } from "../components/resend-button.js";
import { AuthShell } from "../components/shell.js";
import { AuthSkeleton } from "../components/skeletons.js";
import { authClient, useSession } from "../lib/auth.js";
import { safeNext, verifiedCallback } from "../lib/email-flow.js";

const link = "font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";

// After sign-up on an instance that sends email: the verification link is on
// its way. Verifying never blocks: they can go on into Edict right away.
export function CheckInbox() {
  const session = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const user = session.data?.user;
  if (!user || user.emailVerified) return <Navigate to={next} replace />;

  return (
    <AuthShell
      title="Check your inbox"
      lead={
        <>
          Edict sent a link to <span className="font-semibold text-ink">{user.email}</span>. Open it to verify your
          address.
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Button type="button" variant="primary" size="lg" onClick={() => navigate(next, { replace: true })}>
          Continue to Edict
        </Button>
        <ResendButton
          send={() => authClient.sendVerificationEmail({ email: user.email, callbackURL: verifiedCallback(next) })}
        />
      </div>
      <p className="mt-6 text-ui text-ink-2 text-pretty">
        You can use Edict before you verify. Accepting an invite waits until you do.
      </p>
    </AuthShell>
  );
}

// Where a verification link lands. Better Auth has verified the address and
// signed the person in, or sends ?error= when the link is spent or expired.
export function EmailVerified() {
  const session = useSession();
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  if (session.isPending) return <AuthSkeleton />;
  const user = session.data?.user;

  if (params.get("error")) {
    return (
      <AuthShell
        title="This verification link doesn't work"
        lead="It expired or was already used. Verification links work for one hour."
      >
        {user && !user.emailVerified ? (
          <ResendButton
            coolingFromStart={false}
            send={() => authClient.sendVerificationEmail({ email: user.email, callbackURL: verifiedCallback(next) })}
          />
        ) : (
          <Link to={user ? next : "/sign-in"} className={`text-ui ${link}`}>
            {user ? "Continue to Edict" : "Sign in"}
          </Link>
        )}
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Email verified"
      lead={
        user ? (
          <>
            <span className="font-semibold text-ink">{user.email}</span> is confirmed.
          </>
        ) : (
          "Your address is confirmed."
        )
      }
    >
      <div className="flex flex-col">
        <Link to={user ? next : "/sign-in"} className={buttonClass({ variant: "primary", size: "lg" })}>
          {user ? "Continue to Edict" : "Sign in"}
        </Link>
      </div>
    </AuthShell>
  );
}
