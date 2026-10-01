// CAMPAIGN IMPORT INTELLIGENCE — PHASE 1 — ROW-LEVEL OBJECTIVE
// CLASSIFICATION + FUNNEL DERIVATION.
//
// Exercises the two new pure modules this pass adds
// (lib/import/objectiveClassification.ts, lib/import/funnelClassification.ts),
// the two new keyword rules added to lib/import/suggestions.ts, and the
// template-versioning/grouping additions to lib/import/template.ts +
// lib/import/parse.ts. Never tests app/contribute/ContributeLanding.tsx
// directly (a React component, not unit-testable from this script
// harness) — its wiring is exercised indirectly by calling the exact
// same pure functions it calls, with evidence shaped the way
// runValidation actually gathers it, matching the style every other
// test-*.mts file in this project already uses for UI-adjacent pure
// logic (see e.g. test-adaptive-import-profiles.mts).
//
// Real, verified fixture evidence only — "Clientes potenciales" (Meta)
// and the Google column names below are taken from the SAME real
// fixtures test-real-meta-import.mts/test-google-ads-import.mts already
// use, never invented. The canonical objectives/audience_strategies/
// funnel_stages lists below are copied verbatim from supabase/seed.sql.

import { classifyRowObjective, type ObjectiveClassificationResult } from "../lib/import/objectiveClassification";
import { derive3StageFunnel, derive5StageEcommerceFunnel } from "../lib/import/funnelClassification";
import { KEYWORD_RULES, suggestObjectiveFromCampaignNames } from "../lib/import/suggestions";
import { resolveMetaResultForRow, classifyExportProfile, detectExportPlatform } from "../lib/import/platformExports";
import { parseCsv, parseXlsxBuffer } from "../lib/import/parse";
import {
  generateCsvTemplate,
  generateXlsxTemplate,
  detectTemplateVersion,
  templateFieldGroups,
  TEMPLATE_VERSION,
} from "../lib/import/template";
import { REQUIRED_FIELDS, OPTIONAL_FIELDS, type RawTable } from "../lib/import/types";
import { detectMapping } from "../lib/import/mapping";

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

// Copied verbatim from supabase/seed.sql — never invented.
const OBJECTIVES = [
  { internal_key: "awareness", display_label: "Awareness" },
  { internal_key: "reach", display_label: "Reach" },
  { internal_key: "traffic", display_label: "Traffic" },
  { internal_key: "video_views", display_label: "Video Views" },
  { internal_key: "engagement", display_label: "Engagement" },
  { internal_key: "leads", display_label: "Leads" },
  { internal_key: "sales", display_label: "Sales" },
  { internal_key: "app", display_label: "App" },
  { internal_key: "store_visits", display_label: "Store Visits" },
  { internal_key: "other", display_label: "Other" },
];

// ===========================================================================
// 1. META: structured result/conversion signal (tier 2)
// ===========================================================================

// "Clientes potenciales" is the exact real indicator value
// test-real-meta-import.mts's own fixture uses for a leads-optimized
// campaign.
const leadsIndicator = resolveMetaResultForRow("25", "Clientes potenciales").indicatorSample;
const leadsResult = classifyRowObjective({ metaIndicatorNormalized: leadsIndicator, campaignName: null }, OBJECTIVES);
assertEqual(leadsResult.objectiveKey, "leads", "Meta 'Clientes potenciales' indicator -> Leads");
assertEqual(leadsResult.confidence, "detected", "Meta 'Clientes potenciales' -> DETECTED, never a guess");
assertEqual(leadsResult.evidenceTier, "meta_result_indicator", "Leads resolved at the structured Meta indicator tier");

const salesResult = classifyRowObjective({ metaIndicatorNormalized: "compras", campaignName: null }, OBJECTIVES);
assertEqual(salesResult, { objectiveKey: "sales", confidence: "detected", reasonKey: "contribute.import.objectiveReason.metaIndicator", reasonVars: { indicator: "compras" }, evidenceTier: "meta_result_indicator" }, "Meta 'compras' indicator -> Sales, DETECTED");

