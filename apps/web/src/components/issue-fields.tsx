import type { Agent, Label, Member, Priority, Status } from "@edicthq/client";
import { Avatar, LabelDot, LabelPill, Menu, PriorityIcon, StatusIcon, cn } from "@edicthq/ui";
import { CircleDashed, Hash, Tag } from "lucide-react";
import { connectionLine } from "../lib/agents.js";
import { categoryLabel, estimates, priorities, priorityLabel, statusFill } from "../lib/issues.js";

// The prototype's property chip: an outlined pill with an icon and a value.
export const chipClass =
  "inline-flex h-7 items-center gap-1.5 rounded-full ps-2 pe-2.5 text-ui font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] transition-[background-color] duration-[140ms] ease-standard hover:bg-hover";

type TriggerProps = {
  ref: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  "aria-haspopup": "listbox";
  "aria-expanded": boolean;
};

type Open = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom";
  trigger?: (props: TriggerProps) => React.ReactNode;
};

export function StatusPicker({
  statuses,
  value,
  onChange,
  trigger,
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
      trigger={trigger ?? ((props) => (
        <button type="button" {...props} className={chipClass} aria-label={`Status: ${current?.name ?? "none"}. Change status`}>
          {current ? <StatusIcon category={current.category} fill={statusFill(statuses, current)} /> : null}
          {current?.name ?? "Status"}
        </button>
      ))}
    />
  );
}

export function PriorityPicker({ value, onChange, trigger, ...open }: { value: Priority; onChange: (p: Priority) => void } & Open) {
  return (
    <Menu
      label="Set priority"
      value={value}
      onSelect={onChange}
      {...open}
      items={priorities.map((p) => ({ value: p, label: priorityLabel[p], icon: <PriorityIcon priority={p} /> }))}
      trigger={trigger ?? ((props) => (
        <button type="button" {...props} className={chipClass} aria-label={`Priority: ${priorityLabel[value]}. Set priority`}>
          <PriorityIcon priority={value} />
          {value === "none" ? "Priority" : priorityLabel[value]}
        </button>
      ))}
    />
  );
}

const nobody = "none";

export function AssigneePicker({
  members,
  value,
  onChange,
  trigger,
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
      trigger={trigger ?? ((props) => (
        <button
          type="button"
          {...props}
          className={chipClass}
          aria-label={`Assignee: ${current?.name ?? "nobody"}. Assign to`}
        >
          {current ? <Avatar name={current.name} size={18} /> : <NoAssignee />}
          {current?.name ?? "Assignee"}
        </button>
      ))}
    />
  );
}

// The agent doing the work (ADR 0008). Each option says how the agent
// connects and when it will start.
export function DelegatePicker({
  agents,
  members,
  value,
  onChange,
  trigger,
  ...open
}: { agents: Agent[]; members: Member[]; value: string | null; onChange: (agentId: string | null) => void } & Open) {
  const current = agents.find((a) => a.id === value);
  const available = agents.filter((a) => !a.pausedAt || a.id === value);
  return (
    <Menu
      label="Delegate to an agent"
      value={value ?? nobody}
      onSelect={(id) => onChange(id === nobody ? null : id)}
      {...open}
      items={[
        { value: nobody, label: "No delegate", icon: <NoAssignee /> },
        ...available.map((agent) => ({
          value: agent.id,
          label: agent.name,
          detail: connectionLine(agent, members),
          keywords: agent.clientName ?? "",
          icon: <Avatar name={agent.name} kind="agent" size={18} />,
        })),
      ]}
      trigger={trigger ?? ((props) => (
        <button
          type="button"
          {...props}
          className={cn(chipClass, current && "bg-agent-wash shadow-[inset_0_0_0_1px_var(--agent-edge)]", !current && "text-ink-2")}
          aria-label={`Delegate: ${current?.name ?? "none"}. Delegate to an agent`}
        >
          {current ? <Avatar name={current.name} kind="agent" size={18} /> : <NoAssignee />}
          {current?.name ?? "Delegate"}
        </button>
      ))}
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

// Labels as pills that open a multi-select menu; typing a new name offers to
// create a label for the team.
export function LabelPicker({
  labels,
  value,
  onChange,
  onCreate,
}: {
  labels: Label[];
  value: string[];
  onChange: (labelIds: string[]) => void;
  onCreate?: (name: string) => Promise<Label>;
}) {
  const chosen = labels.filter((label) => value.includes(label.id));
  return (
    <Menu
      label="Add labels"
      multiple
      values={value}
      onSelect={(id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])}
      onCreate={
        onCreate
          ? (name) => {
              void onCreate(name).then((label) => onChange([...value, label.id]));
            }
          : undefined
      }
      items={labels.map((label) => ({
        value: label.id,
        label: label.name,
        keywords: label.teamId ? "" : "organization",
        icon: <LabelDot hue={label.hue} />,
      }))}
      trigger={(props) =>
        chosen.length ? (
          <button
            type="button"
            {...props}
            aria-label={`Labels: ${chosen.map((l) => l.name).join(", ")}. Change labels`}
            className="inline-flex flex-wrap items-center gap-1 rounded-full hover:opacity-80"
          >
            {chosen.map((label) => (
              <LabelPill key={label.id} name={label.name} hue={label.hue} size="lg" />
            ))}
          </button>
        ) : (
          <button type="button" {...props} className={cn(chipClass, "text-ink-2")} aria-label="Labels: none. Add labels">
            <Tag aria-hidden="true" className="size-3.5" strokeWidth={2} />
            Labels
          </button>
        )
      }
    />
  );
}
