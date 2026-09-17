// Phase 21 item 8/12 — ONE centralized brand-asset resolution surface,
// pure and DB-free (directly unit-testable). Concept: entity slug ->
// approved local asset -> known brand icon -> initials fallback.
//
// This does not replace components/dashboard/PlatformLogo.tsx's
// PLATFORM_LOGO map (the "known brand icon" tier — real react-icons
// brand marks, bundled locally, no runtime network calls) — it sits
// ABOVE it as the single place that decides WHICH tier applies for a
// given entity, so components/ui/EntityAvatar.tsx (and any future
// brand-grid component) never has to re-implement that precedence
// themselves. See EntityAvatar.tsx for the actual rendering per tier.
//
// LOCAL_MEDIA_LOGO_ASSETS is deliberately empty: Phase 21 explicitly
// prohibits scraping/downloading logos automatically or inventing one
// for an outlet that doesn't have an approved local asset (item 8).
// Adding a real, approved logo later is a one-line addition here plus
// the file under public/brand/media/ — no component needs to change,
// which is the entire point of centralizing this instead of leaving
// slug->asset decisions scattered across cards.
export const LOCAL_MEDIA_LOGO_ASSETS: Record<string, string> = {};

export type BrandAssetKind = "local-asset" | "brand-icon" | "initials";

export interface BrandAssetResolution {
  kind: BrandAssetKind;
  /** public/ path of the approved local logo file — set only when kind is "local-asset". */
  assetPath?: string;
}

// `hasKnownBrandIcon` is passed in rather than looked up here, so this
// module never has to import the (React-component-holding) PLATFORM_LOGO
// map — it stays a plain data/decision function, importable from a test
// script with zero React/DOM dependency.
export function resolveBrandAsset(internalKey: string, hasKnownBrandIcon: boolean): BrandAssetResolution {
  const localAsset = LOCAL_MEDIA_LOGO_ASSETS[internalKey];
  if (localAsset) return { kind: "local-asset", assetPath: localAsset };
  if (hasKnownBrandIcon) return { kind: "brand-icon" };
  return { kind: "initials" };
}
