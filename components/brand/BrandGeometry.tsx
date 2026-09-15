// -----------------------------------------------------------------------
// Cucurucho abstract brand geometry — Phase 12 Step 6.
//
// Decorative primitives derived from the outline logo's own vocabulary
// (rounded arcs, angular separated strokes) — never literal repeats of
// the cone shape. Purely decorative: aria-hidden, no semantic meaning,
// safe to place behind/beside real content without interfering with
// readability. CSS/SVG only, no raster assets.
//
// Usage is intentionally sparse per the brief — these are exported
// individually so each call site opts into exactly one primitive
// rather than importing a bundled "hero background" that risks being
// applied everywhere by default.
// -----------------------------------------------------------------------

import { useId } from "react";

interface GeometryProps {
  className?: string;
}

/** A single cropped arc, echoing the logo's upper shape. */
export function BrandArc({ className = "" }: GeometryProps) {
  const gradientId = `brand-arc-gradient-${useId()}`;
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="200" y2="200" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="var(--color-brand-peach)" stopOpacity="0.5" />
          <stop offset="50%" stopColor="var(--color-brand-lavender)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--color-brand-mint)" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <path d="M20 140 A90 90 0 0 1 180 100" stroke={`url(#${gradientId})`} strokeWidth="14" strokeLinecap="round" />
    </svg>
  );
}

/** A soft rounded diagonal band — pure fill, low opacity. */
export function BrandBand({ className = "" }: GeometryProps) {
  return (
    <svg viewBox="0 0 300 120" fill="none" className={className} aria-hidden="true">
      <rect x="0" y="40" width="300" height="26" rx="13" fill="var(--color-brand-mint)" opacity="0.14" transform="rotate(-6 150 53)" />
    </svg>
  );
}

/** Two soft, overlapping elliptical fields — a quiet background wash. */
export function BrandFields({ className = "" }: GeometryProps) {
  return (
    <svg viewBox="0 0 400 300" fill="none" className={className} aria-hidden="true">
      <ellipse cx="120" cy="110" rx="140" ry="100" fill="var(--color-brand-peach)" opacity="0.10" />
      <ellipse cx="280" cy="190" rx="120" ry="90" fill="var(--color-brand-lavender)" opacity="0.10" />
    </svg>
  );
}

/** A short separated angular stroke, echoing the logo's lower chevron. */
export function BrandChevron({ className = "" }: GeometryProps) {
  return (
    <svg viewBox="0 0 80 60" fill="none" className={className} aria-hidden="true">
      <path
        d="M15 15 L40 50 L65 15"
        stroke="var(--color-brand-mint)"
        strokeOpacity="0.45"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
