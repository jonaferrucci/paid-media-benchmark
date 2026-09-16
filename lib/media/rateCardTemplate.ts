import * as XLSX from "xlsx";

const HEADERS = ["media_outlet", "property", "format", "price", "currency", "pricing_unit", "valid_from", "valid_to", "source", "source_reference", "notes"];
const EXAMPLE_ROW = ["olga", "", "branded_integration", "2000", "USD", "per_integration", "2026-09-01", "", "official_media_kit", "", ""];

export function generateRateCardCsvTemplate(): string {
  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  return [HEADERS.map(escape).join(","), EXAMPLE_ROW.map(escape).join(",")].join("\r\n");
}

export function generateRateCardXlsxTemplate(): ArrayBuffer {
  const dataSheet = XLSX.utils.aoa_to_sheet([HEADERS, EXAMPLE_ROW]);
  const notesSheet = XLSX.utils.aoa_to_sheet([
    ["Cucurucho — plantilla de tarifarios"],
    [""],
    ["media_outlet: internal_key o nombre exacto del medio en el catálogo."],
    ["format: internal_key del formato comercial (ej. branded_integration)."],
    ["pricing_unit: uno de per_integration, per_spot, per_mention, per_day, per_week, per_month, per_thousand, package, custom."],
    ["valid_from / valid_to: fecha en formato YYYY-MM-DD. valid_to puede quedar vacío."],
    [""],
    ["Esto es precio de lista / tarifario. No es lo que pagó una campaña real."],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Datos");
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Instrucciones");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
