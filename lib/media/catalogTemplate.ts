import * as XLSX from "xlsx";

// Phase 21 item 17 — downloadable catalog-import template. Canonical
// columns matching lib/media/importCatalog.ts's field set exactly (one
// source of truth for the column list, same discipline lib/import/
// template.ts already established for the campaign-contribution
// template).
const HEADERS = ["media_outlet", "display_name", "country", "media_category", "status", "website_domain"];
const EXAMPLE_ROW = ["nueva_radio_digital", "Nueva Radio Digital", "AR", "streaming_live", "pending", ""];

export function generateCatalogCsvTemplate(): string {
  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  return [HEADERS.map(escape).join(","), EXAMPLE_ROW.map(escape).join(",")].join("\r\n");
}

export function generateCatalogXlsxTemplate(): ArrayBuffer {
  const dataSheet = XLSX.utils.aoa_to_sheet([HEADERS, EXAMPLE_ROW]);
  const notesSheet = XLSX.utils.aoa_to_sheet([
    ["Cucurucho — plantilla de catálogo de medios digitales"],
    [""],
    ["media_outlet: identificador corto (slug). Si no lo sabés, dejalo vacío — se genera a partir de display_name."],
    ["display_name: nombre del medio o plataforma tal como debería mostrarse."],
    ["country: código ISO de 2 letras (ej. AR) o nombre del país, debe existir ya en Cucurucho."],
    ["media_category: internal_key o nombre de una categoría de medio ya existente (ej. streaming_live)."],
    ["status: active, pending o inactive. Un medio nuevo suele cargarse como pending para revisión."],
    ["website_domain: opcional."],
    [""],
    ["Este archivo crea IDENTIDAD de catálogo (qué medio existe). No incluye precios ni métricas de audiencia — eso se aporta por separado."],
    ["Un país o categoría desconocidos hacen que la fila necesite revisión — nunca se crea una categoría o país nuevo automáticamente."],
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, dataSheet, "Catálogo");
  XLSX.utils.book_append_sheet(workbook, notesSheet, "Instrucciones");
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}
