import type { HTMLAttributes } from "react";

// Minimal, token-driven. Replaces the "rounded-2xl border border-line
// bg-surface p-6 shadow-sm" pattern duplicated across the app —
// Phase 12 Step 3. Does not yet replace existing usages (that's a
// later restyle pass); this is the shared primitive going forward.
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-2xl border border-line bg-surface p-6 shadow-sm ${className}`}
      {...props}
    />
  );
}
