interface LogoMarkProps {
  size?: number;
  className?: string;
  variant?: "gradient" | "dark-on-light" | "light-on-dark" | "monochrome";
}

// Native aspect ratio of the approved mark asset (239x158 px source).
const ASPECT_RATIO = 158 / 239;

// CSS filters used for non-gradient variants. These never touch the
// underlying pixels/silhouette of the source asset -- brightness(0)
// collapses every opaque pixel to solid black while leaving the
// original alpha channel (i.e. the exact approved geometry) completely
// untouched, and invert(1) flips black to white. This is how the
// brief's allowed "technically necessary adaptations... dark/light
// presentation, monochrome usage" are achieved without ever
// recreating, approximating, or redrawing the mark itself.
const VARIANT_FILTER: Record<NonNullable<LogoMarkProps["variant"]>, string | undefined> = {
  gradient: undefined,
  "dark-on-light": "brightness(0)",
  "light-on-dark": "brightness(0) invert(1)",
  monochrome: "brightness(0)",
};

// -----------------------------------------------------------------------
// Cucurucho outline mark.
//
// This is the exact approved asset (public/brand/cucurucho-mark.png),
// extracted directly from the approved reference -- not a redrawn or
// reconstructed interpretation. Do not replace this with a hand-coded
// SVG approximation. If a true vector source becomes available later,
// swap the underlying file here without changing this component's
// API (size/className/variant), so every call site is unaffected.
// -----------------------------------------------------------------------
export function LogoMark({ size = 28, className, variant = "gradient" }: LogoMarkProps) {
  const height = Math.round(size * ASPECT_RATIO);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/cucurucho-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={height}
      className={className}
      style={{ filter: VARIANT_FILTER[variant], objectFit: "contain" }}
    />
  );
}
