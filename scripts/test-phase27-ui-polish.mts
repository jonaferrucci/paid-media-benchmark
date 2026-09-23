// PHASE 27 — REAL-USAGE UI POLISH.
//
// Focused structural regression checks for the sidebar alignment fix
// and the contribution/import-history polish — same source-text
// structural-check pattern already established by
// scripts/test-mobile-responsive.mts (no jsdom/React Testing Library
// configured in this project, so markup/class STRUCTURE is asserted,
// never a real rendered pixel value).

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}

// ---------------------------------------------------------------------
// §1: sidebar bottom control — no top padding, bottom padding and
// horizontal padding both preserved, rail geometry untouched, mobile
// sheet's own (separate) wrapper untouched.
// ---------------------------------------------------------------------
const sidebarSource = readFileSync(new URL("../components/dashboard/DashboardSidebar.tsx", import.meta.url), "utf8");
assertTrue(
  sidebarSource.includes('<div className="border-t border-white/5 px-3 pb-3 pt-0">'),
  "the desktop rail's bottom control wrapper has pb-3 (bottom padding kept) and pt-0 (top padding removed), px-3 (horizontal padding kept)"
);
assertTrue(
  !sidebarSource.includes('border-t border-white/5 px-3 py-3'),
  "the old symmetric py-3 (top+bottom) spacing is gone from the desktop rail wrapper"
);
assertTrue(
  sidebarSource.includes('md:w-16 md:hover:w-56 md:focus-within:w-56'),
  "collapsed (w-16) and hover-expanded (w-56) desktop rail widths are unchanged"
);
assertTrue(
  sidebarSource.includes('border-t border-white/5 px-3 py-4'),
  "the mobile sheet's own bottom-control wrapper (a separate element, py-4) is untouched by the desktop rail's padding fix"
);

// ---------------------------------------------------------------------
// §2/§6: contribution card — campaign name stays the primary title,
// unnamed fallback stays neutral, card density is reduced without
// dropping any of the required content or shrinking the card's own
// touch target (the whole card is one Link; only inter-line/inter-card
// whitespace changes).
// ---------------------------------------------------------------------
const contributionsListSource = readFileSync(new URL("../app/account/contributions/ContributionsList.tsx", import.meta.url), "utf8");
assertTrue(
  contributionsListSource.includes('{d.campaign_name ?? t("contributions.unnamedCampaign")}'),
  "the campaign card's title is still the real campaign name, falling back to the neutral placeholder — never fabricated"
);
assertTrue(
  contributionsListSource.includes('className="block rounded-2xl border border-line bg-surface p-3.5 shadow-sm'),
  "card padding was reduced from p-4 to p-3.5 — a modest density improvement, not a redesign"
);
assertTrue(
  contributionsListSource.includes('<div className="mt-6 space-y-2">'),
  "inter-card spacing was tightened from space-y-3 to space-y-2"
);
// PHASE 38.1: the two literal-text checks that used to sit here
// (vertical+country+period merged onto one card line; source/imported-
// date shown inline on the card) go stale the moment Phase 27's own
// density fix is superseded by a LATER, equally intentional redesign —
// which is exactly what happened. Phase 35 (§5/§6, see this file's own
// comment above the summary lines) deliberately moved vertical,
// campaign type, source, and import date OFF this list card and onto
// the per-campaign detail page (ContributionDetail.tsx), keeping the
// list a fast scan (platform/objective/country/period/status) rather
// than a metadata dump. That is a real product decision, not a
// regression — Phase 27's actual INTENT (no information silently
// dropped from the product; the campaign period stays visible and
// compact) still holds, just realized differently. These two
// assertions were updated in Phase 38.1 to verify that real intent
// against the current, Phase-35 structure instead of Phase 27's exact
// since-superseded literal — nothing about ContributionsList.tsx or
// ContributionDetail.tsx changed to make this pass.
assertTrue(
  contributionsListSource.includes("{d.platforms?.display_label} · {d.objectives?.display_label} · {d.countries?.display_label}"),
  "platform/objective/country are still shown together on one compact summary line per card (Phase 35's current line, superseding Phase 27's vertical+country+period line)"
);
assertTrue(
  contributionsListSource.includes("{d.start_date} — {d.end_date}"),
  "the campaign period is still shown on every card — no information dropped, just its own line under Phase 35's structure rather than merged with country"
);
const contributionDetailSource = readFileSync(new URL("../app/account/contributions/[id]/ContributionDetail.tsx", import.meta.url), "utf8");
assertTrue(
  contributionDetailSource.includes('{t(`contributions.source.${dataset.dataSource}`)}') && contributionDetailSource.includes("contributions.importedOn"),
  "source and imported-date context is not dropped from the product — Phase 35 relocated it from the list card to the linked per-campaign detail page, where it's still shown"
);
assertTrue(
  contributionsListSource.includes("rounded-full px-2.5 py-1 text-[11px] font-medium"),
  "the status pill's own touch/tap area is untouched by the density pass — only surrounding whitespace was reduced"
);

