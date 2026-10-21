import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "./cn.js";
import { Menu, type MenuItem } from "./menu.js";

// Form controls drawn in the tokens instead of the browser's: ink when on,
// hairlines when off, the soft focus halo. Each is still the native input,
// so labels, forms and keyboard work as they always do.

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

export const Checkbox = forwardRef<HTMLInputElement, InputProps>(function Checkbox({ className, ...props }, ref) {
  return (
    <span className={cn("relative inline-grid size-4 shrink-0 place-items-center", className)}>
      <input
        ref={ref}
        type="checkbox"
        className="peer size-4 cursor-pointer appearance-none rounded-xs bg-surface shadow-[inset_0_0_0_1px_var(--line-strong)] transition-[background-color,box-shadow] duration-(--duration-fast) ease-standard checked:bg-ink checked:shadow-none hover:shadow-[inset_0_0_0_1px_var(--ink-3)] checked:hover:shadow-none focus-visible:shadow-[inset_0_0_0_1px_var(--ink-2),0_0_0_3px_var(--focus-soft)] focus-visible:outline-none disabled:cursor-default disabled:opacity-50"
        {...props}
      />
      <svg
        viewBox="0 0 10 10"
        aria-hidden="true"
        className="pointer-events-none absolute size-2.5 scale-75 text-on-human opacity-0 transition-[opacity,transform] duration-(--duration-fast) ease-enter peer-checked:scale-100 peer-checked:opacity-100"
      >
        <path d="M2 5.2 4.1 7.2 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
});

export const Radio = forwardRef<HTMLInputElement, InputProps>(function Radio({ className, ...props }, ref) {
  return (
    <input
      ref={ref}
      type="radio"
      className={cn(
        "size-4 shrink-0 cursor-pointer appearance-none rounded-full bg-surface shadow-[inset_0_0_0_1px_var(--line-strong)] transition-[box-shadow] duration-(--duration-fast) ease-standard",
        "hover:shadow-[inset_0_0_0_1px_var(--ink-3)] checked:shadow-[inset_0_0_0_4.5px_var(--ink)] checked:hover:shadow-[inset_0_0_0_4.5px_var(--ink)]",
        "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-focus-soft disabled:cursor-default disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
});

// An on/off setting that applies at once, like the instance's update check.
export const Switch = forwardRef<HTMLInputElement, InputProps>(function Switch({ className, ...props }, ref) {
  return (
    <span className={cn("relative inline-flex h-[18px] w-[30px] shrink-0", className)}>
      <input
        ref={ref}
        type="checkbox"
        role="switch"
        aria-checked={props.checked ?? props.defaultChecked ?? false}
        className={cn(
          "peer absolute inset-0 cursor-pointer appearance-none rounded-full bg-line-strong transition-[background-color,box-shadow] duration-(--duration-fast) ease-standard checked:bg-ink disabled:cursor-default disabled:opacity-50",
          "focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_var(--focus-soft)]",
        )}
        {...props}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-[2px] left-[2px] size-[14px] rounded-full bg-surface shadow-[0_1px_2px_oklch(0_0_0/0.2)] transition-transform duration-(--duration-base) ease-enter peer-checked:translate-x-3 peer-checked:bg-on-human"
      />
    </span>
  );
});

// Picks one of a few values from the app's menu, where a native <select>
// would open the system's. The trigger shows the current value.
export function SelectMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  className,
  align = "start",
}: {
  // What it sets, for the menu and screen readers: "Role of Maya".
  label: string;
  value: T;
  options: MenuItem<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  className?: string;
  align?: "start" | "end";
}) {
  const current = options.find((option) => option.value === value);
  return (
    <Menu
      label={label}
      items={options}
      value={value}
      onSelect={onChange}
      filter={options.length > 7}
      align={align}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`${label}: ${current?.label ?? value}`}
          disabled={disabled}
          className={cn(
            "hover-fade inline-flex h-7 items-center gap-1.5 rounded-sm ps-2.5 pe-1.5 text-ui text-ink shadow-[inset_0_0_0_1px_var(--line-strong)] hover:bg-hover disabled:opacity-50",
            "aria-expanded:bg-hover",
            className,
          )}
        >
          {current?.icon}
          <span className="truncate">{current?.label ?? value}</span>
          <svg viewBox="0 0 12 12" aria-hidden="true" className="ms-auto size-3 shrink-0 text-ink-2">
            <path d="M3.5 4.75 6 2.5l2.5 2.25M3.5 7.25 6 9.5l2.5-2.25" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    />
  );
}
