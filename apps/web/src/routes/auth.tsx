import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { Button, Field, Input, PasswordInput } from "@edicthq/ui";
import { AuthShell, FormError } from "../components/shell.js";
import { authClient } from "../lib/auth.js";
import { keys, useInstance } from "../lib/queries.js";

// Where to go once signed in: back to the invite that sent them here, or home.
function useNext() {
  const [params] = useSearchParams();
  const invite = params.get("invite");
  return {
    invite,
    next: invite ? `/invite/${encodeURIComponent(invite)}` : "/",
    email: params.get("email") ?? "",
    query: params.toString() ? `?${params.toString()}` : "",
  };
}

const SignInForm = z.object({
  email: z.email("Enter your email address, like name@example.com."),
  password: z.string().min(1, "Enter your password."),
});

export function SignIn() {
  const navigate = useNavigate();
  const { next, email, query } = useNext();
  const instance = useInstance();
  const [params] = useSearchParams();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(SignInForm), defaultValues: { email, password: "" } });

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    const { error } = await authClient.signIn.email(values);
    if (error) {
      setFailure(
        error.status === 401
          ? "That email and password don't match. Check both and try again."
          : (error.message ?? "Signing in failed. Try again."),
      );
      return;
    }
    navigate(next, { replace: true });
  });

  return (
    <AuthShell
      title="Sign in to Edict"
      lead={params.get("reset") ? "Your password is changed. Sign in with the new one." : undefined}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(control) => (
            <Input {...control} type="email" autoComplete="email" autoFocus={!email} {...form.register("email")} />
          )}
        </Field>
        <Field
          label="Password"
          error={form.formState.errors.password?.message}
          hint={
            instance.data?.sendsEmail ? (
              <Link to="/forgot-password" className="underline decoration-line-strong underline-offset-4 hover:text-ink">
                Forgot password?
              </Link>
            ) : undefined
          }
        >
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="current-password"
              autoFocus={Boolean(email)}
              {...form.register("password")}
            />
          )}
        </Field>
        <FormError message={failure} />
        <Button type="submit" variant="primary" size="lg" disabled={form.formState.isSubmitting} className="mt-2">
          {form.formState.isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
      <OtherWays next={next} email={form.watch("email")} />
      <p className="mt-8 text-ui text-ink-2">
        New here?{" "}
        <Link to={`/sign-up${query}`} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}

const SignUpForm = z.object({
  name: z.string().trim().min(1, "Enter the name your team will see."),
  email: z.email("Enter your email address, like name@example.com."),
  password: z.string().min(8, "Choose a password with at least 8 characters."),
});

export function SignUp() {
  const navigate = useNavigate();
  const { invite, next, email, query } = useNext();
  const instance = useInstance();
  const queryClient = useQueryClient();
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(SignUpForm), defaultValues: { name: "", email, password: "" } });
  const inviteOnly = instance.data?.signUpMode === "invite_only";
  const domainOnly = instance.data?.signUpMode === "domain";
  const firstUser = instance.data?.setUp === false;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    // With email set up, the verification link brings them back to where they
    // were going, such as the invite page.
    const { error } = await authClient.signUp.email({ ...values, callbackURL: next });
    if (error) {
      setFailure(error.message ?? "Signing up failed. Try again.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: keys.instance });
    navigate(next, { replace: true });
  });

  return (
    <AuthShell
      title={firstUser ? "Set up Edict" : "Sign up for Edict"}
      lead={
        firstUser
          ? "You're the first person here, so you become the instance admin. You'll create your organization next."
          : inviteOnly && !invite
            ? "This instance is invite-only. Use the email address your invite was sent to."
            : domainOnly && !invite
              ? `Sign up with an address at ${instance.data?.signUpDomains.join(", ")}, or the one your invite was sent to. You'll verify it by email.`
              : "One sign-in works across every organization on this instance."
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Name" error={form.formState.errors.name?.message}>
          {(control) => <Input {...control} autoComplete="name" autoFocus {...form.register("name")} />}
        </Field>
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="email"
              placeholder="name@example.com"
              readOnly={Boolean(invite && email)}
              {...form.register("email")}
            />
          )}
        </Field>
        <Field label="Password" hint="At least 8 characters." error={form.formState.errors.password?.message}>
          {(control) => <PasswordInput {...control} autoComplete="new-password" {...form.register("password")} />}
        </Field>
        <FormError message={failure} />
        <Button type="submit" variant="primary" size="lg" disabled={form.formState.isSubmitting} className="mt-2">
          {form.formState.isSubmitting ? "Signing up…" : "Sign up"}
        </Button>
      </form>
      {firstUser ? null : <OtherWays next={next} />}
      <p className={firstUser ? "hidden" : "mt-8 text-ui text-ink-2"}>
        Already signed up?{" "}
        <Link to={`/sign-in${query}`} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

// Sign-in the instance offers besides a password: a link by email, Google,
// GitHub or an OpenID Connect provider. Each one also signs up someone new,
// within the instance's sign-up mode.
function OtherWays({ next, email }: { next: string; email?: string }) {
  const instance = useInstance();
  const [sent, setSent] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const methods = instance.data?.signInMethods;
  if (!methods || (!methods.magicLink && !methods.google && !methods.github && !methods.oidc)) return null;

  const social = async (provider: string) => {
    setFailure(null);
    const { error } = await authClient.signIn.social({ provider: provider as "google", callbackURL: next });
    if (error) setFailure(error.message ?? "That sign-in failed. Try again.");
  };
  const link = async () => {
    setFailure(null);
    const address = email?.trim();
    if (!address) return setFailure("Enter your email above, then ask for a link.");
    const { error } = await authClient.signIn.magicLink({ email: address, callbackURL: next });
    if (error) setFailure(error.message ?? "Sending the link failed. Try again.");
    else setSent(address);
  };

  return (
    <div className="mt-6 flex flex-col gap-2 border-t border-line pt-6">
      {methods.oidc ? (
        <Button type="button" size="lg" onClick={() => void social("oidc")}>
          Continue with {methods.oidc.name}
        </Button>
      ) : null}
      {methods.google ? (
        <Button type="button" size="lg" onClick={() => void social("google")}>
          Continue with Google
        </Button>
      ) : null}
      {methods.github ? (
        <Button type="button" size="lg" onClick={() => void social("github")}>
          Continue with GitHub
        </Button>
      ) : null}
      {methods.magicLink && email !== undefined ? (
        <Button type="button" variant="ghost" size="lg" onClick={() => void link()}>
          Email me a sign-in link
        </Button>
      ) : null}
      {sent ? <p className="text-ui text-ink-2">Check {sent} for a link. It works once, for five minutes.</p> : null}
      <FormError message={failure} />
    </div>
  );
}

