import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { Button, Field, Input } from "@edicthq/ui";
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
            <Input
              {...control}
              type="password"
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
      <p className="mt-8 text-ui text-ink-2">
        New here?{" "}
        <Link to={`/sign-up${query}`} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Create an account
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
  const firstUser = instance.data?.setUp === false;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    // With email set up, the verification link brings them back to where they
    // were going, such as the invite page.
    const { error } = await authClient.signUp.email({ ...values, callbackURL: next });
    if (error) {
      setFailure(error.message ?? "Creating your account failed. Try again.");
      return;
    }
    await queryClient.invalidateQueries({ queryKey: keys.instance });
    navigate(next, { replace: true });
  });

  return (
    <AuthShell
      title={firstUser ? "Set up Edict" : "Create your account"}
      lead={
        firstUser
          ? "You're the first person here, so your account becomes the instance admin. You'll create your organization next."
          : inviteOnly && !invite
            ? "This instance is invite-only. Use the email address your invite was sent to."
            : "Your account works across every organization on this instance."
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
          {(control) => <Input {...control} type="password" autoComplete="new-password" {...form.register("password")} />}
        </Field>
        <FormError message={failure} />
        <Button type="submit" variant="primary" size="lg" disabled={form.formState.isSubmitting} className="mt-2">
          {form.formState.isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
      <p className={firstUser ? "hidden" : "mt-8 text-ui text-ink-2"}>
        Already have an account?{" "}
        <Link to={`/sign-in${query}`} className="font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
