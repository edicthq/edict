import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "./cn.js";

// Focus is a firmer edge and a soft halo, not the 2px outline: a field you
// type in is focused for long, and a hard ring there shouts.
const control =
  "w-full rounded-sm bg-surface px-3 text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] " +
  "placeholder:text-ink-2 transition-[box-shadow] duration-(--duration-fast) ease-standard " +
  "hover:shadow-[inset_0_0_0_1px_var(--ink-3)] focus-visible:outline-none " +
  "focus:shadow-[inset_0_0_0_1px_var(--ink-2),0_0_0_3px_var(--focus-soft)] " +
  "aria-[invalid=true]:shadow-[inset_0_0_0_1px_var(--ink)] " +
  // 16px on small screens so iOS does not zoom into the field.
  "h-10 text-lg sm:h-9 sm:text-body";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} className={cn(control, className)} {...props} />;
});

// A password field with a button that shows what was typed. The button keeps
// focus in the field, so the caret stays where it was.
export const PasswordInput = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "type">>(
  function PasswordInput({ className, ...props }, ref) {
    const [shown, setShown] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={shown ? "text" : "password"}
          // Edge draws its own reveal button; this one replaces it.
          className={cn(control, "pe-10 [&::-ms-reveal]:hidden", className)}
          {...props}
        />
        <button
          type="button"
          aria-label={shown ? "Hide password" : "Show password"}
          title={shown ? "Hide password" : "Show password"}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setShown((value) => !value)}
          className={cn(
            "absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-e-sm text-ink-2",
            "transition-colors duration-(--duration-fast) ease-standard hover:text-ink",
            "focus-visible:outline-none focus-visible:text-ink focus-visible:shadow-[0_0_0_2px_var(--focus-soft)]",
          )}
        >
          <EyeIcon crossed={shown} />
        </button>
      </div>
    );
  },
);

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {crossed ? (
        <>
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c4.5 0 8.3 3 9.94 6.66a1 1 0 0 1 0 .68 13.5 13.5 0 0 1-1.67 2.68" />
          <path d="M14.08 14.16a3 3 0 0 1-4.24-4.24" />
          <path d="M17.48 17.5A10.75 10.75 0 0 1 2.06 12.35a1 1 0 0 1 0-.7 13.6 13.6 0 0 1 4.45-5.15" />
          <path d="m2 2 20 20" />
        </>
      ) : (
        <>
          <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
          <circle cx="12" cy="12" r="3" />
        </>
      )}
    </svg>
  );
}

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
