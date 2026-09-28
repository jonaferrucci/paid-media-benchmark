import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveTimeWindow } from "./timeWindow";
import { resolveVariantGroup, type MetricValueGroup } from "./metricVariants";
import { getMinimumSampleSize } from "./minimumSampleSize";
import { deriveBenchmarkStatus, type CohortQueryStatus } from "./resultStatus";
import { SINGLE_METRIC_OPTIONS } from "./singleMetricOptions";
import type { TimeWindowInput } from "./types";

// -----------------------------------------------------------------------
// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1.
//
// PRIVACY / ARCHITECTURE NOTE (same boundary as lib/benchmark/engine.ts,
// see that file's own header comment): this module is the second place
// in the codebase allowed to read performance_datasets/
// dataset_metric_values across every user via the service-role admin
// client. Every exported function returns ONLY a typed, aggregated
// CoverageGrid of per-(vertical, metric) STATUS values — never a raw
// row, dataset id, owner id, campaign name, or any exact/bucketed
// sample count. If you find yourself wanting to return a number that
// isn't a public taxonomy display_order, stop — that breaks the privacy
// boundary this file exists to enforce (see the locked implementation
// spec's "privacy lock": V1 has no curator-specific count view either).
//
// QUERY ARCHITECTURE — the whole reason this is its own module rather
// than a loop over lib/benchmark/engine.ts's existing per-cohort
// functions: the real taxonomy scale (6 platforms x 10 objectives x 29
// verticals x 10 countries x 11 metrics, per supabase/seed.sql) makes a
// naive "call the engine once per (vertical, metric) cell" strategy a
// 29 x 10 = 290-query page load for ONE Platform+Objective+Country
// selection (worse yet if every combination were shown at once). This
// module instead resolves the ENTIRE grid with a small, fixed number of
// aggregate queries regardless of how many verticals or metrics are
// requested:
//   A. one query: eligible, validation_status='valid' datasets for the
//      selected Platform+Objective+Country+Time Window, grouped by
//      vertical in application code (never filtered to one vertical).
//   B. one query: dataset_metric_values for every dataset id returned by
//      (A) and every requested metric, grouped by (vertical, metric,
//      metric_definition_variant_id) in application code.
//   C. one query: the live minimum-sample-size setting (shared with the
//      engine via lib/benchmark/minimumSampleSize.ts — never a second,
//      hardcoded threshold).
//   D. one query: resolving the requested metric internal_keys to their
//      row ids (needed to filter query B).
// Four queries total, independent of the number of verticals/metrics —
// never N x M.
// -----------------------------------------------------------------------

export interface CoverageQuery {
  platform: string; // platforms.internal_key
  objective: string; // objectives.internal_key
  country: string; // countries.iso_code
  timeWindow: TimeWindowInput;
}

export interface CoverageCell {
  vertical: string; // verticals.internal_key
  metric: string; // metrics.internal_key
  // Reuses the exact same canonical status type the live engine
  // produces (lib/benchmark/resultStatus.ts) — no new coverage-specific
  // status vocabulary. "error" is deliberately excluded here for the
  // same reason it's excluded from CohortQueryStatus itself: a
  // transport/query failure is not a coverage fact, so this module
  // never fabricates one — a caller wraps getCoverageGrid in its own
  // try/catch (see app/coverage/actions.ts) exactly like
  // app/benchmark/actions.ts already does around the live engine.
  status: CohortQueryStatus;
}

export interface CoverageGrid {
  verticals: string[];
  metrics: string[];
  cells: CoverageCell[]; // exactly verticals.length * metrics.length entries
}

// Coverage V1 excludes Reach from its own PRESENTED metric columns only
// — SINGLE_METRIC_OPTIONS and Reach's own methodology are completely
// unchanged. Reach has a hard, non-negotiable Spend Range + Duration
// Band requirement (lib/benchmark/spendBands.ts) that Coverage V1's grid
// has no axis for (Platform+Objective+Country+Vertical only, per the
// locked spec's "V1 dimensions" decision) — every Reach cell would
// therefore always read methodology_block, a real but permanently
// uninformative column. deriveBenchmarkStatus below still handles
// "reach" with its real, unmodified rule if it's ever passed in; this
// constant only controls what app/coverage's own UI chooses to render.
export const COVERAGE_METRIC_KEYS: string[] = SINGLE_METRIC_OPTIONS.filter((m) => m !== "reach");

