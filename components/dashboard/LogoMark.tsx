interface LogoMarkProps {
  size?: number;
  className?: string;
}

// Temporary placeholder mark: a rounded triangular "cone" base with a
// circular "scoop" — abstract enough to not read as childish, simple
// enough to remain legible at favicon size. Replace with the approved
// brand mark when available.
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
      <path
        d="M9 14 L16 29 L23 14 Z"
        fill="var(--color-primary)"
      />
    </svg>
  );
}
