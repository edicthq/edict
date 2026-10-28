import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import type { z } from "zod";
import { CreateTeam } from "@edicthq/schema";
import { Button, Checkbox, Dialog, Field, Input } from "@edicthq/ui";
import { ApiFailure } from "../lib/api.js";
import { useCreateTeam } from "../lib/queries.js";
import type { OrgContext } from "../routes/org.js";
import { FormError } from "./shell.js";

// A first guess at a team key from its name: "Engineering" → "ENG",
// "Customer Success" → "CS".
export function suggestKey(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, "").split(/\s+/).filter(Boolean);
  const key = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] ?? "").slice(0, 3);
  return key.replace(/^[0-9]+/, "").slice(0, 7);
}

export function CreateTeamDialog({ context, open, onClose }: { context: OrgContext; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Create team">
      <CreateTeamForm context={context} onDone={onClose} />
    </Dialog>
  );
}

function CreateTeamForm({ context, onDone }: { context: OrgContext; onDone: () => void }) {
  const navigate = useNavigate();
  const create = useCreateTeam(context.orgId);
  const [failure, setFailure] = useState<string | null>(null);
  const [keyTouched, setKeyTouched] = useState(false);
  const form = useForm<z.input<typeof CreateTeam>, unknown, z.output<typeof CreateTeam>>({
    resolver: zodResolver(CreateTeam),
    defaultValues: { name: "", key: "", private: false },
  });
  const keyError = form.formState.errors.key?.message;

  const onSubmit = form.handleSubmit(async (values) => {
    setFailure(null);
    try {
      const team = await create.mutateAsync(values);
      onDone();
      navigate(`/${context.slug}/teams/${team.id}`);
    } catch (error) {
      if (error instanceof ApiFailure && error.code === "conflict") {
        form.setError("key", { message: "Another team uses this key. Choose a different one." });
        return;
      }
      setFailure(error instanceof Error ? error.message : "Creating the team failed.");
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-5">
      <p className="text-ui text-ink-2 text-pretty">
        A team owns its issues and gives them their identifier, like ENG-12.
      </p>
      <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
        <Field label="Name" error={form.formState.errors.name?.message}>
          {(control) => (
            <Input
              {...control}
              autoFocus
              placeholder="Engineering"
              {...form.register("name", {
                onChange: (event: { target: { value: string } }) => {
                  if (!keyTouched) form.setValue("key", suggestKey(event.target.value));
                },
              })}
            />
          )}
        </Field>
        <Field
          label="Key"
          error={keyError && (keyError.startsWith("Another") ? keyError : "Use 2–7 capital letters or digits, starting with a letter.")}
        >
          {(control) => (
            <Input
              {...control}
              className="uppercase"
              autoCapitalize="characters"
              maxLength={7}
              placeholder="ENG"
              {...form.register("key", {
                setValueAs: (value: string) => value.toUpperCase(),
                onChange: () => setKeyTouched(true),
              })}
            />
          )}
        </Field>
      </div>
      <label className="flex items-start gap-2 text-ui">
        <Checkbox className="mt-0.5" {...form.register("private")} />
        <span>
          <span className="font-medium">Private team</span>
          <span className="block text-ink-2">Only its members and admins can see it.</span>
        </span>
      </label>
      <FormError message={failure} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="md" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating…" : "Create team"}
        </Button>
      </div>
    </form>
  );
}
