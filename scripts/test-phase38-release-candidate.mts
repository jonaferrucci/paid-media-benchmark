// Phase 38 tests — "Release Candidate Cleanup". This phase adds no
// features; it removes dead prototype surfaces, fixes a stale
// production-visible "mock data" badge, softens evaluative
// classification copy into descriptive quartile-position copy (zero
// logic change), retires orphaned i18n keys, adds a not-found page and
// a global error boundary, updates docs, and re-verifies the same
// security invariants prior phases established. Real imports of the
// shipped modules only, plus source/schema-text checks and a real
// git-diff-based verification (§25) that protected logic is untouched.

import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { classifyPerformance, resolveClassificationLabelKey, isContextualPosition } from "../lib/comparison/classify";
import { NAV_GROUP_STRUCTURE, navGroupStructureFor } from "../components/dashboard/DashboardSidebar";

let passed = 0;
let failed = 0;
function assertEqual(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++;
    console.error(`FAIL: ${label}\n  expected: ${e}\n  actual:   ${a}`);
  }
}
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

const translationsSource = read("lib/i18n/translations.ts");
const appHeaderSource = read("components/dashboard/AppHeader.tsx");
const layoutSource = read("app/layout.tsx");
const adminSource = read("lib/supabase/admin.ts");
const engineSource = read("lib/benchmark/engine.ts");
const reviewActionsSource = read("lib/contribute/reviewActions.ts");

// ---------------------------------------------------------------------
// 1. No production benchmark-mock / random-mock imports anywhere new
//    (the two files themselves are intentionally kept — see their own
//    Phase 38 header comments — but nothing in app/ or components/
//    other than their own historical cluster may import them, and that
//    cluster no longer exists).
// ---------------------------------------------------------------------
{
  const orphanedComponents = [
    "components/dashboard/GlobalInsights.tsx",
    "components/dashboard/MiniTrend.tsx",
    "components/dashboard/FeaturedModules.tsx",
    "components/dashboard/ExploreMarket.tsx",
    "components/dashboard/MetricTrendChart.tsx",
    "components/dashboard/VerticalAudienceMatrix.tsx",
    "components/dashboard/VerticalComparisonChart.tsx",
    "components/dashboard/AudienceComparisonChart.tsx",
    "components/dashboard/DistributionChart.tsx",
  ];
  for (const rel of orphanedComponents) {
    assertTrue(!existsSync(new URL(rel, root)), `${rel} was deleted — it was fully orphaned from production`);
  }
  assertTrue(existsSync(new URL("lib/mock/benchmarks.ts", root)), "lib/mock/benchmarks.ts is intentionally kept on disk (a Phase 30 regression test depends on it)");
  assertTrue(existsSync(new URL("lib/mock/random.ts", root)), "lib/mock/random.ts is intentionally kept on disk (same reason)");
  assertTrue(existsSync(new URL("lib/mock/taxonomies.ts", root)), "lib/mock/taxonomies.ts (still actively used, real static reference data) is untouched");

  // Real import statements only (`from "@/lib/mock/..."`) — the same
  // pattern every other phase test uses — never a blanket string match,
  // which would also flag the explanatory comments in app/page.tsx and
  // the dev-only benchmark-preview route that merely NAME these files
  // while explaining why they're unreachable.
  let stdout = "";
  try {
    stdout = execSync(
      `grep -rlE "from [\\"']@/lib/mock/(benchmarks|random)[\\"']" app components --include="*.ts" --include="*.tsx" || true`,
      { cwd: new URL(".", root), encoding: "utf8" }
    );
  } catch {
    stdout = "ERROR";
  }
  const importers = stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  assertEqual(importers, [], "no file under app/ or components/ imports lib/mock/benchmarks or lib/mock/random any more");
}

// ---------------------------------------------------------------------
// 2. Nav routes are structurally valid — every href in the real (non-
//    translation-driven) nav structure resolves to a real page.tsx.
// ---------------------------------------------------------------------
{
  const allItems = NAV_GROUP_STRUCTURE.flatMap((g) => g.items);
  assertTrue(allItems.length >= 6, "the primary nav still has its full complement of real routes");
  for (const item of allItems) {
    const pagePath = item.href === "/" ? "app/page.tsx" : `app${item.href}/page.tsx`;
    assertTrue(existsSync(new URL(pagePath, root)), `nav destination ${item.href} resolves to a real page.tsx`);
  }
  assertEqual(
    navGroupStructureFor(false).some((g) => g.groupKey === "nav.groupAdmin"),
    false,
    "a non-curator never sees the admin/curation nav group"
  );
  assertEqual(
    navGroupStructureFor(true).some((g) => g.groupKey === "nav.groupAdmin"),
    true,
    "a curator still sees the admin/curation nav group"
  );
}

