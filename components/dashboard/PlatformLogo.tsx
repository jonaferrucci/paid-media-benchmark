import { SiMeta, SiGoogleads, SiYoutube, SiTiktok, SiPinterest } from "react-icons/si";
import { ShoppingBag, Cpu } from "lucide-react";

// Real brand marks via react-icons (bundled locally, no runtime network
// requests). Mercado Libre Ads and DSP / Programmatic have no dedicated
// brand glyph in the simple-icons set available here — rather than
// substituting a different company's logo (e.g. Mercado Pago, a related
// but distinct brand) or distorting a mark, they use a neutral category
// icon instead. Brand colors are fixed regardless of theme, matching how
// brand marks conventionally render in both light and dark UIs.
export const PLATFORM_LOGO: Record<
  string,
  { Icon: React.ElementType; color: string; isBrandMark: boolean }
> = {
  meta_ads: { Icon: SiMeta, color: "#0866FF", isBrandMark: true },
  google_ads: { Icon: SiGoogleads, color: "#4285F4", isBrandMark: true },
  youtube: { Icon: SiYoutube, color: "#FF0000", isBrandMark: true },
  tiktok_ads: { Icon: SiTiktok, color: "#000000", isBrandMark: true },
  mercado_libre_ads: { Icon: ShoppingBag, color: "var(--color-primary)", isBrandMark: false },
  pinterest_ads: { Icon: SiPinterest, color: "#E60023", isBrandMark: true },
  dsp_programmatic: { Icon: Cpu, color: "var(--color-primary)", isBrandMark: false },
};

interface PlatformLogoProps {
  uiId: string;
  size?: number;
}

export function PlatformLogo({ uiId, size = 22 }: PlatformLogoProps) {
  const entry = PLATFORM_LOGO[uiId];
  if (!entry) return null;
  const { Icon, color } = entry;
  return <Icon size={size} style={{ color }} />;
}