// ---------------------------------------------------------------------
// Query A — eligible datasets for the selected cohort, grouped by
// vertical. Mirrors the exact protected-dimension predicate
// lib/benchmark/engine.ts's fetchEligibleDatasetIds uses (validation_
// status = 'valid', platform/objective/country exact match, start_date
// within the Time Window) — grouped by vertical here instead of
// filtered to a single one, since vertical is Coverage's own row axis.
// Coverage V1 deliberately never applies any of the OPTIONAL relaxable
// cohort dimensions a live single-cohort /benchmark query can (audience
// strategy, funnel stage, age, gender, spend band, duration band) — it
// shows the BROADEST honest coverage for a Platform+Objective+Country
// selection, never a narrower slice the user never asked to see (see
// the locked spec's "V1 dimensions" decision: those stay /benchmark-only
// filters, not Coverage axes).
// ---------------------------------------------------------------------
async function fetchEligibleDatasetIdsByVertical(
  query: CoverageQuery,
  verticalKeys: string[]
): Promise<Map<string, string[]>> {
  const byVertical = new Map<string, string[]>();
  for (const key of verticalKeys) byVertical.set(key, []);

  const supabase = createAdminClient();
  const window = resolveTimeWindow(query.timeWindow);

  const { data, error } = await supabase
    .from("performance_datasets")
    .select("id, platforms!inner(internal_key), objectives!inner(internal_key), countries!inner(iso_code), verticals!inner(internal_key)")
    .eq("validation_status", "valid")
    .eq("platforms.internal_key", query.platform)
    .eq("objectives.internal_key", query.objective)
    .eq("countries.iso_code", query.country)
    .gte("start_date", window.startDate)
    .lte("start_date", window.endDate);

  if (error || !data) return byVertical;

  for (const row of data as unknown as { id: string; verticals: { internal_key: string } | null }[]) {
    const verticalKey = row.verticals?.internal_key;
    if (!verticalKey) continue;
    const list = byVertical.get(verticalKey);
    // A vertical outside the requested verticalKeys list (should not
    // normally happen if the caller passes the full canonical taxonomy)
    // is simply not tracked — never silently added as an extra row.
    if (list) list.push(row.id);
  }
  return byVertical;
}

async function fetchMetricIdsByKey(metricKeys: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (metricKeys.length === 0) return map;
  const supabase = createAdminClient();
  const { data } = await supabase.from("metrics").select("id, internal_key").in("internal_key", metricKeys);
  for (const row of data ?? []) map.set(row.internal_key, row.id);
  return map;
}

// ---------------------------------------------------------------------
// Query B — dataset_metric_values for every eligible dataset id (across
// ALL verticals at once) and every requested metric, regrouped in
// application code into (vertical -> metric -> MetricValueGroup[]) so
// resolveVariantGroup (the exact same "never pool incompatible variants,
// always take the single largest group" rule the live engine uses) can
// be applied per (vertical, metric) pair exactly as it would be for a
// live single-cohort query on that same vertical.
// ---------------------------------------------------------------------
async function fetchMetricValueGroupsByVertical(
  eligibleDatasetIdsByVertical: Map<string, string[]>,
  metricIdsByKey: Map<string, string>
): Promise<Map<string, Map<string, MetricValueGroup[]>>> {
  const result = new Map<string, Map<string, MetricValueGroup[]>>();
  for (const vertical of eligibleDatasetIdsByVertical.keys()) result.set(vertical, new Map());

  const allDatasetIds = Array.from(new Set(Array.from(eligibleDatasetIdsByVertical.values()).flat()));
  if (allDatasetIds.length === 0 || metricIdsByKey.size === 0) return result;

  const datasetToVertical = new Map<string, string>();
  for (const [vertical, ids] of eligibleDatasetIdsByVertical) {
    for (const id of ids) datasetToVertical.set(id, vertical);
  }

  const metricIdToKey = new Map<string, string>();
  for (const [key, id] of metricIdsByKey) metricIdToKey.set(id, key);

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("dataset_metric_values")
    .select("dataset_id, metric_id, metric_definition_variant_id, raw_numeric_value")
    .in("dataset_id", allDatasetIds)
    .in("metric_id", Array.from(metricIdsByKey.values()));

  if (error || !data) return result;

  // vertical -> metric -> variantKey -> values
  const counts = new Map<string, Map<string, Map<string, number[]>>>();
  for (const row of data) {
    const vertical = datasetToVertical.get(row.dataset_id);
    const metricKey = metricIdToKey.get(row.metric_id);
    if (!vertical || !metricKey) continue;
    if (!counts.has(vertical)) counts.set(vertical, new Map());
    const byMetric = counts.get(vertical)!;
    if (!byMetric.has(metricKey)) byMetric.set(metricKey, new Map());
    const byVariant = byMetric.get(metricKey)!;
    const variantKey = row.metric_definition_variant_id ?? "__null__";
    if (!byVariant.has(variantKey)) byVariant.set(variantKey, []);
    byVariant.get(variantKey)!.push(row.raw_numeric_value);
  }

  for (const [vertical, byMetric] of counts) {
    const out = new Map<string, MetricValueGroup[]>();
    for (const [metricKey, byVariant] of byMetric) {
      out.set(
        metricKey,
        Array.from(byVariant.entries()).map(([variantKey, values]) => ({
          variantId: variantKey === "__null__" ? null : variantKey,
          values,
        }))
      );
    }
    result.set(vertical, out);
  }

  return result;
}