const purchasesResult = classifyRowObjective({ metaIndicatorNormalized: "purchases", campaignName: null }, OBJECTIVES);
assertEqual(purchasesResult.objectiveKey, "sales", "Meta 'purchases' (English indicator form) -> Sales");

const landingPageResult = classifyRowObjective({ metaIndicatorNormalized: "landing page views", campaignName: null }, OBJECTIVES);
assertEqual(landingPageResult, { objectiveKey: "traffic", confidence: "detected", reasonKey: "contribute.import.objectiveReason.metaIndicator", reasonVars: { indicator: "landing page views" }, evidenceTier: "meta_result_indicator" }, "Meta 'Landing page views' -> Traffic, DETECTED (a real, strong structured signal)");

const linkClickResult = classifyRowObjective({ metaIndicatorNormalized: "link clicks", campaignName: null }, OBJECTIVES);
assertEqual(linkClickResult.objectiveKey, "traffic", "Meta 'Link clicks' -> Traffic");
assertEqual(linkClickResult.confidence, "suggested", "Meta 'Link clicks' is a WEAKER traffic signal than Landing Page Views -> SUGGESTED, never DETECTED");

const reachResult = classifyRowObjective({ metaIndicatorNormalized: "reach", campaignName: null }, OBJECTIVES);
assertEqual(reachResult.objectiveKey, "reach", "Meta 'Reach' indicator -> Reach");
assertEqual(reachResult.confidence, "suggested", "Reach is always SUGGESTED (brief: 'unless stronger structured objective evidence exists', and none is stronger within one Resultados/Indicador pair)");

// Generic/unrecognized Meta indicators must NEVER be guessed into an
// objective — they fall through to lower tiers (here: none available,
// so UNKNOWN with the generic no-evidence reason).
const genericConversionsResult = classifyRowObjective({ metaIndicatorNormalized: "conversions", campaignName: null }, OBJECTIVES);
assertEqual(genericConversionsResult.objectiveKey, null, "Meta's generic 'conversions' indicator (collapsed from leads/purchases/sales for the METRIC, never for objective) is never itself objective evidence");
assertEqual(genericConversionsResult.confidence, "unknown", "generic Meta 'conversions' indicator alone -> UNKNOWN, never guessed");

const unrecognizedIndicatorResult = classifyRowObjective({ metaIndicatorNormalized: "total_profile_visits", campaignName: null }, OBJECTIVES);
assertEqual(unrecognizedIndicatorResult.objectiveKey, null, "an unrecognized Meta indicator (no safe canonical mapping) is never guessed into an objective");

// ===========================================================================
// 2. GOOGLE: metric/result presence (tier 3) — deliberately minimal,
//    never using "Tipo de campaña" (campaign type) as objective evidence.
// ===========================================================================

const videoEvidenceResult = classifyRowObjective({ googleHasVideoViewEvidence: true, campaignName: null }, OBJECTIVES);
assertEqual(videoEvidenceResult, { objectiveKey: "video_views", confidence: "suggested", reasonKey: "contribute.import.objectiveReason.googleVideoEvidence", evidenceTier: "google_metric_presence" }, "Google video-view evidence -> Video Views, SUGGESTED (a real but weak signal)");

// A real Google file's own header-level video evidence (via
// classifyExportProfile, reused rather than re-implemented) drives this
// boolean in runValidation — verified here end-to-end against the SAME
// real header subset test-google-ads-import.mts uses.
const googleVideoHeaders = ["Campaña", "Código de moneda", "Costo", "Vistas de TrueView", "Video reproducido al 25 %"];
const googleVideoTable: RawTable = { headers: googleVideoHeaders, rows: [["Campaña de video", "USD", "100", "500", "200"]] };
const googleVideoMappings = detectMapping(googleVideoTable);
const googleVideoProfile = classifyExportProfile("google_ads", googleVideoTable, googleVideoMappings);
assertEqual(googleVideoProfile.profileId, "google_video_campaign_report", "the real video-evidence headers classify this file as a Google video report");

