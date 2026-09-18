import Papa from "papaparse";
import * as XLSX from "xlsx";
import type { RawTable } from "./types";
import { findReportDateRangeInLines } from "./normalize";

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
  // Post-MVP Google Ads fix (§D/§G): a report-level date range found in
  // skipped preamble lines above the real header row (e.g. Google's own
  // "18 de septiembre de 2026 - 18 de septiembre de 2026" summary
  // line) — null when the file had no preamble, or the preamble didn't
  // state a parseable range. Never a guess.
  reportDateRange: { start: string; end: string } | null;
}
export interface ParseError {
  ok: false;
  errorKey: "empty_file" | "no_header_row" | "no_usable_rows" | "corrupt_file" | "too_large" | "unsupported_type";
}

function stripBlankRows(rows: string[][]): string[][] {
  return rows.filter((row) => row.some((cell) => cell != null && String(cell).trim() !== ""));
}

// Post-MVP Google Ads fix (§K): real Google exports use "--" as an
// explicit "not applicable" placeholder (e.g. a video-completion metric
// on a non-video campaign) — this must become genuinely MISSING data,
// never a zero. Narrow and deterministic: only the exact "--" token
// (after trimming) is normalized; a real zero value ("0") is left
// completely untouched.
function normalizePlaceholder(cell: string): string {
  return cell.trim() === "--" ? "" : cell;
}

function toRawTable(headers: string[], rows: string[][]): RawTable {
  const width = headers.length;
  const normalizedRows = rows.map((row) => {
    const padded = row.slice(0, width);
    while (padded.length < width) padded.push("");
    return padded.map((c) => normalizePlaceholder(c == null ? "" : String(c).trim()));
  });
  return { headers: headers.map((h) => String(h ?? "").trim()), rows: normalizedRows };
}

// Post-MVP Google Ads fix (§D): a real Google Ads export begins with
// TWO metadata lines ("Informe de campaña" / a date-range summary
// line) before the real, tabular header row. Detected generically —
// never by looking for those literal strings — by finding the first
// row with at least 2 non-empty cells: a real header row for this
// product always has several columns, while a preamble title or
// date-range line has exactly one. A normal file whose first row IS
// already the header (the common case) matches immediately at index 0,
// so this changes nothing for every existing import shape. Capped to a
// short lookahead so a pathological file can't make this scan deep
// into what is actually tabular data.
function findHeaderRowIndex(rows: string[][]): number {
  const lookahead = Math.min(rows.length, 6);
  for (let i = 0; i < lookahead; i++) {
    const nonEmpty = rows[i].filter((c) => c != null && String(c).trim() !== "").length;
    if (nonEmpty >= 2) return i;
  }
  return 0;
}

function splitPreambleAndHeader(rows: string[][]): { headerIndex: number; preambleLines: string[] } {
  const headerIndex = findHeaderRowIndex(rows);
  const preambleLines = rows.slice(0, headerIndex).map((r) => r.filter((c) => c != null && String(c).trim() !== "").join(" ").trim());
  return { headerIndex, preambleLines };
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

  const allRows = result.data as string[][];
  const { headerIndex, preambleLines } = splitPreambleAndHeader(allRows);
  const headerRow = allRows[headerIndex];
  const bodyRows = allRows.slice(headerIndex + 1);
  if (!headerRow || headerRow.every((h) => !h || h.trim() === "")) {
    return { ok: false, errorKey: "no_header_row" };
  }

  const cleanRows = stripBlankRows(bodyRows);
  if (cleanRows.length === 0) return { ok: false, errorKey: "no_usable_rows" };

  const truncated = cleanRows.length > IMPORT_LIMITS.maxRows;
  const finalRows = truncated ? cleanRows.slice(0, IMPORT_LIMITS.maxRows) : cleanRows;

  return { ok: true, table: toRawTable(headerRow, finalRows), truncated, reportDateRange: findReportDateRangeInLines(preambleLines) };
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

  // Note: sheet_to_json with defval:"" pads every row to the sheet's
  // full column width, so a 1-value preamble row comes back as a
  // mostly-empty array of the SAME length as the real header row —
  // findHeaderRowIndex's "count non-empty cells" check (not raw array
  // length) still finds the true header correctly despite that padding.
  const allRows = rows.map((r) => r.map((c) => String(c ?? "")));
  const { headerIndex, preambleLines } = splitPreambleAndHeader(allRows);
  const headerRow = allRows[headerIndex];
  const bodyRows = allRows.slice(headerIndex + 1);
  if (!headerRow || headerRow.every((h) => !h || String(h).trim() === "")) {
    return { ok: false, errorKey: "no_header_row" };
  }

  const cleanRows = stripBlankRows(bodyRows);
  if (cleanRows.length === 0) return { ok: false, errorKey: "no_usable_rows" };

  const truncated = cleanRows.length > IMPORT_LIMITS.maxRows;
  const finalRows = truncated ? cleanRows.slice(0, IMPORT_LIMITS.maxRows) : cleanRows;

  return { ok: true, table: toRawTable(headerRow.map(String), finalRows), truncated, reportDateRange: findReportDateRangeInLines(preambleLines) };
}
