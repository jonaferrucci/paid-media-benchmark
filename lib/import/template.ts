import * as XLSX from "xlsx";
import { REQUIRED_FIELDS, OPTIONAL_FIELDS, type CanonicalField } from "./types";

// CAMPAIGN IMPORT INTELLIGENCE PHASE 1 (§ template versioning): bumped
// from 1 — this pass adds the version-marker preamble line below plus
// the REQUIRED/RECOMMENDED/ADVANCED grouping in the Instrucciones
// sheet. Neither change touches validation semantics (REQUIRED_FIELDS/
// OPTIONAL_FIELDS themselves are completely unchanged) — only what the
// generated FILE itself looks like.
export const TEMPLATE_VERSION = 2;

// A single-cell preamble line, exactly like a real Google Ads export's
// own date-range summary line — lib/import/parse.ts's
// findHeaderRowIndex ALREADY skips any leading row with fewer than 2
// non-empty cells before looking for the real header row, so this
// needs ZERO changes to parse.ts/mapping.ts/validate.ts to be silently
// and correctly ignored by the existing pipeline. This is purely an
// ADDITIVE signal detectTemplateVersion (below) can read back — a
// legacy v1 template (generated before this pass, with no such line)
// or any other generic CSV/XLSX simply has no preamble line here and
// imports exactly as it always has (the legacy fallback the approved
// brief requires).
const TEMPLATE_VERSION_MARKER_PREFIX = "Cucurucho plantilla v";

function buildTemplateVersionMarkerLine(): string {
  return `${TEMPLATE_VERSION_MARKER_PREFIX}${TEMPLATE_VERSION}`;
}

// Reads the marker back out of a file's own skipped preamble lines
// (lib/import/parse.ts already collects these for the unrelated
// report-date-range check — this reuses that exact same collection,
// never a second preamble scan). Returns null — never a guess — for
// any file with no recognizable marker: a legacy v1 template (no
// marker line at all) and a non-Cucurucho generic CSV both fall
// through to this same null, and both continue to import exactly as
// before; this is purely an informational "we recognize this file"
// signal, never a gate.
export function detectTemplateVersion(preambleLines: string[]): number | null {
  for (const line of preambleLines) {
    const match = new RegExp(`^${TEMPLATE_VERSION_MARKER_PREFIX}(\\d+)$`, "i").exec(line.trim());
    if (match) {
      const version = Number(match[1]);
      if (Number.isFinite(version) && version > 0) return version;
    }
  }
  return null;
}

// Canonical header row + one example row, generated from the SAME
// REQUIRED_FIELDS/OPTIONAL_FIELDS lists the import engine validates
// against — not a second, manually-maintained field list (Phase 16
// item 24).
const HEADER_LABELS: Record<string, string> = {
  platform: "Plataforma", objective: "Objetivo", vertical: "Vertical", country: "País",
  business_model: "Modelo de negocio", audience_strategy: "Audiencia", funnel_stage: "Etapa del funnel",
  start_date: "Fecha inicio", end_date: "Fecha fin", currency: "Moneda", ad_spend: "Inversión",
  impressions: "Impresiones", reach: "Alcance", clicks: "Clics", link_clicks: "Clics en el enlace",
  landing_page_views: "Vistas de landing", video_views: "Reproducciones de video",
  engagements: "Interacciones", conversions: "Conversiones", attributed_revenue: "Ingresos atribuidos",
  total_revenue: "Ingresos totales",
  // Post-MVP row-level fix (§3): shown/downloadable like any other
  // optional field — never persisted (see the "campaign_name"
  // CanonicalField comment in lib/import/types.ts).
  campaign_name: "Nombre de la campaña",
  // POST-MVP IMPORT FIX 3 (§N): same treatment as campaign_name above —
  // shown/downloadable, never persisted (see the "campaign_type"
  // CanonicalField comment in lib/import/types.ts).
  campaign_type: "Tipo de campaña",
};

const EXAMPLE_ROW: Record<string, string> = {
  platform: "Meta Ads", objective: "Traffic", vertical: "Beauty & Personal Care", country: "Argentina",
  start_date: "2026-08-01", end_date: "2026-08-31", currency: "ARS", ad_spend: "1500000",
  impressions: "4800000", reach: "1700000", clicks: "62000", landing_page_views: "49000",
  campaign_name: "Campaña Verano",
  campaign_type: "Búsqueda",
};

const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

// CAMPAIGN IMPORT INTELLIGENCE PHASE 1 (§ template evolution):
// REQUIRED/RECOMMENDED/ADVANCED presentation grouping for the
// Instrucciones sheet — purely a display curation layered ON TOP of
// the real REQUIRED_FIELDS/OPTIONAL_FIELDS arrays, never a duplicated
// or parallel field list and never a validation change (a field's
// presence in REQUIRED_FIELDS is still the only thing that makes it
// actually required). Only RECOMMENDED needs to be hand-curated (the
// fields the task brief's own earlier download-guidance line already
// calls out as most benchmark-valuable: spend is already required,
// so this is impressions/reach/clicks/conversions/attributed revenue/
// currency/campaign name); REQUIRED is read directly from
// REQUIRED_FIELDS, and ADVANCED is simply "every optional field not
// explicitly promoted to RECOMMENDED" — so a future new OPTIONAL_FIELDS
// entry automatically lands in the safe ADVANCED default instead of
// silently going unlabeled.
const RECOMMENDED_OPTIONAL_FIELDS: CanonicalField[] = [
  "currency", "impressions", "reach", "clicks", "conversions", "attributed_revenue", "campaign_name",
];