// Generic Google "Conversiones" presence is explicitly ambiguous
// (Leads vs Sales) — it must NEVER pick either on its own.
const googleConversionsAmbiguous = classifyRowObjective({ googleConversionsPresent: true, campaignName: null }, OBJECTIVES);
assertEqual(googleConversionsAmbiguous.objectiveKey, null, "Google's generic 'Conversiones' presence alone never resolves to an objective");
assertEqual(googleConversionsAmbiguous.reasonKey, "contribute.import.objectiveReason.googleConversionsAmbiguous", "the ambiguous-conversions reason is surfaced (more informative than a bare 'no evidence'), never a guess");

// But a campaign-name match still gets a chance to resolve what the
// ambiguous structured signal alone could not (tier 4 beats the
// held-back ambiguous fallback, never the other way around).
const googleConversionsWithNameResult = classifyRowObjective({ googleConversionsPresent: true, campaignName: "WM | Ventas | Q3" }, OBJECTIVES);
assertEqual(googleConversionsWithNameResult.objectiveKey, "sales", "campaign-name evidence ('Ventas') resolves what ambiguous Google Conversions presence alone could not");
assertEqual(googleConversionsWithNameResult.confidence, "suggested", "a campaign-name resolution is always SUGGESTED, never DETECTED");

// ===========================================================================
// 3. CAMPAIGN-NAME FALLBACK (tier 4) — reuses suggestions.ts's
//    KEYWORD_RULES directly, never a second/parallel keyword list.
// ===========================================================================

assertEqual(KEYWORD_RULES.length, 5, "suggestions.ts's KEYWORD_RULES now has 5 rules — the original 3 (Awareness/Reach/Traffic) plus the 2 this pass adds (Sales, Leads)");
assertEqual(KEYWORD_RULES.map((r) => r.internalKey), ["awareness", "reach", "traffic", "sales", "leads"], "the 2 new rules are APPENDED after the original 3, never reordered — preserves pre-existing first-match-wins behavior for any name matching only the original rules");

const nameOnlyTraffic = classifyRowObjective({ campaignName: "WM | Trafico | Seguidores" }, OBJECTIVES);
assertEqual(nameOnlyTraffic.objectiveKey, "traffic", "'WM | Trafico | Seguidores' (no structured evidence) falls back to the campaign-name keyword -> Traffic");
assertEqual(nameOnlyTraffic.confidence, "suggested", "a name-only resolution is always SUGGESTED, never DETECTED (it is a guess, however safe)");

const nameOnlySales = classifyRowObjective({ campaignName: "WM | Ventas | Q4" }, OBJECTIVES);
assertEqual(nameOnlySales.objectiveKey, "sales", "a campaign name containing only 'Ventas' resolves to Sales via the new keyword rule");

const nameOnlyLeads = classifyRowObjective({ campaignName: "Promo Leads Octubre" }, OBJECTIVES);
assertEqual(nameOnlyLeads.objectiveKey, "leads", "a campaign name containing 'Leads' resolves to Leads via the new keyword rule");

// The real brief example: "WM | Trafico | Ventas" contains BOTH
// "Trafico" (rule index 2) and "Ventas" (rule index 3) — first-match-
// wins means this resolves to Traffic, not Sales. This ambiguous
// multi-keyword behavior is explicitly documented (never silently
// relied upon) per the approved brief's own instruction.
const ambiguousMultiKeyword = classifyRowObjective({ campaignName: "WM | Trafico | Ventas" }, OBJECTIVES);
assertEqual(ambiguousMultiKeyword.objectiveKey, "traffic", "AMBIGUOUS MULTI-KEYWORD CASE (documented, not a bug): 'WM | Trafico | Ventas' resolves to Traffic because the Traffic rule is earlier in KEYWORD_RULES than the Sales rule — first-match-wins");

// The real brief example: "WM | Awareness | Alcance" contains both
// "Awareness" (rule index 0) and "Alcance" (rule index 1) — resolves to
// Awareness, the earlier rule.
const ambiguousAwarenessReach = classifyRowObjective({ campaignName: "WM | Awareness | Alcance" }, OBJECTIVES);
assertEqual(ambiguousAwarenessReach.objectiveKey, "awareness", "'WM | Awareness | Alcance' resolves to Awareness (earlier rule) over Reach — same documented first-match-wins behavior");

