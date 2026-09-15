import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-900 outline-none transition-colors focus-visible:border-primary ${className}`}
      {...props}
    />
  );
}
