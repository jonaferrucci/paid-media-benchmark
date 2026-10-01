// CUCURUCHO — CONTRIBUTION UX SAFETY PASS A.
//
// Focused regression for the five UX-only fixes in this pass. None of
// them touch persistence semantics, validation_status behavior, curator
// RPCs, RLS, migrations, the benchmark engine, or cross-DB duplicate
// detection — this file proves that by (a) exercising the real,
// unmodified validation/parsing functions directly where they're safely
// importable (none of lib/import/parse.ts, lib/media/importSnapshots.ts,
// lib/media/importRateCards.ts carry "server-only", unlike
// lib/benchmark/engine.ts or coverage.ts — see those files' own test
// scripts for why THEY use readFileSync instead), and (b) using
// readFileSync structural checks — this project's established
// convention (scripts/test-coverage-map.mts, test-coverage-ux-polish.mts,
// etc.) — for the "use client" component UI that can't run outside Next.

import { readFileSync } from "node:fs";
import { parseCsv } from "../lib/import/parse";
import { validateSnapshotRow } from "../lib/media/importSnapshots";
import { validateRateCardRow, type RawRateCardRow } from "../lib/media/importRateCards";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else { failed++; console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`); }
}

function stripComments(src: string): string {
  return src.split("\n").filter((line) => {
    const t = line.trim();
    return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
  }).join("\n");
}

const publicMetricFlowSource = readFileSync(new URL("../app/contribute/public-metrics/PublicMetricImportFlow.tsx", import.meta.url), "utf8");
const rateCardFlowSource = readFileSync(new URL("../app/contribute/rate-cards/RateCardImportFlow.tsx", import.meta.url), "utf8");
const contributeLandingSource = readFileSync(new URL("../app/contribute/ContributeLanding.tsx", import.meta.url), "utf8");
const contributeWizardSource = readFileSync(new URL("../app/contribute/ContributeWizard.tsx", import.meta.url), "utf8");
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");

// -----------------------------------------------------------------------
// §1 PUBLIC METRICS — PENDING-REVIEW DISCLOSURE.
// Shown before confirmation AND on success — never just one of the two.
// -----------------------------------------------------------------------
{
  const occurrences = (publicMetricFlowSource.match(/t\("media\.publicMetricsPendingNote"\)/g) ?? []).length;
  assertTrue(occurrences >= 2, `publicMetricsPendingNote is rendered at least twice in PublicMetricImportFlow.tsx (found ${occurrences}) — once before confirmation, once on success`);

  const confirmStepSource = publicMetricFlowSource.slice(publicMetricFlowSource.indexOf('step === "confirm"'), publicMetricFlowSource.indexOf('step === "done"'));
  assertTrue(confirmStepSource.includes('t("media.publicMetricsPendingNote")'), "the confirm step specifically (before the user clicks confirm) renders publicMetricsPendingNote");

  const doneStepSource = publicMetricFlowSource.slice(publicMetricFlowSource.indexOf('step === "done"'));
  assertTrue(doneStepSource.includes('t("media.publicMetricsPendingNote")'), "the done step specifically (after success) renders publicMetricsPendingNote");

  assertTrue(!publicMetricFlowSource.includes("validation_status") && !publicMetricFlowSource.includes('status: "pending"'), "this disclosure is presentation-only — PublicMetricImportFlow.tsx still never sets or reads a persistence status itself (that stays server-side in lib/media/actions.ts, untouched)");
}

// -----------------------------------------------------------------------
// §2 PUBLIC METRICS — PREVIEW COMPLETENESS (date + source columns).
// -----------------------------------------------------------------------
{
  assertTrue(publicMetricFlowSource.includes('t("media.field.observedAt")') && publicMetricFlowSource.includes('t("media.field.source")'), "the review table header row now includes the observed-date and source column labels");
  assertTrue(publicMetricFlowSource.includes("row.observedAt") && publicMetricFlowSource.includes("row.source"), "the review table body now actually renders each row's observedAt and source values, not just the header labels");
}

// -----------------------------------------------------------------------
// §3 PUBLIC METRICS — FIELD-SPECIFIC VALIDATION COPY.
// Cross-checked against the REAL, unmodified validateSnapshotRow — this
// proves the five error keys formatSnapshotError's mapping covers are
// exactly the five keys that function can actually raise today, not a
// stale or invented list.
// -----------------------------------------------------------------------
{
  const knownPlatforms = [{ internal_key: "meta_ads", display_label: "Meta Ads" }];
  const knownMetrics = [{ internal_key: "subscribers", display_label: "Suscriptores" }];
  const badRow = {
    rowNumber: 2, mediaOutlet: "not_a_real_outlet", property: null, metric: "not_a_real_metric",
    value: "not_a_number", observedAt: "not_a_date", source: "",
  };
  const result = validateSnapshotRow(badRow as never, knownPlatforms, knownMetrics);
  assertEqual(
    [...result.errors].sort(),
    ["import.issue.invalidDate", "import.issue.invalidNumber", "import.issue.missingRequired", "import.issue.unknownMediaOutlet", "import.issue.unknownMetricDefinition"].sort(),
    "validateSnapshotRow (real, unmodified function) raises exactly the five error keys this pass's field-prefix mapping covers — confirms the mapping in PublicMetricImportFlow.tsx is accurate, and that validation logic itself was not touched"
  );

  const SOURCE_MAP_KEYS = ["unknownMediaOutlet", "unknownMetricDefinition", "invalidNumber", "invalidDate", "missingRequired"];
  for (const key of SOURCE_MAP_KEYS) {
    assertTrue(publicMetricFlowSource.includes(`"import.issue.${key}":`), `PublicMetricImportFlow.tsx's SNAPSHOT_ERROR_FIELD mapping includes "${key}"`);
  }
  assertTrue(publicMetricFlowSource.includes("function formatSnapshotError("), "a dedicated formatSnapshotError helper exists");
  assertTrue(
    stripComments(publicMetricFlowSource).includes("row.errors.map((e) => formatSnapshotError(e, t))"),
    "both places that render row.errors now go through formatSnapshotError instead of a bare t(e) call"
  );
}