// suggestObjectiveFromCampaignNames (the existing file-level suggestion
// function, UNCHANGED itself) automatically benefits from the 2 new
// rules too, as a side effect of sharing KEYWORD_RULES — verified here
// to be intentional, not an accidental behavior change.
const fileLevelSalesSuggestion = suggestObjectiveFromCampaignNames(["WM | Ventas | Q4"], OBJECTIVES);
assertEqual(fileLevelSalesSuggestion?.internalKey, "sales", "the file-level suggestion banner also now recognizes 'Ventas' (an intentional, low-risk consistency side effect of sharing KEYWORD_RULES)");

// ===========================================================================
// 4. STRUCTURED EVIDENCE ALWAYS BEATS A CONTRADICTORY CAMPAIGN NAME
// ===========================================================================

const contradictoryEvidenceResult = classifyRowObjective(
  { metaIndicatorNormalized: "compras", campaignName: "WM | Trafico | Ventas" },
  OBJECTIVES
);
assertEqual(contradictoryEvidenceResult.objectiveKey, "sales", "a campaign named 'WM | Trafico | Ventas' (name-only would resolve to Traffic) is overridden by real structured Meta evidence (compras) -> Sales, DETECTED");
assertEqual(contradictoryEvidenceResult.confidence, "detected", "structured evidence always short-circuits before the campaign-name tier is ever consulted");

// ===========================================================================
// 5. MIXED-OBJECTIVE FILE — the real production bug this phase fixes:
//    one file, three campaigns, three genuinely different objectives,
//    resolved per row rather than one report-level guess for all three.
// ===========================================================================

const mixedFileRows = [
  { campaignName: "WM | Trafico | Seguidores", metaIndicatorNormalized: null as string | null },
  { campaignName: "WM | Trafico | Ventas", metaIndicatorNormalized: "compras" },
  { campaignName: "WM | Awareness | Alcance", metaIndicatorNormalized: null as string | null },
];
const mixedFileResults = mixedFileRows.map((r) => classifyRowObjective({ metaIndicatorNormalized: r.metaIndicatorNormalized, campaignName: r.campaignName }, OBJECTIVES));
assertEqual(mixedFileResults.map((r) => r.objectiveKey), ["traffic", "sales", "awareness"], "the real 3-campaign example resolves to 3 DIFFERENT objectives per row — never one report-level guess forced onto every row");
assertEqual(mixedFileResults.map((r) => r.confidence), ["suggested", "detected", "suggested"], "row 2 (real Meta purchase evidence) is DETECTED; rows 1 and 3 (name-only) are SUGGESTED");

// ===========================================================================
// 6. 3-STAGE FUNNEL MATRIX
// ===========================================================================

assertEqual(derive3StageFunnel("awareness").stage, "awareness", "Awareness objective -> Awareness stage");
assertEqual(derive3StageFunnel("reach").stage, "awareness", "Reach objective -> Awareness stage");
assertEqual(derive3StageFunnel("video_views").stage, "awareness", "Video Views objective -> Awareness stage (safe default)");
assertEqual(derive3StageFunnel("engagement").stage, "consideration", "Engagement objective -> Consideration stage");
assertEqual(derive3StageFunnel("traffic").stage, "consideration", "Traffic objective -> Consideration stage");
assertEqual(derive3StageFunnel("leads").stage, "conversion", "Leads objective -> Conversion stage");
assertEqual(derive3StageFunnel("sales").stage, "conversion", "Sales objective -> Conversion stage");
assertEqual(derive3StageFunnel("app").stage, "unknown", "App objective -> UNKNOWN for now (never inferred)");
assertEqual(derive3StageFunnel("other").stage, "unknown", "'Other' objective -> UNKNOWN");
assertEqual(derive3StageFunnel(null).stage, "unknown", "no objective at all -> UNKNOWN");

