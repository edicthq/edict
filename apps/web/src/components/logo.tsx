import { LogoMark, cn } from "@edicthq/ui";

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-body font-semibold tracking-[-0.01em] text-ink", className)}>
      <LogoMark />
      Edict
    </span>
  );
}
