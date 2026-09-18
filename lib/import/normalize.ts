// Pure normalization helpers — number/date/taxonomy parsing. No
// Supabase/network dependency, so these are directly unit-testable.

export interface NumberParseResult {
  value: number | null;
  ambiguous: boolean;
}

// Post-MVP Google Ads fix (§L): a real Google Ads export's own number
// formatting is UNAMBIGUOUSLY English-style (comma=thousands,
// dot=decimal) — never a guess, since Google's own locale-formatted
// export is known upfront by platform, not inferred from the numbers
// themselves. "auto" (the default) keeps the exact pre-existing
// LATAM-primary ambiguity handling below, completely unchanged for
// every caller that doesn't pass a format — so this is purely
// additive, never a behavior change for Meta or generic imports.
export type NumberFormatHint = "auto" | "us";

// Handles both "1.234,56" (LATAM/EU) and "1,234.56" (US) formats.
// When BOTH a comma and a period appear, the LAST separator is
// assumed to be the decimal point (standard convention in both
// systems) — this is deterministic, not a guess. When only one
// separator type appears, it's ambiguous only in the specific case of
// a single comma/period with exactly 3 trailing digits (could be a
// thousands separator OR an unusual decimal) — flagged for review
// rather than silently assumed, per Phase 16 item 15 — UNLESS `format`
// says the source's notation is already known (§L), in which case the
// single-separator case is resolved deterministically instead.
export function parseLatamAwareNumber(raw: string, format: NumberFormatHint = "auto"): NumberParseResult {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (trimmed === "") return { value: null, ambiguous: false };

  const cleaned = trimmed.replace(/^[$€]/, "").replace(/[^\d.,-]/g, "");
  if (cleaned === "" || cleaned === "-") return { value: null, ambiguous: false };

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    // Whichever separator appears LAST is the decimal point. Already
    // deterministic regardless of locale (e.g. "32,173.40" correctly
    // resolves to 32173.40 whether or not `format` is set), so `format`
    // changes nothing in this branch.
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    const decimalIsComma = lastComma > lastDot;
    const normalized = decimalIsComma
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
    const value = Number(normalized);
    return { value: Number.isFinite(value) ? value : null, ambiguous: false };
  }

  if (hasComma && !hasDot) {
    const parts = cleaned.split(",");
    const lastPart = parts[parts.length - 1];
    if (parts.length === 2 && lastPart.length !== 3) {
      // Single comma, not exactly 3 trailing digits -> unambiguously a
      // decimal separator (e.g. "4,5" or "4,72").
      const value = Number(cleaned.replace(",", "."));
      return { value: Number.isFinite(value) ? value : null, ambiguous: false };
    }
    if (parts.length === 2 && lastPart.length === 3) {
      if (format === "us") {
        // English-style export (e.g. a real Google Ads report): a
        // single comma is UNAMBIGUOUSLY a thousands separator (English
        // notation never uses a bare comma as a decimal point) — e.g.
        // "1,134" -> 1134, never 1.134.
        const value = Number(cleaned.replace(",", ""));
        return { value: Number.isFinite(value) ? value : null, ambiguous: false };
      }
      // Exactly 3 trailing digits after a single comma: could be
      // "1,234" (thousands, = 1234) or "1,234" meant as a decimal in
      // some locale. Genuinely ambiguous — flag rather than guess.
      return { value: Number(cleaned.replace(",", ".")), ambiguous: true };
    }
    // Multiple commas -> thousands separators.
    const value = Number(cleaned.replace(/,/g, ""));
    return { value: Number.isFinite(value) ? value : null, ambiguous: false };
  }

  if (hasDot && !hasComma) {
    if (format === "us") {
      // English notation never uses a bare dot as a thousands
      // separator — a single dot is always the decimal point,
      // whatever the trailing digit count.
      const value = Number(cleaned);
      return { value: Number.isFinite(value) ? value : null, ambiguous: false };
    }
    const parts = cleaned.split(".");
    const lastPart = parts[parts.length - 1];
    if (parts.length === 2 && lastPart.length !== 3) {
      const value = Number(cleaned);
      return { value: Number.isFinite(value) ? value : null, ambiguous: false };
    }
    if (parts.length === 2 && lastPart.length === 3) {
      return { value: Number(cleaned), ambiguous: true };
    }
    const value = Number(cleaned.replace(/\./g, ""));
    return { value: Number.isFinite(value) ? value : null, ambiguous: false };
  }

  const value = Number(cleaned);
  return { value: Number.isFinite(value) ? value : null, ambiguous: false };
}

