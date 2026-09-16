// Phase 19B tests — real imports of the shipped pure modules (no
// mocks/reimplementation), same convention as scripts/test-rate-cards.mts
// and friends.

import { groupRateCardsByIdentity, areRateCardsCompatible } from "../lib/media/rateCardHistory";
import { platformsForCategory, platformsForCountry, formatsForCategory, metricsForCategory } from "../lib/media/filter";
import { isSupportedCurrencyCode, SUPPORTED_CURRENCIES, SUPPORTED_CURRENCY_CODES } from "../lib/config/currencies";
import { isValidCurrencyCode } from "../lib/media/validators";
import {
  authorizeGovernanceAction,
  isValidRateCardTransition,
  isValidSnapshotTransition,
  isValidPlatformStatusTransition,
} from "../lib/media/governanceRules";

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`); }
}
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

const today = new Date("2026-09-16T12:00:00Z");

// --- Item 1: rate-card profile history grouping ----------------------
const identityA = { platformId: "olga", propertyId: null, mediaFormatId: "integration", currency: "USD", pricingUnit: "per_integration" };
const identityB = { platformId: "olga", propertyId: null, mediaFormatId: "sponsorship", currency: "ARS", pricingUnit: "per_month" };

const mixedRateCards = [
  { id: "a-active", ...identityA, price: 2000, status: "active" as const, validFrom: "2026-09-01", validTo: null },
  { id: "a-superseded", ...identityA, price: 1600, status: "superseded" as const, validFrom: "2026-06-01", validTo: "2026-08-31" },
  { id: "a-pending", ...identityA, price: 5000, status: "pending" as const, validFrom: "2026-09-10", validTo: null },
  { id: "b-pending-only", ...identityB, price: 300000, status: "pending" as const, validFrom: "2026-09-01", validTo: null },
];

const groups = groupRateCardsByIdentity(mixedRateCards, today);
assertEqual(groups.length, 2, "groups by exact compatible identity — two distinct identities produce two groups");

const groupA = groups.find((g) => g.identity.mediaFormatId === "integration")!;
assertEqual(groupA.current?.id, "a-active", "current resolves to the active row within the group");
assertEqual(groupA.previous?.id, "a-superseded", "previous resolves to the compatible superseded row");
assertTrue(groupA.change !== null && groupA.change.absolute === 400, "change computed correctly (1600 -> 2000)");
assertTrue(!groupA.history.some((h) => h.id === "a-pending"), "a pending row NEVER appears in the compact history list, even mixed in with active/superseded rows");
assertEqual(groupA.pendingCount, 1, "pending row is counted, not shown as a price");
assertTrue(!groupA.isPendingOnly, "a group with an active row is never flagged pending-only");

const groupB = groups.find((g) => g.identity.mediaFormatId === "sponsorship")!;
assertEqual(groupB.current, null, "a group with ONLY a pending submission has no current price");
assertEqual(groupB.previous, null, "no previous price either, when nothing verified exists yet");
assertTrue(groupB.isPendingOnly, "outlet with only pending rows is correctly flagged pending-only");
assertEqual(groupB.pendingCount, 1, "pending count still reported for messaging, even with no current price");

// A pending row must never be eligible as "previous" for change math,
// even when it's chronologically earlier than the current active row.
const pendingCanNeverBePrevious = [
  { id: "cur", ...identityA, price: 2000, status: "active" as const, validFrom: "2026-09-01", validTo: null },
  { id: "old-pending", ...identityA, price: 1, status: "pending" as const, validFrom: "2026-01-01", validTo: null },
];
const g2 = groupRateCardsByIdentity(pendingCanNeverBePrevious, today)[0];
assertEqual(g2.previous, null, "an earlier PENDING row is never treated as the previous verified price");
assertEqual(g2.change, null, "no change computed against a pending row");

// --- Item 1: compatibility rule reused, not reimplemented -------------
assertTrue(areRateCardsCompatible(identityA, { ...identityA }), "identical identity still compatible (reused rule)");
assertTrue(!areRateCardsCompatible(identityA, identityB), "different format+currency+unit correctly incompatible");

// --- Item 2: category-aware wizard applicability -----------------------
// Mirrors the CONTRIBUTION WIZARD's taxonomy shape (extra metric_kind/
// unit_type fields getMediaCatalog's narrower type doesn't carry) to
// prove the generic filter functions are genuinely reusable there, not
// just structurally coincidental with the catalog's own shape.
type WizardPlatform = { id: string; internal_key: string; display_label: string; media_category_id: string | null; is_global: boolean };
type WizardMetric = { id: string; internal_key: string; display_label: string; metric_kind: "base" | "derived"; unit_type: string };

const wizardPlatforms: WizardPlatform[] = [
  { id: "p-meta", internal_key: "meta_ads", display_label: "Meta Ads", media_category_id: "cat-paid-social", is_global: true },
  { id: "p-olga", internal_key: "olga", display_label: "OLGA", media_category_id: "cat-streaming", is_global: false },
];
const wizardPlatformCountries = [{ platform_id: "p-olga", country_id: "ar" }];

assertEqual(
  platformsForCategory(wizardPlatforms, "cat-streaming").map((p) => p.id),
  ["p-olga"],
  "category filter works against the wizard's own (differently-selected) platform shape"
);
assertEqual(
  platformsForCountry(platformsForCategory(wizardPlatforms, null), wizardPlatformCountries, "ar").map((p) => p.id).sort(),
  ["p-meta", "p-olga"],
  "global platform still included for a country even scoped through the wizard's taxonomy shape"
);
assertEqual(
  platformsForCountry(platformsForCategory(wizardPlatforms, null), wizardPlatformCountries, "mx").map((p) => p.id),
  ["p-meta"],
  "AR-only outlet correctly excluded for a different country, wizard shape"
);

const wizardMetrics: WizardMetric[] = [
  { id: "m-impr", internal_key: "impressions", display_label: "Impresiones", metric_kind: "base", unit_type: "count" },
  { id: "m-spend", internal_key: "ad_spend", display_label: "Inversión", metric_kind: "base", unit_type: "currency" },
];
const wizardCategoryMetrics = [{ media_category_id: "cat-streaming", metric_id: "m-impr", required: false }];

const streamingApplicable = metricsForCategory(wizardCategoryMetrics, wizardMetrics, "cat-streaming");
assertEqual(streamingApplicable.map((x) => x.metric.internal_key), ["impressions"], "category-driven metrics resolve for a new (streaming) category, keeping the wizard's extra metric_kind/unit_type fields intact");
assertTrue(streamingApplicable[0].metric.metric_kind === "base", "the generic preserves the wizard's wider metric type (metric_kind readable), not just the narrower catalog shape");

// --- Item 2: paid-media backward compatibility --------------------------
// paid_social has NO media_category_metrics rows seeded (migration
// 0012's own comment: "existing paid-social/search/marketplace/
// programmatic categories keep using platform_metrics") — the wizard
// must fall back to the ORIGINAL platform_metrics-driven behavior for
// these, completely unchanged, never an empty/broken metrics step.
const paidSocialApplicable = metricsForCategory(wizardCategoryMetrics, wizardMetrics, "cat-paid-social");
assertEqual(paidSocialApplicable.length, 0, "an existing paid-media category with no category-metrics rows returns empty — this is exactly the signal the wizard uses to fall back to platform_metrics, never a broken/empty step");

assertEqual(formatsForCategory([{ id: "f1", media_category_id: "cat-streaming" }], "cat-paid-social").length, 0, "a paid-media category with no formats seeded correctly yields no Formato step (progressive disclosure, not an error)");

// --- Item 3: curator authorization (never trust a client check alone) ---
assertEqual(authorizeGovernanceAction(false, false), { allowed: false, error: "not_authenticated" }, "signed-out visitor is rejected before curator status is even considered");
assertEqual(authorizeGovernanceAction(true, false), { allowed: false, error: "not_authorized" }, "authenticated but non-curator user is rejected — this is the 'unauthorized moderation rejection' case");
assertEqual(authorizeGovernanceAction(true, true), { allowed: true }, "authenticated curator is allowed");
assertTrue(authorizeGovernanceAction(false, true).allowed === false, "an is_curator=true flag can never substitute for actually being authenticated (defensive ordering)");

// --- Item 3: pending -> active/rejected/inactive transitions -----------
assertTrue(isValidRateCardTransition("pending", "active"), "pending -> active is a valid rate-card transition");
assertTrue(isValidRateCardTransition("pending", "rejected"), "pending -> rejected is a valid rate-card transition");
assertTrue(!isValidRateCardTransition("active", "active"), "an already-active rate card is never re-'reviewed' through this path");
assertTrue(!isValidRateCardTransition("rejected", "active"), "a rejected submission cannot be silently reinstated — resubmission is the correct path");

assertTrue(isValidSnapshotTransition("pending", "active"), "pending -> active is a valid snapshot transition");
assertTrue(isValidSnapshotTransition("pending", "rejected"), "pending -> rejected is a valid snapshot transition");
assertTrue(!isValidSnapshotTransition("active", "rejected"), "an already-active snapshot cannot be retroactively rejected through this path");

assertTrue(isValidPlatformStatusTransition("pending", "active"), "pending -> active is a valid platform governance transition");
assertTrue(isValidPlatformStatusTransition("pending", "inactive"), "pending -> inactive is a valid platform governance transition");
assertTrue(!isValidPlatformStatusTransition("active", "inactive"), "an already-active platform is not deactivated through the pending-review path");

// --- Item 4: currency validation (controlled set, not length) ----------
assertTrue(isSupportedCurrencyCode("ARS"), "ARS is supported");
assertTrue(isSupportedCurrencyCode("brl"), "lowercase input is normalized before checking");
assertTrue(isSupportedCurrencyCode(" USD "), "surrounding whitespace is trimmed before checking");
assertTrue(!isSupportedCurrencyCode("EUR"), "EUR is a well-formed 3-letter code but NOT in the controlled set — this is exactly what the length-only check used to miss");
assertTrue(!isSupportedCurrencyCode("AR"), "still rejects a too-short code");
assertEqual(SUPPORTED_CURRENCY_CODES.length, 8, "exactly the 8 currencies specified in the brief");
assertTrue(SUPPORTED_CURRENCIES.every((c) => SUPPORTED_CURRENCY_CODES.includes(c.code)), "every entry's code is reflected in the flat code list (single source of truth)");
assertTrue(isValidCurrencyCode("MXN"), "lib/media/validators.ts's isValidCurrencyCode now delegates to the centralized controlled set");
assertTrue(!isValidCurrencyCode("GBP"), "lib/media/validators.ts rejects a currency outside the controlled set");

console.log(`\n${failed === 0 ? "ALL" : failed} PHASE 19B TESTS ${failed === 0 ? "PASSED" : "FAILED"} (${passed} passed, ${failed} failed)`);
if (failed > 0) process.exit(1);
