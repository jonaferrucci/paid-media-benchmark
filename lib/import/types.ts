// Phase 16 canonical import pipeline types.
//
// Every contribution path (manual entry, CSV, XLSX — clipboard paste
// deferred, see README note in mapping.ts) produces the SAME
// intermediate representation below, which then flows through the
// SAME mapping → normalize → validate → preview → persist stages.
// This is the "one normalized intermediate representation" required
// by the brief — no parallel validation systems per input type.

// Canonical fields a source column can be mapped to. Names match the
// existing ContributionPayload/taxonomy field names exactly — no
// parallel taxonomy invented.
export type CanonicalField =
  | "platform"
  | "objective"
  | "vertical"
  | "country"
  | "business_model"
  | "audience_strategy"
  | "funnel_stage"
  | "start_date"
  | "end_date"
  | "currency"
  | "ad_spend"
  | "impressions"
  | "reach"
  | "clicks"
  | "link_clicks"
  | "landing_page_views"
  | "video_views"
  | "engagements"
  | "conversions"
  | "attributed_revenue"
  | "total_revenue";

export const REQUIRED_FIELDS: CanonicalField[] = [
  "platform",
  "objective",
  "vertical",
  "country",
  "start_date",
  "end_date",
  "ad_spend",
];

export const OPTIONAL_FIELDS: CanonicalField[] = [
  "business_model",
  "audience_strategy",
  "funnel_stage",
  "currency",
  "impressions",
  "reach",
  "clicks",
  "link_clicks",
  "landing_page_views",
  "video_views",
  "engagements",
  "conversions",
  "attributed_revenue",
  "total_revenue",
];

// A raw parsed table, before any mapping — the direct output of the
// CSV/XLSX parsers. Headers preserved exactly as found in the file.
export interface RawTable {
  headers: string[];
  rows: string[][];
}

// One detected header -> canonical field suggestion.
export interface DetectedMapping {
  sourceHeader: string;
  sourceColumnIndex: number;
  canonicalField: CanonicalField | null;
  // "mapped": confidently auto-detected. "needs_review": header found
  // but ambiguous/unrecognized, canonicalField is null until the user
  // picks one. "ignored": user (or a duplicate-field conflict) marked
  // this column as not imported.
  state: "mapped" | "needs_review" | "ignored";
}

// One row after applying the column mapping — still raw strings, not
// yet normalized/validated.
export type MappedRow = Partial<Record<CanonicalField, string>>;

export type Severity = "error" | "warning";

export interface RowIssue {
  field: CanonicalField | null;
  severity: Severity;
  // Translation key + interpolation vars, never a hardcoded message —
  // see lib/import/validate.ts for the exact keys used.
  messageKey: string;
  messageVars?: Record<string, string | number>;
}

// A single row after normalization + validation — this is what the
// preview table and the confirm/persist step both consume.
export interface NormalizedRow {
  rowNumber: number; // 1-based, matches what a spreadsheet user expects
  platform: string | null; // resolved taxonomy internal_key
  objective: string | null;
  vertical: string | null;
  country: string | null; // resolved ISO code
  businessModel: string | null;
  audienceStrategy: string | null;
  funnelStage: string | null;
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;
  currency: string; // 3-letter code, defaults applied upstream
  adSpend: number | null;
  rawMetrics: Partial<Record<string, number>>;
  issues: RowIssue[];
  status: "valid" | "needs_review" | "duplicate";
}

export interface ImportSummary {
  totalRows: number;
  validCount: number;
  needsReviewCount: number;
  ignoredCount: number;
}
