// Derived metric calculations, per the approved formulas in
// 01-PLATFORMS-AND-METRICS.md. Pure functions: given raw base values,
// return derived values — never mutate raw inputs, never invent a
// formula not already approved. A derived metric is only returned when
// its required inputs are present and the denominator is a valid,
// non-zero number; otherwise it's simply omitted (never a fabricated 0
// or a divide-by-zero throw).

export interface RawMetricInputs {
  ad_spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  video_views?: number;
  engagements?: number;
  conversions?: number;
  attributed_revenue?: number;
  total_revenue?: number;
}

export interface DerivedMetrics {
  cpm?: number;
  ctr?: number;
  cpc?: number;
  frequency?: number;
  cpv?: number;
  cpe?: number;
  cpa?: number;
  cpl?: number;
  roas?: number;
  acos?: number;
  tacos?: number;
}

function safeDivide(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (numerator === undefined || denominator === undefined) return undefined;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return undefined;
  if (denominator <= 0) return undefined;
  return numerator / denominator;
}

export function calculateDerivedMetrics(raw: RawMetricInputs): DerivedMetrics {
  const derived: DerivedMetrics = {};

  const cpm = safeDivide(raw.ad_spend, raw.impressions);
  if (cpm !== undefined) derived.cpm = cpm * 1000;

  const ctr = safeDivide(raw.clicks, raw.impressions);
  if (ctr !== undefined) derived.ctr = ctr * 100;

  const cpc = safeDivide(raw.ad_spend, raw.clicks);
  if (cpc !== undefined) derived.cpc = cpc;

  const frequency = safeDivide(raw.impressions, raw.reach);
  if (frequency !== undefined) derived.frequency = frequency;

  const cpv = safeDivide(raw.ad_spend, raw.video_views);
  if (cpv !== undefined) derived.cpv = cpv;

  const cpe = safeDivide(raw.ad_spend, raw.engagements);
  if (cpe !== undefined) derived.cpe = cpe;

  // CPA (Sales objective) and CPL (Leads objective) share the same
  // underlying formula — ad_spend / conversions — since the schema has
  // one "conversions" base metric, not separate "sales" and "leads"
  // counters. Which label applies is a matter of which objective the
  // dataset was submitted under, not a different raw input.
  const cpa = safeDivide(raw.ad_spend, raw.conversions);
  if (cpa !== undefined) derived.cpa = cpa;

  const cpl = safeDivide(raw.ad_spend, raw.conversions);
  if (cpl !== undefined) derived.cpl = cpl;

  // Conversion Rate is intentionally NOT calculated here. Per
  // 01-PLATFORMS-AND-METRICS.md, "Conversion Rate = Conversions /
  // Relevant Traffic * 100" — but "Relevant Traffic" is not defined as
  // a single approved raw metric (it could mean clicks, landing page
  // views, or something else depending on objective/platform). Picking
  // one silently would be inventing methodology rather than following
  // an approved formula. Deferred pending an explicit decision on what
  // "Relevant Traffic" means for conversion rate purposes.

  const roas = safeDivide(raw.attributed_revenue, raw.ad_spend);
  if (roas !== undefined) derived.roas = roas;

  const acos = safeDivide(raw.ad_spend, raw.attributed_revenue);
  if (acos !== undefined) derived.acos = acos * 100;

  const tacos = safeDivide(raw.ad_spend, raw.total_revenue);
  if (tacos !== undefined) derived.tacos = tacos * 100;

  return derived;
}

// Normalized Monthly Spend = Advertising Spend / Duration Days * 30.
// Spend-band classification/context only — mirrors
// fn_normalized_monthly_spend() in the database (0004_performance_
// datasets.sql). Kept here too since some callers (e.g. a client-side
// preview in the Review step) need it before the row is ever inserted.
export function normalizedMonthlySpend(adSpend: number, durationDays: number): number | undefined {
  if (!Number.isFinite(adSpend) || !Number.isFinite(durationDays) || durationDays <= 0) return undefined;
  return (adSpend / durationDays) * 30;
}
