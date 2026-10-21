import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { CreatedInvite, Role } from "@edicthq/client";
import { z } from "zod";
import { Button, Checkbox, Dialog, Field, Input, SelectMenu } from "@edicthq/ui";
import { allRoles, roleHint, roleLabel } from "../lib/labels.js";
import { useCreateInvite, useTeams } from "../lib/queries.js";
import type { OrgContext } from "../routes/org.js";
import { FormError } from "./shell.js";

const InviteValues = z.object({
  email: z.email("Enter an email address, like name@example.com."),
  role: z.enum(["owner", "admin", "member", "guest"]),
  teamIds: z.array(z.string()),
});

export function InviteDialog({ context, open, onClose }: { context: OrgContext; open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={`Invite people to ${context.membership.organization.name}`}>
      <InviteForm context={context} onDone={onClose} />
    </Dialog>
  );
}

function InviteForm({ context, onDone }: { context: OrgContext; onDone: () => void }) {
  const teams = useTeams(context.orgId);
  const create = useCreateInvite(context.orgId);
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const form = useForm({
    resolver: zodResolver(InviteValues),
    defaultValues: { email: "", role: "member" as Role, teamIds: [] as string[] },
  });
  const role = form.watch("role");
  const roles = allRoles.filter((r) => context.membership.member.role === "owner" || r !== "owner");

  const onSubmit = form.handleSubmit(async (values) => {
    setCreated(null);
    try {
      setCreated(await create.mutateAsync(values));
      form.reset({ email: "", role: values.role, teamIds: [] });
    } catch {
      // Shown from create.error.
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
        <Field label="Email" error={form.formState.errors.email?.message}>
          {(control) => (
            <Input {...control} type="email" autoFocus autoComplete="off" placeholder="name@example.com" {...form.register("email")} />
          )}
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold text-ink-2">Role</span>
          <SelectMenu
            label="Role"
            value={role}
            onChange={(next: Role) => form.setValue("role", next)}
            options={roles.map((r) => ({ value: r, label: roleLabel[r] }))}
            className="h-10 w-full sm:h-9"
          />
        </div>
      </div>
      <p className="-mt-2 text-sm text-ink-2">{roleHint[role]}</p>
      {teams.data?.length ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-semibold text-ink-2">
            Teams to join{role === "guest" ? ", the only ones a guest sees" : ""}
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {teams.data.map((team) => (
              <label key={team.id} className="flex items-center gap-2 text-ui">
                <Checkbox value={team.id} {...form.register("teamIds")} />
                {team.name}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <FormError message={create.error?.message} />
      {created ? <InviteLink invite={created} /> : null}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" className="h-8 text-ui" onClick={onDone}>
          {created ? "Done" : "Cancel"}
        </Button>
        <Button type="submit" variant="primary" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Creating invite…" : created ? "Invite another" : "Create invite"}
        </Button>
      </div>
    </form>
  );
}

function InviteLink({ invite }: { invite: CreatedInvite }) {
  const [copied, setCopied] = useState(false);
  return (
    <div role="status" className="flex flex-col gap-2 rounded-md bg-bg p-3 shadow-[inset_0_0_0_1px_var(--line)]">
      <p className="text-ui text-pretty">
        {invite.emailSent ? (
          <>
            Invite emailed to <span className="font-semibold">{invite.email}</span>. You can also send them this link.
          </>
        ) : (
          <>
            This instance doesn't send email, so send <span className="font-semibold">{invite.email}</span> this link
            yourself.
          </>
        )}{" "}
        <span className="text-ink-2">It works once, for that address, for seven days.</span>
      </p>
      <div className="flex gap-2">
        <Input readOnly value={invite.url} className="text-ui sm:text-ui" onFocus={(e) => e.target.select()} aria-label="Invite link" />
        <Button
          className="h-9"
          onClick={async () => {
            await navigator.clipboard.writeText(invite.url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? <Check aria-hidden="true" className="size-3.5" strokeWidth={2} /> : <Copy aria-hidden="true" className="size-3.5" strokeWidth={1.75} />}
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    </div>
  );
}
