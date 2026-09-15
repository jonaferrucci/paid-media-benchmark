interface LogoMarkProps {
  size?: number;
  className?: string;
}

// Cucurucho mark: the cone/scoop base (circle + triangle) established in
// Phase 1.5, refined in Phase 11 with a small ascending trend-line accent
// cut through the cone — the one geometric element tying the shape to
// "benchmarks/data/performance" rather than reading as purely decorative.
// Works at every required size (favicon, sidebar-compact, header,
// standalone icon) since it's still just three flat shapes, no fine
// detail that would disappear when scaled down.
export function LogoMark({ size = 28, className }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="16" cy="10" r="8" fill="var(--color-coral)" />
      <path d="M9 14 L16 29 L23 14 Z" fill="var(--color-primary)" />
      <path
        d="M11 20 L15 16 L18 18.5 L22 14.5"
        stroke="var(--color-surface)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
