// PHASE 28 — read side of the contribution benchmark-eligibility
// review queue. Mirrors lib/media/governanceQueries.ts's exact shape
// (Phase 19B item 3): a small, fixed set of queries, session-scoped
// client only (never the admin client — the curator-only SELECT
// policy from migration 0019, "curators read pending contributions",
// is the actual, un-bypassable boundary), one Promise.all, never N+1.
//
// Privacy (§10/§19): this query selects ONLY what a curator genuinely
// needs to judge benchmark eligibility — platform/objective/vertical/
// country/period/currency/available metrics/source type/import date,
// plus the campaign name (identity/provenance metadata a curator may
// reasonably need to cross-check a submission, same governance
// boundary campaign_name already has everywhere else in this
// codebase — see migration 0018's own comment: never a benchmark
// cohort dimension, never exposed by the public benchmark engine).
// It never selects or joins owner_user_id, profiles, or auth.users —
// a curator reviewing this queue has no way to see who submitted a
// given row, by design.

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RawMetricInputs } from "@/lib/metrics/derive";

// PHASE 28: the label-key map used to live here, but that pulled this
// file's server-only import (createServerSupabaseClient, which needs
// next/headers) into app/curation/CurationView.tsx's CLIENT bundle the
// moment it imported the label map — Next.js's build correctly refused
// that. It now lives in its own tiny, server-free module
// (reviewMetricLabels.ts); CurationView.tsx imports it from there
// directly, never through this file.

const RAW_METRIC_KEYS = new Set<keyof RawMetricInputs>([
  "ad_spend", "impressions", "reach", "clicks", "video_views", "engagements", "conversions", "attributed_revenue", "total_revenue",
]);

export interface PendingContributionRow {
  id: string;
  campaignName: string | null;
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  countryLabel: string;
  startDate: string;
  endDate: string;
  currency: string;
  dataSource: string;
  createdAt: string;
  availableMetrics: (keyof RawMetricInputs)[];
}

interface PendingRow {
  id: string;
  campaign_name: string | null;
  start_date: string;
  end_date: string;
  original_currency: string;
  data_source: string;
  created_at: string;
  platforms: { display_label: string } | null;
  objectives: { display_label: string } | null;
  verticals: { display_label: string } | null;
  countries: { display_label: string } | null;
  dataset_metric_values: { raw_numeric_value: number; metrics: { internal_key: string } | null }[] | null;
}

export async function getPendingContributionsQueue(): Promise<{ hasError: boolean; rows: PendingContributionRow[] }> {
  const supabase = createServerSupabaseClient();

  // RLS ("curators read pending contributions", migration 0019) is
  // what actually restricts this to curators and to pending rows —
  // this query works for a curator exactly like any other owner-scoped
  // read elsewhere in this codebase, no admin client involved.
  const { data, error } = await supabase
    .from("performance_datasets")
    .select(
      `id, campaign_name, start_date, end_date, original_currency, data_source, created_at,
       platforms(display_label),
       objectives(display_label),
       verticals(display_label),
       countries(display_label),
       dataset_metric_values(raw_numeric_value, metrics(internal_key))`
    )
    .eq("validation_status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[contribution-review] pending queue lookup failed", error);
    return { hasError: true, rows: [] };
  }

  const rows = ((data as unknown as PendingRow[] | null) ?? []).map((row): PendingContributionRow => {
    const availableMetrics: (keyof RawMetricInputs)[] = [];
    for (const value of row.dataset_metric_values ?? []) {
      const key = value.metrics?.internal_key;
      if (key && RAW_METRIC_KEYS.has(key as keyof RawMetricInputs) && !availableMetrics.includes(key as keyof RawMetricInputs)) {
        availableMetrics.push(key as keyof RawMetricInputs);
      }
    }
    return {
      id: row.id,
      campaignName: row.campaign_name,
      platformLabel: row.platforms?.display_label ?? "—",
      objectiveLabel: row.objectives?.display_label ?? "—",
      verticalLabel: row.verticals?.display_label ?? "—",
      countryLabel: row.countries?.display_label ?? "—",
      startDate: row.start_date,
      endDate: row.end_date,
      currency: row.original_currency,
      dataSource: row.data_source,
      createdAt: row.created_at,
      availableMetrics,
    };
  });

  return { hasError: false, rows };
}

export type PendingContributionsQueue = Awaited<ReturnType<typeof getPendingContributionsQueue>>;
