import type { CanonicalField, MappedRow, NormalizedRow, RowIssue } from "./types";
import { REQUIRED_FIELDS } from "./types";
import { parseLatamAwareNumber, parseFlexibleDate, matchTaxonomyValue } from "./normalize";
import { isSupportedCurrencyCode } from "@/lib/config/currencies";

export interface ValidationTaxonomies {
  platforms: { internal_key: string; display_label: string }[];
  objectives: { internal_key: string; display_label: string }[];
  verticals: { internal_key: string; display_label: string }[];
  countries: { iso_code: string; display_label: string }[];
  businessModels: { internal_key: string; display_label: string }[];
  audienceStrategies: { internal_key: string; display_label: string }[];
  funnelStages: { internal_key: string; display_label: string }[];
}

const NUMERIC_FIELDS: CanonicalField[] = [
  "ad_spend", "impressions", "reach", "clicks", "link_clicks", "landing_page_views",
  "video_views", "engagements", "conversions", "attributed_revenue", "total_revenue",
];

const TAXONOMY_FIELD_MAP: Partial<Record<CanonicalField, keyof ValidationTaxonomies>> = {
  platform: "platforms",
  objective: "objectives",
  vertical: "verticals",
  country: "countries",
  business_model: "businessModels",
  audience_strategy: "audienceStrategies",
  funnel_stage: "funnelStages",
};

export function normalizeAndValidateRow(
  rowNumber: number,
  mapped: MappedRow,
  taxonomies: ValidationTaxonomies
): NormalizedRow {
  const issues: RowIssue[] = [];

  function resolveTaxonomy(field: CanonicalField): string | null {
    const raw = mapped[field];
    if (!raw) return null;
    const key = TAXONOMY_FIELD_MAP[field];
    if (!key) return null;
    const list = taxonomies[key] as { internal_key?: string; iso_code?: string; display_label: string }[];
    const match = matchTaxonomyValue(raw, list);
    if (!match) {
      issues.push({
        field,
        severity: REQUIRED_FIELDS.includes(field) ? "error" : "warning",
        messageKey: "import.issue.unknownTaxonomyValue",
        messageVars: { value: raw },
      });
    }
    return match;
  }

  const platform = resolveTaxonomy("platform");
  const objective = resolveTaxonomy("objective");
  const vertical = resolveTaxonomy("vertical");
  const country = resolveTaxonomy("country");
  const businessModel = resolveTaxonomy("business_model");
  const audienceStrategy = resolveTaxonomy("audience_strategy");
  const funnelStage = resolveTaxonomy("funnel_stage");

  // Required-field presence checks (fields with no raw value at all).
  for (const field of REQUIRED_FIELDS) {
    if (field === "start_date" || field === "end_date" || field === "ad_spend") continue; // checked separately below
    if (!mapped[field]) {
      issues.push({ field, severity: "error", messageKey: "import.issue.missingRequired" });
    }
  }

  // Dates.
  let startDate: string | null = null;
  let endDate: string | null = null;
  if (!mapped.start_date) {
    issues.push({ field: "start_date", severity: "error", messageKey: "import.issue.missingRequired" });
  } else {
    const parsed = parseFlexibleDate(mapped.start_date);
    startDate = parsed.iso;
    if (!parsed.iso) issues.push({ field: "start_date", severity: "error", messageKey: "import.issue.invalidDate", messageVars: { value: mapped.start_date } });
    else if (parsed.ambiguous) issues.push({ field: "start_date", severity: "warning", messageKey: "import.issue.ambiguousDate", messageVars: { value: mapped.start_date } });
  }
  if (!mapped.end_date) {
    issues.push({ field: "end_date", severity: "error", messageKey: "import.issue.missingRequired" });
  } else {
    const parsed = parseFlexibleDate(mapped.end_date);
    endDate = parsed.iso;
    if (!parsed.iso) issues.push({ field: "end_date", severity: "error", messageKey: "import.issue.invalidDate", messageVars: { value: mapped.end_date } });
    else if (parsed.ambiguous) issues.push({ field: "end_date", severity: "warning", messageKey: "import.issue.ambiguousDate", messageVars: { value: mapped.end_date } });
  }
  if (startDate && endDate && endDate < startDate) {
    issues.push({ field: "end_date", severity: "error", messageKey: "import.issue.endBeforeStart" });
  }

  // Numeric fields.
  const rawMetrics: Partial<Record<string, number>> = {};
  let adSpend: number | null = null;
  for (const field of NUMERIC_FIELDS) {
    const raw = mapped[field];
    if (!raw) {
      if (field === "ad_spend") issues.push({ field, severity: "error", messageKey: "import.issue.missingRequired" });
      continue;
    }
    const parsed = parseLatamAwareNumber(raw);
    if (parsed.value === null) {
      issues.push({ field, severity: "error", messageKey: "import.issue.invalidNumber", messageVars: { value: raw } });
      continue;
    }
    if (parsed.value < 0) {
      issues.push({ field, severity: "error", messageKey: "import.issue.negativeNumber", messageVars: { value: raw } });
      continue;
    }
    if (parsed.ambiguous) {
      issues.push({ field, severity: "warning", messageKey: "import.issue.ambiguousNumber", messageVars: { value: raw } });
    }
    if (field === "ad_spend") adSpend = parsed.value;
    else rawMetrics[field] = parsed.value;
  }

  // Phase 19B item 4: validated against the centralized controlled set
  // (lib/config/currencies.ts), not a length-only check. Still a
  // warning, not a hard error — the same permissive-but-flagged
  // behavior as before, so existing bulk-import flows and any
  // already-submitted currency values keep working unchanged; the row
  // is simply flagged for human review, same as any other warning.
  const currency = (mapped.currency || "USD").toUpperCase().slice(0, 3);
  if (mapped.currency && !isSupportedCurrencyCode(mapped.currency)) {
    issues.push({ field: "currency", severity: "warning", messageKey: "import.issue.unrecognizedCurrency", messageVars: { value: mapped.currency } });
  }

  const hasError = issues.some((i) => i.severity === "error");
  const status: NormalizedRow["status"] = hasError ? "needs_review" : "valid";

  // Post-MVP real-Meta-export fix (§3): a plain passthrough, never
  // taxonomy-resolved or validated — see the "campaign_name"
  // CanonicalField comment in types.ts for why this is display-only.
  const campaignName = mapped.campaign_name?.trim() || null;

  return {
    rowNumber,
    campaignName,
    platform,
    objective,
    vertical,
    country,
    businessModel,
    audienceStrategy,
    funnelStage,
    startDate,
    endDate,
    currency,
    adSpend,
    rawMetrics,
    issues,
    status,
  };
}

// Within-import duplicate detection (Phase 16 item 29): flags rows
// sharing the same platform + objective + country + date range +
// ad_spend as likely duplicates. Never deletes anything — just marks
// for review, same as any other warning-level issue.
export function detectDuplicates(rows: NormalizedRow[]): NormalizedRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.status !== "valid") return row;
    const key = `${row.platform}|${row.objective}|${row.country}|${row.startDate}|${row.endDate}|${row.adSpend}`;
    const firstSeenRow = seen.get(key);
    if (firstSeenRow !== undefined) {
      return {
        ...row,
        status: "duplicate" as const,
        issues: [...row.issues, { field: null, severity: "warning" as const, messageKey: "import.issue.possibleDuplicate", messageVars: { row: firstSeenRow } }],
      };
    }
    seen.set(key, row.rowNumber);
    return row;
  });
}