// ---------------------------------------------------------------------
// 3. Classification copy is non-evaluative and descriptive — the exact
//    thresholds/math are untouched (classifyPerformance itself), only
//    the label text and its resolution key changed.
// ---------------------------------------------------------------------
{
  const stats = { p25: 10, median: 15, p75: 20 };
  assertEqual(classifyPerformance(6, stats, "lower_is_better"), "muy_competitivo", "classifyPerformance's own thresholds are unchanged");
  assertEqual(classifyPerformance(25, stats, "lower_is_better"), "requiere_atencion", "classifyPerformance's own thresholds are unchanged (2)");
  assertEqual(resolveClassificationLabelKey("lower_is_better", "muy_competitivo"), "lower_muy_competitivo", "label key resolves with the lower_ prefix");
  assertEqual(resolveClassificationLabelKey("higher_is_better", "muy_competitivo"), "higher_muy_competitivo", "label key resolves with the higher_ prefix");
  assertEqual(resolveClassificationLabelKey("lower_is_better", "dentro_del_rango"), "dentro_del_rango", "a contextual position is never direction-prefixed");
  assertTrue(isContextualPosition("dentro_del_rango"), "isContextualPosition itself is unchanged");

  const labelStrings = [
    ...(translationsSource.match(/lower_muy_competitivo: "([^"]+)"/) ?? []),
    ...(translationsSource.match(/higher_requiere_atencion: "([^"]+)"/) ?? []),
  ].join(" ");
  assertTrue(!/mejor|peor/i.test(labelStrings), "no classification label says 'mejor'/'peor'");
  assertTrue(
    translationsSource.includes('lower_muy_competitivo: "Muy por debajo de la mediana"') &&
      translationsSource.includes('higher_muy_competitivo: "Muy por encima de la mediana"'),
    "classification labels describe real quartile position relative to the median, not a competitive judgment"
  );
  assertTrue(!translationsSource.includes('muy_competitivo: "Muy competitivo"'), "the old evaluative 'Muy competitivo' label is gone");
  assertTrue(!translationsSource.includes('requiere_atencion: "Requiere atención"'), "the old evaluative 'Requiere atención' label is gone");
}

// ---------------------------------------------------------------------
// 4. Owner-facing status copy (contribution/rate-card/plan naming) is
//    still the reviewed, non-raw vocabulary from prior phases.
// ---------------------------------------------------------------------
assertTrue(translationsSource.includes('contributionsNav: "Mis campañas"') || translationsSource.includes('"Mis campañas"'), "the campaign-first 'Mis campañas' owner label is present");
assertTrue(translationsSource.includes('"Aportar datos"'), "the 'Aportar datos' owner label is present");
assertTrue(!translationsSource.includes('mockData: "Datos de prueba"') && !translationsSource.includes('mockData: "Mock data"'), "the stale mock-data badge copy is gone from translations");
assertTrue(!appHeaderSource.includes("app.mockData") && !appHeaderSource.includes("reference-soft"), "the header no longer renders a mock-data badge");

// ---------------------------------------------------------------------
// 5. Metadata present, correctly scoped (no invented claims, no
//    'agencia'/'marketing intelligence' framing).
// ---------------------------------------------------------------------
assertTrue(/title:\s*"Cucurucho/.test(layoutSource), "root metadata has a real title");
assertTrue(/description:\s*"[^"]{20,}"/.test(layoutSource), "root metadata has a substantive description");
assertTrue(!/agencia|marketing intelligence/i.test(layoutSource), "metadata avoids the disallowed framing");
assertTrue(/benchmarking y planificaci[oó]n/i.test(layoutSource), "metadata describes benchmarking and planning, the actual product scope");

// ---------------------------------------------------------------------
// 6. not-found / error boundary exist and are minimal (no stack trace,
//    real retry/home actions).
// ---------------------------------------------------------------------
assertTrue(existsSync(new URL("app/not-found.tsx", root)), "app/not-found.tsx exists");
assertTrue(existsSync(new URL("app/error.tsx", root)), "app/error.tsx exists");
{
  const notFoundSource = read("app/not-found.tsx");
  const errorSource = read("app/error.tsx");
  assertTrue(notFoundSource.includes('href="/"'), "not-found offers a real link back to home");
  assertTrue(errorSource.includes("reset") && errorSource.includes('href="/"'), "the error boundary offers both a real retry (reset) and a way home");
  assertTrue(!/error\.(message|stack)/.test(errorSource.replace(/console\.error\([^)]*\)/g, "")), "the error boundary never renders the raw error message/stack to the visitor");
  assertTrue(errorSource.includes('"use client"'), "the error boundary is a Client Component, as Next.js requires");
}

