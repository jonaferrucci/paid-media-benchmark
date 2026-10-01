import { parseLatamAwareNumber, parseFlexibleDate } from "@/lib/import/normalize";
import type { RawTable } from "@/lib/import/types";
import { classifySnapshotFileDuplicates, type SnapshotFileCandidate } from "./snapshotDuplicates";

// Phase 18 item 4/5: reuses lib/import/parse.ts's parseCsv/
// parseXlsxBuffer directly (format-agnostic, already generic over any
// RawTable) — this file only adds the snapshot-specific field
// detection/validation layer on top, never a second parser.

export type SnapshotField = "media_outlet" | "property" | "metric" | "value" | "observed_at" | "source" | "source_reference";

const SNAPSHOT_ALIASES: Record<SnapshotField, string[]> = {
  media_outlet: ["media_outlet", "medio", "outlet", "platform", "plataforma", "canal"],
  property: ["property", "propiedad", "channel", "canal específico"],
  metric: ["metric", "métrica", "metrica"],
  value: ["value", "valor"],
  observed_at: ["observed_at", "fecha", "date", "fecha de observación"],
  source: ["source", "fuente"],
  source_reference: ["source_reference", "referencia", "url", "link"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\-.]/g, " ").replace(/\s+/g, " ").trim();
}

const ALIAS_LOOKUP = new Map<string, SnapshotField>();
for (const [field, aliases] of Object.entries(SNAPSHOT_ALIASES) as [SnapshotField, string[]][]) {
  for (const alias of aliases) ALIAS_LOOKUP.set(normalizeHeader(alias), field);
}

export interface SnapshotColumnMapping {
  sourceHeader: string;
  sourceColumnIndex: number;
  field: SnapshotField | null;
}

// Same "first match claims the field, no silent duplicate mapping"
// rule as lib/import/mapping.ts's detectMapping.
export function detectSnapshotMapping(table: RawTable): SnapshotColumnMapping[] {
  const claimed = new Set<SnapshotField>();
  return table.headers.map((header, index) => {
    const candidate = ALIAS_LOOKUP.get(normalizeHeader(header));
    if (candidate && !claimed.has(candidate)) {
      claimed.add(candidate);
      return { sourceHeader: header, sourceColumnIndex: index, field: candidate };
    }
    return { sourceHeader: header, sourceColumnIndex: index, field: null };
  });
}

export interface RawSnapshotRow {
  rowNumber: number;
  mediaOutlet: string;
  property: string | null;
  metric: string;
  value: string;
  observedAt: string;
  source: string;
  sourceReference: string | null;
}

export function applySnapshotMapping(table: RawTable, mappings: SnapshotColumnMapping[]): RawSnapshotRow[] {
  const byField = new Map(mappings.filter((m) => m.field).map((m) => [m.field as SnapshotField, m.sourceColumnIndex]));
  return table.rows.map((row, i) => ({
    rowNumber: i + 2,
    mediaOutlet: byField.has("media_outlet") ? row[byField.get("media_outlet")!] ?? "" : "",
    property: byField.has("property") ? (row[byField.get("property")!] || null) : null,
    metric: byField.has("metric") ? row[byField.get("metric")!] ?? "" : "",
    value: byField.has("value") ? row[byField.get("value")!] ?? "" : "",
    observedAt: byField.has("observed_at") ? row[byField.get("observed_at")!] ?? "" : "",
    source: byField.has("source") ? row[byField.get("source")!] ?? "" : "",
    sourceReference: byField.has("source_reference") ? (row[byField.get("source_reference")!] || null) : null,
  }));
}

export interface ValidatedSnapshotRow {
  rowNumber: number;
  platformKey: string | null; // resolved internal_key, or null if unrecognized
  metricKey: string | null;
  value: number | null;
  observedAt: string | null;
  source: string;
  sourceReference: string | null;
  // CONTRIBUTION RELIABILITY PASS B (§1/§2): "conflicting" is a new,
  // distinct status from "duplicate" — same identity (platform +
  // property + metric + observed_at) but a DIFFERENT value than
  // another row in this same file. Unlike "duplicate" (an exact
  // repeat, excluded from submission exactly as before this pass),
  // a "conflicting" row is never blocked — it may still be submitted
  // for curator review, per the approved product decision. Never
  // silently resolved to "whichever is latest."
  status: "valid" | "needs_review" | "duplicate" | "conflicting";
  errors: string[]; // translation keys, same convention as lib/import/validate.ts
}

// Item 20: unknown outlet/metric NEVER silently becomes a new
// canonical entry — validation only resolves against what's already
// passed in (the real catalog), and flags anything it can't match.
export function validateSnapshotRow(
  row: RawSnapshotRow,
  knownPlatforms: { internal_key: string; display_label: string }[],
  knownMetrics: { internal_key: string; display_label: string }[]
): ValidatedSnapshotRow {
  const errors: string[] = [];

  const platform = knownPlatforms.find(
    (p) => p.internal_key === row.mediaOutlet.trim() || p.display_label.toLowerCase() === row.mediaOutlet.trim().toLowerCase()
  );
  if (!platform) errors.push("import.issue.unknownMediaOutlet");

  const metric = knownMetrics.find(
    (m) => m.internal_key === row.metric.trim() || m.display_label.toLowerCase() === row.metric.trim().toLowerCase()
  );
  if (!metric) errors.push("import.issue.unknownMetricDefinition");

  const parsedValue = parseLatamAwareNumber(row.value);
  if (parsedValue.value === null || parsedValue.value < 0) errors.push("import.issue.invalidNumber");

  const parsedDate = parseFlexibleDate(row.observedAt);
  if (!parsedDate.iso) errors.push("import.issue.invalidDate");

  if (!row.source.trim()) errors.push("import.issue.missingRequired");

  return {
    rowNumber: row.rowNumber,
    platformKey: platform?.internal_key ?? null,
    metricKey: metric?.internal_key ?? null,
    value: parsedValue.value,
    observedAt: parsedDate.iso,
    source: row.source.trim(),
    sourceReference: row.sourceReference,
    status: errors.length > 0 ? "needs_review" : "valid",
    errors,
  };
}

// CONTRIBUTION RELIABILITY PASS B (§1/§2): previously this collapsed
// "same identity, same value" and "same identity, different value"
// into the exact same "duplicate" classification — a corrected
// re-entry for the same day looked identical to an accidental repeat,
// and was silently blocked either way with no information about which
// one it was. classifySnapshotFileDuplicates now distinguishes them:
// an exact value match still becomes "duplicate" (same blocking
// behavior as before), a differing value becomes the new "conflicting"
// status (never blocked — see the field's own comment above).
export function markSnapshotDuplicates(rows: ValidatedSnapshotRow[]): ValidatedSnapshotRow[] {
  const candidates: SnapshotFileCandidate[] = rows.map((r) => ({
    platformKey: r.platformKey ?? "",
    propertyKey: null,
    metricKey: r.metricKey ?? "",
    observedAt: r.observedAt ?? "",
    value: r.value ?? 0,
  }));
  const verdicts = classifySnapshotFileDuplicates(candidates);
  return rows.map((r, i) => {
    if (r.status !== "valid") return r;
    const verdict = verdicts.get(i);
    if (verdict === "exact_duplicate") return { ...r, status: "duplicate" as const };
    if (verdict === "conflicting_version") return { ...r, status: "conflicting" as const };
    return r;
  });
}
