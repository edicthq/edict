import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Avatar, Badge, Button } from "@edicthq/ui";
import { AuthShell, FormError, Loading } from "../components/shell.js";
import { ApiFailure } from "../lib/api.js";
import { authClient, useSession } from "../lib/auth.js";
import { useAcceptInvite, useInstance, useInvitePreview } from "../lib/queries.js";
import { roleLabel } from "../lib/labels.js";

export function InvitePage() {
  const { token = "" } = useParams();
  const navigate = useNavigate();
  const preview = useInvitePreview(token);
  const session = useSession();
  const accept = useAcceptInvite(token);
  const instance = useInstance();
  const [resent, setResent] = useState(false);

  if (preview.isPending || session.isPending) return <Loading />;

  if (preview.isError) {
    const expired = preview.error instanceof ApiFailure && preview.error.code === "gone";
    return (
      <AuthShell
        title={expired ? "This invite has expired" : "This invite link doesn't work"}
        lead={
          expired
            ? "Invites last seven days. Ask the person who invited you for a new one."
            : "It was already used, revoked or replaced by a newer invite. Ask the person who invited you for a new link."
        }
      >
        <Link to="/" className="text-ui font-medium underline decoration-line-strong underline-offset-4">
          Go to Edict
        </Link>
      </AuthShell>
    );
  }

  const invite = preview.data;
  const user = session.data?.user;
  const params = new URLSearchParams({ invite: token, email: invite.email }).toString();
  const wrongUser = user && user.email.toLowerCase() !== invite.email;
  const needsVerification = user && !user.emailVerified && instance.data?.sendsEmail;

  return (
    <AuthShell title={`Join ${invite.organization.name}`}>
      <div className="flex items-center gap-3 border-y border-line py-4">
        <Avatar name={invite.invitedBy.name} size={32} />
        <p className="text-body text-pretty">
          <span className="font-semibold">{invite.invitedBy.name}</span> invited{" "}
          <span className="font-semibold">{invite.email}</span> to join as{" "}
          <Badge className="align-middle">{roleLabel[invite.role]}</Badge>
        </p>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        {!user ? (
          <>
            <Button variant="primary" size="lg" onClick={() => navigate(`/sign-up?${params}`)}>
              Create an account to join
            </Button>
            <Button variant="secondary" size="lg" onClick={() => navigate(`/sign-in?${params}`)}>
              Sign in as {invite.email}
            </Button>
          </>
        ) : wrongUser ? (
          <>
            <p className="text-ui text-ink-2 text-pretty">
              You're signed in as {user.email}. This invite is for {invite.email}, so sign out and continue with
              that address.
            </p>
            <Button
              variant="primary"
              size="lg"
              onClick={async () => {
                await authClient.signOut();
                navigate(`/sign-in?${params}`);
              }}
            >
              Sign out and continue
            </Button>
          </>
        ) : needsVerification ? (
          <>
            <p className="text-ui text-ink-2 text-pretty">
              Verify {invite.email} first: open the link in the email Edict sent you, then come back to join.
            </p>
            <Button
              variant="secondary"
              size="lg"
              disabled={resent}
              onClick={async () => {
                await authClient.sendVerificationEmail({ email: invite.email, callbackURL: `/invite/${token}` });
                setResent(true);
              }}
            >
              {resent ? "Sent. Check your inbox" : "Send the verification email again"}
            </Button>
          </>
        ) : (
          <>
            <FormError message={accept.error?.message} />
            <Button
              variant="primary"
              size="lg"
              disabled={accept.isPending}
              onClick={() =>
                accept.mutate(undefined, {
                  onSuccess: ({ organization }) => navigate(`/${organization.slug}`, { replace: true }),
                })
              }
            >
              {accept.isPending ? "Joining…" : `Join ${invite.organization.name}`}
            </Button>
          </>
        )}
      </div>
    </AuthShell>
  );
}
