// PHASE 32 (§5): the single-metric comparison surface (/benchmark's
// "single" mode metric dropdown, app/benchmark/BenchmarkExplorer.tsx)
// only ever accepts these metric keys. Extracted here — rather than
// kept as a local const in that client component — so any other caller
// that needs to check whether a metric is something /benchmark can
// actually accept has ONE real source of truth to import, never a
// second, independently-maintained copy of the same list that could
// silently drift out of sync.
//
// Used by app/account/contributions/[id]/page.tsx to decide which of a
// campaign's own derivable/base metrics are eligible for the "Comparar
// con benchmark" activation, and by app/benchmark/CampaignExplorer.tsx's
// multi-metric "campaign mode" dropdown (Phase 34 unified that file's
// previously-separate, drifted CAMPAIGN_METRICS array into this same
// list rather than leaving two independently-maintained metric
// allowlists in app/benchmark/*).
//
// PHASE 34 (§1-§10 audit): added cpa, roas, cpe, acos, tacos after
// confirming, end-to-end, that each already has (1) real raw inputs
// from actual imports (conversions/attributed_revenue/total_revenue/
// engagements are real, mapped fields — see lib/import/mapping.ts),
// (2) an existing, unmodified formula (lib/metrics/derive.ts, never
// touched by this phase), (3)/(4) a real seeded unit_type/
// benchmark_direction row in the `metrics` table (supabase/seed.sql),
// (5) full support from the engine (lib/benchmark/engine.ts accepts
// any metric key generically — no allowlist to extend there), (6)
// identical cohort/sample handling (same getMetricBenchmark path, no
// special-casing needed beyond Reach's own pre-existing spend/duration
// requirement), (7) UI formatting/direction handled generically by
// lib/comparison/classify.ts's formatMetricValue/classifyPerformance
// (unit_type-driven, not a per-metric switch), (8) automatic Campaign
// -> Benchmark eligibility once added here (app/account/contributions/
// [id]/page.tsx's compareOptions filter already gates on this exact
// array), and (9) saved-comparison persistence (the `metric` column on
// saved_comparisons is a plain, unconstrained text field — see
// migration 0011 — no allowlist there to update).
//
// CPL is deliberately NOT included. Every "leads" raw value observed
// in a real import (Meta "Leads", ES "Clientes potenciales") is mapped
// into the SAME generic `conversions` raw field as "Purchases"/"Ventas"
// (see lib/import/mapping.ts's own comment on this) — there is no
// canonical, semantically-safe `lead_count` raw metric distinct from a
// sales/purchase conversion count. Silently treating `conversions` as
// "leads" for CPL would be inventing a methodology distinction the
// data doesn't actually support, so CPL stays deferred until a real,
// distinct lead semantic exists.
export const SINGLE_METRIC_OPTIONS = ["cpm", "ctr", "cpc", "reach", "frequency", "cpv", "cpa", "roas", "cpe", "acos", "tacos"] as const;
export type SingleMetricOption = (typeof SINGLE_METRIC_OPTIONS)[number];