// ---------------------------------------------------------------------
// 7. No raw internal terminology in primary owner-facing translation
//    copy (values, not code comments) — dataset/validation_status/
//    rate_card/public_signal/entity as literal jargon.
// ---------------------------------------------------------------------
{
  // Strip `//` comment lines first — a code comment explaining that a
  // term was retired (e.g. `// "dataset" retired from owner-facing
  // copy`) legitimately names the term without it being a live value.
  const codeOnly = translationsSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  const stringValues = codeOnly.match(/:\s*"[^"]*"/g) ?? [];
  const leaks = stringValues.filter((v) => /\b(dataset|validation_status|rate_card|public_signal)\b/i.test(v));
  assertEqual(leaks, [], "no translation VALUE contains raw internal terminology");
}

// ---------------------------------------------------------------------
// 8. Security sanity checks — unchanged invariants, re-verified.
// ---------------------------------------------------------------------
assertTrue(adminSource.includes('import "server-only"'), "admin.ts still guards itself with server-only");
assertTrue(adminSource.includes('cache: "no-store"'), "admin.ts still disables caching for cross-owner aggregation reads");
{
  let clientImportersOfAdmin = "";
  try {
    clientImportersOfAdmin = execSync(
      `grep -rl "from \\"@/lib/supabase/admin\\"" app components --include="*.tsx" --include="*.ts" 2>/dev/null | xargs grep -l "\\"use client\\"" 2>/dev/null || true`,
      { cwd: new URL(".", root), encoding: "utf8" }
    ).trim();
  } catch {
    clientImportersOfAdmin = "ERROR";
  }
  assertEqual(clientImportersOfAdmin, "", "no client component imports the service-role admin client");
}
assertTrue(engineSource.includes('.eq("validation_status", "valid")'), "the benchmark engine still only reads validation_status='valid' rows");
assertTrue(reviewActionsSource.includes('supabase.rpc("fn_review_contribution"'), "curator review still goes through the real fn_review_contribution RPC");
assertTrue(existsSync(new URL("supabase/migrations/0019_contribution_validation.sql", root)), "migration 0019 is still present");
assertTrue(read("supabase/migrations/0019_contribution_validation.sql").includes("fn_review_contribution"), "migration 0019 still defines fn_review_contribution");

// ---------------------------------------------------------------------
// 9. Mobile shell preserved — no wide-table regressions, no reappeared
//    horizontal-scroll pattern, sidebar/nav sheet structure intact.
// ---------------------------------------------------------------------
{
  const sidebarSource = read("components/dashboard/DashboardSidebar.tsx");
  assertTrue(sidebarSource.includes('role="dialog"') && sidebarSource.includes('aria-modal="true"'), "the mobile nav sheet keeps its dialog semantics");
  assertTrue(!sidebarSource.includes("overflow-x-auto"), "no horizontal-scroll pattern in the sidebar");
}

// ---------------------------------------------------------------------
// 10. No new migration, no new dependency, package files untouched.
// ---------------------------------------------------------------------
{
  let migrationDiff = "";
  let pkgDiff = "";
  let lockDiff = "";
  try {
    migrationDiff = execSync("git diff --stat -- supabase/migrations", { cwd: new URL(".", root), encoding: "utf8" }).trim();
    pkgDiff = execSync("git diff --stat -- package.json", { cwd: new URL(".", root), encoding: "utf8" }).trim();
    lockDiff = execSync("git diff --stat -- package-lock.json", { cwd: new URL(".", root), encoding: "utf8" }).trim();
  } catch {
    migrationDiff = pkgDiff = lockDiff = "ERROR";
  }
  assertEqual(migrationDiff, "", "no uncommitted change under supabase/migrations/");
  assertEqual(pkgDiff, "", "package.json has zero uncommitted changes (no new dependency)");
  assertEqual(lockDiff, "", "package-lock.json has zero uncommitted changes");

  let untrackedMigrations = "";
  try {
    untrackedMigrations = execSync("git status --porcelain -- supabase/migrations", { cwd: new URL(".", root), encoding: "utf8" }).trim();
  } catch {
    untrackedMigrations = "ERROR";
  }
  assertEqual(untrackedMigrations, "", "no new/untracked migration file was added");
}

// ---------------------------------------------------------------------
// §25: protected files — zero uncommitted changes.
// ---------------------------------------------------------------------
const PROTECTED_FILES = [
  "lib/benchmark/engine.ts",
  "lib/planning/budget.ts",
  "lib/planning/comparability.ts",
  "lib/supabase/admin.ts",
];
for (const rel of PROTECTED_FILES) {
  let diffStat = "";
  try {
    diffStat = execSync(`git diff --stat -- ${rel}`, { cwd: new URL(".", root), encoding: "utf8" }).trim();
  } catch {
    diffStat = "ERROR_RUNNING_GIT_DIFF";
  }
  assertEqual(diffStat, "", `${rel} has zero uncommitted changes (protected logic untouched)`);
}

console.log(`test-phase38-release-candidate: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
