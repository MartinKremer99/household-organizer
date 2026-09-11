import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

const VARIANT_CLASS = {
  primary: "bg-primary text-primary-foreground",
  secondary: "border border-border bg-surface text-foreground",
  danger: "border border-danger bg-surface font-semibold text-danger",
} as const;

export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-control px-3 py-2 text-body font-medium touch-manipulation focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60 ${VARIANT_CLASS[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
