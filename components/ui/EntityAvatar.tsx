import { PLATFORM_LOGO } from "@/components/dashboard/PlatformLogo";
import { resolveBrandAsset } from "@/lib/media/brand";

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
//
// Phase 21 item 8/12: the actual local-asset/brand-icon/initials
// PRECEDENCE decision now lives in lib/media/brand.ts's resolveBrandAsset
// (a pure, DB-free function) rather than being implicit in this
// component's own if/else — this component only renders whichever tier
// that resolver picks.
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
  const resolution = resolveBrandAsset(platformUiId ?? label, !!brandEntry);
  const dimension = { width: size, height: size };

  if (resolution.kind === "local-asset" && resolution.assetPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a small,
      // fixed-size catalog avatar; not worth next/image's remote-loader
      // config for a handful of locally-approved logo files.
      <img
        src={resolution.assetPath}
        alt=""
        className={`shrink-0 rounded-full object-contain ${className}`}
        style={dimension}
        aria-hidden="true"
      />
    );
  }

  if (resolution.kind === "brand-icon" && brandEntry) {
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
