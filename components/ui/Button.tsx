import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:opacity-90",
  secondary: "bg-secondary text-secondary-foreground hover:opacity-90",
  ghost: "bg-transparent text-ink-700 border border-line hover:border-primary hover:text-primary",
  destructive: "bg-destructive text-white hover:opacity-90",
};

export function Button({ variant = "primary", className = "", disabled, ...props }: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-opacity disabled:opacity-40 ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    />
  );
}
