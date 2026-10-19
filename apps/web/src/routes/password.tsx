import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { Button, Field, Input } from "@edicthq/ui";
import { AuthShell, FormError } from "../components/shell.js";
import { authClient } from "../lib/auth.js";

const link = "font-medium text-ink underline decoration-line-strong underline-offset-4 hover:decoration-ink";

const EmailForm = z.object({ email: z.email("Enter your email address, like name@example.com.") });

export function ForgotPassword() {
  const [params] = useSearchParams();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(EmailForm), defaultValues: { email: params.get("email") ?? "" } });

  const onSubmit = form.handleSubmit(async ({ email }) => {
    setFailure(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    if (error) {
      setFailure(error.message ?? "Sending the link failed. Try again.");
      return;
    }
    setSentTo(email);
  });

  if (sentTo) {
    return (
      <AuthShell
        title="Check your email"
        lead={`If ${sentTo} signed up for Edict, a link to choose a new password is on its way. It works for one hour.`}
      >
        <Link to="/sign-in" className={`text-ui ${link}`}>
          Back to sign in
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Reset your password" lead="Enter your email and Edict sends you a link to choose a new password.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(control) => <Input {...control} type="email" autoComplete="email" autoFocus {...form.register("email")} />}
        </Field>
        <FormError message={failure} />
        <Button type="submit" variant="primary" size="lg" disabled={form.formState.isSubmitting} className="mt-2">
          {form.formState.isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>
      <p className="mt-8 text-ui text-ink-2">
        Remembered it?{" "}
        <Link to="/sign-in" className={link}>
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}

const PasswordForm = z.object({ password: z.string().min(8, "Choose a password with at least 8 characters.") });

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const [failure, setFailure] = useState<string | null>(null);
  const form = useForm({ resolver: zodResolver(PasswordForm), defaultValues: { password: "" } });

  if (!token || params.get("error")) {
    return (
      <AuthShell
        title="This reset link doesn't work"
        lead="It expired or was already used. Reset links work once, for one hour."
      >
        <Link to="/forgot-password" className={`text-ui ${link}`}>
          Send a new link
        </Link>
      </AuthShell>
    );
  }

  const onSubmit = form.handleSubmit(async ({ password }) => {
    setFailure(null);
    const { error } = await authClient.resetPassword({ newPassword: password, token });
    if (error) {
      setFailure(error.message ?? "Setting the password failed. Request a new link and try again.");
      return;
    }
    navigate("/sign-in?reset=1", { replace: true });
  });

  return (
    <AuthShell title="Choose a new password">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="New password" hint="At least 8 characters." error={form.formState.errors.password?.message}>
          {(control) => <Input {...control} type="password" autoComplete="new-password" autoFocus {...form.register("password")} />}
        </Field>
        <FormError message={failure} />
        <Button type="submit" variant="primary" size="lg" disabled={form.formState.isSubmitting} className="mt-2">
          {form.formState.isSubmitting ? "Saving…" : "Set password"}
        </Button>
      </form>
    </AuthShell>
  );
}
