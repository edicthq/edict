import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "./cn.js";

const control =
  "w-full rounded-sm bg-surface px-3 text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] " +
  "placeholder:text-ink-2 transition-[box-shadow] duration-[140ms] ease-standard " +
  "hover:shadow-[inset_0_0_0_1px_var(--ink-3)] focus-visible:shadow-[inset_0_0_0_1px_var(--ink)] " +
  "aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--ink)] " +
  // 16px on small screens so iOS does not zoom into the field.
  "h-10 text-lg sm:h-9 sm:text-body";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, className)} {...props} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref,
) {
  return <select ref={ref} className={cn(control, "appearance-auto pe-2", className)} {...props} />;
});

export interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  // Renders the control with the ids the label, hint and error need.
  children: (control: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
  className?: string;
}

// A labelled control with an optional hint and an error that names the fix.
export function Field({ label, hint, error, children, className }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-semibold text-ink-2">
        {label}
      </label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error ? (
        <p id={hintId} className="text-sm text-ink-2 text-pretty">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-ink text-pretty">
          {error}
        </p>
      ) : null}
    </div>
  );
}
