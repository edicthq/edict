import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from "react-router";
import { AuthShell, Loading } from "./components/shell.js";
import { useSession } from "./lib/auth.js";
import { ApiFailure } from "./lib/api.js";
import { useInstance } from "./lib/queries.js";
import { SignIn, SignUp } from "./routes/auth.js";
import { InstancePage } from "./routes/instance.js";
import { InvitePage } from "./routes/invite.js";
import { MembersPage } from "./routes/members.js";
import { Home, NewOrganization } from "./routes/onboarding.js";
import { OrgLayout } from "./routes/org.js";
import { ForgotPassword, ResetPassword } from "./routes/password.js";
import { SettingsPage } from "./routes/settings.js";
import { TeamPage, TeamsPage } from "./routes/teams.js";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // A 4xx will not change on retry.
      retry: (count, error) => !(error instanceof ApiFailure && error.status < 500) && count < 2,
    },
  },
});

// Pages for signed-in users. Others go to sign-in, or to sign-up on a fresh instance.
function SignedIn() {
  const session = useSession();
  const instance = useInstance();
  if (session.isPending || (!session.data && instance.isPending)) return <Loading />;
  if (!session.data) {
    // A fresh instance has no one to sign in yet: its first visitor sets it up.
    return <Navigate to={instance.data?.setUp === false ? "/sign-up" : "/sign-in"} replace />;
  }
  return <Outlet />;
}

// Sign-in and sign-up, unless already signed in.
function SignedOut() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <Loading />;
  if (session.data && !new URLSearchParams(location.search).has("invite")) return <Navigate to="/" replace />;
  return <Outlet />;
}

function NotFound() {
  return (
    <AuthShell title="Page not found" lead="The address may be mistyped, or the page has moved.">
      <Link to="/" className="text-ui font-medium underline decoration-line-strong underline-offset-4">
        Go to Edict
      </Link>
    </AuthShell>
  );
}

const router = createBrowserRouter([
  {
    element: <SignedOut />,
    children: [
      { path: "/sign-in", element: <SignIn /> },
      { path: "/sign-up", element: <SignUp /> },
      { path: "/forgot-password", element: <ForgotPassword /> },
    ],
  },
  // Readable signed out: it offers sign-up or sign-in.
  { path: "/invite/:token", element: <InvitePage /> },
  { path: "/reset-password", element: <ResetPassword /> },
  {
    element: <SignedIn />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/new", element: <NewOrganization /> },
      {
        path: "/:slug",
        element: <OrgLayout />,
        children: [
          { index: true, element: <TeamsPage /> },
          { path: "teams/:teamId", element: <TeamPage /> },
          { path: "members", element: <MembersPage /> },
          { path: "settings", element: <SettingsPage /> },
          { path: "instance", element: <InstancePage /> },
        ],
      },
    ],
  },
  { path: "*", element: <NotFound /> },
]);

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
