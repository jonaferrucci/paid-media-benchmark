// Phase 19B item 4 — centralized supported-currency registry. Replaces
// the length-only ("any 3 letters is valid") currency validation that
// was duplicated across lib/media/validators.ts, lib/import/validate.ts,
// app/contribute/actions.ts, and lib/media/importRateCards.ts. Adding a
// future currency means updating this ONE file — every validator and
// every currency <select> in the app reads from here.
//
// Deliberately NOT a currency-conversion table (no FX rates, no
// symbols-to-amount logic) — see Cucurucho Data Visualization.md
// "Rate-card history": different currencies are never implicitly
// compared or converted, only validated as recognized codes. Scope is
// explicitly LATAM + USD per the Phase 19B brief; existing already-
// inserted rows with any other currency remain in the database exactly
// as they are (this module only governs validation of NEW input, it
// never reads or rewrites existing records).

export interface SupportedCurrency {
  code: string;
  displayLabel: string;
}

export const SUPPORTED_CURRENCIES: SupportedCurrency[] = [
  { code: "ARS", displayLabel: "Peso argentino (ARS)" },
  { code: "USD", displayLabel: "Dólar estadounidense (USD)" },
  { code: "UYU", displayLabel: "Peso uruguayo (UYU)" },
  { code: "MXN", displayLabel: "Peso mexicano (MXN)" },
  { code: "CLP", displayLabel: "Peso chileno (CLP)" },
  { code: "COP", displayLabel: "Peso colombiano (COP)" },
  { code: "PEN", displayLabel: "Sol peruano (PEN)" },
  { code: "BRL", displayLabel: "Real brasileño (BRL)" },
];

export const SUPPORTED_CURRENCY_CODES: string[] = SUPPORTED_CURRENCIES.map((c) => c.code);

const SUPPORTED_CODE_SET = new Set(SUPPORTED_CURRENCY_CODES);

export function isSupportedCurrencyCode(currency: string): boolean {
  return SUPPORTED_CODE_SET.has(currency.trim().toUpperCase());
}
