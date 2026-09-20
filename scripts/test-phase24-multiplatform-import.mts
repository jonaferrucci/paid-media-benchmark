// PHASE 24 — MULTI-PLATFORM IMPORT COMPLETION.
//
// No real TikTok/Pinterest/Mercado Ads fixtures were provided for this
// task (see the final response's "genuine unresolved issues"), so per
// the task's own REAL-FIXTURE RULE this suite does NOT fabricate a
// detailed column fingerprint for any of the three. It only (1)
// regression-protects the GENERIC platform-detection signatures that
// already shipped in a prior phase (a7aba01) — using the exact literal
// strings already declared in platformExports.ts's own SIGNATURES map,
// never a new guess — and (2) verifies the new, honest §17 "verified
// vs. pending" platform-support indicator. Same readFileSync +
// real-import pattern as scripts/test-adaptive-import-profiles.mts.

import { readFileSync } from "node:fs";
import {
  detectExportPlatform,
  classifyExportProfile,
  findAdPlatformProfile,
  isVerifiedWithRealExport,
  AD_PLATFORM_PROFILES,
} from "../lib/import/platformExports";
import type { RawTable, DetectedMapping } from "../lib/import/types";

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

function tableFrom(headers: string[], rows: string[][] = [["1"]]): RawTable {
  return { headers, rows: rows.map((r) => headers.map((_, i) => r[i] ?? "1")) };
}

// ---------------------------------------------------------------------
// §17: the platform-support indicator's single source of truth. Only
// Meta/Google are verified against a real export today — TikTok/
// Pinterest/Mercado Libre Ads stay honestly unverified, exactly
// mirroring the existing downloadGuidanceKey registry (never a second,
// independently-maintained "verified" flag that could drift out of
// sync with it).
// ---------------------------------------------------------------------
assertEqual(isVerifiedWithRealExport(findAdPlatformProfile("meta_ads")), true, "Meta Ads is verified with a real export");
assertEqual(isVerifiedWithRealExport(findAdPlatformProfile("google_ads")), true, "Google Ads is verified with a real export");
for (const id of ["tiktok_ads", "pinterest_ads", "mercado_libre_ads"] as const) {
  assertEqual(isVerifiedWithRealExport(findAdPlatformProfile(id)), false, `${id} is honestly NOT claimed as verified — no real fixture exists yet`);
}

// ---------------------------------------------------------------------
// §2/§1: without a real fixture, TikTok/Pinterest/Mercado Libre Ads
// must always resolve to the one honest GENERIC export profile — never
// a fabricated "campaign report" variant invented from assumptions,
// even once the platform itself is confidently detected.
// ---------------------------------------------------------------------
{
  const noMappings: DetectedMapping[] = [];
  for (const id of ["tiktok_ads", "pinterest_ads", "mercado_libre_ads"] as const) {
    const result = classifyExportProfile(id, tableFrom(["Campaign", "Spend"]), noMappings);
    assertEqual(result.profileId, "generic_campaign_report", `${id} always classifies as the generic profile — no invented fingerprint`);
  }
}

// ---------------------------------------------------------------------
// §18 "platform detection", "zero unsafe guessing": regression-protect
// the EXISTING generic detection signatures (already shipped, already
// real platform terminology) — built from the exact literal strings
// platformExports.ts itself declares, never a new assumption. A single
// STRONG signature alone is enough to detect; a single SUPPORTING-only
// signature must stay "ambiguous", never a guess.
// ---------------------------------------------------------------------
assertEqual(
  detectExportPlatform(["Campaign", "6-Second Video Views"]).state,
  "detected",
  "TikTok's own strong signature ('6-Second Video Views') alone is enough to detect the platform"
);
assertEqual(
  detectExportPlatform(["Campaign", "6-Second Video Views"]).platformId,
  "tiktok_ads",
  "the detected platform is TikTok Ads"
);
assertEqual(
  detectExportPlatform(["Campaign", "Video Views"]).state,
  "ambiguous",
  "a single SUPPORTING-only TikTok signal ('Video Views') is not enough evidence on its own — never a guess"
);

assertEqual(
  detectExportPlatform(["Campaign", "Pin clicks"]).state,
  "detected",
  "Pinterest's own strong signature ('Pin clicks') alone is enough to detect the platform"
);
assertEqual(
  detectExportPlatform(["Campaign", "Pin clicks"]).platformId,
  "pinterest_ads",
  "the detected platform is Pinterest Ads"
);
assertEqual(
  detectExportPlatform(["Campaign", "Spend"]).state,
  "ambiguous",
  "a single SUPPORTING-only Pinterest signal ('Spend') is not enough evidence on its own — never a guess"
);

assertEqual(
  detectExportPlatform(["Campaña", "ACOS"]).state,
  "detected",
  "Mercado Libre Ads' own strong signature ('ACOS') alone is enough to detect the platform"
);
assertEqual(
  detectExportPlatform(["Campaña", "ACOS"]).platformId,
  "mercado_libre_ads",
  "the detected platform is Mercado Libre Ads"
);
assertEqual(
  // "Campaign" (English) deliberately used here instead of "Campaña" —
  // "Campaña"/"Campana" is ITSELF one of Mercado Libre Ads' own
  // supporting signatures, which would silently add a second point of
  // evidence and invalidate this as a single-signal test.
  detectExportPlatform(["Campaign", "Inversión"]).state,
  "ambiguous",
  "a single SUPPORTING-only Mercado Libre Ads signal ('Inversión') is not enough evidence on its own — never a guess"
);

// A file with none of the three platforms' evidence at all stays
// "unknown" and still falls through to the untouched Phase 16 generic
// import flow (§15: adaptive profiles must never make generic import
// worse) — never misclassified as one of them.
assertEqual(
  detectExportPlatform(["Fecha", "Notas internas"]).state,
  "unknown",
  "a file with no recognizable evidence for any platform stays 'unknown' — the generic Phase 16 flow still applies"
);

// ---------------------------------------------------------------------
// §17 UI wiring: the honest verified/pending indicator is actually
// rendered on /contribute, not just available as a helper nobody calls.
// Structural source-text check, same pattern as the mobile-pass suite
// (no jsdom/RTL configured in this project).
// ---------------------------------------------------------------------
const contributeLandingSource = readFileSync(new URL("../app/contribute/ContributeLanding.tsx", import.meta.url), "utf8");
assertTrue(
  contributeLandingSource.includes("isVerifiedWithRealExport(p)") && contributeLandingSource.includes('t("contribute.platformPendingLabel")'),
  "the /contribute platform pill list distinguishes verified platforms from honestly-pending ones"
);
assertTrue(
  contributeLandingSource.includes('t("contribute.platformSupportLegend")'),
  "a visible legend explains the checkmark, not just a hover-only title attribute"
);

// ---------------------------------------------------------------------
// §19: no new platform was added and the registry is unchanged in
// shape — this task is additive-only (a helper function + UI labeling),
// never a schema/migration change.
// ---------------------------------------------------------------------
assertEqual(AD_PLATFORM_PROFILES.length, 5, "still exactly the 5 real platforms — Phase 24 added no new platform or migration");

console.log(`test-phase24-multiplatform-import: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
