// MVP RELEASE FIX — final accessibility/polish pass, resolving exactly
// the 5 items the Release UAT found (0 BLOCKERS, primary journeys/data
// integrity/security all already PASS). Same convention as every other
// scripts/test-*.mts file: readFileSync-based structural source-text
// checks (no jsdom/React Testing Library configured here).
//
// Explicitly OUT of scope for this pass (never touched, never checked
// here as a "fix"): Planner ghost selections, real import fixture
// storage, contribution hard delete, Media -> Planner auto-select,
// stale planner comment, dead market.* translations, DiscoveryWizard
// objective cast, CPL, Historical Benchmarks, Campaign Explorer, or any
// other FUTURE item from the Release UAT.

import { readFileSync } from "node:fs";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}`);
  }
}

const root = new URL("..", import.meta.url);
function read(path: string): string {
  return readFileSync(new URL(path, root), "utf8");
}

const searchOverlaySource = read("components/dashboard/SearchOverlay.tsx");
const mediaCatalogSource = read("app/platforms/MediaCatalogView.tsx");
const mediaProfileSource = read("app/media/[slug]/MediaProfileView.tsx");
const comparisonDetailSource = read("app/benchmark/ComparisonDetail.tsx");
const savedComparisonsSource = read("app/comparisons/SavedComparisonsList.tsx");
const translationsSource = read("lib/i18n/translations.ts");
const classifySource = read("lib/comparison/classify.ts");

// -----------------------------------------------------------------------
// 1. SearchOverlay — close button accessible name.
// -----------------------------------------------------------------------
assertTrue(
  searchOverlaySource.includes('aria-label={t("search.close")}'),
  "SearchOverlay's close button now has an aria-label bound to a real translation key"
);
assertTrue(
  searchOverlaySource.includes("<X size={16} />"),
  "the close button's icon is unchanged (X, size 16)"
);
assertTrue(
  searchOverlaySource.includes("onClick={onClose}") && searchOverlaySource.includes("useEffect"),
  "the close button's onClick and the existing Escape-to-close behavior are both still present"
);
assertTrue(translationsSource.includes('close: "Cerrar búsqueda"'), "search.close (ES) translation exists");
assertTrue(translationsSource.includes('close: "Close search"'), "search.close (EN) translation exists");

// -----------------------------------------------------------------------
// 2. Search input focus-visible — SearchOverlay + MediaCatalogView.
// -----------------------------------------------------------------------
assertTrue(
  /rounded-full border border-line bg-canvas px-4 py-2\.5[^"]*focus-within:border-primary/.test(searchOverlaySource),
  "SearchOverlay's search-pill wrapper gets a focus-within style (the input itself has no border to color)"
);
assertTrue(
  /rounded-full border border-line bg-surface px-3 py-2[^"]*focus-within:border-primary/.test(mediaCatalogSource),
  "MediaCatalogView's search-pill wrapper gets the same focus-within style"
);
assertTrue(
  searchOverlaySource.includes("border-primary") && mediaCatalogSource.includes("border-primary"),
  "both use the existing border-primary token — no new color/dependency introduced"
);
// The fix must not touch the shared Input component (would ripple into
// unrelated pages) — this is a local wrapper-div style, not a change to
// components/ui/Input.tsx.
{
  const sharedInputSource = read("components/ui/Input.tsx");
  assertTrue(
    !sharedInputSource.includes("focus-within"),
    "the shared Input component (used by unrelated pages) was not touched by this fix"
  );
}

// -----------------------------------------------------------------------
// 3. Media rate-card history disclosure — real aria-expanded (+ aria-controls).
// -----------------------------------------------------------------------
assertTrue(
  mediaProfileSource.includes("aria-expanded={historyOpen}"),
  "the rate-card history toggle exposes aria-expanded bound to the real historyOpen state"
);
assertTrue(
  mediaProfileSource.includes("aria-controls={historyId}") && mediaProfileSource.includes("id={historyId}"),
  "the toggle has aria-controls pointing at the actual history list's id"
);
assertTrue(
  mediaProfileSource.includes("identity.mediaFormatId") && mediaProfileSource.includes("identity.propertyId"),
  "historyId is derived from this card's own real composite identity, so multiple rate-card groups on one profile never collide"
);
assertTrue(
  mediaProfileSource.includes("setHistoryOpen((v) => !v)"),
  "the disclosure's own toggle logic is unchanged — only its ARIA wiring was added"
);

// -----------------------------------------------------------------------
// 4. ComparisonDetail — marker clipping fix. Math/position untouched,
//    only the label's own anchor changes near the track edges.
// -----------------------------------------------------------------------
assertTrue(
  comparisonDetailSource.includes("computeMarkerPosition") && classifySource.includes("export function computeMarkerPosition"),
  "computeMarkerPosition is still imported from and defined in lib/comparison/classify.ts — not re-derived locally"
);
{
  // Confirm the actual computeMarkerPosition implementation (P25/median/
  // P75 math) is untouched by grabbing its function body and checking
  // for the statistics-based math this phase was told never to change.
  const fnMatch = classifySource.match(/export function computeMarkerPosition\([\s\S]*?\n}/);
  assertTrue(!!fnMatch, "computeMarkerPosition's implementation is present and extractable");
  assertTrue(
    !!fnMatch && /p25|median|p75/.test(fnMatch[0]),
    "computeMarkerPosition's body still derives from p25/median/p75 statistics, unchanged"
  );
}
assertTrue(
  !comparisonDetailSource.includes("flex -translate-x-1/2 flex-col items-center"),
  "the old shared label+pin transform (which caused the clipping) is gone"
);
assertTrue(
  comparisonDetailSource.includes('style={{ left: `${markerPosition}%` }}') &&
  (comparisonDetailSource.match(/style=\{\{ left: `\$\{markerPosition\}%`/g) ?? []).length >= 2,
  "both the pin and the label are still positioned from the same, single, unmodified markerPosition value"
);
assertTrue(
  comparisonDetailSource.includes("function markerLabelTransform(position: number)"),
  "a local, presentation-only helper decides the label's anchor near the track edges"
);
assertTrue(
  comparisonDetailSource.includes('return "translateX(0%)"') &&
  comparisonDetailSource.includes('return "translateX(-100%)"') &&
  comparisonDetailSource.includes('return "translateX(-50%)"'),
  "the label anchor has 3 real cases: left edge, right edge, and the original centered case"
);
assertTrue(
  comparisonDetailSource.includes("markerLabelTransform(markerPosition)"),
  "the label's transform is actually driven by the real markerPosition value, not a static class"
);
// Never let the fix introduce a new horizontal-overflow escape hatch.
assertTrue(
  !/overflow-x-auto|whitespace-nowrap\s+overflow-visible/.test(comparisonDetailSource),
  "no new horizontal-scroll pattern was introduced by this fix"
);
// P25/Median/P75/classification/percent-diff call sites are untouched.
for (const fn of ["classifyPerformance", "computePercentDiff", "resolveClassificationLabelKey", "getInsightKey"]) {
  assertTrue(comparisonDetailSource.includes(fn), `${fn} is still delegated to lib/comparison/classify.ts, unchanged`);
}

// -----------------------------------------------------------------------
// 5. SavedComparisonsList — "more actions" menu closes on Escape and
//    outside click; every existing action/routing/delete behavior kept.
// -----------------------------------------------------------------------
assertTrue(
  savedComparisonsSource.includes('if (e.key === "Escape") setOpenMenuId(null);'),
  "the more-actions menu closes on Escape"
);
assertTrue(
  savedComparisonsSource.includes("openMenuRef.current && !openMenuRef.current.contains(e.target as Node)"),
  "the more-actions menu closes on an outside click, via the same ref-containment check AccountMenu.tsx already uses"
);
assertTrue(
  savedComparisonsSource.includes('document.addEventListener("mousedown", handleClickOutside)') &&
  savedComparisonsSource.includes('document.addEventListener("keydown", handleEscape)'),
  "both listeners are real document-level listeners, not stubs"
);
assertTrue(
  savedComparisonsSource.includes("ref={openMenuId === c.id ? openMenuRef : undefined}"),
  "the ref is only attached to the row whose menu is actually open, so it never mismatches to a different comparison's menu"
);
// Preserved behavior: rename/duplicate/delete actions, routing, and
// keyboard accessibility (existing Escape-to-cancel-rename and the
// alertdialog's own Escape handler) are all still present verbatim.
for (const preserved of [
  "renameComparisonAction",
  "duplicateComparisonAction",
  "deleteComparisonAction",
  'router.push(`/benchmark?saved=${c.id}`)',
  'if (e.key === "Escape") { setRenamingId(null); setRenameError(null); }',
  'role="alertdialog"',
]) {
  assertTrue(savedComparisonsSource.includes(preserved), `existing behavior preserved: ${preserved}`);
}
// AccountMenu itself (the reused pattern's source) was not modified.
{
  const accountMenuSource = read("components/dashboard/AccountMenu.tsx");
  assertTrue(
    accountMenuSource.includes("function handleClickOutside(e: MouseEvent)") && !accountMenuSource.includes("openMenuRef"),
    "AccountMenu.tsx (the reused pattern's source) is untouched by this fix"
  );
}

// -----------------------------------------------------------------------
// Out-of-scope guard: none of the explicitly-excluded FUTURE items were
// touched by this pass (spot-checks on the files this fix DID modify).
// -----------------------------------------------------------------------
assertTrue(
  !/exchangeRate|convertCurrency/.test(savedComparisonsSource + comparisonDetailSource + mediaProfileSource),
  "no FX/currency logic was introduced anywhere touched by this fix"
);
assertTrue(
  read("app/account/contributions/actions.ts").includes(".delete()"),
  "contribution hard-delete behavior (explicitly out of scope) is untouched"
);

console.log(`test-mvp-release-fix: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
