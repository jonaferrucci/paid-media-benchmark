import type { RawTable } from "@/lib/import/types";

// Phase 21 items 13/14/15/18/19 — curator-safe bulk CATALOG import
// (media_outlet identity rows, never a rate card or an audience metric
// — those already have their own dedicated import workflows, see
// lib/media/importRateCards.ts / lib/media/importSnapshots.ts). Reuses
// lib/import/parse.ts's parseCsv/parseXlsxBuffer directly (item 13:
// "reuse Phase 16 parser infrastructure. Do NOT create another
// parser.") — this module only adds catalog-specific column mapping
// and validation, the same shape lib/media/importRateCards.ts already
// established for rate cards.

export type CatalogField = "media_outlet" | "display_name" | "country" | "media_category" | "status" | "website_domain";

const CATALOG_ALIASES: Record<CatalogField, string[]> = {
  media_outlet: ["media_outlet", "slug", "internal_key", "medio", "clave"],
  display_name: ["display_name", "nombre", "name", "medio", "outlet"],
  country: ["country", "país", "pais", "mercado"],
  media_category: ["media_category", "category", "categoria", "categoría", "tipo de medio"],
  status: ["status", "estado"],
  website_domain: ["website_domain", "website", "sitio", "dominio", "url"],
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\-.]/g, " ").replace(/\s+/g, " ").trim();
}

const ALIAS_LOOKUP = new Map<string, CatalogField>();
for (const [field, aliases] of Object.entries(CATALOG_ALIASES) as [CatalogField, string[]][]) {
  for (const alias of aliases) ALIAS_LOOKUP.set(normalizeHeader(alias), field);
}

export interface CatalogColumnMapping {
  sourceHeader: string;
  sourceColumnIndex: number;
  field: CatalogField | null;
}

// Same "first match wins, never duplicate a canonical field across two
// columns" discipline as lib/import/mapping.ts.
export function detectCatalogMapping(table: RawTable): CatalogColumnMapping[] {
  const claimed = new Set<CatalogField>();
  return table.headers.map((header, index) => {
    const candidate = ALIAS_LOOKUP.get(normalizeHeader(header));
    if (candidate && !claimed.has(candidate)) {
      claimed.add(candidate);
      return { sourceHeader: header, sourceColumnIndex: index, field: candidate };
    }
    return { sourceHeader: header, sourceColumnIndex: index, field: null };
  });
}

export interface RawCatalogRow {
  rowNumber: number;
  mediaOutlet: string;
  displayName: string;
  country: string;
  mediaCategory: string;
  status: string;
  websiteDomain: string | null;
}

export function applyCatalogMapping(table: RawTable, mappings: CatalogColumnMapping[]): RawCatalogRow[] {
  const byField = new Map(mappings.filter((m) => m.field).map((m) => [m.field as CatalogField, m.sourceColumnIndex]));
  const get = (row: string[], field: CatalogField) => (byField.has(field) ? row[byField.get(field)!] ?? "" : "");
  return table.rows.map((row, i) => ({
    rowNumber: i + 2,
    mediaOutlet: get(row, "media_outlet"),
    displayName: get(row, "display_name"),
    country: get(row, "country"),
    mediaCategory: get(row, "media_category"),
    status: get(row, "status") || "active",
    websiteDomain: get(row, "website_domain") || null,
  }));
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const VALID_STATUSES = new Set(["active", "pending", "inactive"]);

export interface ValidatedCatalogRow {
  rowNumber: number;
  slug: string | null;
  displayName: string;
  countryIso: string | null;
  mediaCategoryKey: string | null;
  status: "active" | "pending" | "inactive" | null;
  websiteDomain: string | null;
  // "valid": ready to create as a NEW outlet. "existing": already a
  // real catalog row (item 18/19: create-new vs skip-existing, never a
  // blind upsert). "needs_review": unknown taxonomy value or missing
  // required field. "duplicate": repeats another row within THIS
  // import.
  status_: "valid" | "existing" | "needs_review" | "duplicate";
  errors: string[];
}

// Item 15/18/19: an unknown country/category is a hard error — never
// silently created. A slug matching an EXISTING platform is flagged as
// "existing" (skippable, never auto-overwritten) rather than treated as
// an error, since re-uploading a catalog file that includes outlets
// Cucurucho already has is an expected, ordinary occurrence, not a
// mistake the curator needs to fix in the source file.
export function validateCatalogRow(
  row: RawCatalogRow,
  knownCategories: { internal_key: string; display_label: string }[],
  knownCountries: { iso_code: string; display_label: string }[],
  knownPlatforms: { internal_key: string; display_label: string }[]
): ValidatedCatalogRow {
  const errors: string[] = [];

  const displayName = row.displayName.trim() || row.mediaOutlet.trim();
  if (!displayName) errors.push("import.issue.missingRequired");

  const rawSlug = row.mediaOutlet.trim() || displayName;
  const slug = rawSlug ? slugify(rawSlug) : null;
  if (!slug) errors.push("import.issue.missingRequired");

  const country = knownCountries.find(
    (c) => c.iso_code.toLowerCase() === row.country.trim().toLowerCase() || c.display_label.toLowerCase() === row.country.trim().toLowerCase()
  );
  if (!country) errors.push("import.issue.unknownCountry");

  const category = knownCategories.find(
    (c) => c.internal_key === row.mediaCategory.trim() || c.display_label.toLowerCase() === row.mediaCategory.trim().toLowerCase()
  );
  if (!category) errors.push("import.issue.unknownMediaCategory");

  const statusRaw = row.status.trim().toLowerCase();
  const status = VALID_STATUSES.has(statusRaw) ? (statusRaw as "active" | "pending" | "inactive") : null;
  if (!status) errors.push("import.issue.unknownCatalogStatus");

  const existing = slug
    ? knownPlatforms.find((p) => p.internal_key === slug || p.display_label.toLowerCase() === displayName.toLowerCase())
    : undefined;

  let finalStatus: ValidatedCatalogRow["status_"];
  if (errors.length > 0) finalStatus = "needs_review";
  else if (existing) finalStatus = "existing";
  else finalStatus = "valid";

  return {
    rowNumber: row.rowNumber,
    slug,
    displayName,
    countryIso: country?.iso_code ?? null,
    mediaCategoryKey: category?.internal_key ?? null,
    status,
    websiteDomain: row.websiteDomain,
    status_: finalStatus,
    errors,
  };
}

// Item 18: within-import duplicate rows (same slug appearing twice in
// the SAME file) never both become "valid" — the second occurrence is
// flagged, never silently created twice.
export function markCatalogDuplicates(rows: ValidatedCatalogRow[]): ValidatedCatalogRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    if (row.status_ !== "valid" || !row.slug) return row;
    if (seen.has(row.slug)) return { ...row, status_: "duplicate" as const };
    seen.set(row.slug, row.rowNumber);
    return row;
  });
}
