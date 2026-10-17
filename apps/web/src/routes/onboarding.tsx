import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router";
import type { z } from "zod";
import { CreateOrganization } from "@edicthq/schema";
import { Button, Field, Input } from "@edicthq/ui";
import { AuthShell, FormError, Loading } from "../components/shell.js";
import { ApiFailure } from "../lib/api.js";
import { useCreateOrganization, useMemberships } from "../lib/queries.js";

// Home: the first organization the user belongs to, or onboarding.
export function Home() {
  const memberships = useMemberships();
  if (memberships.isPending) return <Loading />;
  const first = memberships.data?.[0];
  return <Navigate to={first ? `/${first.organization.slug}` : "/new"} replace />;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function NewOrganization() {
  const navigate = useNavigate();
  const create = useCreateOrganization();
  const [failure, setFailure] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const form = useForm<z.input<typeof CreateOrganization>>({
    resolver: zodResolver(CreateOrganization),
    defaultValues: { name: "", slug: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      const { organization } = await create.mutateAsync(values);
      navigate(`/${organization.slug}`, { replace: true });
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "conflict") {
        form.setError("slug", { message: "That URL is taken. Choose another." });
        return;
      }
      setFailure(error instanceof Error ? error.message : "Creating the organization failed.");
    }
  });

  const name = form.register("name", {
    onChange: (event: { target: { value: string } }) => {
      if (!slugTouched) form.setValue("slug", slugify(event.target.value));
    },
  });

  return (
    <AuthShell
      title="Create an organization"
      lead="An organization holds your teams, the people in them and the agents working with them. You can invite others next."
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Name" error={form.formState.errors.name?.message}>
          {(control) => <Input {...control} autoFocus autoComplete="organization" placeholder="Acme" {...name} />}
        </Field>
        <Field
          label="URL"
          hint="Lowercase letters, digits and dashes."
          error={form.formState.errors.slug && "Use 1–48 lowercase letters, digits and dashes."}
        >
          {(control) => (
            <div className="flex items-center rounded-sm bg-surface shadow-[inset_0_0_0_1px_var(--line-strong)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink has-[:focus-visible]:outline-solid">
              <span className="ps-3 text-body text-ink-2 select-none" aria-hidden="true">
                {window.location.host}/
              </span>
              <Input
                {...control}
                className="ps-0.5 shadow-none hover:shadow-none focus-visible:shadow-none focus-visible:outline-none"
                {...form.register("slug", { onChange: () => setSlugTouched(true) })}
              />
            </div>
          )}
        </Field>
        <FormError message={failure} />
        <Button type="submit" variant="primary" size="lg" disabled={form.formState.isSubmitting} className="mt-2">
          {form.formState.isSubmitting ? "Creating…" : "Create organization"}
        </Button>
      </form>
    </AuthShell>
  );
}
