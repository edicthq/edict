import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn.js";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

// Fills from the C2 prototype: the one filled action is ink; secondary is
// outlined; ghost is quiet. A disabled primary turns into a quiet surface
// rather than a faded ink slab, which reads as a bright block in dark.
const variants: Record<Variant, string> = {
  primary:
    "gap-2 px-3.5 font-semibold bg-ink text-on-human hover:bg-ink/88 has-[kbd]:pe-2 disabled:bg-hover disabled:text-ink-2",
  secondary:
    "gap-1.5 px-3 font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-hover has-[kbd]:pe-2 disabled:opacity-50",
  ghost: "gap-1.5 px-2 text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50",
};

// Height and type size come from the size alone, never the variant, so
// buttons side by side, like Cancel beside Create team, always match. A ghost
// button is small unless asked; the others are 32 high.
const sizes: Record<Size, string> = {
  sm: "h-[26px] text-sm",
  md: "h-8 text-ui",
  lg: "h-10 px-4 text-body",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  // "md" beside a primary button; "lg" for the single action of a sign-in
  // style page. Ghost buttons default to "sm", the rest to "md".
  size?: Size;
}

// A button's classes, for a link that looks like one.
export function buttonClass({ variant = "secondary", size }: { variant?: Variant; size?: Size } = {}): string {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-sm",
    "transition-[background-color,color,transform] duration-(--duration-fast) ease-standard active:scale-[0.96]",
    "disabled:pointer-events-none",
    variants[variant],
    sizes[size ?? (variant === "ghost" ? "sm" : "md")],
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size, className, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(buttonClass({ variant, size }), className)} {...props} />
  );
});

// A key hint. Inside a primary button it takes the button's colors.
export function Kbd({ className, children }: { className?: string; children: string }) {
  return (
    <kbd
      className={cn(
        // A touch screen has no keys to hint at.
        "inline-block min-w-[18px] rounded-xs bg-hover px-[5px] py-[3px] text-center font-sans text-[10px] leading-none font-medium text-ink-2 pointer-coarse:hidden",
        "in-[.bg-ink]:bg-on-human/18 in-[.bg-ink]:text-on-human",
        "in-[.bg-ink:disabled]:bg-line in-[.bg-ink:disabled]:text-ink-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
