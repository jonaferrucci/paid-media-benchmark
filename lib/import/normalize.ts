// Pure normalization helpers — number/date/taxonomy parsing. No
// Supabase/network dependency, so these are directly unit-testable.

export interface NumberParseResult {
  value: number | null;
  ambiguous: boolean;
}

// Handles both "1.234,56" (LATAM/EU) and "1,234.56" (US) formats.
// When BOTH a comma and a period appear, the LAST separator is
// assumed to be the decimal point (standard convention in both
// systems) — this is deterministic, not a guess. When only one
// separator type appears, it's ambiguous only in the specific case of
// a single comma/period with exactly 3 trailing digits (could be a
// thousands separator OR an unusual decimal) — flagged for review
// rather than silently assumed, per Phase 16 item 15.
export function parseLatamAwareNumber(raw: string): NumberParseResult {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (trimmed === "") return { value: null, ambiguous: false };

  const cleaned = trimmed.replace(/^[$€]/, "").replace(/[^\d.,-]/g, "");
  if (cleaned === "" || cleaned === "-") return { value: null, ambiguous: false };

  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");

  if (hasComma && hasDot) {
    // Whichever separator appears LAST is the decimal point.
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
