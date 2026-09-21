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
assertTrue(
  contributionsListSource.includes("{d.verticals?.display_label} · {d.countries?.display_label} · {d.start_date} — {d.end_date}"),
  "vertical/country and the campaign period are merged onto one line — no information dropped, one fewer line per card"
);
assertTrue(
  contributionsListSource.includes(`{t("contributions.sourceLabel")}: {t(\`contributions.source.\${d.data_source}\`)}`),
  "source and imported-date context is still shown on the card, unchanged in substance"
);
assertTrue(
  contributionsListSource.includes("rounded-full px-2.5 py-1 text-[11px] font-medium"),
  "the status pill's own touch/tap area is untouched by the density pass — only surrounding whitespace was reduced"
);

// ---------------------------------------------------------------------
// §3: status language — "pending" no longer reads as an action item
// for a campaign whose import already completed successfully.
// ---------------------------------------------------------------------
const translationsSource = readFileSync(new URL("../lib/i18n/translations.ts", import.meta.url), "utf8");
assertTrue(
  translationsSource.includes('pending: "Importada"') && translationsSource.includes('pending: "Imported"'),
  "the 'pending' validation_status displays as a factual, completed-sounding label in both locales — never 'Pendiente'/'Pending', which read as an outstanding action"
);
assertTrue(
  !translationsSource.includes('pending: "Pendiente"') && !/pending: "Pending"[,\n]/.test(translationsSource),
  "the old action-implying labels are gone"
);

// ---------------------------------------------------------------------
// §4: import-history count must reflect the REAL persisted batch —
// the batch's own success_count is only a fallback, never trusted over
// an actual tally of linked performance_datasets rows when one exists.
// ---------------------------------------------------------------------
assertTrue(
  contributionsListSource.includes("realCampaignCountByBatch.get(b.id)"),
  "the account/contributions import-history row prefers the real tally of linked campaigns over the batch's own stored success_count"
);
assertTrue(
  contributionsListSource.includes('if (!d.import_batch_id || d.validation_status === "deleted") continue;'),
  "the real tally excludes rows without a batch link and the owner's own deleted rows — never inflating the count with unrelated data"
);

const workspaceActionsSource = readFileSync(new URL("../lib/contribute/workspaceActions.ts", import.meta.url), "utf8");
assertTrue(
  workspaceActionsSource.includes("realCampaignCountByBatch.get(b.id) ?? b.success_count"),
  "the homepage Workspace's recent-imports cards apply the exact same real-count-over-stored-count preference"
);
assertTrue(
  workspaceActionsSource.includes("import_batch_id") && (workspaceActionsSource.match(/await Promise\.all\(\[/g) ?? []).length === 1,
  "the real tally reuses the existing batched performance_datasets query — no new query was added just for this fix"
);

const importBatchDetailSource = readFileSync(new URL("../app/account/contributions/imports/[id]/ImportBatchDetail.tsx", import.meta.url), "utf8");
assertTrue(
  importBatchDetailSource.includes("const displayCount = campaigns.length > 0 ? campaigns.length : batch.successCount;"),
  "the import-batch detail page also prefers its own already-real campaigns.length over the stored success_count"
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
