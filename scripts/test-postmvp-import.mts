// Post-MVP tests — native ad-platform import (§C/§D/§E) and sidebar
// simplification (§J/§K). FOCUSED coverage only: doesn't duplicate the
// Phase 16 import-engine baseline (number/date parsing, taxonomy
// fuzzy-matching — see test-import-engine.mts, re-run alongside this
// script per this task's own QA sequence) or the Phase 22 sidebar
// alignment/geometry regression (see test-phase22.mts, also re-run).
// Real imports of the actual shipped modules, plus source-text
// structural checks for the sidebar nav shape, since useNavGroups()
// is a React hook (needs a translation context) but the underlying
// NAV_GROUP_STRUCTURE it maps over is a plain, directly importable
// data structure.

import { readFileSync } from "node:fs";
import { detectExportPlatform, findAdPlatformProfile, AD_PLATFORM_PROFILES } from "../lib/import/platformExports";
import { detectMapping, normalizeHeader } from "../lib/import/mapping";
import type { RawTable } from "../lib/import/types";
import { NAV_GROUP_STRUCTURE } from "../components/dashboard/DashboardSidebar";

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

function table(headers: string[]): RawTable {
  return { headers, rows: [] };
}

// ---------------------------------------------------------------------
// §D: real ad-platform export detection — one representative header
// set per platform, taken directly from the task's own alias examples.
// ---------------------------------------------------------------------
assertEqual(
  detectExportPlatform(["Campaign name", "Ad set name", "Amount spent", "Impressions", "Link clicks", "Purchases"]).state,
  "detected",
  "Meta Ads export (Ad set name + Amount spent) is detected"
);
assertEqual(
  detectExportPlatform(["Campaign name", "Ad set name", "Amount spent", "Impressions", "Link clicks", "Purchases"]).platformId,
  "meta_ads",
  "Meta Ads export resolves to the meta_ads profile"
);
assertEqual(
  detectExportPlatform(["Campaign", "Campaign type", "Cost", "Impressions", "Clicks", "Avg. CPC", "Conversions"]).state,
  "detected",
  "Google Ads export (Campaign type + Avg. CPC) is detected"
);
assertEqual(
  detectExportPlatform(["Campaign", "Campaign type", "Cost", "Impressions", "Clicks", "Avg. CPC", "Conversions"]).platformId,
  "google_ads",
  "Google Ads export resolves to the google_ads profile"
);
assertEqual(
  detectExportPlatform(["Campaign name", "Ad group name", "Ad name", "Cost", "Impressions", "Clicks", "6-Second Video Views"]).platformId,
  "tiktok_ads",
  "TikTok Ads export (6-Second Video Views alone) resolves to tiktok_ads"
);
assertEqual(
  detectExportPlatform(["Campaign name", "Spend", "Impressions", "Pin clicks", "Outbound clicks", "CTR"]).platformId,
  "pinterest_ads",
  "Pinterest Ads export (Pin clicks + Outbound clicks) resolves to pinterest_ads"
);
assertEqual(
  detectExportPlatform(["Campaña", "Inversión", "Impresiones", "Clics", "Ventas", "Facturación", "ACOS"]).platformId,
  "mercado_libre_ads",
  "Mercado Libre Ads export (Facturación + ACOS) resolves to mercado_libre_ads"
);

// Weak/ambiguous/unknown evidence must never be silently guessed.
assertEqual(
  detectExportPlatform(["Campaign", "Impressions", "Clicks", "Conversions"]).state,
  "unknown",
  "a header set with no platform-distinctive column at all is 'unknown', never guessed"
);
assertEqual(
  detectExportPlatform(["Campaign", "Spend", "Impressions", "Reach"]).state,
  "ambiguous",
  "a single weak/supporting-only signal (Reach, shared with Meta at weight 1) is 'ambiguous', not 'detected'"
);
const tie = detectExportPlatform(["Ad set name", "Amount spent", "Campaign type", "Avg. CPC"]);
assertTrue(tie.state === "ambiguous" && tie.platformId === null, "a genuine tie between two platforms' top scores is 'ambiguous', never a coin-flip pick");

