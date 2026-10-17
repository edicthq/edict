import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./cn.js";

type Variant = "primary" | "secondary" | "ghost";
type Size = "md" | "lg";

const variants: Record<Variant, string> = {
  // The one filled action on a screen. Ink, never the accent.
  primary: "bg-ink text-on-human hover:bg-ink/90",
  secondary: "bg-surface text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-hover",
  ghost: "text-ink-2 hover:bg-hover hover:text-ink",
};

const sizes: Record<Size, string> = {
  md: "h-8 px-3 text-ui",
  lg: "h-10 px-4 text-body",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium",
        "transition-[background-color,color,transform] duration-[140ms] ease-standard active:scale-[0.96]",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
});
