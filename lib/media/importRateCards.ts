import { parseLatamAwareNumber, parseFlexibleDate } from "@/lib/import/normalize";
import type { RawTable } from "@/lib/import/types";
import { isSupportedCurrencyCode } from "@/lib/config/currencies";
import { classifyRateCardFileDuplicates, type RateCardFileCandidate } from "./rateCardDuplicates";

// Phase 19 item 9/10/11: reuses lib/import/parse.ts's parseCsv/
// parseXlsxBuffer directly — same reused pattern as lib/media/
// importSnapshots.ts (Phase 18B), never a third parser.

export type RateCardField = "media_outlet" | "property" | "format" | "price" | "currency" | "pricing_unit" | "valid_from" | "valid_to" | "source" | "source_reference" | "notes";

const RATE_CARD_ALIASES: Record<RateCardField, string[]> = {
  media_outlet: ["media_outlet", "medio", "outlet", "media", "canal"],
  property: ["property", "propiedad"],
  format: ["format", "formato", "acción", "accion", "producto"],
  price: ["price", "precio", "tarifa", "rate", "cost"],
  currency: ["currency", "moneda"],
  pricing_unit: ["pricing_unit", "unidad", "unidad de precio"],
  valid_from: ["valid_from", "vigencia desde", "desde", "valid from"],
  valid_to: ["valid_to", "vigencia hasta", "hasta", "valid to"],
  source: ["source", "fuente"],
  source_reference: ["source_reference", "referencia", "url", "link"],
  notes: ["notes", "notas", "observaciones"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[_\-.]/g, " ").replace(/\s+/g, " ").trim();
}

const ALIAS_LOOKUP = new Map<string, RateCardField>();
for (const [field, aliases] of Object.entries(RATE_CARD_ALIASES) as [RateCardField, string[]][]) {
  for (const alias of aliases) ALIAS_LOOKUP.set(normalizeHeader(alias), field);
}

export interface RateCardColumnMapping {
  sourceHeader: string;
  sourceColumnIndex: number;
  field: RateCardField | null;
}

export function detectRateCardMapping(table: RawTable): RateCardColumnMapping[] {
  const claimed = new Set<RateCardField>();
  return table.headers.map((header, index) => {
    const candidate = ALIAS_LOOKUP.get(normalizeHeader(header));
    if (candidate && !claimed.has(candidate)) {
      claimed.add(candidate);
      return { sourceHeader: header, sourceColumnIndex: index, field: candidate };
    }
    return { sourceHeader: header, sourceColumnIndex: index, field: null };
  });
}

export interface RawRateCardRow {
  rowNumber: number;
  mediaOutlet: string;
  property: string | null;
  format: string;
  price: string;
  currency: string;
  pricingUnit: string;
  validFrom: string;
  validTo: string | null;
  source: string;
  sourceReference: string | null;
  notes: string | null;
}

export function applyRateCardMapping(table: RawTable, mappings: RateCardColumnMapping[]): RawRateCardRow[] {
  const byField = new Map(mappings.filter((m) => m.field).map((m) => [m.field as RateCardField, m.sourceColumnIndex]));
  const get = (row: string[], field: RateCardField) => (byField.has(field) ? row[byField.get(field)!] ?? "" : "");
  return table.rows.map((row, i) => ({
    rowNumber: i + 2,
    mediaOutlet: get(row, "media_outlet"),
    property: get(row, "property") || null,
    format: get(row, "format"),
    price: get(row, "price"),
    currency: get(row, "currency"),
    pricingUnit: get(row, "pricing_unit"),
    validFrom: get(row, "valid_from"),
    validTo: get(row, "valid_to") || null,
    source: get(row, "source"),
    sourceReference: get(row, "source_reference") || null,
    notes: get(row, "notes") || null,
  }));
}

const VALID_PRICING_UNITS = new Set([
  "per_integration", "per_spot", "per_mention", "per_day", "per_week", "per_month", "per_thousand", "package", "custom",
]);

export interface ValidatedRateCardRow {
  rowNumber: number;
  platformKey: string | null;
  mediaFormatKey: string | null;
  price: number | null;
  currency: string | null;
  pricingUnit: string | null;
  validFrom: string | null;
  validTo: string | null;
  source: string;
  sourceReference: string | null;
  notes: string | null;
  // CONTRIBUTION RELIABILITY PASS B (§4/§5): "conflicting" is a new,
  // distinct status from "duplicate" — same canonical identity
  // (RateCardIdentity: platform + property + format + currency +
  // pricing_unit) AND the same validFrom, but a DIFFERENT price than
  // another row in this same file. Unlike "duplicate" (an exact
  // repeat, excluded from submission exactly as before this pass), a
  // "conflicting" row is never blocked — it may still be submitted for
  // curator review. Never silently resolved, never auto-superseded.
  status: "valid" | "needs_review" | "duplicate" | "conflicting";
  errors: string[];
}

