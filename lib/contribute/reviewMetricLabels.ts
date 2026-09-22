// PHASE 28 — split out from reviewQueries.ts so client components (the
// curator UI, app/curation/CurationView.tsx) can import this small,
// server-free label map without pulling in reviewQueries.ts's
// createServerSupabaseClient (@/lib/supabase/server, which imports
// next/headers and breaks client bundling — Next.js's own build error
// on this exact import chain is what surfaced the mistake). No logic
// here, just the label keys, so it is safe from any component.

import type { RawMetricInputs } from "@/lib/metrics/derive";

// Matches the exact label keys app/contribute/ContributeLanding.tsx's
// review step already uses for these same canonical fields — never a
// second, differently-worded label set for the same raw metric.
export const REVIEW_METRIC_LABEL_KEYS: Partial<Record<keyof RawMetricInputs, string>> = {
  ad_spend: "contribute.field.adSpend",
  impressions: "contribute.field.impressions",
  reach: "contribute.field.reach",
  clicks: "contribute.field.clicks",
  video_views: "contribute.field.videoViews",
  engagements: "contribute.field.engagements",
  conversions: "contribute.field.conversions",
  attributed_revenue: "contribute.field.attributedRevenue",
  total_revenue: "contribute.field.totalRevenue",
};
