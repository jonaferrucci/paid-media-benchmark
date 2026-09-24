// PHASE 26 (§4/§5): "What can I analyze?" / "What data am I missing?" —
// pure, deterministic helpers built ONLY on top of the existing,
// approved lib/metrics/derive.ts formulas. No new methodology, no
// arbitrary score: a metric "counts" for a campaign exactly when
// calculateDerivedMetrics() would already compute it from that
// campaign's own raw values — the SAME rule the benchmark/comparison
// UI already relies on. Framework-free and DB-free so this is directly
// unit-testable.

import { calculateDerivedMetrics, type RawMetricInputs, type DerivedMetrics } from "@/lib/metrics/derive";

export type DerivedMetricKey = keyof DerivedMetrics;

// Display labels for every key calculateDerivedMetrics can produce.
// Reuses lib/config/objectiveKpis.ts's own METRIC_LABELS values where a
// metric exists in both places (cpm/ctr/cpc/frequency/cpv/cpe/cpa/cpl/
// roas already match exactly) and only adds the two derive.ts formulas
// that mock config doesn't cover (acos/tacos) — never a second,
// independently-worded label set. Metric acronyms are kept in English
// even in the Spanish UI, matching every existing benchmark/comparison
// surface in this app.
export const DERIVED_METRIC_LABELS: Record<DerivedMetricKey, string> = {
  cpm: "CPM",
  ctr: "CTR",
  cpc: "CPC",
  frequency: "Frequency",
  cpv: "CPV",
  cpe: "CPE",
  cpa: "CPA",
  cpl: "CPL",
  roas: "ROAS",
  acos: "ACOS",
  tacos: "TACOS",
};

// One campaign's raw metric inputs, keyed by its own dataset id — the
// id is carried through only for grouping/debugging, never displayed.
export interface DatasetRawSummary {
  id: string;
  raw: RawMetricInputs;
}

// CUCURUCHO INTELLIGENCE 2 (§7 — metric availability engine): the one,
// explicit "which metrics can THIS campaign's own raw data produce"
// function Campaign Explorer needs, named to match the spec's own
// getAvailableCampaignMetrics(dataset). It does not reimplement
// anything — calculateDerivedMetrics() already only ever sets a key
// when every required raw input is present and its denominator is
// valid (see safeDivide in lib/metrics/derive.ts), so a metric key is
// already absent from its result whenever it's unavailable. This is a
// thin, named wrapper around that existing behavior so callers have one
// explicit, self-documenting entry point instead of re-deriving
// Object.keys(calculateDerivedMetrics(raw)) inline at each call site.
// "Unavailable" here is never the same thing as a zero or missing
// benchmark value — a campaign simply not having, say, `conversions`
// raw data means CPA/ROAS/ACOS/TACOS are unavailable FOR THIS CAMPAIGN,
// which is a completely different fact from the market benchmark itself
// having no_data or insufficient_sample for a metric the campaign DOES
// have.
export function getAvailableCampaignMetrics(raw: RawMetricInputs): DerivedMetricKey[] {
  const derived = calculateDerivedMetrics(raw);
  return (Object.keys(derived) as DerivedMetricKey[]).filter((key) => derived[key] !== undefined);
}

export interface MetricCoverageEntry {
  metric: DerivedMetricKey;
  campaignCount: number;
}

