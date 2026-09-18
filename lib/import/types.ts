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
  | "total_revenue"
  // Post-MVP real-Meta-export fix (§3): a real, existing field a
  // source column can map to — NOT a new persisted database column.
  // It flows through the same mapping/normalize pipeline as every
  // other field so it can be auto-recognized and shown in preview
  // (never a giant "no necesarias" dump for campaign identity), but
  // app/contribute/bulk-actions.ts never writes it anywhere: the
  // performance_datasets schema has no campaign-name/title column,
  // and this task creates no migration to add one.
  | "campaign_name"
  // POST-MVP IMPORT FIX 3 (§N): campaign subtype context (e.g. Google's
  // own "Búsqueda"/"Search", "Máximo rendimiento"/"Performance Max").
  // performance_datasets DOES have a real campaign_type_id FK, but
  // resolving it correctly requires a platform-scoped taxonomy lookup
  // (campaign_types is scoped per platform_id, and several platforms
  // reuse the same internal_key, e.g. "standard") plus an ES/EN label
  // dictionary for each platform's own export wording — real work
  // deliberately deferred rather than rushed (see the unresolved-issues
  // note this task's final response calls out). For now this is
  // review/context-only, exactly like "campaign_name" above: never
  // persisted, never taxonomy-resolved, just carried through so the
  // review UI can show it and the user isn't left wondering where it
  // went.
  | "campaign_type";

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
  "campaign_name",
  "campaign_type",
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
  // Post-MVP real-Meta-export fix (§3): a passthrough string, never
  // taxonomy-resolved and never validated — purely so the review UI
  // can show which real-world campaign each row belongs to instead of
  // an anonymous row number. NOT persisted (see the CanonicalField
  // "campaign_name" comment in this file for why).
  campaignName: string | null;
  // POST-MVP IMPORT FIX 3 (§N): same passthrough treatment as
  // campaignName above — a raw string, never taxonomy-resolved, shown
  // in review only. See the "campaign_type" CanonicalField comment in
  // this file for why real campaign_type_id resolution is deferred.
  campaignType: string | null;
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
