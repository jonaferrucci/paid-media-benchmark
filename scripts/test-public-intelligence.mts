// Phase 18 tests — real imports of the shipped pure modules.

import { resolveLatestAndPrevious, computeChange, trendEligibility, isChangeMeaningful, freshnessLabel, findDuplicateSnapshotIndices } from "../lib/media/trend";
import { normalizeProviderRecord } from "../lib/media/providers";
import { detectSnapshotMapping, applySnapshotMapping, validateSnapshotRow, markSnapshotDuplicates } from "../lib/media/importSnapshots";
import { parseCsv } from "../lib/import/parse";
import { generateSnapshotCsvTemplate } from "../lib/media/snapshotTemplate";

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`); }
}
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

// --- Latest/previous resolution (chronological ordering) -----------------
const history = [
  { value: 3420000, observed_at: "2026-09-01", source: "youtube" },
  { value: 3300000, observed_at: "2026-08-01", source: "youtube" },
  { value: 3100000, observed_at: "2026-07-01", source: "youtube" },
];
const { latest, previous } = resolveLatestAndPrevious(history);
assertEqual(latest?.value, 3420000, "latest snapshot resolution picks the first (most recent) entry");
assertEqual(previous?.value, 3300000, "previous snapshot resolution picks the second entry");
assertEqual(resolveLatestAndPrevious([]).latest, null, "empty history resolves to null latest, not a crash");
assertEqual(resolveLatestAndPrevious([history[0]]).previous, null, "single snapshot has no previous");

// --- Change calculation with zero-denominator safety ----------------------
assertEqual(computeChange(3300000, 3420000), { absolute: 120000, percent: (120000 / 3300000) * 100 }, "change calculation correct for a real growth case");
assertEqual(computeChange(0, 500), { absolute: 500, percent: null }, "zero previous denominator produces null percent, never divides by zero");
assertEqual(computeChange(100, 100).absolute, 0, "no change resolves to zero absolute delta");

// --- Trend eligibility (item 10) ------------------------------------------
assertEqual(trendEligibility(0), "value_only", "0 snapshots -> value_only");
assertEqual(trendEligibility(1), "value_only", "1 snapshot -> value_only, not a false trend");
assertEqual(trendEligibility(2), "change_only", "2 snapshots -> change_only");
assertEqual(trendEligibility(3), "trend", "3 snapshots -> trend eligible");
assertEqual(trendEligibility(50), "trend", "many snapshots -> still just trend (no special tier beyond 3+)");

// --- Cumulative vs period metric behavior (item 11) ------------------------
assertTrue(isChangeMeaningful("count"), "count (cumulative, e.g. subscribers) is change-eligible");
assertTrue(isChangeMeaningful("rate"), "rate (period, e.g. videos_per_month) is change-eligible");
assertTrue(!isChangeMeaningful("duration"), "duration (e.g. channel_age) is NOT framed as a growth percentage");

// --- Freshness / age helper -----------------------------------------------
const now = new Date("2026-09-16T12:00:00Z");
assertEqual(freshnessLabel("2026-09-16", now, "es"), "Actualizado hoy", "same-day observation reads as 'today'");
assertEqual(freshnessLabel("2026-09-15", now, "es"), "Hace 1 día", "1 day ago, singular form");
assertEqual(freshnessLabel("2026-09-10", now, "es"), "Hace 6 días", "under a month shows exact day count");
assertEqual(freshnessLabel("2026-08-01", now, "es"), "Hace 1 mes", "over a month rounds to months, singular form correct");
assertEqual(freshnessLabel("2024-09-01", now, "es"), "Hace 2 años", "over a year rounds to years");
assertEqual(freshnessLabel("2026-09-16", now, "en"), "Updated today", "EN locale produces English label");

// --- Duplicate detection within an import (item 21) ------------------------
const dupCandidates = [
  { platformKey: "olga", propertyKey: null, metricKey: "subscriber_count", observedAt: "2026-09-01" },
  { platformKey: "olga", propertyKey: null, metricKey: "subscriber_count", observedAt: "2026-09-01" }, // exact dup
  { platformKey: "olga", propertyKey: null, metricKey: "total_views", observedAt: "2026-09-01" }, // different metric, not a dup
];
const dupIndices = findDuplicateSnapshotIndices(dupCandidates);
assertTrue(dupIndices.has(1) && !dupIndices.has(0), "second identical row flagged, first occurrence kept clean");
assertTrue(!dupIndices.has(2), "different metric for the same outlet/date is correctly NOT flagged as a duplicate");

// --- Provider adapter (item 7) ----------------------------------------------
const providerResult = normalizeProviderRecord(
  { externalEntityId: "UC12345", metricKey: "subscriber_count", value: 3420000, observedAt: "2026-09-01", sourceType: "youtube" },
  (extId) => (extId === "UC12345" ? "platform-uuid-olga" : null),
  (key) => (key === "subscriber_count" ? "metric-uuid-subs" : null)
);
assertEqual(providerResult, { platformId: "platform-uuid-olga", metricDefinitionId: "metric-uuid-subs", value: 3420000, observedAt: "2026-09-01", source: "youtube", sourceReference: undefined }, "provider record normalizes correctly when both ids resolve");
assertEqual(
  normalizeProviderRecord({ externalEntityId: "UNKNOWN", metricKey: "subscriber_count", value: 100, observedAt: "2026-09-01", sourceType: "youtube" }, () => null, () => "x"),
  null,
  "unresolvable external entity id -> null, never silently creates a new platform"
);
assertEqual(
  normalizeProviderRecord({ externalEntityId: "UC1", metricKey: "subscriber_count", value: -5, observedAt: "2026-09-01", sourceType: "youtube" }, () => "p", () => "m"),
  null,
  "negative value from a provider is rejected, not passed through"
);

// --- Snapshot CSV import: mapping + validation (item 20) --------------------
const csv = "medio,métrica,valor,fecha,fuente\nolga,subscriber_count,3420000,2026-09-01,youtube\nunknown_outlet_xyz,subscriber_count,100,2026-09-01,youtube\n";
const parsed = parseCsv(csv);
assertTrue(parsed.ok, "snapshot CSV parses via the reused Phase 16 parser (no second parser)");
if (parsed.ok) {
  const mappings = detectSnapshotMapping(parsed.table);
  assertEqual(mappings.find((m) => m.sourceHeader === "medio")?.field, "media_outlet", "Spanish header 'medio' detected as media_outlet");
  assertEqual(mappings.find((m) => m.sourceHeader === "métrica")?.field, "metric", "Spanish header 'métrica' detected as metric");

  const rawRows = applySnapshotMapping(parsed.table, mappings);
  const knownPlatforms = [{ internal_key: "olga", display_label: "OLGA" }];
  const knownMetrics = [{ internal_key: "subscriber_count", display_label: "Subscribers" }];

  const validatedFirst = validateSnapshotRow(rawRows[0], knownPlatforms, knownMetrics);
  assertEqual(validatedFirst.status, "valid", "known outlet + known metric + valid number/date resolves to valid");
  assertEqual(validatedFirst.platformKey, "olga", "platform correctly resolved to its internal_key");

  const validatedSecond = validateSnapshotRow(rawRows[1], knownPlatforms, knownMetrics);
  assertEqual(validatedSecond.status, "needs_review", "unknown outlet flagged for review, never silently creates a new catalog entry");
  assertTrue(validatedSecond.errors.includes("import.issue.unknownMediaOutlet"), "unknown outlet produces the correct specific error key");
}

// --- Snapshot import duplicate marking --------------------------------------
const rowsForDup = [
  { rowNumber: 2, platformKey: "olga", metricKey: "subscriber_count", value: 100, observedAt: "2026-09-01", source: "youtube", sourceReference: null, status: "valid" as const, errors: [] },
  { rowNumber: 3, platformKey: "olga", metricKey: "subscriber_count", value: 100, observedAt: "2026-09-01", source: "youtube", sourceReference: null, status: "valid" as const, errors: [] },
];
const markedDup = markSnapshotDuplicates(rowsForDup);
assertEqual(markedDup[1].status, "duplicate", "second identical valid row marked as duplicate after validation, never silently dropped");
assertEqual(markedDup[0].status, "valid", "first occurrence remains valid");

// --- Public template generation / no fake fallback (item 5/26) -------------
const template = generateSnapshotCsvTemplate();
assertTrue(template.includes("media_outlet") && template.includes("observed_at"), "template contains the canonical snapshot headers");
assertTrue(template.split("\r\n").length === 2, "template has exactly header + one clearly-example row, not fabricated production data");

console.log(`\n${failed === 0 ? "ALL" : failed} PHASE 18 TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