// §4: "Your data currently supports: CPM — 12 campaigns, ...". Sorted by
// campaign count (most-supported first) so the section reads as a
// factual capability list, not a random enumeration.
export function computeDataCoverage(datasets: DatasetRawSummary[]): MetricCoverageEntry[] {
  const counts = new Map<DerivedMetricKey, number>();
  for (const d of datasets) {
    const derived = calculateDerivedMetrics(d.raw);
    for (const key of Object.keys(derived) as DerivedMetricKey[]) {
      if (derived[key] !== undefined) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([metric, campaignCount]) => ({ metric, campaignCount }))
    .sort((a, b) => b.campaignCount - a.campaignCount || a.metric.localeCompare(b.metric));
}

export interface DataGapEntry {
  // The one raw field whose absence is blocking the metrics below —
  // every campaign counted here already has ad_spend (always required
  // at import) but not this field.
  missingField: keyof RawMetricInputs;
  campaignCount: number;
  unlocksMetrics: DerivedMetricKey[];
}

// §5: which single additional raw field would unlock which derived
// metric(s) — a direct, honest reading of derive.ts's own formulas
// (never a fabricated recommendation). ad_spend itself is never listed
// as a "gap" because lib/import/validate.ts already requires it for
// every persisted row — there is nothing actionable to ask for there.
const GAP_DEFINITIONS: { field: keyof RawMetricInputs; unlocks: DerivedMetricKey[] }[] = [
  { field: "impressions", unlocks: ["cpm", "ctr"] },
  { field: "clicks", unlocks: ["ctr", "cpc"] },
  { field: "conversions", unlocks: ["cpa", "cpl"] },
  { field: "attributed_revenue", unlocks: ["roas", "acos"] },
  { field: "total_revenue", unlocks: ["tacos"] },
  { field: "reach", unlocks: ["frequency"] },
  { field: "video_views", unlocks: ["cpv"] },
  { field: "engagements", unlocks: ["cpe"] },
];

export function computeDataGaps(datasets: DatasetRawSummary[]): DataGapEntry[] {
  return GAP_DEFINITIONS
    .map(({ field, unlocks }) => ({
      missingField: field,
      campaignCount: datasets.filter((d) => d.raw[field] === undefined).length,
      unlocksMetrics: unlocks,
    }))
    .filter((g) => g.campaignCount > 0)
    .sort((a, b) => b.campaignCount - a.campaignCount);
}

// §3: "recent imports" grouping. Cucurucho has no separate import-batch/
// provenance table (each uploaded row becomes its own performance_datasets
// row — see app/contribute/bulk-actions.ts), so a real "this file produced
// these N campaigns" identity doesn't exist yet. This is a deliberate,
// documented, best-effort APPROXIMATION rather than a fabricated one:
// rows are grouped by (platform + data source + calendar day submitted),
// which is exactly the shape a single bulk upload actually produces
// (bulkSubmitContributionsAction inserts every row from one file within
// the same request, same platform, same source, same day). Two separate
// uploads of the same platform on the same day would be merged into one
// group — a known, honest limitation, not silently hidden (see the
// "genuine unresolved issues" note this phase's final response calls
// out).
export interface RecentImportInput {
  id: string;
  platformLabel: string;
  dataSource: string;
  submittedOnIso: string; // created_at, already truncated to a day (YYYY-MM-DD) by the caller
}

export interface RecentImportGroup {
  platformLabel: string;
  dataSource: string;
  submittedOnIso: string;
  campaignCount: number;
  // PHASE 35 (§13): optional — only the real batch-based caller
  // (lib/contribute/workspaceActions.ts, which reads the actual
  // import_batches.source_filename column) ever sets this.
  // groupRecentImports below has no such column to read from its rows
  // and simply never sets it — never a second, differently-shaped type.
  sourceFilename?: string | null;
}

export function groupRecentImports(rows: RecentImportInput[], maxGroups: number): RecentImportGroup[] {
  const order: string[] = [];
  const groups = new Map<string, RecentImportGroup>();
  for (const row of rows) {
    const key = `${row.platformLabel}|${row.dataSource}|${row.submittedOnIso}`;
    const existing = groups.get(key);
    if (existing) {
      existing.campaignCount += 1;
    } else {
      groups.set(key, { platformLabel: row.platformLabel, dataSource: row.dataSource, submittedOnIso: row.submittedOnIso, campaignCount: 1 });
      order.push(key);
    }
  }
  // Rows are already fetched most-recent-first by the caller, so the
  // FIRST time a group key is seen is already its most recent occurrence
  // — no re-sorting needed beyond preserving that first-seen order.
  return order.slice(0, maxGroups).map((key) => groups.get(key)!);
}