// Store Visits: Conversion ONLY with actual structured evidence behind
// the objective — a manual/report-level pick is never "structured".
assertEqual(derive3StageFunnel("store_visits", { hasStructuredObjectiveEvidence: true }).stage, "conversion", "Store Visits WITH structured evidence -> Conversion");
assertEqual(derive3StageFunnel("store_visits", { hasStructuredObjectiveEvidence: false }).stage, "unknown", "Store Visits WITHOUT structured evidence -> UNKNOWN, never guessed into Conversion");
assertEqual(derive3StageFunnel("store_visits").stage, "unknown", "Store Visits with the option omitted entirely defaults to the safe UNKNOWN, never Conversion");

// ===========================================================================
// 7. 5-STAGE ECOMMERCE FUNNEL MATRIX
// ===========================================================================

assertEqual(derive5StageEcommerceFunnel("awareness").stage, "conocimiento", "Awareness -> Conocimiento");
assertEqual(derive5StageEcommerceFunnel("reach").stage, "conocimiento", "Reach -> Conocimiento");
assertEqual(derive5StageEcommerceFunnel("video_views").stage, "conocimiento", "Video Views -> Conocimiento");
assertEqual(derive5StageEcommerceFunnel("engagement").stage, "consideracion", "Engagement -> Consideración");
assertEqual(derive5StageEcommerceFunnel("traffic").stage, "consideracion", "Traffic -> Consideración");
assertEqual(derive5StageEcommerceFunnel("leads").stage, null, "Leads is deliberately OMITTED (null) in the 5-stage model — never blindly labeled Compra");
assertEqual(derive5StageEcommerceFunnel("app").stage, null, "App has no ecommerce-lifecycle meaning -> omitted (null)");
assertEqual(derive5StageEcommerceFunnel("store_visits").stage, null, "Store Visits has no ecommerce-lifecycle meaning -> omitted (null)");
assertEqual(derive5StageEcommerceFunnel(null).stage, null, "no objective at all -> omitted (null)");

// Sales: the critical negative tests — purchase/sale ALONE must never
// imply Recompra or Fidelización.
assertEqual(derive5StageEcommerceFunnel("sales").stage, "compra", "Sales with ZERO additional evidence -> Compra (the safe default), never Recompra or Fidelización");
assertEqual(derive5StageEcommerceFunnel("sales", {}).stage, "compra", "Sales with an explicitly empty evidence object -> still Compra");
assertEqual(derive5StageEcommerceFunnel("sales", { campaignName: "Black Friday Sale" }).stage, "compra", "Sales with a campaign name that has nothing to do with loyalty/repeat-purchase -> still Compra, PURCHASE ALONE NEVER MEANS RECOMPRA");

// Real, pre-existing taxonomy values corroborate Recompra — copied
// verbatim from supabase/seed.sql's audience_strategies/funnel_stages.
assertEqual(derive5StageEcommerceFunnel("sales", { audienceStrategyKey: "remarketing" }).stage, "recompra", "Sales + real audience_strategies 'remarketing' evidence -> Recompra");
assertEqual(derive5StageEcommerceFunnel("sales", { audienceStrategyKey: "customer_list" }).stage, "recompra", "Sales + real audience_strategies 'customer_list' evidence -> Recompra");
assertEqual(derive5StageEcommerceFunnel("sales", { campaignName: "Recompra Clientes Q3" }).stage, "recompra", "Sales + an explicit 'Recompra' campaign-name keyword -> Recompra");
assertEqual(derive5StageEcommerceFunnel("sales", { audienceStrategyKey: "broad" }).stage, "compra", "Sales + an UNRELATED real audience_strategies value ('broad') -> still Compra, not Recompra");