// Item 12: unknown outlet/format NEVER becomes canonical automatically
// — validation only resolves against what's already passed in (the
// real catalog), and flags anything unresolvable.
export function validateRateCardRow(
  row: RawRateCardRow,
  knownPlatforms: { internal_key: string; display_label: string }[],
  knownFormats: { internal_key: string; display_label: string }[]
): ValidatedRateCardRow {
  const errors: string[] = [];

  const platform = knownPlatforms.find(
    (p) => p.internal_key === row.mediaOutlet.trim() || p.display_label.toLowerCase() === row.mediaOutlet.trim().toLowerCase()
  );
  if (!platform) errors.push("import.issue.unknownMediaOutlet");

  const format = knownFormats.find(
    (f) => f.internal_key === row.format.trim() || f.display_label.toLowerCase() === row.format.trim().toLowerCase()
  );
  if (!format) errors.push("import.issue.unknownFormat");

  const parsedPrice = parseLatamAwareNumber(row.price);
  if (parsedPrice.value === null || parsedPrice.value < 0) errors.push("import.issue.invalidNumber");

  // Phase 19B item 4: controlled supported set, not a length check.
  const currency = row.currency.trim().toUpperCase();
  if (!isSupportedCurrencyCode(currency)) errors.push("import.issue.unrecognizedCurrency");

  const pricingUnit = row.pricingUnit.trim();
  if (!VALID_PRICING_UNITS.has(pricingUnit)) errors.push("import.issue.unknownPricingUnit");

  const parsedFrom = parseFlexibleDate(row.validFrom);
  if (!parsedFrom.iso) errors.push("import.issue.invalidDate");

  let validToIso: string | null = null;
  if (row.validTo) {
    const parsedTo = parseFlexibleDate(row.validTo);
    if (!parsedTo.iso) errors.push("import.issue.invalidDate");
    else if (parsedFrom.iso && parsedTo.iso < parsedFrom.iso) errors.push("import.issue.endBeforeStart");
    else validToIso = parsedTo.iso;
  }

  if (!row.source.trim()) errors.push("import.issue.missingRequired");

  return {
    rowNumber: row.rowNumber,
    platformKey: platform?.internal_key ?? null,
    mediaFormatKey: format?.internal_key ?? null,
    price: parsedPrice.value,
    currency: isSupportedCurrencyCode(currency) ? currency : null,
    pricingUnit: VALID_PRICING_UNITS.has(pricingUnit) ? pricingUnit : null,
    validFrom: parsedFrom.iso,
    validTo: validToIso,
    source: row.source.trim(),
    sourceReference: row.sourceReference,
    notes: row.notes,
    status: errors.length > 0 ? "needs_review" : "valid",
    errors,
  };
}

// Item 13: within-import duplicate detection — same identity concept
// as the snapshot/campaign import engines.
// CONTRIBUTION RELIABILITY PASS B (§4/§5): the old key included price
// itself, so two rows sharing the same identity + validFrom but a
// DIFFERENT price never even matched as "the same row" — they silently
// passed through as two independent valid rows with no information at
// all. classifyRateCardFileDuplicates fixes this by matching on
// identity + validFrom FIRST, then separately checking price: a match
// with the same price is still "duplicate" (same blocking behavior as
// before this pass), a match with a different price becomes the new
// "conflicting" status (never blocked — see the field's own comment
// above).
export function markRateCardDuplicates(rows: ValidatedRateCardRow[]): ValidatedRateCardRow[] {
  const candidates: RateCardFileCandidate[] = rows.map((r) => ({
    platformId: r.platformKey ?? "",
    propertyId: null,
    mediaFormatId: r.mediaFormatKey ?? "",
    currency: r.currency ?? "",
    pricingUnit: r.pricingUnit ?? "",
    validFrom: r.validFrom ?? "",
    price: r.price ?? 0,
  }));
  const verdicts = classifyRateCardFileDuplicates(candidates);
  return rows.map((r, i) => {
    if (r.status !== "valid") return r;
    const verdict = verdicts.get(i);
    if (verdict === "exact_duplicate") return { ...r, status: "duplicate" as const };
    if (verdict === "conflicting_version") return { ...r, status: "conflicting" as const };
    return r;
  });
}