/**
 * Resolves the full Vertical x Metric coverage grid for a Platform +
 * Objective + Country selection, using a fixed, small number of
 * aggregate queries (see the module header) regardless of how many
 * verticalKeys/metricKeys are requested.
 *
 * Every status is derived through the exact same deriveBenchmarkStatus
 * precedence lib/benchmark/engine.ts and app/benchmark/actions.ts
 * already use (methodology_block > success > no_data >
 * insufficient_sample) — never a second, independently-invented rule.
 */
export async function getCoverageGrid(query: CoverageQuery, verticalKeys: string[], metricKeys: string[]): Promise<CoverageGrid> {
  const [minimumSampleSize, eligibleByVertical, metricIdsByKey] = await Promise.all([
    getMinimumSampleSize(),
    fetchEligibleDatasetIdsByVertical(query, verticalKeys),
    fetchMetricIdsByKey(metricKeys),
  ]);

  const groupsByVertical = await fetchMetricValueGroupsByVertical(eligibleByVertical, metricIdsByKey);

  const cells: CoverageCell[] = [];
  for (const vertical of verticalKeys) {
    const cohortSampleSize = eligibleByVertical.get(vertical)?.length ?? 0;
    const metricGroups = groupsByVertical.get(vertical);
    for (const metric of metricKeys) {
      const groups = metricGroups?.get(metric) ?? [];
      const chosen = resolveVariantGroup(groups);
      const metricSampleSize = chosen?.values.length ?? 0;
      const sufficientData = metricSampleSize >= minimumSampleSize;
      const status = deriveBenchmarkStatus({
        metricKey: metric,
        // Coverage V1 has no Spend Range/Duration Band axis (see the
        // module header) — passing undefined for both still lets
        // deriveBenchmarkStatus's own, unmodified isReachMethodologyBlock
        // rule correctly methodology-block "reach" if it's ever passed
        // here (e.g. from a future caller or a test), rather than this
        // module silently reimplementing that rule a second time.
        spendBand: undefined,
        durationBand: undefined,
        relaxedDimensions: undefined,
        sufficientData,
        cohortSampleSize,
      });
      cells.push({ vertical, metric, status });
    }
  }

  return { verticals: verticalKeys, metrics: metricKeys, cells };
}

// ---------------------------------------------------------------------
// Taxonomy for Coverage's own Platform / Objective / Country / Vertical
// selectors. Uses the RLS-scoped server client (NOT the admin client) —
// platforms/objectives/countries/verticals all have a public SELECT
// policy for active rows (0007_row_level_security.sql), exactly the
// same public-safe read lib/contribute/taxonomies.ts already relies on.
// A dedicated, minimal fetch here (4 tables, not
// getContributionTaxonomies()'s full 15-table contribution-wizard
// payload) — Coverage needs none of the wizard's campaign-type/
// audience-strategy/funnel-stage/media-category taxonomy.
// ---------------------------------------------------------------------
export interface CoverageTaxonomyOption {
  value: string;
  label: string;
}

export interface CoverageTaxonomies {
  platforms: CoverageTaxonomyOption[];
  objectives: CoverageTaxonomyOption[];
  countries: CoverageTaxonomyOption[];
  verticals: CoverageTaxonomyOption[];
  hasError: boolean;
}

export async function getCoverageTaxonomies(): Promise<CoverageTaxonomies> {
  const supabase = createServerSupabaseClient();

  const [platforms, objectives, countries, verticals] = await Promise.all([
    supabase.from("platforms").select("internal_key, display_label").eq("active", true).order("display_order"),
    supabase.from("objectives").select("internal_key, display_label").eq("active", true).order("display_order"),
    supabase.from("countries").select("iso_code, display_label").eq("active", true).order("display_order"),
    supabase.from("verticals").select("internal_key, display_label").eq("active", true).order("display_order"),
  ]);

  const hasError = Boolean(platforms.error || objectives.error || countries.error || verticals.error);
  if (hasError) {
    // Same never-silently-empty convention as lib/contribute/
    // taxonomies.ts's own audited error handling — logged server-side
    // only, never exposing internals to the client.
    console.error("[coverage] taxonomy query failed", {
      platforms: platforms.error?.message,
      objectives: objectives.error?.message,
      countries: countries.error?.message,
      verticals: verticals.error?.message,
    });
  }

  return {
    platforms: (platforms.data ?? []).map((p) => ({ value: p.internal_key, label: p.display_label })),
    objectives: (objectives.data ?? []).map((o) => ({ value: o.internal_key, label: o.display_label })),
    countries: (countries.data ?? []).map((c) => ({ value: c.iso_code, label: c.display_label })),
    verticals: (verticals.data ?? []).map((v) => ({ value: v.internal_key, label: v.display_label })),
    hasError,
  };
}
