import type { HTMLAttributes } from "react";

type Tone = "neutral" | "primary" | "success" | "warning" | "destructive";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

// Generic status pill — distinct from the benchmark classification
// pills in ComparisonDetail.tsx (LABEL_STYLE), which encode specific
// statistical meaning and are intentionally left untouched until the
// Step 5 benchmark restyle. This Badge is for everything else
// (account status, generic tags, etc.).
const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-surface2 text-ink-600",
  primary: "bg-primary-soft text-primary",
  success: "bg-pistachio-soft text-pistachio",
  warning: "bg-vanilla-soft text-vanilla",
  destructive: "bg-destructive-soft text-destructive",
};

export function Badge({ tone = "neutral", className = "", ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${TONE_CLASS[tone]} ${className}`}
      {...props}
    />
  );
}