export interface DateParseResult {
  iso: string | null;
  ambiguous: boolean;
}

// Supports YYYY-MM-DD unambiguously. For slash-separated dates
// (DD/MM/YYYY vs MM/DD/YYYY), only resolves automatically when the
// day-like component is > 12 (unambiguous - must be DD/MM). Otherwise
// flags as ambiguous rather than silently assuming a convention, per
// Phase 16 item 17.
export function parseFlexibleDate(raw: string): DateParseResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { iso: null, ambiguous: false };

  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return isValidDate(+y, +m, +d) ? { iso: trimmed, ambiguous: false } : { iso: null, ambiguous: false };
  }

  const slashMatch = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed);
  if (slashMatch) {
    const [, a, b, y] = slashMatch;
    const first = +a;
    const second = +b;
    if (first > 12 && second <= 12) {
      // Unambiguous: DD/MM/YYYY.
      return isValidDate(+y, second, first) ? { iso: toIso(+y, second, first), ambiguous: false } : { iso: null, ambiguous: false };
    }
    if (second > 12 && first <= 12) {
      // Unambiguous: MM/DD/YYYY.
      return isValidDate(+y, first, second) ? { iso: toIso(+y, first, second), ambiguous: false } : { iso: null, ambiguous: false };
    }
    // Both <= 12: genuinely ambiguous. Default to DD/MM (the more
    // common convention for this product's primary LATAM audience)
    // but flag for review rather than silently trusting it.
    return isValidDate(+y, second, first) ? { iso: toIso(+y, second, first), ambiguous: true } : { iso: null, ambiguous: false };
  }

  return { iso: null, ambiguous: false };
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toIso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Post-MVP Google Ads fix (§D/§G): a real Google Ads CSV export has NO
// per-row date columns at all — the report's date range is only ever
// stated once, in a preamble line above the real header row (e.g.
// "18 de septiembre de 2026 - 18 de septiembre de 2026"). None of the
// 12 Spanish month names carry accents, so no accent-stripping is
// needed here for a safe, deterministic match.
const SPANISH_MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
  noviembre: 11, diciembre: 12,
};

function parseSpanishLongDate(text: string): string | null {
  const match = /^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})$/i.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = SPANISH_MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (!month) return null;
  return isValidDate(year, month, day) ? toIso(year, month, day) : null;
}

// Parses ONE line as a "<date> - <date>" report-level range — both
// halves must independently resolve to a real date (via the Spanish
// long form above, or any format parseFlexibleDate already
// understands, so this isn't limited to only the Spanish-locale case)
// or the whole line is rejected rather than guessed.
export function parseReportDateRangeLine(line: string): { start: string; end: string } | null {
  const parts = line.split(/\s-\s/);
  if (parts.length !== 2) return null;
  const start = parseSpanishLongDate(parts[0]) ?? parseFlexibleDate(parts[0]).iso;
  const end = parseSpanishLongDate(parts[1]) ?? parseFlexibleDate(parts[1]).iso;
  if (!start || !end) return null;
  return { start, end };
}

// Scans a set of candidate lines (typically the report-preamble lines
// skipped by lib/import/parse.ts, before the real header row) for the
// FIRST one that parses as a date range — never guesses across
// unrelated text, and returns null when nothing in the file states one.
export function findReportDateRangeInLines(lines: string[]): { start: string; end: string } | null {
  for (const line of lines) {
    const range = parseReportDateRangeLine(line);
    if (range) return range;
  }
  return null;
}

// Fuzzy-matches a free-text taxonomy value (e.g. "Meta" or "facebook
// ads") against real taxonomy rows, by normalized display_label or
// internal_key. Returns the internal_key/iso_code on a confident
// match, or null if nothing matches closely enough (never guesses).
export function matchTaxonomyValue(
  raw: string,
  taxonomyItems: { internal_key?: string; iso_code?: string; display_label: string }[]
): string | null {
  const normalized = raw.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (normalized === "") return null;

  for (const item of taxonomyItems) {
    const key = item.internal_key ?? item.iso_code ?? "";
    const label = item.display_label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const keyNorm = key.toLowerCase().replace(/_/g, " ");
    if (normalized === label || normalized === keyNorm || normalized === key.toLowerCase()) {
      return key;
    }
  }
  // Loose contains-match as a second pass, only if exactly one candidate.
  const looseMatches = taxonomyItems.filter((item) => {
    const label = item.display_label.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    return label.includes(normalized) || normalized.includes(label);
  });
  if (looseMatches.length === 1) {
    return looseMatches[0].internal_key ?? looseMatches[0].iso_code ?? null;
  }
  return null;
}
