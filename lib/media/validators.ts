// Pure validators shared by lib/media/actions.ts (server actions) and
// tests. Mirrors the exact checks performed there.

import { isSupportedCurrencyCode } from "@/lib/config/currencies";

export function isValidObservedValue(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

export function isValidDateString(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isValidRateCardRange(validFrom: string, validTo?: string): boolean {
  if (!validTo) return true;
  return validTo >= validFrom;
}

// Phase 19B item 4: a controlled supported set, not a length check —
// see lib/config/currencies.ts (the single centralized list).
export function isValidCurrencyCode(currency: string): boolean {
  return isSupportedCurrencyCode(currency);
}
