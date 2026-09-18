import * as XLSX from "xlsx";
import { REQUIRED_FIELDS, OPTIONAL_FIELDS } from "./types";

export const TEMPLATE_VERSION = 1;

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

export function generateCsvTemplate(): string {
  const headers = buildTemplateHeaders();
  const example = buildTemplateExampleRow();
  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  return [headers.map(escape).join(","), example.map(escape).join(",")].join("\r\n");
}

export function generateXlsxTemplate(): ArrayBuffer {
  const headers = buildTemplateHeaders();
  const example = buildTemplateExampleRow();
  const required = new Set(REQUIRED_FIELDS.map((f) => HEADER_LABELS[f] ?? f));

  const dataSheet = XLSX.utils.aoa_to_sheet([headers, example]);
  const notesSheet = XLSX.utils.aoa_to_sheet([
    [`Cucurucho — plantilla de aportación de datos (versión ${TEMPLATE_VERSION})`],
    [""],
    ["Campos obligatorios:", Array.from(required).join(", ")],
    ["Campos opcionales:", OPTIONAL_FIELDS.map((f) => HEADER_LABELS[f] ?? f).join(", ")],
    [""],
    ["La primera fila de la hoja 'Datos' son los encabezados exactos."],
    ["La segunda fila es un ejemplo — reemplazala o eliminala antes de subir el archivo."],
  ]);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Datos");
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Instrucciones");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