// ---------------------------------------------------------------------
// §C: real ad-platform header aliases map to the SAME existing
// canonical fields — no invented fields, Spanish variants included.
// ---------------------------------------------------------------------
const metaHeaders = table(["Campaign name", "Amount spent", "Impressions", "Link clicks", "Purchases", "Purchase conversion value"]);
const metaMappings = detectMapping(metaHeaders);
assertEqual(metaMappings.find((m) => m.sourceHeader === "Amount spent")?.canonicalField, "ad_spend", "Meta 'Amount spent' maps to ad_spend");
assertEqual(metaMappings.find((m) => m.sourceHeader === "Purchases")?.canonicalField, "conversions", "Meta 'Purchases' maps to conversions");
assertEqual(metaMappings.find((m) => m.sourceHeader === "Purchase conversion value")?.canonicalField, "attributed_revenue", "Meta 'Purchase conversion value' maps to attributed_revenue");
// POST-MVP IMPORT FIX 2 (row-level fix, §3): campaign identity was
// previously disposable row-identity metadata (auto-ignored) — it's now
// a real ALIASES.campaign_name mapping instead, since campaign identity
// must be preserved for review rather than dropped. See
// scripts/test-real-meta-import.mts and test-row-level-meta-import.mts
// for the full campaign-identity-preservation coverage.
assertEqual(metaMappings.find((m) => m.sourceHeader === "Campaign name")?.state, "mapped", "Meta 'Campaign name' is auto-mapped to campaign_name (row-level fix §3), not ignored");
assertEqual(metaMappings.find((m) => m.sourceHeader === "Campaign name")?.canonicalField, "campaign_name", "Meta 'Campaign name' maps to the campaign_name field");

const esMappings = detectMapping(table(["Importe gastado", "Impresiones", "Clientes potenciales", "Facturación"]));
assertEqual(esMappings.find((m) => m.sourceHeader === "Importe gastado")?.canonicalField, "ad_spend", "Spanish 'Importe gastado' maps to ad_spend");
assertEqual(esMappings.find((m) => m.sourceHeader === "Clientes potenciales")?.canonicalField, "conversions", "Spanish 'Clientes potenciales' maps to conversions");
assertEqual(esMappings.find((m) => m.sourceHeader === "Facturación")?.canonicalField, "total_revenue", "Spanish 'Facturación' maps to total_revenue");

// §F: derived/calculated metrics are recognized and auto-ignored —
// Cucurucho's own calculateDerivedMetrics is never overridden by a
// platform's own pre-calculated figure.
const derivedHeaders = table(["Spend", "Impressions", "CTR", "CPM", "CPC", "ROAS", "ACOS", "6-Second Video Views"]);
const derivedMappings = detectMapping(derivedHeaders);
for (const h of ["CTR", "CPM", "CPC", "ROAS", "ACOS", "6-Second Video Views"]) {
  assertEqual(derivedMappings.find((m) => m.sourceHeader === h)?.state, "ignored", `platform-calculated '${h}' is auto-ignored, never trusted from the file`);
}
// A genuinely unrecognized column still lands in needs_review, not ignored.
const unknownColMappings = detectMapping(table(["Spend", "Some Totally Custom Internal Field"]));
assertEqual(unknownColMappings.find((m) => m.sourceHeader === "Some Totally Custom Internal Field")?.state, "needs_review", "a genuinely unknown column stays needs_review, not auto-ignored");

// normalizeHeader itself (exported for reuse by the detector) still
// behaves exactly as the original Phase 16 alias-matching relied on.
assertEqual(normalizeHeader("Amount Spent"), "amount spent", "normalizeHeader lowercases");
assertEqual(normalizeHeader("Avg. CPC"), "avg cpc", "normalizeHeader strips trailing punctuation");
assertEqual(normalizeHeader("Clientes  potenciales"), "clientes potenciales", "normalizeHeader collapses whitespace");

