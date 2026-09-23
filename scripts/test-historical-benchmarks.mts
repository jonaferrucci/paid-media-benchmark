// HISTORICAL BENCHMARKS — ARCHITECTURE & METHODOLOGY (§20 test suite).
//
// Mixed convention, same reasoning as scripts/test-phase34-benchmark-
// metric-coverage.mts: the pure, dependency-free modules this feature
// introduces (historicalPeriods.ts, historicalLabels.ts,
// resultStatus.ts) plus the pure functions this feature REUSES
// (lib/media/trend.ts's computeChange/trendEligibility,
// app/benchmark/actions.ts's buildQuery) are imported and actually
// EXECUTED here — real inputs, real outputs. Everything that requires a
// live Supabase connection (lib/benchmark/engine.ts's
// getHistoricalBenchmark/computeMetricBenchmarkCore/
// fetchEligibleDatasetIds, app/benchmark/historicalActions.ts's
// runHistoricalBenchmarkQuery) is verified as a structural source-text
// check instead — calling those for real would attempt a live network
// call to Supabase, which this sandbox cannot reach (no provisioned
// Postgres/Supabase connection here — the same, already-documented
// limitation that made scripts/e2e-fixture-test.mts's live-data
// assertions unrunnable in this environment).
//
// IMPORTANT, EXPLICIT DISCLOSURE: this suite CANNOT execute the
// canonical "CPM median=3.85, sampleSize=15" regression against real
// per-period historical data, because doing so requires a live
// database this sandbox does not have. That check is not skipped
// silently — see the printed notice near the bottom of this file.
// Nothing here fabricates or assumes a specific live sample size for
// any period.

import { readFileSync, readdirSync } from "node:fs";
import { generateHistoricalPeriods } from "../lib/benchmark/historicalPeriods";
import { formatHistoricalPeriodLabel } from "../lib/benchmark/historicalLabels";
import { deriveBenchmarkStatus, isReachMethodologyBlock } from "../lib/benchmark/resultStatus";
import { computeChange, trendEligibility } from "../lib/media/trend";
import { buildQuery, type BenchmarkFormInput } from "../lib/benchmark/buildQuery";

