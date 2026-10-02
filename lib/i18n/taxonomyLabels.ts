import { dictionaries, type Locale } from "./translations";

// CUCURUCHO — CROSS-SITE RELEASE POLISH (Section 1: taxonomy
// localization layer).
//
// WHY THIS FILE EXISTS: objectives/verticals/audience_strategies/
// funnel_stages/business_models/media_categories/countries are seeded
// in Supabase with their display_label 100% in English, by permanent
// design — there is no locale column on these tables and none is
// planned (see supabase/migrations' own comments on this). A component
// that renders a taxonomy row's raw `display_label` directly therefore
// always shows English text, no matter which locale is active — the
// live-confirmed bug on Benchmark/Coverage/Catálogo de medios/Media
// Profile ("Traffic", "Digital Publishers / Digital News", etc.).
//
// This module is the ONE shared place every such surface should go
// through instead — Benchmark (CampaignExplorer/BenchmarkExplorer),
// Coverage, Media Catalog, Media Profile, Planner, and the Home
// wizard's Vertical step all resolve their taxonomy option labels here,
// never by reading `display_label` (or an equivalent hardcoded mock
// `.label`, e.g. lib/mock/taxonomies.ts's VERTICALS) straight into JSX.
//
// Deliberately NOT covered by this helper:
//   - platforms: real brand/proper nouns ("Meta Ads", "Google Ads") —
//     never translated in any locale, in or out of this helper.
//   - media formats (media_formats.display_label): many are legitimate
//     industry loanwords or terms not yet product-reviewed for a
//     confident Spanish rendering — explicitly out of scope for this
//     pass, same as the new verticals/businessModels/mediaCategories
//     Spanish copy below (reasonable, but not yet product-confirmed —
//     see the release-polish report).
//
// Resolution order for every (kind, internalKey, locale):
//   1. dictionaries[locale][<block>][internalKey], if that key exists
//   2. the real taxonomy row's own displayLabel — NEVER the generic
//      "humanize the last path segment" fallback useTranslation()'s
//      t() uses for an unrelated missing UI string. Falling back to
//      the DB's real display_label is always at least as good as (and
//      often better than) that generic fallback would be here.
export type TaxonomyKind =
  | "objective"
  | "vertical"
  | "audienceStrategy"
  | "funnelStage"
  | "businessModel"
  | "mediaCategory"
  | "country";

function dictionaryTableFor(locale: Locale, kind: TaxonomyKind): Record<string, string> {
  const dict = dictionaries[locale];
  switch (kind) {
    case "objective":
      return dict.objectives;
    case "vertical":
      return dict.verticals;
    case "audienceStrategy":
      return dict.audiences;
    case "funnelStage":
      return dict.funnel;
    case "businessModel":
      return dict.businessModels;
    case "mediaCategory":
      return dict.mediaCategories;
    case "country":
      return dict.countries;
  }
}

export function translateTaxonomyLabel(
  kind: TaxonomyKind,
  internalKey: string | null | undefined,
  displayLabel: string,
  locale: Locale
): string {
  if (!internalKey) return displayLabel;
  const table = dictionaryTableFor(locale, kind);
  return table[internalKey] ?? displayLabel;
}