// Fidelización requires its own, more specific loyalty/retention
// evidence — never purchase volume, and checked BEFORE Recompra.
assertEqual(derive5StageEcommerceFunnel("sales", { campaignName: "Programa de Fidelización VIP" }).stage, "fidelizacion", "Sales + an explicit loyalty-program campaign name -> Fidelización");
assertEqual(derive5StageEcommerceFunnel("sales", { funnelStageKey: "retention" }).stage, "fidelizacion", "Sales + real funnel_stages 'retention' evidence -> Fidelización (checked BEFORE Recompra, since 'retention' also satisfies Recompra's own funnel-stage set)");
assertEqual(derive5StageEcommerceFunnel("sales", { funnelStageKey: "remarketing" }).stage, "recompra", "Sales + real funnel_stages 'remarketing' evidence (not in Fidelización's narrower set) -> Recompra, not Fidelización");

// ===========================================================================
// 8. TEMPLATE VERSIONING — round-tripped through the REAL parse.ts
//    pipeline, never mocked.
// ===========================================================================

assertTrue(TEMPLATE_VERSION >= 2, "TEMPLATE_VERSION was bumped for this pass");

const csvTemplateText = generateCsvTemplate();
assertTrue(csvTemplateText.startsWith(`Cucurucho plantilla v${TEMPLATE_VERSION}`), "generateCsvTemplate() prepends the version-marker line");
const csvParsed = parseCsv(csvTemplateText);
assertTrue(csvParsed.ok, "the generated CSV template still parses successfully with the marker line present");
if (csvParsed.ok) {
  assertEqual(csvParsed.templateVersion, TEMPLATE_VERSION, "parseCsv() recognizes the real generated template's version marker");
  assertTrue(csvParsed.table.headers.includes("Objetivo"), "the version-marker preamble line is correctly skipped — the real header row is still found (findHeaderRowIndex's existing generic preamble-skip logic, unchanged)");
  assertTrue(csvParsed.table.rows.length >= 1, "the example data row still parses after the marker line is skipped");
}

// A legacy (pre-this-pass) template, or any other generic CSV with no
// marker at all, must still import exactly as before — the required
// backward-compatible fallback.
const legacyStyleCsv = "Plataforma,Objetivo,Vertical,País,Fecha inicio,Fecha fin,Inversión\r\nMeta Ads,Traffic,Beauty,Argentina,2026-01-01,2026-01-31,1000";
const legacyParsed = parseCsv(legacyStyleCsv);
assertTrue(legacyParsed.ok, "a legacy-style CSV (no version marker) still parses successfully");
if (legacyParsed.ok) {
  assertEqual(legacyParsed.templateVersion, null, "a legacy/generic CSV with no marker line correctly detects as templateVersion: null, never a guessed version");
  assertEqual(legacyParsed.table.headers[0], "Plataforma", "a legacy CSV's real header row is found immediately at index 0, completely unaffected by the new marker-detection logic");
}

assertEqual(detectTemplateVersion([]), null, "detectTemplateVersion([]) (no preamble at all) -> null");
assertEqual(detectTemplateVersion(["Informe de campaña"]), null, "an unrelated preamble line (e.g. Google's own report title) is never mistaken for a Cucurucho version marker");
assertEqual(detectTemplateVersion([`Cucurucho plantilla v${TEMPLATE_VERSION}`]), TEMPLATE_VERSION, "detectTemplateVersion recognizes the exact real marker line generateCsvTemplate/generateXlsxTemplate produce");
assertEqual(detectTemplateVersion(["cucurucho plantilla v1"]), 1, "detectTemplateVersion is case-insensitive and correctly reads back an OLDER version number too (e.g. a v1 template re-downloaded before this pass, if one existed)");

// XLSX round trip — same marker convention, read back through the real
// XLSX parser (sheet_to_json's own column-width padding, not mocked).
const xlsxBuffer = generateXlsxTemplate();
const xlsxParsed = parseXlsxBuffer(xlsxBuffer);
assertTrue(xlsxParsed.ok, "the generated XLSX template parses successfully with the marker row present");
if (xlsxParsed.ok) {
  assertEqual(xlsxParsed.templateVersion, TEMPLATE_VERSION, "parseXlsxBuffer() recognizes the real generated XLSX template's version marker, despite sheet_to_json's column-width padding");
  assertTrue(xlsxParsed.table.headers.includes("Objetivo"), "the XLSX marker row is correctly skipped — the real header row is still found");
}