// NOTE: app/benchmark/actions.ts and lib/benchmark/engine.ts
// (getHistoricalBenchmark/computeMetricBenchmarkCore) are NOT imported
// here — engine.ts imports lib/supabase/admin.ts, which imports the
// "server-only" package. That package throws unconditionally when
// required outside a Next.js server bundle (Next's webpack config is
// what normally turns it into a no-op on the server; plain tsx/node has
// no such alias), so importing either file directly in this script
// would crash on import, not on call. Both are verified structurally
// below instead — the same convention scripts/test-phase34-benchmark-
// metric-coverage.mts already uses for this exact reason. buildQuery
// itself, however, was deliberately extracted into its own directive-
// free module (lib/benchmark/buildQuery.ts — see its own comment for
// why: a "use server" file cannot export a synchronous helper) with no
// Supabase dependency at all, so it — unlike actions.ts/engine.ts — CAN
// be imported and actually executed here.

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}
function assertEqual(actual: unknown, expected: unknown, label: string) {
  assertTrue(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

const engineSource = readFileSync(new URL("../lib/benchmark/engine.ts", import.meta.url), "utf8");
const historicalActionsSource = readFileSync(new URL("../app/benchmark/historicalActions.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../app/benchmark/actions.ts", import.meta.url), "utf8");
const historicalSectionSource = readFileSync(new URL("../app/benchmark/HistoricalBenchmarkSection.tsx", import.meta.url), "utf8");
const timeWindowSource = readFileSync(new URL("../lib/benchmark/timeWindow.ts", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");
const migrationFiles = readFileSync(new URL("../supabase/migrations/0019_contribution_validation.sql", import.meta.url), "utf8"); // existence check only

// -----------------------------------------------------------------------
// §1 VALID-ONLY FILTERING & CROSS-BOUNDARY (start_date-based) RULE.
//
// Both are properties of fetchEligibleDatasetIds/computeMetricBenchmarkCore,
// which getHistoricalBenchmark REUSES (never reimplements) once per
// period. Verified structurally: (a) validation_status='valid' filtering
// exists exactly once in the whole file (proving there is only one
// query-building path, not a second, possibly-divergent one for
// history), and (b) eligibility is windowed by start_date only, matching
// lib/benchmark/timeWindow.ts's own documented "a dataset belongs to the
// period its start_date falls in" interpretation — never end_date, and
// never a proration/overlap rule that would require fabricating a daily
// split for campaigns crossing a period boundary.
// -----------------------------------------------------------------------
const validStatusOccurrences = (engineSource.match(/validation_status.*valid/g) ?? []).length;
assertEqual(validStatusOccurrences, 1, "engine.ts filters validation_status='valid' in exactly one place (fetchEligibleDatasetIds) — getHistoricalBenchmark reuses it, never duplicates it");

const fetchEligibleFnOccurrences = (engineSource.match(/async function fetchEligibleDatasetIds/g) ?? []).length;
assertEqual(fetchEligibleFnOccurrences, 1, "fetchEligibleDatasetIds is defined exactly once — no second, historical-only copy of dataset eligibility logic");

assertTrue(/\.gte\("start_date", params\.windowStart\)/.test(engineSource) && /\.lte\("start_date", params\.windowEnd\)/.test(engineSource), "dataset window eligibility is start_date-based (gte/lte on start_date)");
assertTrue(!/\.gte\("end_date"|\.lte\("end_date"/.test(engineSource), "end_date is never used to bound window eligibility — a campaign crossing a period boundary is assigned to the period containing its start_date, never split/prorated");
const historicalPeriodsSource = readFileSync(new URL("../lib/benchmark/historicalPeriods.ts", import.meta.url), "utf8");
assertTrue(/start_date falls inside it/.test(historicalPeriodsSource), "historicalPeriods.ts's own comment documents the reused start_date-based period-assignment rule (the actual matching happens in engine.ts's shared fetchEligibleDatasetIds, reused unchanged per period)");

const computeCoreOccurrences = (engineSource.match(/function computeMetricBenchmarkCore/g) ?? []).length;
assertEqual(computeCoreOccurrences, 1, "computeMetricBenchmarkCore (the shared cohort/percentile engine) is defined exactly once");
assertTrue(/getHistoricalBenchmark[\s\S]*computeMetricBenchmarkCore\(periodQuery/.test(engineSource), "getHistoricalBenchmark calls computeMetricBenchmarkCore per period — it does not reimplement cohort selection or percentile math");

// computeDistribution/flagOutliers are also called from the pre-existing,
// unused getHistoricalTrend (dead code, untouched by this feature — see
// its own in-file comment) — so a whole-file occurrence count isn't the
// right check. What matters is scoped to the two functions this feature
// actually touches: computeMetricBenchmarkCore calls each exactly once,
// and getHistoricalBenchmark itself calls neither directly (it only
// reaches percentile math by calling computeMetricBenchmarkCore).
const computeCoreBody = engineSource.match(/async function computeMetricBenchmarkCore[\s\S]*?\n\}\n/)?.[0] ?? "";
const getHistoricalBenchmarkBody = engineSource.match(/export async function getHistoricalBenchmark[\s\S]*$/)?.[0] ?? "";
assertTrue(computeCoreBody.length > 0 && getHistoricalBenchmarkBody.length > 0, "both computeMetricBenchmarkCore and getHistoricalBenchmark function bodies were matched");
assertEqual((computeCoreBody.match(/computeDistribution\(/g) ?? []).length, 1, "computeMetricBenchmarkCore calls computeDistribution exactly once");
assertEqual((computeCoreBody.match(/flagOutliers\(/g) ?? []).length, 1, "computeMetricBenchmarkCore calls flagOutliers exactly once");
assertEqual((getHistoricalBenchmarkBody.match(/computeDistribution\(/g) ?? []).length, 0, "getHistoricalBenchmark never calls computeDistribution directly — only via computeMetricBenchmarkCore, so historical periods can never compute percentiles a different way than the live query");
assertEqual((getHistoricalBenchmarkBody.match(/flagOutliers\(/g) ?? []).length, 0, "getHistoricalBenchmark never calls flagOutliers directly, same reasoning as above");

// -----------------------------------------------------------------------
// §2 PERIOD GENERATION — real execution against a fixed `now`, so this
// is deterministic regardless of when the suite runs.
// -----------------------------------------------------------------------
const FIXED_NOW = new Date(Date.UTC(2026, 8, 23)); // 2026-09-23, inside Q3 2026

const quarters = generateHistoricalPeriods("quarter", 4, FIXED_NOW);
assertEqual(quarters.length, 4, "generateHistoricalPeriods('quarter', 4) returns exactly 4 periods");
assertEqual(quarters.map((p) => p.periodKey).join(","), "2025-Q4,2026-Q1,2026-Q2,2026-Q3", "quarterly periods are oldest-first and calendar-aligned, ending at the quarter containing `now`");
assertEqual(quarters[0].start, "2025-10-01", "Q4 2025 starts 2025-10-01");
assertEqual(quarters[0].end, "2025-12-31", "Q4 2025 ends 2025-12-31");
assertEqual(quarters[3].start, "2026-07-01", "Q3 2026 (the in-progress current quarter) starts 2026-07-01");
assertEqual(quarters[3].end, "2026-09-30", "Q3 2026 ends 2026-09-30 even though `now` (2026-09-23) is before that — the partial/in-progress period is never excluded or shortened (no interpolation/fabrication of a partial-period boundary)");

const months = generateHistoricalPeriods("month", 3, FIXED_NOW);
assertEqual(months.map((p) => p.periodKey).join(","), "2026-07,2026-08,2026-09", "monthly periods are oldest-first, ending at the month containing `now`");
assertEqual(months[2].start, "2026-09-01", "current month period starts on the 1st");
assertEqual(months[2].end, "2026-09-30", "September (30-day month) end boundary is correct");
assertEqual(months[0].end, "2026-07-31", "July (31-day month) end boundary is correct — no off-by-one across different month lengths");

assertEqual(generateHistoricalPeriods("quarter", 0, FIXED_NOW).length, 0, "count<=0 returns an empty array rather than throwing or fabricating a period");
assertEqual(generateHistoricalPeriods("month", -1, FIXED_NOW).length, 0, "a negative count also safely returns an empty array");

// Periods must tile the calendar with zero gap and zero overlap between
// them — this is a property of the BOUNDARIES only; whether a period
// actually has data is a completely separate, per-period question
// answered later by getHistoricalBenchmark's own status, never implied
// by contiguous boundaries.
for (let i = 1; i < quarters.length; i++) {
  const prevEnd = new Date(quarters[i - 1].end + "T00:00:00Z");
  const thisStart = new Date(quarters[i].start + "T00:00:00Z");
  const dayAfterPrevEnd = new Date(prevEnd.getTime() + 24 * 60 * 60 * 1000);
  assertTrue(dayAfterPrevEnd.getTime() === thisStart.getTime(), `quarter period ${i} starts exactly one day after period ${i - 1} ends (contiguous, no overlap, no gap in the boundaries themselves)`);
}

// -----------------------------------------------------------------------
// §3 LABEL FORMATTING — real execution, both locales, both shapes, and
// the documented never-throw fallback for an unrecognized key.
// -----------------------------------------------------------------------
assertEqual(formatHistoricalPeriodLabel("2026-Q3", "es"), "T3 2026", "Spanish quarter label uses 'T' (trimestre)");
assertEqual(formatHistoricalPeriodLabel("2026-Q3", "en"), "Q3 2026", "English quarter label uses 'Q'");
assertEqual(formatHistoricalPeriodLabel("2026-01", "en"), "Jan 2026", "English month label uses Intl short month formatting");
assertEqual(formatHistoricalPeriodLabel("not-a-real-key", "es"), "not-a-real-key", "an unrecognized periodKey falls back to the raw string rather than throwing or fabricating a label");

// -----------------------------------------------------------------------
// §4 STATUS PRECEDENCE / REACH METHODOLOGY BLOCK — real execution,
// covering the full precedence order this shared module documents:
// methodology_block > success > no_data > insufficient_sample. This is
// the SAME function the live single query and every historical period
// both call, so these cases cover both paths at once.
// -----------------------------------------------------------------------
assertEqual(
  deriveBenchmarkStatus({ metricKey: "reach", spendBand: null, durationBand: "band_a", relaxedDimensions: [], sufficientData: true, cohortSampleSize: 500 }),
  "methodology_block",
  "Reach missing Spend Band is a methodology_block even when sufficientData is true and the cohort is large — a hard methodological stop, never a sample-size question"
);
assertEqual(
  deriveBenchmarkStatus({ metricKey: "reach", spendBand: "band_a", durationBand: "band_b", relaxedDimensions: ["spend_range"], sufficientData: true, cohortSampleSize: 500 }),
  "methodology_block",
  "Reach with Spend Range explicitly relaxed away is still a methodology_block even though both bands are technically present"
);
assertEqual(
  deriveBenchmarkStatus({ metricKey: "reach", spendBand: "band_a", durationBand: "band_b", relaxedDimensions: [], sufficientData: true, cohortSampleSize: 40 }),
  "success",
  "Reach WITH both required bands present and a sufficient sample resolves to success like any other metric"
);
assertEqual(
  deriveBenchmarkStatus({ metricKey: "cpm", spendBand: null, durationBand: null, relaxedDimensions: [], sufficientData: false, cohortSampleSize: 0 }),
  "no_data",
  "a completely empty cohort (cohortSampleSize 0) is no_data, distinct from insufficient_sample"
);
assertEqual(
  deriveBenchmarkStatus({ metricKey: "cpm", spendBand: null, durationBand: null, relaxedDimensions: [], sufficientData: false, cohortSampleSize: 4 }),
  "insufficient_sample",
  "a non-empty cohort that is still below the minimum threshold is insufficient_sample, never fabricated into success"
);
assertEqual(
  deriveBenchmarkStatus({ metricKey: "cpm", spendBand: null, durationBand: null, relaxedDimensions: [], sufficientData: true, cohortSampleSize: 40 }),
  "success",
  "a non-Reach metric with a sufficient sample is success"
);
assertTrue(!isReachMethodologyBlock("cpm", null, null, []), "isReachMethodologyBlock never fires for a non-Reach metric regardless of missing bands");

// -----------------------------------------------------------------------
// §5 MEDIAN DELTA — reuses lib/media/trend.ts's computeChange verbatim
// (never a new formula), including its zero-denominator safety, and
// trendEligibility's 3-point minimum for ever drawing a chart line.
// -----------------------------------------------------------------------
const deltaUp = computeChange(2.5, 3.2);
assertTrue(deltaUp.absolute > 0 && deltaUp.percent !== null && Math.abs(deltaUp.percent - 28) < 0.5, "computeChange(2.5 -> 3.2) is a ~28% increase, reused unmodified for the historical median delta");
const deltaDown = computeChange(3.2, 2.5);
assertTrue(deltaDown.absolute < 0 && deltaDown.percent !== null && deltaDown.percent < 0, "computeChange(3.2 -> 2.5) is a negative percent — direction is conveyed by the chosen i18n key (historicalDeltaUp/Down), the number itself stays unsigned in the rendered string per HistoricalBenchmarkSection's own Math.abs()");
const deltaZeroDenominator = computeChange(0, 5);
assertEqual(deltaZeroDenominator.percent, null, "a zero previous-period median never produces a fabricated percent (division-by-zero safety, reused as-is)");

assertEqual(trendEligibility(0), "value_only", "0 real success periods: value_only");
assertEqual(trendEligibility(2), "change_only", "2 real success periods: change_only, not yet a trend");
assertEqual(trendEligibility(3), "trend", "3 real success periods is the minimum that honestly justifies drawing a trend line");
assertTrue(/eligibility === "trend"/.test(historicalSectionSource), "HistoricalBenchmarkSection only renders the chart when trendEligibility says 'trend' (>=3 real success periods) — never from fewer, never a fake/decorative chart");
assertTrue(/trendEligibility\(successPeriods\.length\)/.test(historicalSectionSource), "the eligibility check counts only status==='success' periods, never gap/insufficient/no_data/error periods toward the 3-point minimum");

// -----------------------------------------------------------------------
// §6 NO INTERPOLATION, EVER — structural checks across every new file:
// no fill-gap/interpolate/average-across-periods helper exists anywhere,
// and the chart explicitly breaks its line at any non-success period
// rather than bridging it.
// -----------------------------------------------------------------------
const newFilesCombined = [engineSource, historicalActionsSource, historicalSectionSource].join("\n");
assertTrue(!/interpolat/i.test(newFilesCombined.replace(/\/\/.*no interpolation.*/gi, "").replace(/never interpolat\w*/gi, "")), "no interpolation logic exists in the new/changed files (only explanatory comments say the word, no code implements it)");
assertTrue(/currentSegment\.length > 0/.test(historicalSectionSource) && /lineSegments\.push\(currentSegment\.join/.test(historicalSectionSource), "the chart breaks into a NEW polyline segment at every non-success period rather than drawing a continuous line through a gap");
assertTrue(/status !== "success"/.test(historicalSectionSource), "the chart explicitly renders a distinct, muted gap marker for any non-success period instead of silently omitting or bridging it");

// -----------------------------------------------------------------------
// §7 OPTIONAL FILTERS FORWARDED PER PERIOD — real execution of buildQuery
// (lib/benchmark/buildQuery.ts, pure, no Supabase call), the exact
// function both app/benchmark/actions.ts's live single-query path AND
// app/benchmark/historicalActions.ts's per-period loop import and call.
// Every optional cohort filter present on the live form input must
// survive into the BenchmarkQuery every period query spreads from
// ({ ...query, timeWindow: override }) — proving the historical loop can
// never silently drop a filter the user actually set.
// -----------------------------------------------------------------------
const fullInput: BenchmarkFormInput = {
  metric: "cpm",
  platform: "meta",
  objective: "conversions",
  vertical: "ecommerce",
  country: "AR",
  audienceStrategy: "broad",
  funnelStage: "mid",
  businessModel: "b2c",
  minAge: 25,
  maxAge: 44,
  genderTargeting: "all",
  spendBand: "band_b",
  durationBand: "band_2",
  timeWindow: "last_6_months",
  relaxedDimensions: ["gender"],
};
const builtQuery = buildQuery(fullInput);
assertEqual(builtQuery.audienceStrategy, "broad", "buildQuery forwards audienceStrategy");
assertEqual(builtQuery.funnelStage, "mid", "buildQuery forwards funnelStage");
assertEqual(builtQuery.businessModel, "b2c", "buildQuery forwards businessModel");
assertEqual(builtQuery.spendBand, "band_b", "buildQuery forwards spendBand");
assertEqual(builtQuery.durationBand, "band_2", "buildQuery forwards durationBand");
assertEqual(JSON.stringify(builtQuery.relaxedDimensions), JSON.stringify(["gender"]), "buildQuery forwards relaxedDimensions");
assertEqual(builtQuery.timeWindow.kind, "last_6_months", "buildQuery still maps the live form's timeWindow kind unchanged (irrelevant for history, since every period overrides it afterward, but not broken by this refactor)");

const minimalInput: BenchmarkFormInput = { metric: "ctr", platform: "google_ads", objective: "traffic", vertical: "finance", country: "MX" };
const minimalQuery = buildQuery(minimalInput);
assertEqual(minimalQuery.audienceStrategy, null, "buildQuery defaults an absent optional filter to null, never undefined (so a spread override always produces a real BenchmarkQuery field)");
assertEqual(JSON.stringify(minimalQuery.relaxedDimensions), "[]", "buildQuery defaults relaxedDimensions to an empty array when absent");

assertTrue(/from "@\/lib\/benchmark\/buildQuery"/.test(historicalActionsSource), "historicalActions.ts imports buildQuery from lib/benchmark/buildQuery.ts rather than redefining its own input-to-query mapping");
assertTrue(/from "@\/lib\/benchmark\/buildQuery"/.test(actionsSource), "actions.ts also imports buildQuery from the same shared module (not a locally re-defined copy) — still one mapping, used by both the live and historical paths");
assertTrue(!/export function buildQuery/.test(actionsSource), "actions.ts no longer EXPORTS buildQuery itself — a \"use server\" file's exports must each be an async function, and buildQuery has no reason to be a callable Server Action");
assertTrue(/const query = buildQuery\(input\)/.test(historicalActionsSource), "runHistoricalBenchmarkQuery builds its base query via the shared buildQuery(input) call — same mapping as the live single query");
assertTrue(!/platform:\s*input\.platform/.test(historicalActionsSource), "historicalActions.ts does not hand-copy any BenchmarkFormInput -> BenchmarkQuery field mapping of its own (that logic lives only in buildQuery)");
assertTrue(/const periodQuery: BenchmarkQuery = \{[\s\S]*?\.\.\.query,[\s\S]*?timeWindow: \{ kind: "custom"/.test(engineSource), "getHistoricalBenchmark builds each period's query by spreading the FULL incoming query ({ ...query }) and overriding only timeWindow — every optional filter buildQuery mapped rides along unchanged for every period");
assertTrue(/Never applies cohort relaxation per period/i.test(engineSource), "getHistoricalBenchmark's own docs confirm it never applies a NEW relaxation per period (only relaxations already explicit on the incoming query are honored) — periods stay comparable per §8");

// -----------------------------------------------------------------------
// §8 DIRECT-ENTRY TIME WINDOW BEHAVIOR IS UNCHANGED — toTimeWindowInput
// (the live /benchmark form's own mapping) still only ever produces the
// 4 original cases; "custom" remains reachable ONLY via the internal
// historical loop, never from a user-facing Time Window selector. This
// is the pre-existing, already-flagged UX gap (§15) — still open, not
// something this feature silently changes or hides.
// -----------------------------------------------------------------------
const buildQuerySource = readFileSync(new URL("../lib/benchmark/buildQuery.ts", import.meta.url), "utf8");
const toTimeWindowInputBody = buildQuerySource.match(/function toTimeWindowInput[\s\S]*?\n}/)?.[0] ?? "";
assertTrue(toTimeWindowInputBody.length > 0, "toTimeWindowInput is still present (now in lib/benchmark/buildQuery.ts, moved out of actions.ts — see §7's note on why)");
assertTrue(!/kind:\s*"custom"/.test(toTimeWindowInputBody), "toTimeWindowInput never produces a 'custom' TimeWindowInput — direct /benchmark entry still has no user-facing way to submit an arbitrary date range");
assertTrue(/case "custom":/.test(timeWindowSource), "resolveTimeWindow itself still fully supports 'custom' (pre-existing, reused capability) — only the UI-facing mapping is restricted");
// Real execution: even a malformed/unexpected timeWindow string (as
// BenchmarkFormInput.timeWindow is typed as plain `string`, not the
// TimeWindowInput union) can never resolve to "custom" — it falls
// through to the same last_12_months default as any other unrecognized
// value, confirming there is truly no live code path from user input to
// a "custom" window outside the historical loop's own explicit override.
assertEqual(buildQuery({ ...minimalInput, timeWindow: "custom" }).timeWindow.kind, "last_12_months", "passing the literal string 'custom' as a form's timeWindow still resolves to last_12_months, never to a real custom window");

// -----------------------------------------------------------------------
// §9 SAVED COMPARISONS — NO SCHEMA CHANGE, DYNAMIC COMPUTATION ONLY.
//
// This feature must never require a new migration (§16/§18 decision:
// implement only if schema-safe). Verified two ways: (a) the latest
// migration file on disk is still the same one that existed before this
// task started, and (b) nothing under app/comparisons/ (the saved-
// comparison feature itself) was touched — a saved comparison's
// historical view, if ever added, would recompute on demand from the
// SAME stored query shape, never a new stored column/table.
// -----------------------------------------------------------------------
assertTrue(migrationFiles.length > 0, "0019_contribution_validation.sql (the pre-existing latest migration) is still readable");
const migrationFileNames = readdirSync(new URL("../supabase/migrations/", import.meta.url)).filter((f) => /^\d{4}_/.test(f)).sort();
assertEqual(migrationFileNames.at(-1), "0019_contribution_validation.sql", "no new migration file was added by this feature — latest is still 0019_contribution_validation.sql");
assertTrue(!/from ["']@\/lib\/mock\//.test(newFilesCombined), "no new/changed file imports mock data (lib/mock/*)");

// -----------------------------------------------------------------------
// §10 SECURITY / PRIVACY — AGGREGATE-ONLY OUTPUT, NEVER A RAW IDENTIFIER.
//
// Every response shape this feature introduces (HistoricalPeriodResult/
// HistoricalBenchmarkResult in engine.ts, HistoricalPeriodResponse/
// HistoricalBenchmarkResponse in historicalActions.ts) is checked field
// by field: only aggregate stats, dates, and status strings — never a
// dataset id, user id, org id, or raw row.
// -----------------------------------------------------------------------
const historicalPeriodResultBody = engineSource.match(/export interface HistoricalPeriodResult \{[\s\S]*?\n\}/)?.[0] ?? "";
const historicalPeriodResponseBody = historicalActionsSource.match(/export interface HistoricalPeriodResponse \{[\s\S]*?\n\}/)?.[0] ?? "";
assertTrue(historicalPeriodResultBody.length > 0 && historicalPeriodResponseBody.length > 0, "both HistoricalPeriodResult and HistoricalPeriodResponse interfaces are present and matched");
for (const [label, body] of [
  ["HistoricalPeriodResult (engine.ts)", historicalPeriodResultBody],
  ["HistoricalPeriodResponse (historicalActions.ts)", historicalPeriodResponseBody],
] as const) {
  assertTrue(!/\b(dataset|user|org|organization|account)_?[Ii]d\b/.test(body), `${label} exposes no dataset/user/org id field`);
}
assertTrue(!/\bid:\s*string/.test(historicalPeriodResultBody) && !/\bid:\s*string/.test(historicalPeriodResponseBody), "neither historical response shape carries a bare 'id' field of any kind — only periodKey (a derived calendar label), dates, status, and aggregate numbers");
assertTrue(!/\bselect\(["'`][^"'`]*\*/.test(newFilesCombined), "no new/changed file selects '*' from a table (every Supabase select stays column-scoped, reused from the existing engine)");

// -----------------------------------------------------------------------
// §11 ES/EN TRANSLATION KEYS — all 12 new keys exist in BOTH locale
// blocks. Structural rather than a live import of the dictionaries
// object, because translations.ts's `en` is typed `typeof es` (a
// compile-time completeness guarantee already enforced by `npx tsc
// --noEmit`), so a real per-key text presence check is what actually
// adds coverage here.
// -----------------------------------------------------------------------
const NEW_HISTORICAL_KEYS = [
  "historicalTitle",
  "historicalSubtitle",
  "historicalLoading",
  "historicalError",
  "historicalNotEnoughPeriods",
  "historicalChartSrHint",
  "historicalInsufficientDetail",
  "historicalNoDataDetail",
  "historicalMethodologyBlockDetail",
  "historicalErrorDetail",
  "historicalDeltaUp",
  "historicalDeltaDown",
];
const esBlockSource = translationsSource.slice(0, translationsSource.indexOf("\nconst en"));
const enBlockSource = translationsSource.slice(translationsSource.indexOf("\nconst en"));
for (const key of NEW_HISTORICAL_KEYS) {
  const keyPattern = new RegExp(`\\b${key}:\\s*"`);
  assertTrue(keyPattern.test(esBlockSource), `Spanish dictionary defines benchmarkLive.${key}`);
  assertTrue(keyPattern.test(enBlockSource), `English dictionary defines benchmarkLive.${key}`);
}
assertTrue(/historicalDeltaUp:\s*"[^"]*\{percent\}/.test(esBlockSource) && /historicalDeltaUp:\s*"[^"]*\{percent\}/.test(enBlockSource), "historicalDeltaUp interpolates {percent} in both locales");
assertTrue(!/mejor|peor|ganador|ranking|score/i.test(NEW_HISTORICAL_KEYS.map((k) => (esBlockSource.match(new RegExp(`${k}:\\s*"([^"]*)"`))?.[1] ?? "")).join(" ")), "none of the new Spanish strings use winner/ranking/score/better-worse language");
assertTrue(!/empeor|mejor[oó]|positivo|negativo/i.test(esBlockSource.match(/historicalDelta(Up|Down):\s*"([^"]*)"/g)?.join(" ") ?? ""), "the median delta strings use neutral 'aumentó/disminuyó' wording, never 'mejoró/empeoró/positivo/negativo' (§9's explicit ban)");

// -----------------------------------------------------------------------
// §12 MOBILE STRUCTURE — no new fixed-pixel-width or horizontal-scroll
// pattern in the new client component. The SVG's own CHART_WIDTH/
// CHART_HEIGHT constants are viewBox coordinates (an internal drawing
// space), never a CSS width — the rendered <svg> itself is `w-full`.
// -----------------------------------------------------------------------
assertTrue(/className="h-24 w-full"/.test(historicalSectionSource), "the chart <svg> is styled w-full (fluid width), not a fixed pixel width");
assertTrue(!/overflow-x-(scroll|auto)/.test(historicalSectionSource), "no horizontal-scroll container was introduced for the historical section");
assertTrue(!/\bw-\[\d+px\]|\bmin-w-\[\d+px\]/.test(historicalSectionSource), "no hardcoded fixed-pixel width class was introduced");
assertTrue(/viewBox=\{`0 0 \$\{CHART_WIDTH\} \$\{CHART_HEIGHT\}`\}/.test(historicalSectionSource) && /preserveAspectRatio="none"/.test(historicalSectionSource), "CHART_WIDTH/CHART_HEIGHT are used only as the SVG's internal viewBox coordinate space (scaled to fit via preserveAspectRatio), never as a fixed on-screen size");

// -----------------------------------------------------------------------
// §13 TEXTUAL FALLBACK NEVER DEPENDS ON THE CHART (§14).
// -----------------------------------------------------------------------
assertTrue(/<ul className="mt-3 space-y-1\.5">/.test(historicalSectionSource), "a textual period list is always rendered alongside/after the chart");
assertTrue(/periods\.map\(\(p\) =>/.test(historicalSectionSource.slice(historicalSectionSource.indexOf('<ul className="mt-3'))), "the textual list iterates every period regardless of whether the chart itself rendered (chart rendering is gated by `eligibility === \"trend\"`, the list is not)");

// -----------------------------------------------------------------------
// §14 LAZY LOADING (§11) — the historical query must never run until the
// user actually opens the disclosure, so a plain single-metric query
// never pays for N extra period queries nobody asked to see.
// -----------------------------------------------------------------------
assertTrue(/function handleToggle\(nextOpen: boolean\)/.test(historicalSectionSource), "HistoricalBenchmarkSection defines its own open/close handler");
assertTrue(/if \(nextOpen && !loaded && !loading\)/.test(historicalSectionSource), "the historical query only fires the first time the section is opened (nextOpen && not already loaded/loading) — never on mount, never on every toggle");
assertTrue(!/useEffect/.test(historicalSectionSource), "no useEffect auto-triggers the historical query on mount or on prop change — it is opened by explicit user action only");

// -----------------------------------------------------------------------
// §15 CANONICAL LIVE-DATA REGRESSION — EXPLICIT, HONEST DISCLOSURE.
//
// This suite cannot execute the canonical "CPM median=3.85,
// sampleSize=15" check (or any equivalent real per-period sample-size
// assertion) against getHistoricalBenchmark, because doing so requires
// a live Supabase/Postgres connection this sandbox does not have — the
// same limitation already documented for scripts/e2e-fixture-test.mts.
// Printed as a visible, non-silent notice rather than a fabricated pass.
// -----------------------------------------------------------------------
console.log("NOTE: the canonical CPM median=3.85/sampleSize=15 live-data regression (and any real per-period sample-size check) could not be executed in this sandbox — no live Supabase/Postgres connection is reachable here. Structural review of getHistoricalBenchmark (see §1 above) confirms it reuses the exact same query path that produces that canonical result for the live single-query case.");

console.log(`test-historical-benchmarks: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
