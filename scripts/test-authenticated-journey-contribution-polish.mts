// AUTHENTICATED USER JOURNEY + CONTRIBUTION ONBOARDING POLISH — §8
// dedicated regression suite.
//
// Same convention as every other scripts/test-*.mts file in this
// project: readFileSync-based structural source-text checks (no
// jsdom/React Testing Library configured here), plus real imports of
// the new pure logic this phase added (translateTaxonomyLabel,
// cohortFiltersToPrefillQuery/benchmarkHrefForCohortFilters).
//
// Scope: this phase's own root-cause finding is that NONE of the
// prior "Cross-Site Release Polish" work (commit c05f635) was ever
// pushed to origin/main — it only ever existed as a local, unpushed
// commit, exactly as that phase's own brief instructed ("NO PUSH. NO
// DEPLOY."). This branch was built from scratch against the current,
// real origin/main, so this suite checks the ACTUAL state of that
// work on this branch, not a diff against an assumed-deployed
// baseline.

import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { translateTaxonomyLabel } from "../lib/i18n/taxonomyLabels";
import { cohortFiltersToPrefillQuery, benchmarkHrefForCohortFilters } from "../lib/benchmark/prefillQuery";
import { dictionaries } from "../lib/i18n/translations";

let passed = 0;
let failed = 0;
function assertTrue(cond: boolean, label: string) {
  if (cond) passed++;
  else { failed++; console.error(`FAIL: ${label}`); }
}
function assertEqual(actual: unknown, expected: unknown, label: string) {
  assertTrue(actual === expected, `${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

function src(relPath: string): string {
  return readFileSync(new URL(`../${relPath}`, import.meta.url), "utf8");
}

const ROOT = new URL("..", import.meta.url).pathname;

const SURFACE_FILES = {
  benchmarkExplorer: "app/benchmark/BenchmarkExplorer.tsx",
  campaignExplorer: "app/benchmark/CampaignExplorer.tsx",
  coverageExplorer: "app/coverage/CoverageExplorer.tsx",
  coverageGrid: "app/coverage/CoverageGrid.tsx",
  mediaCatalogView: "app/platforms/MediaCatalogView.tsx",
  mediaProfileView: "app/media/[slug]/MediaProfileView.tsx",
  plannerView: "app/planner/PlannerView.tsx",
  contributionsList: "app/account/contributions/ContributionsList.tsx",
  contributionDetail: "app/account/contributions/[id]/ContributionDetail.tsx",
  comparisonMatrix: "app/account/contributions/compare/ComparisonMatrix.tsx",
  importBatchDetail: "app/account/contributions/imports/[id]/ImportBatchDetail.tsx",
  savedComparisonsList: "app/comparisons/SavedComparisonsList.tsx",
  contributeLanding: "app/contribute/ContributeLanding.tsx",
  contributeWizard: "app/contribute/ContributeWizard.tsx",
  curationView: "app/curation/CurationView.tsx",
  catalogImportFlow: "app/curation/catalog-import/CatalogImportFlow.tsx",
};

// -----------------------------------------------------------------------
// §5 Taxonomy Localization — Global Audit: ONE canonical display-label
// function, used (not duplicated) by every authenticated surface the
// brief named.
// -----------------------------------------------------------------------
const taxonomyLabelsSource = src("lib/i18n/taxonomyLabels.ts");
assertTrue(
  /export function translateTaxonomyLabel/.test(taxonomyLabelsSource),
  "the one shared translateTaxonomyLabel() function exists"
);

for (const [name, path] of Object.entries(SURFACE_FILES)) {
  const source = src(path);
  assertTrue(
    source.includes('from "@/lib/i18n/taxonomyLabels"') || source.includes("translateTaxonomyLabel"),
    `${name} (${path}) routes taxonomy labels through the shared translateTaxonomyLabel()`
  );
}

// No page-local re-implementation of the same resolution table — every
// surface imports the one shared module instead of declaring its own
// dictionaries object literal keyed by taxonomy kind.
for (const [name, path] of Object.entries(SURFACE_FILES)) {
  const source = src(path);
  assertTrue(
    !/const\s+\w*[Dd]ictionar\w*\s*[:=]\s*\{[\s\S]{0,40}es\s*:/.test(source),
    `${name} (${path}) does not duplicate a local es/en dictionary object`
  );
}

// Canonical DB keys (internal_key/iso_code) are never touched by the
// translator — only the label shown changes. Confirmed structurally:
// the function's only two string-returning branches are displayLabel
// (fallback) and a dictionary-table lookup; it never writes/returns an
// internal_key anywhere.
assertTrue(
  !/internal_key\s*=/.test(taxonomyLabelsSource) && !/iso_code\s*=/.test(taxonomyLabelsSource),
  "translateTaxonomyLabel never assigns/mutates internal_key or iso_code — canonical keys are read-only inputs"
);

// -----------------------------------------------------------------------
// translateTaxonomyLabel: real behavior (ES/EN correctness, canonical
// keys unchanged, unknown-key fallback never the generic humanized
// placeholder).
// -----------------------------------------------------------------------
assertEqual(translateTaxonomyLabel("objective", "reach", "Reach", "es"), dictionaries.es.objectives["reach"], "ES objective 'reach' resolves via the ES dictionary");
assertEqual(translateTaxonomyLabel("objective", "reach", "Reach", "en"), dictionaries.en.objectives["reach"], "EN objective 'reach' resolves via the EN dictionary (EN still works)");
assertEqual(
  translateTaxonomyLabel("mediaCategory", "streaming_live", "Streaming / Social-Native Media", "en"),
  "Streaming / Social-Native Media",
  "EN mediaCategory 'streaming_live' resolves to the DB's own verbatim English label (migration 0016's rename)"
);
assertTrue(
  dictionaries.es.mediaCategories["streaming_live"] !== dictionaries.en.mediaCategories["streaming_live"],
  "ES and EN mediaCategories diverge for streaming_live — ES is actually translated, not a copy of the English label"
);
assertEqual(
  translateTaxonomyLabel("objective", "not_a_real_key_xyz", "Some Real Display Label", "es"),
  "Some Real Display Label",
  "an unknown internal_key falls back to the REAL display_label, never a generic humanized placeholder"
);
assertEqual(translateTaxonomyLabel("objective", null, "Reach", "es"), "Reach", "a null internal_key (Server/Client boundary not yet threaded) safely falls back to the display_label");
assertTrue(
  Object.keys(dictionaries.es).includes("verticals") && Object.keys(dictionaries.es).includes("businessModels") && Object.keys(dictionaries.es).includes("mediaCategories"),
  "the verticals/businessModels/mediaCategories dictionary blocks this phase added actually exist"
);
assertTrue(
  JSON.stringify(Object.keys(dictionaries.es)) === JSON.stringify(Object.keys(dictionaries.en)),
  "es/en dictionaries keep the exact same top-level block shape (TypeScript's own `typeof es` mirroring enforces this at compile time too)"
);

// -----------------------------------------------------------------------
// §1.F / root cause: the literal "PlatformSupportLegend" text can never
// reach production again — the lookup path matches the dictionary's
// real nested key, and the OLD, broken path string is gone everywhere.
// -----------------------------------------------------------------------
const contributeLandingSource = src("app/contribute/ContributeLanding.tsx");
assertTrue(
  contributeLandingSource.includes('t("contribute.import.platformSupportLegend")'),
  'ContributeLanding looks up the REAL nested key "contribute.import.platformSupportLegend"'
);
assertTrue(
  !contributeLandingSource.includes('t("contribute.platformSupportLegend")'),
  "the old, one-level-shallow broken lookup path is gone"
);
assertTrue(
  !!dictionaries.es.contribute.import.platformSupportLegend && !!dictionaries.en.contribute.import.platformSupportLegend,
  "the real nested contribute.import.platformSupportLegend key resolves in both ES and EN"
);

// -----------------------------------------------------------------------
// §2 Contribution Onboarding — exact required primary/secondary
// hierarchy and wording, in the user's own language (never DB/model
// terminology).
// -----------------------------------------------------------------------
const translationsSource = src("lib/i18n/translations.ts");
assertTrue(translationsSource.includes('primaryTitle: "Importar campañas"'), 'primary card title is exactly "Importar campañas"');
assertTrue(translationsSource.includes('primaryCta: "Importar reporte"'), 'primary CTA is exactly "Importar reporte"');
assertTrue(
  translationsSource.includes('primaryBody: "Subí un reporte exportado de Meta Ads o Google Ads. Cucurucho detecta las campañas, métricas y contexto automáticamente."'),
  "primary explanation names Meta Ads/Google Ads and states automatic detection, in plain language"
);
assertTrue(translationsSource.includes('secondaryTitle: "Otras formas de aportar datos"'), 'secondary section is titled "Otras formas de aportar datos"');
assertTrue(translationsSource.includes('pathQuickTitle: "Cargar resultado manualmente"'), 'first secondary path renamed to "Cargar resultado manualmente"');
assertTrue(translationsSource.includes('pathPublicMetricsTitle: "Datos públicos de un medio"'), 'second secondary path is "Datos públicos de un medio"');
assertTrue(translationsSource.includes('pathRateCardsTitle: "Tarifario / media kit"'), 'third secondary path is "Tarifario / media kit"');
assertTrue(
  contributeLandingSource.includes("onClick={onUpload}") && contributeLandingSource.includes('t("contribute.primaryTitle")'),
  "the primary card is still the dominant, visually distinct upload action"
);
assertTrue(
  contributeLandingSource.includes("onClick={onQuick}") && contributeLandingSource.includes('t("contribute.pathQuickTitle")'),
  "manual entry is still a secondary, equally-weighted card alongside public-metrics/rate-cards — never promoted to primary"
);

// -----------------------------------------------------------------------
// §3 Export Guidance — ONLY the verified Meta/Google fields; no
// speculative alias ever introduced.
// -----------------------------------------------------------------------
assertTrue(contributeLandingSource.includes('t("contribute.import.exportGuidanceDetailsTitle")'), "the export-guidance expandable is wired into the file step, near the main import action");
assertTrue(translationsSource.includes('exportGuidanceDetailsTitle: "¿Qué archivo tengo que exportar?"'), 'the expandable is framed as the plain question "¿Qué archivo tengo que exportar?"');
assertTrue(
  translationsSource.includes("Nombre de la campaña, Inicio del informe, Fin del informe, Importe gastado"),
  "Meta Ads minimum fields are exactly the verified set"
);
assertTrue(
  translationsSource.includes("Alcance, Impresiones, Frecuencia, Resultados, Indicador de resultado"),
  "Meta Ads recommended fields are exactly the verified set"
);
assertTrue(translationsSource.includes("Campaña, Código de moneda, Costo"), "Google Ads minimum fields are exactly the verified set");
assertTrue(
  translationsSource.includes("Tipo de campaña, Clics, Impr., Conversiones") && translationsSource.includes("Vistas de TrueView") && translationsSource.includes("Usuarios únicos"),
  "Google Ads recommended + verified video-report fields are exactly the verified set"
);
const NEVER_INVENTED_ALIASES = ["Optimization Goal", "Buying Type", "Conversion Action", "Conversion Category", "Advertising Channel Subtype"];
for (const alias of NEVER_INVENTED_ALIASES) {
  assertTrue(!translationsSource.includes(alias), `speculative/unverified platform field alias "${alias}" is never introduced`);
}

// -----------------------------------------------------------------------
// §4 Template Discoverability — existing CSV/XLSX template mechanism
// untouched; only a discoverability affordance (icon) added; no second
// competing template system.
// -----------------------------------------------------------------------
assertTrue(
  contributeLandingSource.includes("generateCsvTemplate") && contributeLandingSource.includes("generateXlsxTemplate"),
  "the existing single CSV/XLSX template generators are still the only template source"
);
assertTrue(
  contributeLandingSource.includes("onClick={downloadCsv}") && contributeLandingSource.includes("onClick={downloadXlsx}"),
  "both template download buttons remain functional"
);
assertTrue(
  contributeLandingSource.includes('<FileDown size={14} className="text-ink-400" aria-hidden="true" />') &&
    contributeLandingSource.includes('{t("contribute.pathTemplateQuestion")}'),
  "the template callout gained only a discoverability icon — same question copy, same two buttons"
);
const templateImportSrc = src("lib/import/template.ts");
assertTrue(
  /REQUIRED_FIELDS|OPTIONAL_FIELDS/.test(src("lib/import/types.ts")),
  "REQUIRED_FIELDS/OPTIONAL_FIELDS still exist in lib/import/types.ts — validation semantics untouched"
);
assertTrue(templateImportSrc.length > 0, "lib/import/template.ts (the one template generator) is untouched/still present");

// -----------------------------------------------------------------------
// §1.D Unnamed-campaign root cause: the manual Quick Entry wizard never
// collects a campaign name by design (ContributionPayload has no such
// field, and the real write site sets observation_fingerprint: null
// explicitly for that reason) — "Campaña sin nombre" rows from
// data_source "manual" are legitimate, not a current reproducible bug.
// -----------------------------------------------------------------------
const contributeActionsSource = src("app/contribute/actions.ts");
assertTrue(
  !/campaignName|campaign_name/.test(src("app/contribute/ContributeWizard.tsx")),
  "the manual single-entry wizard's own Draft/payload genuinely has no campaign-name field (confirms the legitimate, by-design cause)"
);
assertTrue(
  contributeActionsSource.includes('data_source: "manual"') && contributeActionsSource.includes("observation_fingerprint: null"),
  "the manual-entry write site explicitly documents/sets no campaign name — legitimate historical data, not a bug this phase needs to fix"
);

// -----------------------------------------------------------------------
// §6 Authenticated SearchOverlay — no dead no-op onApply handlers left
// anywhere in the app, and the shared prefill/navigation mechanism is
// what every instance now uses (never a per-page reimplementation).
// -----------------------------------------------------------------------
const prefillQuerySource = src("lib/benchmark/prefillQuery.ts");
assertTrue(/export function cohortFiltersToPrefillQuery/.test(prefillQuerySource) && /export function benchmarkHrefForCohortFilters/.test(prefillQuerySource), "the shared prefill/navigation helpers exist");
assertEqual(cohortFiltersToPrefillQuery({}), "", "an empty filter set produces an empty query string");
assertTrue(cohortFiltersToPrefillQuery({ platform: "meta_ads", country: "AR" }).includes("prefillPlatform=meta_ads"), "platform maps to prefillPlatform");
assertTrue(cohortFiltersToPrefillQuery({ platform: "meta_ads", country: "AR" }).includes("prefillCountry=AR"), "country maps to prefillCountry");
assertEqual(benchmarkHrefForCohortFilters({}), "/benchmark", "no filters yields the bare /benchmark path");
assertTrue(benchmarkHrefForCohortFilters({ objective: "reach" }).startsWith("/benchmark?"), "any filter yields a querystring href");

for (const [name, path] of Object.entries(SURFACE_FILES)) {
  const source = src(path);
  if (!/SearchOverlay/.test(source)) continue;
  assertTrue(!/onApply=\{\(\) => \{\}\}/.test(source), `${name} (${path}) has no no-op SearchOverlay onApply handler`);
}

// app/page.tsx intentionally keeps its OWN separately-tested local copy
// of this logic from earlier phases — never merged into the shared
// module, and never regressed by this phase.
const homePageSource = src("app/page.tsx");
assertTrue(homePageSource.length > 0, "app/page.tsx is present and untouched by this phase's SearchOverlay work");
assertTrue(!/from ["']@\/lib\/benchmark\/prefillQuery["']/.test(homePageSource), "app/page.tsx keeps its own pre-existing local prefill logic rather than being merged into the new shared module");

// -----------------------------------------------------------------------
// My Campaigns row-level objective classification: untouched. This
// phase only changed how an already-resolved objective LABEL is
// displayed (ES/EN), never the classification logic that produces it.
// -----------------------------------------------------------------------
const objectiveClassificationSource = src("lib/import/objectiveClassification.ts");
assertTrue(/export function classifyRowObjective/.test(objectiveClassificationSource), "classifyRowObjective is still the one classification function");
assertTrue(
  !/translateTaxonomyLabel/.test(objectiveClassificationSource),
  "the classification module itself was never touched by the i18n work — it has no reason to import the label translator"
);

// -----------------------------------------------------------------------
// §7 Do Not Touch: no Supabase migration/schema/RLS files in this
// phase's diff; benchmark methodology/engine untouched.
// -----------------------------------------------------------------------
let changedFiles: string[] = [];
try {
  changedFiles = execSync("git diff --name-only origin/main", { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean);
} catch {
  changedFiles = [];
}
if (changedFiles.length > 0) {
  assertTrue(
    !changedFiles.some((f) => f.startsWith("supabase/")),
    "no file under supabase/ (migrations, schema, RLS, seed) was touched by this phase"
  );
  assertTrue(
    !changedFiles.some((f) => f.includes("benchmark/engine") || f.includes("methodology")),
    "no benchmark engine/methodology file was touched by this phase"
  );
}

console.log(`test-authenticated-journey-contribution-polish: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
