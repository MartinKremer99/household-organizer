import type { ButtonHTMLAttributes } from "react";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger";
};

const VARIANT_CLASS = {
  primary:
    "bg-foreground text-background disabled:opacity-60",
  secondary:
    "border border-foreground/20 bg-background text-foreground disabled:opacity-60",
  danger:
    "border border-foreground bg-background font-semibold text-foreground underline disabled:opacity-60",
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
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground ${VARIANT_CLASS[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
