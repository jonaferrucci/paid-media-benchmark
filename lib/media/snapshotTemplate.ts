import * as XLSX from "xlsx";

// Phase 18 item 5: canonical headers for public-metric snapshot
// import. Same generation approach as lib/import/template.ts (one
// small source of truth, not duplicated definitions).

const HEADERS = ["media_outlet", "property", "metric", "value", "observed_at", "source", "source_reference"];
const EXAMPLE_ROW = ["olga", "", "subscriber_count", "3300000", "2026-09-01", "youtube", ""];

export function generateSnapshotCsvTemplate(): string {
  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  return [HEADERS.map(escape).join(","), EXAMPLE_ROW.map(escape).join(",")].join("\r\n");
}

export function generateSnapshotXlsxTemplate(): ArrayBuffer {
  const dataSheet = XLSX.utils.aoa_to_sheet([HEADERS, EXAMPLE_ROW]);
  const notesSheet = XLSX.utils.aoa_to_sheet([
    ["Cucurucho — plantilla de métricas públicas"],
    [""],
    ["media_outlet: el internal_key o nombre exacto del medio en el catálogo (ej. olga, meta_ads)."],
    ["metric: internal_key de la métrica pública (ej. subscriber_count)."],
    ["property: opcional, dejar vacío si no aplica."],
    ["observed_at: fecha en formato YYYY-MM-DD."],
    ["source: de dónde sale el dato (ej. youtube, official_media_kit)."],
    [""],
    ["Estos son datos públicos del medio, no resultados de campaña."],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Datos");
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Instrucciones");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