export interface TemplateFieldGroups {
  required: CanonicalField[];
  recommended: CanonicalField[];
  advanced: CanonicalField[];
}

export function templateFieldGroups(): TemplateFieldGroups {
  return {
    required: [...REQUIRED_FIELDS],
    // Filtered against the REAL OPTIONAL_FIELDS array, not assumed —
    // if a field were ever removed from OPTIONAL_FIELDS, it silently
    // drops out of RECOMMENDED here too, rather than referencing a
    // field that no longer exists.
    recommended: RECOMMENDED_OPTIONAL_FIELDS.filter((f) => OPTIONAL_FIELDS.includes(f)),
    advanced: OPTIONAL_FIELDS.filter((f) => !RECOMMENDED_OPTIONAL_FIELDS.includes(f)),
  };
}

// Phase 17B.2: category-aware templates. Rather than maintaining N
// separate hardcoded template definitions, this filters the SAME
// canonical field list down to only the fields relevant for a given
// category — callers pass the metric internal_keys resolved from
// media_category_metrics (the real applicability data), so the
// template generator itself has zero category-specific knowledge.
export function buildCategoryTemplateHeaders(applicableMetricKeys: string[] | null): string[] {
  const fields = applicableMetricKeys
    ? ALL_FIELDS.filter((f) => REQUIRED_FIELDS.includes(f) || applicableMetricKeys.includes(f))
    : ALL_FIELDS;
  return fields.map((f) => HEADER_LABELS[f] ?? f);
}

export function buildTemplateHeaders(): string[] {
  return ALL_FIELDS.map((f) => HEADER_LABELS[f] ?? f);
}

export function buildTemplateExampleRow(): string[] {
  return ALL_FIELDS.map((f) => EXAMPLE_ROW[f] ?? "");
}

// CAMPAIGN IMPORT INTELLIGENCE PHASE 1: the version-marker line is
// prepended as its own single-cell CSV row — see
// buildTemplateVersionMarkerLine's comment for why parse.ts already
// skips this correctly with zero changes, on both the legacy template
// (no such line) and any other generic CSV (also no such line) alike.
export function generateCsvTemplate(): string {
  const headers = buildTemplateHeaders();
  const example = buildTemplateExampleRow();
  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  return [
    escape(buildTemplateVersionMarkerLine()),
    headers.map(escape).join(","),
    example.map(escape).join(","),
  ].join("\r\n");
}

// `validValues` is an optional, generic (not taxonomy-coupled — this
// module has no Supabase/taxonomy dependency of its own) list of
// {label, values} pairs for an extra "Valores válidos" sheet. Per the
// approved brief ("do NOT hardcode taxonomy values if the generator
// cannot safely access the canonical taxonomy"), this is only ever
// populated by the caller from REAL taxonomy rows already fetched
// server-side (see ContributeLanding.tsx's LandingChooser) — omitted
// entirely (as before this pass) when the caller has no taxonomy data
// to pass, so no sheet is ever built from an invented or stale list.
export function generateXlsxTemplate(validValues?: { label: string; values: string[] }[]): ArrayBuffer {
  const headers = buildTemplateHeaders();
  const example = buildTemplateExampleRow();
  const groups = templateFieldGroups();
  const label = (f: CanonicalField) => HEADER_LABELS[f] ?? f;

  // The version-marker row goes ABOVE the real header row, exactly
  // like the CSV generator — same single-cell-preamble convention,
  // read identically by findHeaderRowIndex regardless of file type.
  const dataSheet = XLSX.utils.aoa_to_sheet([[buildTemplateVersionMarkerLine()], headers, example]);
  const notesRows: (string | string[])[][] = [
    [`Cucurucho — plantilla de aportación de datos (versión ${TEMPLATE_VERSION})`],
    [""],
    // CAMPAIGN IMPORT INTELLIGENCE PHASE 1: three groups instead of the
    // old flat obligatorios/opcionales split — REQUIRED is still the
    // only thing validate.ts actually enforces; RECOMMENDED/ADVANCED
    // are purely a presentation aid for which optional fields matter
    // most for benchmark completeness.
    ["Campos obligatorios:", groups.required.map(label).join(", ")],
    ["Recomendados (mejoran la calidad del benchmark):", groups.recommended.map(label).join(", ")],
    ["Avanzados (opcionales, uso ocasional):", groups.advanced.map(label).join(", ")],
    [""],
    ["La primera fila de la hoja 'Datos' identifica la versión de esta plantilla — no la borres, pero tampoco hace falta entenderla."],
    ["La segunda fila son los encabezados exactos. La tercera es un ejemplo — reemplazala o eliminala antes de subir el archivo."],
  ];
  const notesSheet = XLSX.utils.aoa_to_sheet(notesRows);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Datos");
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Instrucciones");
  // Only built when the caller supplied real taxonomy rows — never a
  // hardcoded/invented list (see this function's own doc comment).
  if (validValues && validValues.length > 0) {
    const validValuesRows: string[][] = [];
    for (const group of validValues) {
      validValuesRows.push([group.label]);
      for (const value of group.values) validValuesRows.push(["", value]);
      validValuesRows.push([""]);
    }
    const validValuesSheet = XLSX.utils.aoa_to_sheet(validValuesRows);
    XLSX.utils.book_append_sheet(workbook, validValuesSheet, "Valores válidos");
  }
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
