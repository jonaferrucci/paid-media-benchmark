import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { RawTable } from "./types";

// Centralized limits (Phase 16 item 31/7) — referenced by both the
// client (to show a message before even attempting to parse a huge
// file) and here (as a hard backstop).
export const IMPORT_LIMITS = {
  maxFileSizeBytes: 8 * 1024 * 1024, // 8 MB
  maxRows: 5000,
};

export interface ParseResult {
  ok: true;
  table: RawTable;
  truncated: boolean;
}
export interface ParseError {
  ok: false;
  errorKey: "empty_file" | "no_header_row" | "no_usable_rows" | "corrupt_file" | "too_large" | "unsupported_type";
}

function stripBlankRows(rows: string[][]): string[][] {
  return rows.filter((row) => row.some((cell) => cell != null && String(cell).trim() !== ""));
}

function toRawTable(headers: string[], rows: string[][]): RawTable {
  const width = headers.length;
  const normalizedRows = rows.map((row) => {
    const padded = row.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded.map((c) => (c == null ? "" : String(c).trim()));
  });
  return { headers: headers.map((h) => String(h ?? "").trim()), rows: normalizedRows };
}

// CSV: PapaParse with delimiter auto-detection (comma vs. semicolon —
// semicolon-delimited exports are common from LATAM Excel locales
// where comma is the decimal separator). Never a fragile split(",").
export function parseCsv(fileContent: string): ParseResult | ParseError {
  if (fileContent.trim().length === 0) return { ok: false, errorKey: "empty_file" };

  const result = Papa.parse<string[]>(fileContent, {
    delimiter: "", // auto-detect
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  if (!result.data || result.data.length === 0) return { ok: false, errorKey: "corrupt_file" };

  const [headerRow, ...bodyRows] = result.data as string[][];
  if (!headerRow || headerRow.every((h) => !h || h.trim() === "")) {
    return { ok: false, errorKey: "no_header_row" };
  }

  const cleanRows = stripBlankRows(bodyRows);
  if (cleanRows.length === 0) return { ok: false, errorKey: "no_usable_rows" };

  const truncated = cleanRows.length > IMPORT_LIMITS.maxRows;
  const finalRows = truncated ? cleanRows.slice(0, IMPORT_LIMITS.maxRows) : cleanRows;

  return { ok: true, table: toRawTable(headerRow, finalRows), truncated };
}

// XLSX: reads the first sheet with actual data (not blindly
// "Sheet1"). Formulas are never evaluated as executable content —
// SheetJS's default read already only extracts computed cell values
// (or raw formula text if a workbook has no cached value, which we
// simply treat as its string form, never executed). No macros are
// read at all (.xlsm is explicitly unsupported — see the file-type
// guard in the calling route/component).
//
// Known Phase 16 scope limitation (explicitly permitted by the brief
// when full worksheet selection would add too much complexity for
// this pass): if multiple sheets have data, this picks the FIRST one
// with a non-empty used range, rather than offering a picker.
export function parseXlsxBuffer(buffer: ArrayBuffer): ParseResult | ParseError {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: "array", cellFormula: false, cellHTML: false });
  } catch {
    return { ok: false, errorKey: "corrupt_file" };
  }

  const sheetName = workbook.SheetNames.find((name) => {
    const sheet = workbook.Sheets[name];
    return sheet && sheet["!ref"];
  });
  if (!sheetName) return { ok: false, errorKey: "no_usable_rows" };

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
  if (!rows || rows.length === 0) return { ok: false, errorKey: "corrupt_file" };

  const [headerRow, ...bodyRows] = rows;
  if (!headerRow || headerRow.every((h) => !h || String(h).trim() === "")) {
    return { ok: false, errorKey: "no_header_row" };
  }

  const cleanRows = stripBlankRows(bodyRows.map((r) => r.map((c) => String(c ?? ""))));
  if (cleanRows.length === 0) return { ok: false, errorKey: "no_usable_rows" };

  const truncated = cleanRows.length > IMPORT_LIMITS.maxRows;
  const finalRows = truncated ? cleanRows.slice(0, IMPORT_LIMITS.maxRows) : cleanRows;

  return { ok: true, table: toRawTable(headerRow.map(String), finalRows), truncated };
}