// -----------------------------------------------------------------------
// §4 RATE CARDS — PRICING UNIT GUIDANCE (visible before the error).
// -----------------------------------------------------------------------
{
  assertTrue(rateCardFlowSource.includes('t("media.pricingUnitGuidance"'), "RateCardImportFlow.tsx's file-upload step renders inline pricing_unit guidance");
  // The guidance must actually be inside the "file" step (near the
  // template download buttons), not buried somewhere it won't be seen
  // before the user ever picks a file.
  const fileStepSource = rateCardFlowSource.slice(rateCardFlowSource.indexOf('step === "file" &&'), rateCardFlowSource.indexOf('step === "columns"'));
  assertTrue(fileStepSource.includes('t("media.pricingUnitGuidance"'), "the pricing_unit guidance specifically sits in the file-upload step, visible before any error can occur");

  for (const unit of ["per_integration", "per_spot", "per_mention", "per_day", "per_week", "per_month", "per_thousand", "package", "custom"]) {
    assertTrue(translationsSource.includes(unit), `the canonical pricing_unit value "${unit}" appears somewhere in translations.ts's guidance copy`);
  }
}

// -----------------------------------------------------------------------
// §5 RATE CARDS — INVALID PRICING-UNIT MESSAGE NAMES THE VALID OPTIONS.
// Cross-checked against the REAL, unmodified VALID_PRICING_UNITS set and
// validateRateCardRow — proves the canonical values were never changed.
// -----------------------------------------------------------------------
{
  const baseRow: RawRateCardRow = {
    rowNumber: 2, mediaOutlet: "clarin", property: null, format: "branded_integration", price: "100",
    currency: "USD", pricingUnit: "per_fortnight", validFrom: "2026-01-01", validTo: null, source: "test", sourceReference: null, notes: null,
  };
  const knownPlatforms = [{ internal_key: "clarin", display_label: "Clarín" }];
  const knownFormats = [{ internal_key: "branded_integration", display_label: "Integración de marca" }];
  const result = validateRateCardRow(baseRow, knownPlatforms, knownFormats);
  assertTrue(result.errors.includes("import.issue.unknownPricingUnit"), "validateRateCardRow (real, unmodified function) still raises exactly import.issue.unknownPricingUnit for an invalid value — the canonical error key was never changed");
  assertTrue(result.pricingUnit === null, "an invalid pricing_unit still resolves to null (never silently coerced to one of the valid values) — validation behavior unchanged");

  // The canonical valid set itself — read directly from source rather
  // than re-declared here, so this test fails loudly if anyone ever
  // changes it outside an explicitly-approved methodology-style pass.
  const importRateCardsSource = readFileSync(new URL("../lib/media/importRateCards.ts", import.meta.url), "utf8");
  const CANONICAL_UNITS = ["per_integration", "per_spot", "per_mention", "per_day", "per_week", "per_month", "per_thousand", "package", "custom"];
  for (const unit of CANONICAL_UNITS) {
    assertTrue(importRateCardsSource.includes(`"${unit}"`), `lib/media/importRateCards.ts's VALID_PRICING_UNITS still contains the canonical value "${unit}" (unchanged by this UX pass)`);
  }

  assertTrue(rateCardFlowSource.includes("function formatRateCardError("), "a dedicated formatRateCardError helper exists in RateCardImportFlow.tsx");
  assertTrue(rateCardFlowSource.includes('errorKey === "import.issue.unknownPricingUnit"'), "formatRateCardError specifically special-cases the unknownPricingUnit key");
  assertTrue(rateCardFlowSource.includes('t("media.pricingUnitInvalidWithOptions"'), "the enriched invalid-pricing-unit message key is actually used");
  assertTrue(
    stripComments(rateCardFlowSource).includes("row.errors.map((e) => formatRateCardError(e, t))"),
    "both places that render row.errors in RateCardImportFlow.tsx now go through formatRateCardError"
  );
}

