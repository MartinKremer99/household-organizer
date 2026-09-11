import type { SelectHTMLAttributes } from "react";
import { FIELD_CONTROL_CLASS, FIELD_LABEL_CLASS } from "./field";

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  id: string;
};

export function Select({
  label,
  id,
  className = "",
  children,
  ...props
}: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <select
        id={id}
        className={`${FIELD_CONTROL_CLASS} ${className}`.trim()}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}
