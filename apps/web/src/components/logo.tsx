import { cn } from "@edicthq/ui";

// The mark is the product in two shapes: a human circle beside an agent's
// rounded square, the same shapes the avatars use.
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-lg font-semibold text-ink", className)}>
      <span aria-hidden="true" className="inline-flex items-center gap-[3px]">
        <span className="size-3.5 rounded-full bg-ink" />
        <span className="size-3.5 rounded-[4px] bg-agent" />
      </span>
      Edict
    </span>
  );
}
