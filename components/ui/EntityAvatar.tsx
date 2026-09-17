import { PLATFORM_LOGO } from "@/components/dashboard/PlatformLogo";

// Phase 20C: a single, reusable slug→asset mapping surface for "who is
// this" chips across the app (homepage, platforms, planner, media catalog,
// contribution, benchmark selection). It never draws or approximates a
// real company's mark — it only wraps PLATFORM_LOGO's existing bundled
// react-icons brand glyphs (ad platforms with an official glyph available)
// and, for everything else (LATAM media outlets, properties, or any
// platform without a dedicated glyph in that set), falls back to a
// neutral initials chip. That fallback is deliberately generic — no
// invented logo, no substituted competitor mark — exactly the same
// policy PlatformLogo.tsx already established for mercado_libre_ads and
// dsp_programmatic; this component just extends it to entities that have
// no bundled brand glyph at all.
const ACCENTS = [
  "bg-brandPeach/25 text-ink-900",
  "bg-brandLavender/25 text-ink-900",
  "bg-brandMint/25 text-ink-900",
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function initialsFor(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

interface EntityAvatarProps {
  label: string;
  platformUiId?: string | null;
  size?: number;
  className?: string;
}

export function EntityAvatar({ label, platformUiId, size = 36, className = "" }: EntityAvatarProps) {
  const brandEntry = platformUiId ? PLATFORM_LOGO[platformUiId] : undefined;
  const dimension = { width: size, height: size };

  if (brandEntry) {
    const { Icon, color } = brandEntry;
    return (
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-surface2 ${className}`}
        style={dimension}
        aria-hidden="true"
      >
        <Icon size={Math.round(size * 0.55)} style={{ color }} />
      </span>
    );
  }

  const accent = ACCENTS[hashString(label) % ACCENTS.length];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-semibold ${accent} ${className}`}
      style={{ ...dimension, fontSize: Math.round(size * 0.38) }}
      aria-hidden="true"
    >
      {initialsFor(label)}
    </span>
  );
}