// "Valores válidos" sheet: only ever built from REAL caller-supplied
// taxonomy rows, never hardcoded inside template.ts itself.
const xlsxWithValidValues = generateXlsxTemplate([{ label: "Objetivo", values: OBJECTIVES.map((o) => o.display_label) }]);
assertTrue(xlsxWithValidValues.byteLength > xlsxBuffer.byteLength, "passing real validValues produces a larger workbook (the extra 'Valores válidos' sheet) than the default call with none");

// REQUIRED/RECOMMENDED/ADVANCED grouping — a pure presentation layer on
// top of the real REQUIRED_FIELDS/OPTIONAL_FIELDS arrays, never a
// duplicated field list.
const groups = templateFieldGroups();
assertEqual(groups.required, REQUIRED_FIELDS, "templateFieldGroups().required is read directly from the real REQUIRED_FIELDS array, never duplicated");
assertTrue(groups.recommended.every((f) => OPTIONAL_FIELDS.includes(f)), "every RECOMMENDED field is a real member of OPTIONAL_FIELDS");
assertTrue(groups.advanced.every((f) => OPTIONAL_FIELDS.includes(f)), "every ADVANCED field is a real member of OPTIONAL_FIELDS");
const groupedOptionalFields = new Set([...groups.recommended, ...groups.advanced]);
assertEqual(groupedOptionalFields.size, OPTIONAL_FIELDS.length, "RECOMMENDED + ADVANCED together account for EVERY OPTIONAL_FIELDS entry exactly once (no field left ungrouped, none duplicated across groups)");
assertTrue(!groups.recommended.some((f) => groups.advanced.includes(f)), "RECOMMENDED and ADVANCED never overlap");

// ===========================================================================
// 9. EXPORT-GUIDANCE SAFETY: this pass adds no new header ALIASES to the
//    mapping engine itself (lib/import/mapping.ts is untouched) — the
//    UI's export-guidance text is reviewed manually for the "no
//    speculative alias" list in the final report, since mapping.ts's
//    own real ALIASES dictionary is the actual source of truth and is
//    unchanged by this pass. Verified here structurally: the speculative
//    labels the approved brief explicitly forbids are not present as
//    KEYS in detectMapping's recognized output for an unrelated file
//    (i.e. this pass introduced no new alias for them).
// ===========================================================================

const speculativeHeaders = ["Optimization Goal", "Buying Type", "Conversion Action", "Conversion Category", "Advertising Channel Subtype"];
const speculativeTable: RawTable = { headers: speculativeHeaders, rows: [["", "", "", "", ""]] };
const speculativeMappings = detectMapping(speculativeTable);
assertTrue(speculativeMappings.every((m) => m.state !== "mapped"), "none of the explicitly-forbidden speculative Meta/Google header names are recognized/auto-mapped by this project's real ALIASES dictionary — confirming this pass added no speculative alias for them");

// ===========================================================================
// 10. PLATFORM DETECTION SANITY: confirms the real detectExportPlatform
//     function this phase's evidence-gathering depends on (to decide
//     whether Meta or Google evidence even applies to a given row)
//     still behaves exactly as the pre-existing suite already verifies —
//     not re-testing platformExports.ts itself (see
//     test-adaptive-import-profiles.mts for that), just confirming the
//     dependency this new code relies on is the one actually in place.
// ===========================================================================

const metaHeaders = ["Nombre de la campaña", "Importe gastado", "Resultados", "Indicador de resultado"];
assertEqual(detectExportPlatform(metaHeaders).platformId, "meta_ads", "sanity check: the real Meta header signature this phase's Meta-tier evidence depends on still detects as meta_ads");
const googleHeaders = ["Campaña", "Código de moneda", "Tipo de campaña", "Costo/conv."];
assertEqual(detectExportPlatform(googleHeaders).platformId, "google_ads", "sanity check: the real Google header signature this phase's Google-tier evidence depends on still detects as google_ads");

console.log(`test-campaign-import-intelligence-phase1: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