// ---------------------------------------------------------------------
// §3: status language — "pending" no longer reads as an action item
// for a campaign whose import already completed successfully.
//
// PHASE 28 UPDATE: this pill's job changed from "did the import
// succeed" (Phase 27's fix, since nothing else on screen made the
// import/benchmark distinction) to "is this benchmark-eligible" now
// that migration 0019 + ContributionDetail.tsx's separate
// contributions.importCompleted line make that distinction explicit.
// The exact wording this assertion checks is intentionally superseded
// — see scripts/test-phase28-contribution-validation.mts for the
// current, authoritative wording check.
// ---------------------------------------------------------------------
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");
assertTrue(
  translationsSource.includes('pending: "En revisión"') && translationsSource.includes('pending: "In review"'),
  "PHASE 28: the benchmark-status pill now reads as a review state (not an import action item), now that import success is stated separately"
);
assertTrue(
  !translationsSource.includes('pending: "Pendiente"') && !/pending: "Pending"[,\n]/.test(translationsSource),
  "the old, pre-Phase-27 action-implying labels never come back"
);

// ---------------------------------------------------------------------
// §4: import-history count must reflect the REAL persisted batch —
// the batch's own success_count is only a fallback, never trusted over
// an actual tally of linked performance_datasets rows when one exists.
//
// PHASE 28 UPDATE: migration 0019 fixed the root cause (import_batches
// finally has a real, owner-scoped UPDATE policy), so the stored count
// is primary now and the real tally is the defensive fallback — the
// exact preference order flipped from Phase 27, and the tally/decision
// logic itself was centralized into lib/contribute/importBatchStatus.ts
// (tallyRealCampaignCountByBatch / resolveBatchDisplayCount) instead of
// being duplicated inline in three places. See
// test-phase28-contribution-validation.mts for the authoritative check
// of that helper's own behavior; these assertions just confirm every
// call site was migrated to use it.
// ---------------------------------------------------------------------
const importBatchStatusSource = readFileSync(new URL("../lib/contribute/importBatchStatus.ts", import.meta.url), "utf8");
assertTrue(
  importBatchStatusSource.includes("export function tallyRealCampaignCountByBatch") && importBatchStatusSource.includes("export function resolveBatchDisplayCount"),
  "PHASE 28: the tally/display-count logic is centralized in one shared module instead of duplicated across three call sites"
);
assertTrue(
  contributionsListSource.includes("resolveBatchDisplayCount(b.success_count, realCampaignCountByBatch.get(b.id))"),
  "PHASE 28: the account/contributions import-history row uses the shared helper (stored count primary, real tally as fallback)"
);
assertTrue(
  contributionsListSource.includes("tallyRealCampaignCountByBatch(datasets)"),
  "PHASE 28: the real tally itself is now built by the shared helper, not an inline loop"
);

const workspaceActionsSource = readFileSync(new URL("../lib/contribute/workspaceActions.ts", import.meta.url), "utf8");
assertTrue(
  workspaceActionsSource.includes("resolveBatchDisplayCount(b.success_count, realCampaignCountByBatch.get(b.id))"),
  "PHASE 28: the homepage Workspace's recent-imports cards use the exact same shared helper"
);
assertTrue(
  workspaceActionsSource.includes("import_batch_id") && (workspaceActionsSource.match(/await Promise\.all\(\[/g) ?? []).length === 1,
  "the real tally still reuses the existing batched performance_datasets query — no new query was added just for this fix"
);

const importBatchDetailSource = readFileSync(new URL("../app/account/contributions/imports/[id]/ImportBatchDetail.tsx", import.meta.url), "utf8");
assertTrue(
  importBatchDetailSource.includes("resolveBatchDisplayCount(batch.successCount, campaigns.length)"),
  "PHASE 28: the import-batch detail page also uses the shared helper instead of its own inline preference logic"
);

// ---------------------------------------------------------------------
// §5: legacy/neutral fallbacks stay neutral — never fabricated.
// ---------------------------------------------------------------------
assertTrue(
  contributionsListSource.includes('{b.source_filename ?? profileLabel ?? t("contributions.unknownSource")}'),
  "a batch with no captured filename falls back to the detected export-profile family, then a neutral 'unnamed file' label — never a fabricated filename"
);

console.log(`test-phase27-ui-polish: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
