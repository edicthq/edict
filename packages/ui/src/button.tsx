import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn.js";

type Variant = "primary" | "secondary" | "ghost";

// Sizes and fills from the C2 prototype: the one filled action is ink, 32 high;
// secondary is outlined; ghost is quiet and small. A disabled primary turns
// into a quiet surface rather than a faded ink slab, which reads as a bright
// block in dark.
const variants: Record<Variant, string> = {
  primary:
    "h-8 gap-2 px-3.5 font-semibold bg-ink text-on-human hover:bg-ink/88 has-[kbd]:pe-2 disabled:bg-hover disabled:text-ink-2",
  secondary:
    "h-[30px] gap-1.5 px-3 font-medium text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-hover has-[kbd]:pe-2 disabled:opacity-50",
  ghost: "h-[26px] gap-1.5 px-2 text-sm text-ink-2 hover:bg-hover hover:text-ink disabled:opacity-50",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  // "lg" for the single action of a sign-in style page.
  size?: "md" | "lg";
}

// A button's classes, for a link that looks like one.
export function buttonClass({ variant = "secondary", size = "md" }: { variant?: Variant; size?: "md" | "lg" } = {}): string {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-sm",
    "transition-[background-color,color,transform] duration-[140ms] ease-standard active:scale-[0.96]",
    "disabled:pointer-events-none",
    variants[variant],
    size === "lg" && "h-10 px-4 text-body",
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
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
        "inline-block min-w-[18px] rounded-xs bg-hover px-[5px] py-[3px] text-center font-sans text-[10px] leading-none font-medium text-ink-2",
        "in-[.bg-ink]:bg-on-human/18 in-[.bg-ink]:text-on-human",
        "in-[.bg-ink:disabled]:bg-line in-[.bg-ink:disabled]:text-ink-2",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