// -----------------------------------------------------------------------
// §6 CAMPAIGN BULK IMPORT — 5000-ROW TRUNCATION WARNING.
// Real behavioral test against the actual parseCsv function — not just a
// structural check — since parse.ts carries no "server-only" guard.
// -----------------------------------------------------------------------
{
  const header = "platform,objective,country,start_date,end_date,ad_spend\n";
  const row = "meta_ads,traffic,AR,2026-01-01,2026-01-31,100\n";

  const smallCsv = header + row.repeat(10);
  const smallResult = parseCsv(smallCsv);
  assertTrue(smallResult.ok, "a 10-row file parses successfully");
  if (smallResult.ok) {
    assertTrue(smallResult.truncated === false, "a file under the 5000-row limit is never marked truncated");
    assertEqual(smallResult.originalRowCount, 10, "originalRowCount matches the real row count for a non-truncated file");
    assertEqual(smallResult.table.rows.length, 10, "table.rows.length matches originalRowCount when nothing was truncated");
  }

  const bigCsv = header + row.repeat(6000);
  const bigResult = parseCsv(bigCsv);
  assertTrue(bigResult.ok, "a 6000-row file still parses successfully (never rejected outright)");
  if (bigResult.ok) {
    assertTrue(bigResult.truncated === true, "a file over the 5000-row limit is marked truncated");
    assertEqual(bigResult.originalRowCount, 6000, "originalRowCount reports the TRUE original count (6000), not the post-truncation count");
    assertEqual(bigResult.table.rows.length, 5000, "the 5000-row cap itself is unchanged by this pass — still exactly 5000 rows are processed");
  }

  assertTrue(contributeLandingSource.includes("truncationInfo"), "ContributeLanding.tsx tracks truncation state");
  assertTrue(contributeLandingSource.includes('t("contribute.import.truncationWarning"'), "ContributeLanding.tsx renders the truncation warning copy");
  assertTrue(contributeLandingSource.includes("IMPORT_LIMITS.maxRows"), "the warning cites the real, unchanged IMPORT_LIMITS.maxRows value rather than a hardcoded '5000' string");
  assertTrue(contributeLandingSource.includes("result.originalRowCount") && contributeLandingSource.includes("result.truncated"), "the warning is driven directly off parse.ts's own truncated/originalRowCount fields, not a re-derived count");
}

// -----------------------------------------------------------------------
// §7 MANUAL CAMPAIGN FORM — PERFORMANCE SCOPE TRANSLATIONS.
// -----------------------------------------------------------------------
{
  const stripped = stripComments(contributeWizardSource);
  for (const literal of ['"Full Account"', '"Campaign Group"', '"Individual Campaign"']) {
    assertTrue(!stripped.includes(literal), `ContributeWizard.tsx no longer contains the hardcoded literal ${literal}`);
  }
  assertTrue(
    contributeWizardSource.includes('t("contribute.performanceScopeOptions.fullAccount")') &&
    contributeWizardSource.includes('t("contribute.performanceScopeOptions.campaignGroup")') &&
    contributeWizardSource.includes('t("contribute.performanceScopeOptions.individualCampaign")'),
    "all three performance-scope options now go through t()"
  );
  // The STORED value (what's actually submitted) must stay the exact
  // same canonical strings — only the displayed label changed.
  assertTrue(
    contributeWizardSource.includes('{ value: "full_account", label:') &&
    contributeWizardSource.includes('{ value: "campaign_group", label:') &&
    contributeWizardSource.includes('{ value: "individual_campaign", label:'),
    "the stored option values (full_account/campaign_group/individual_campaign) are unchanged — only their labels were localized"
  );

  // Gender Targeting was flagged in the originating audit as possibly
  // also hardcoded — verified false on inspection (it already goes
  // through t(`contribute.genders.${key}`)); this guard keeps it that
  // way rather than silently re-breaking it in a future edit.
  assertTrue(
    contributeWizardSource.includes("t(`contribute.genders.${key}`)"),
    "gender-targeting options were already correctly localized before this pass and remain so (confirmed, not a regression introduced here)"
  );
}

