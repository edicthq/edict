import type { Member, Priority, Status } from "@edicthq/client";
import { Avatar, Menu, PriorityIcon, StatusIcon, cn } from "@edicthq/ui";
import { CircleDashed, Hash } from "lucide-react";
import { categoryLabel, estimates, priorities, priorityLabel, statusFill } from "../lib/issues.js";

// The prototype's property chip: an outlined pill with an icon and a value.
export const chipClass =
  "inline-flex h-7 items-center gap-1.5 rounded-full ps-2 pe-2.5 text-ui font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] transition-[background-color] duration-[140ms] ease-standard hover:bg-hover";

type Open = { open?: boolean; onOpenChange?: (open: boolean) => void };

export function StatusPicker({
  statuses,
  value,
  onChange,
  ...open
}: { statuses: Status[]; value: string; onChange: (statusId: string) => void } & Open) {
  const current = statuses.find((s) => s.id === value);
  return (
    <Menu
      label="Change status"
      value={value}
      onSelect={onChange}
      {...open}
      items={statuses.map((status) => ({
        value: status.id,
        label: status.name,
        keywords: categoryLabel[status.category],
        icon: <StatusIcon category={status.category} fill={statusFill(statuses, status)} />,
      }))}
      trigger={(props) => (
        <button type="button" {...props} className={chipClass} aria-label={`Status: ${current?.name ?? "none"}. Change status`}>
          {current ? <StatusIcon category={current.category} fill={statusFill(statuses, current)} /> : null}
          {current?.name ?? "Status"}
        </button>
      )}
    />
  );
}

export function PriorityPicker({ value, onChange, ...open }: { value: Priority; onChange: (p: Priority) => void } & Open) {
  return (
    <Menu
      label="Set priority"
      value={value}
      onSelect={onChange}
      {...open}
      items={priorities.map((p) => ({ value: p, label: priorityLabel[p], icon: <PriorityIcon priority={p} /> }))}
      trigger={(props) => (
        <button type="button" {...props} className={chipClass} aria-label={`Priority: ${priorityLabel[value]}. Set priority`}>
          <PriorityIcon priority={value} />
          {value === "none" ? "Priority" : priorityLabel[value]}
        </button>
      )}
    />
  );
}

const nobody = "none";

export function AssigneePicker({
  members,
  value,
  onChange,
  ...open
}: { members: Member[]; value: string | null; onChange: (memberId: string | null) => void } & Open) {
  const current = members.find((m) => m.id === value);
  return (
    <Menu
      label="Assign to"
      value={value ?? nobody}
      onSelect={(id) => onChange(id === nobody ? null : id)}
      {...open}
      items={[
        { value: nobody, label: "No assignee", icon: <NoAssignee /> },
        ...members.map((m) => ({ value: m.id, label: m.name, keywords: m.email ?? "", icon: <Avatar name={m.name} size={18} /> })),
      ]}
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={chipClass}
          aria-label={`Assignee: ${current?.name ?? "nobody"}. Assign to`}
        >
          {current ? <Avatar name={current.name} size={18} /> : <NoAssignee />}
          {current?.name ?? "Assignee"}
        </button>
      )}
    />
  );
}

export function EstimatePicker({ value, onChange }: { value: number | null; onChange: (estimate: number | null) => void }) {
  const options = value !== null && !estimates.includes(value) ? [...estimates, value].sort((a, b) => a - b) : estimates;
  return (
    <Menu
      label="Set estimate"
      value={value === null ? nobody : String(value)}
      onSelect={(v) => onChange(v === nobody ? null : Number(v))}
      items={[
        { value: nobody, label: "No estimate" },
        ...options.map((n) => ({ value: String(n), label: `${n} ${n === 1 ? "point" : "points"}` })),
      ]}
      trigger={(props) => (
        <button type="button" {...props} className={cn(chipClass, value === null && "text-ink-2")} aria-label={`Estimate: ${value ?? "none"}. Set estimate`}>
          <Hash aria-hidden="true" className="size-3.5 text-ink-2" strokeWidth={2} />
          {value === null ? "Estimate" : value}
        </button>
      )}
    />
  );
}

// The prototype's empty assignee: a dashed circle.
export function NoAssignee({ size = 18 }: { size?: 18 | 22 }) {
  return (
    <CircleDashed
      aria-hidden="true"
      className={cn("shrink-0 text-ink-3", size === 18 ? "size-[18px]" : "size-[22px]")}
      strokeWidth={1.5}
    />
  );
}