// AD_PLATFORM_PROFILES is the single source of truth the landing
// page's platform chips render from — exactly 5 real platforms, each
// with a real seeded display_label (verified against supabase/seed.sql
// during this task; re-asserted here as a lightweight drift guard).
assertEqual(AD_PLATFORM_PROFILES.length, 5, "exactly 5 ad platform profiles are defined");
assertEqual(findAdPlatformProfile("mercado_libre_ads").displayLabel, "Mercado Libre Ads", "the real seeded display_label is used, not the colloquial 'Mercado Ads'");

// ---------------------------------------------------------------------
// §J/§K: sidebar nav shape — EXPLORAR (3) / TRABAJAR (3) / ADMINISTRAR
// (1), Verticals/Audiences no longer in the sidebar (routes untouched
// — see the file-existence check below), Planificador's label key
// changed so it can't still be the old, truncation-prone string.
// ---------------------------------------------------------------------
assertEqual(NAV_GROUP_STRUCTURE.length, 3, "exactly 3 nav groups (Explorar/Trabajar/Administrar)");
assertEqual(NAV_GROUP_STRUCTURE[0].groupKey, "nav.groupExplore", "first group is Explorar");
assertEqual(NAV_GROUP_STRUCTURE[0].items.map((i) => i.href), ["/", "/benchmark", "/platforms"], "Explorar has exactly Inicio/Benchmark/Medios — Verticals and Audiences are no longer permanent sidebar items");
assertEqual(NAV_GROUP_STRUCTURE[0].items.find((i) => i.href === "/platforms")?.labelKey, "nav.media", "the /platforms sidebar item uses the user-facing 'Medios' label key, not the internal 'platforms' one");
assertEqual(NAV_GROUP_STRUCTURE[1].groupKey, "nav.groupWork", "second group is Trabajar");
assertEqual(NAV_GROUP_STRUCTURE[1].items.map((i) => i.href), ["/planner", "/comparisons", "/contribute"], "Trabajar has Planificador/Mis comparaciones/Aportar datos");
assertEqual(NAV_GROUP_STRUCTURE[2].groupKey, "nav.groupAdmin", "third group is Administrar");
assertEqual(NAV_GROUP_STRUCTURE[2].items.map((i) => i.href), ["/curation"], "Administrar has only Curación");

// The routes for Verticals/Audiences must still exist on disk — this
// task removes them from the sidebar array, never deletes the pages.
assertTrue(
  (() => { try { readFileSync(new URL("../app/verticals/page.tsx", import.meta.url)); return true; } catch { return false; } })(),
  "/verticals route still exists on disk (only removed from the sidebar, per the task's explicit instruction)"
);
assertTrue(
  (() => { try { readFileSync(new URL("../app/audiences/page.tsx", import.meta.url)); return true; } catch { return false; } })(),
  "/audiences route still exists on disk (only removed from the sidebar, per the task's explicit instruction)"
);

// Translation source check: the shortened planner label text must not
// still be the old, truncation-prone "Planificador de medios"/"Media
// Planner" strings (a plain source-text check, since translations.ts
// has no runtime export of "the current locale's nav.planner value"
// separate from the LanguageContext itself).
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");
assertTrue(!translationsSource.includes('planner: "Planificador de medios"'), "the old, truncation-prone ES planner label is gone");
assertTrue(!translationsSource.includes('planner: "Media Planner"'), "the old, truncation-prone EN planner label is gone");
assertTrue(translationsSource.includes('planner: "Planificador"'), "the ES planner label is now the shorter 'Planificador'");

// RAIL_ICON_SLOT geometry (Phase 22) must still be present, unregressed.
const sidebarSource = readFileSync(new URL("../components/dashboard/DashboardSidebar.tsx", import.meta.url), "utf8");
assertTrue(sidebarSource.includes("const RAIL_ICON_SLOT ="), "the Phase 22 RAIL_ICON_SLOT constant is still defined");
assertTrue((sidebarSource.match(/RAIL_ICON_SLOT/g) ?? []).length >= 3, "RAIL_ICON_SLOT is still used by at least two call sites (nav link + pin control)");

console.log(`\ntest-postmvp-import: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