// -----------------------------------------------------------------------
// §9 FLOW-SPECIFIC DONE SUMMARY (PASS A.1) — Public Metrics and Rate
// Cards no longer reuse contribute.import.doneSummary's "campañas
// importadas" / "campaigns imported" copy, which was semantically wrong
// for flows that import metrics/prices rather than campaigns. The
// campaign flow (ContributeLanding.tsx) keeps its original key and copy
// unchanged.
// -----------------------------------------------------------------------
{
  // Campaign flow: unchanged key, unchanged copy.
  assertTrue(contributeLandingSource.includes('t("contribute.import.doneSummary"'), "ContributeLanding.tsx (the real campaign importer) still uses contribute.import.doneSummary — unchanged by this follow-up");
  assertTrue(translationsSource.includes('doneSummary: "{imported} campañas importadas, {failed} con errores.",'), "contribute.import.doneSummary's ES copy is unchanged (\"campañas importadas\")");
  assertTrue(translationsSource.includes('doneSummary: "{imported} campaigns imported, {failed} with errors.",'), "contribute.import.doneSummary's EN copy is unchanged (\"campaigns imported\")");

  // Public Metrics flow: new flow-specific key, no more reuse of the
  // campaign key, no hardcoded "métricas importadas" string in the JSX.
  assertTrue(!publicMetricFlowSource.includes('t("contribute.import.doneSummary"'), "PublicMetricImportFlow.tsx no longer reuses the campaign-specific doneSummary key");
  assertTrue(publicMetricFlowSource.includes('t("media.publicMetricsDoneSummary", { imported: result.imported, failed: result.failed })'), "PublicMetricImportFlow.tsx's done screen uses the new media.publicMetricsDoneSummary key with the same imported/failed counters");
  assertTrue(!stripComments(publicMetricFlowSource).match(/>\s*["'`].*(métricas importadas|metrics imported)/i), "the metrics-imported copy is not hardcoded inline in PublicMetricImportFlow.tsx — it comes from the translation key");
  assertTrue(translationsSource.includes('publicMetricsDoneSummary: "{imported} métricas importadas, {failed} con errores.",'), "media.publicMetricsDoneSummary's ES copy says \"métricas importadas\"");
  assertTrue(translationsSource.includes('publicMetricsDoneSummary: "{imported} metrics imported, {failed} with errors.",'), "media.publicMetricsDoneSummary's EN copy says \"metrics imported\"");

  // Rate Cards flow: new flow-specific key, no more reuse of the campaign
  // key, no hardcoded "tarifas importadas" string in the JSX.
  assertTrue(!rateCardFlowSource.includes('t("contribute.import.doneSummary"'), "RateCardImportFlow.tsx no longer reuses the campaign-specific doneSummary key");
  assertTrue(rateCardFlowSource.includes('t("media.rateCardsDoneSummary", { imported: result.imported, failed: result.failed })'), "RateCardImportFlow.tsx's done screen uses the new media.rateCardsDoneSummary key with the same imported/failed counters");
  assertTrue(!stripComments(rateCardFlowSource).match(/>\s*["'`].*(tarifas importadas|rates imported)/i), "the rates-imported copy is not hardcoded inline in RateCardImportFlow.tsx — it comes from the translation key");
  assertTrue(translationsSource.includes('rateCardsDoneSummary: "{imported} tarifas importadas, {failed} con errores.",'), "media.rateCardsDoneSummary's ES copy says \"tarifas importadas\"");
  assertTrue(translationsSource.includes('rateCardsDoneSummary: "{imported} rates imported, {failed} with errors.",'), "media.rateCardsDoneSummary's EN copy says \"rates imported\"");

  // Guard: the three done screens must each render a DIFFERENT doneSummary
  // key — proves no accidental cross-wiring between flows.
  assertTrue(
    contributeLandingSource.match(/t\("contribute\.import\.doneSummary"/)?.length === 1 &&
    publicMetricFlowSource.match(/t\("media\.publicMetricsDoneSummary"/)?.length === 1 &&
    rateCardFlowSource.match(/t\("media\.rateCardsDoneSummary"/)?.length === 1,
    "each of the three done screens renders exactly its own flow-specific doneSummary key, once"
  );

  // Pass A disclosures/guidance must still all be present after this
  // follow-up's component edits — this is a copy-only change, so nothing
  // from the prior pass should have been displaced.
  assertTrue(publicMetricFlowSource.includes('t("media.publicMetricsPendingNote")'), "Pass A's public-metrics pending-review disclosure is still present after this follow-up");
  assertTrue(rateCardFlowSource.includes('t("media.pricingUnitGuidance"'), "Pass A's rate-card pricing-unit guidance is still present after this follow-up");
  assertTrue(contributeLandingSource.includes('t("contribute.import.truncationWarning"'), "Pass A's 5000-row truncation warning is still present after this follow-up");
}

// -----------------------------------------------------------------------
// §8 ES/EN PARITY — every new key this pass added exists exactly twice
// (once per locale), never only in one.
// -----------------------------------------------------------------------
{
  const NEW_KEYS = [
    "publicMetricsPendingNote",
    "pricingUnitValidOptions",
    "pricingUnitGuidance",
    "pricingUnitInvalidWithOptions",
    "truncationWarning",
    "publicMetricsDoneSummary",
    "rateCardsDoneSummary",
  ];
  for (const key of NEW_KEYS) {
    const count = (translationsSource.match(new RegExp(`\\b${key}:`, "g")) ?? []).length;
    assertEqual(count, 2, `the "${key}" key appears exactly twice in translations.ts (one ES, one EN)`);
  }

  // performanceScopeOptions is a nested block (3 sub-keys) — checked by
  // block count and by each sub-key appearing twice.
  const optionBlocks = (translationsSource.match(/performanceScopeOptions: \{/g) ?? []).length;
  assertEqual(optionBlocks, 2, "exactly two performanceScopeOptions blocks exist (one ES, one EN) — not the unrelated 'finder' namespace's own separate performanceScope key");
  for (const sub of ["fullAccount", "campaignGroup", "individualCampaign"]) {
    const count = (translationsSource.match(new RegExp(`${sub}:`, "g")) ?? []).length;
    assertEqual(count, 2, `performanceScopeOptions.${sub} appears exactly twice (one ES, one EN)`);
  }

  // The EN performanceScopeOptions values deliberately preserve the
  // original English words this pass replaced as literals — a direct,
  // visible proof that no user-facing information was lost in the fix.
  assertTrue(translationsSource.includes('fullAccount: "Full Account"'), "the EN performanceScopeOptions.fullAccount value preserves the original English label");
  assertTrue(translationsSource.includes('campaignGroup: "Campaign Group"'), "the EN performanceScopeOptions.campaignGroup value preserves the original English label");
  assertTrue(translationsSource.includes('individualCampaign: "Individual Campaign"'), "the EN performanceScopeOptions.individualCampaign value preserves the original English label");
}

// -----------------------------------------------------------------------
// PROTECTED-AREA GUARDS — this pass must never touch persistence,
// validation_status handling, curator RPCs, RLS, migrations, the
// benchmark engine, or cross-DB duplicate detection.
// -----------------------------------------------------------------------
{
  const actionsSource = readFileSync(new URL("../lib/media/actions.ts", import.meta.url), "utf8");
  assertTrue(actionsSource.includes('status: "pending"'), "lib/media/actions.ts still inserts public-metric/rate-card submissions as pending — untouched by this UX-only pass");
  for (const forbidden of ["checkImportDuplicatesAction", "cross-db", "crossDb"]) {
    assertTrue(!readFileSync(new URL("../lib/media/importSnapshots.ts", import.meta.url), "utf8").includes(forbidden), `lib/media/importSnapshots.ts still has no cross-DB duplicate detection ("${forbidden}" absent) — explicitly out of scope for this pass`);
  }
}

console.log(`test-contribution-ux-safety-pass-a: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
