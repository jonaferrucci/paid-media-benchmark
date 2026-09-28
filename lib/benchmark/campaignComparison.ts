// CUCURUCHO INTELLIGENCE 3 — Multi-Campaign Comparison.
//
// Pure, DB-free, framework-free helpers only. No I/O, no Supabase, no
// Next.js — this is the one place the comparison feature's own
// non-statistical rules live (id validation, cohort grouping, currency
// comparability), kept separate from app/account/contributions/compare/
// page.tsx's orchestration so every rule here is directly unit-testable
// without a database, matching this codebase's existing convention
// (lib/contribute/coverage.ts, lib/comparison/classify.ts).
//
// This module does NOT define a new statistical cohort concept. The
// cohort tuple used below (platform + objective + vertical + country,
// same fixed 12-month window) is exactly the same four dimensions
// app/account/contributions/[id]/page.tsx already uses for its own
// automatic "Comparar con benchmark" activation — see that file's
// `query` object. Multi-Campaign Comparison reuses that exact
// definition rather than inventing a richer one (no businessModel/
// audienceStrategy/funnelStage/age/gender here — those exist elsewhere
// in the app, e.g. Campaign Explorer's manual cohort form, but are not
// part of THIS automatic per-owned-campaign cohort).

export const MIN_COMPARISON_CAMPAIGNS = 2;
export const MAX_COMPARISON_CAMPAIGNS = 5;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ParseComparisonIdsResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: "too_few" | "too_many" | "invalid" };

/**
 * Parses the `ids` query-string value from /account/contributions/compare.
 * Never trusts the URL: splits on comma, trims, drops anything that
 * isn't shaped like a UUID (garbage can never match a real row anyway,
 * so dropping it here is strictly a sanitization step, not a security
 * boundary — RLS at the actual query is the real boundary, see
 * compare/page.tsx), then deduplicates before enforcing the 2-5 range.
 * A too-many request is REJECTED outright rather than silently
 * truncated to 5 — silently dropping campaigns the user explicitly
 * selected would show a comparison they didn't ask for without saying
 * so, which this app's "never invent/never silently change what the
 * user asked for" convention does not allow.
 */
export function parseComparisonIds(raw: string | null | undefined): ParseComparisonIdsResult {
  const parts = (raw ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && UUID_RE.test(p));

  const deduped = Array.from(new Set(parts));

  if (deduped.length < MIN_COMPARISON_CAMPAIGNS) return { ok: false, error: "too_few" };
  if (deduped.length > MAX_COMPARISON_CAMPAIGNS) return { ok: false, error: "too_many" };
  return { ok: true, ids: deduped };
}

export interface CampaignCohortTaxonomy {
  platformKey: string | null;
  objectiveKey: string | null;
  verticalKey: string | null;
  countryKey: string | null;
}

/**
 * Returns the cohort grouping key, or null when the campaign lacks a
 * full cohort (missing platform/objective/vertical/country) — the same
 * `hasFullCohort` gate app/account/contributions/[id]/page.tsx already
 * uses before it will attempt any market comparison at all. A campaign
 * with a null key never gets a "Market benchmark" for any metric — it
 * still appears in the matrix with its own real values, exactly like
 * that existing page shows a campaign's own data even when no
 * comparison is possible.
 */
export function buildCampaignCohortKey(t: CampaignCohortTaxonomy): string | null {
  if (!t.platformKey || !t.objectiveKey || !t.verticalKey || !t.countryKey) return null;
  return [t.platformKey, t.objectiveKey, t.verticalKey, t.countryKey].join("|");
}

export interface CampaignForGrouping extends CampaignCohortTaxonomy {
  id: string;
}

export interface CohortGroup {
  key: string;
  campaignIds: string[];
  platformKey: string;
  objectiveKey: string;
  verticalKey: string;
  countryKey: string;
}

export interface GroupCampaignsResult {
  // One entry per DISTINCT cohort tuple among the selected campaigns —
  // 1 entry when every campaign shares a cohort, up to N entries when
  // every campaign has its own. This count is exactly how many
  // getBenchmarksForMetrics calls the orchestration layer needs to
  // make for the non-Reach metrics — never one per campaign, never one
  // per campaign per metric.
  groups: CohortGroup[];
  // Campaign ids with no full cohort — never included in any group,
  // never given a synthetic/partial cohort.
  ungroupedCampaignIds: string[];
}

export function groupCampaignsByCohort(campaigns: CampaignForGrouping[]): GroupCampaignsResult {
  const groups = new Map<string, CohortGroup>();
  const ungroupedCampaignIds: string[] = [];

  for (const c of campaigns) {
    const key = buildCampaignCohortKey(c);
    if (!key) {
      ungroupedCampaignIds.push(c.id);
      continue;
    }
    const existing = groups.get(key);
    if (existing) {
      existing.campaignIds.push(c.id);
    } else {
      groups.set(key, {
        key,
        campaignIds: [c.id],
        platformKey: c.platformKey!,
        objectiveKey: c.objectiveKey!,
        verticalKey: c.verticalKey!,
        countryKey: c.countryKey!,
      });
    }
  }

  return { groups: Array.from(groups.values()), ungroupedCampaignIds };
}

/**
 * Currency-denominated metrics (cpm/cpc/cpv/cpe/cpa/cpl — every
 * per-unit "ad_spend divided by a count" metric) are the only ones an
 * FX-free app cannot honestly line up side by side across campaigns in
 * different currencies. This reads the metric's own real `unit_type`
 * (the same field lib/comparison/classify.ts's formatMetricValue
 * already switches on, sourced from the `metrics` table via the
 * engine's BenchmarkResponse) rather than hardcoding a metric-key list
 * — a metric's currency-ness is defined once, in the database, not
 * duplicated here.
 */
export function isCurrencyDenominatedUnit(unit: string): boolean {
  return unit === "currency";
}

/**
 * Distinct, non-null currency codes among the campaigns that actually
 * have a value for a given row — a campaign missing the metric plays
 * no part in deciding whether that row is "mixed currency."
 */
export function distinctCurrencies(currencies: (string | null | undefined)[]): string[] {
  return Array.from(new Set(currencies.filter((c): c is string => Boolean(c))));
}

/**
 * A metric row is "not directly comparable" only when it's currency-
 * denominated AND more than one currency is actually present among the
 * campaigns that have that metric. A currency-neutral ratio (ctr,
 * frequency, roas, acos, tacos) is never blocked by this rule, no
 * matter how many currencies are in play — see this module's own
 * header comment and the CURRENCY RULES section of the spec this
 * implements.
 */
export function isMixedCurrencyRow(unit: string, currenciesInRow: (string | null | undefined)[]): boolean {
  if (!isCurrencyDenominatedUnit(unit)) return false;
  return distinctCurrencies(currenciesInRow).length > 1;
}
