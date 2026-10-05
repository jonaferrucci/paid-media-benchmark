"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Edit3, Upload, FileDown, BarChart3, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { useRouter } from "next/navigation";
import { benchmarkHrefForCohortFilters } from "@/lib/benchmark/prefillQuery";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { translateTaxonomyLabel } from "@/lib/i18n/taxonomyLabels";
import type { Locale } from "@/lib/i18n/translations";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import type { ContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { ContributeWizard } from "./ContributeWizard";
import { bulkSubmitContributionsAction } from "./bulk-actions";
import { parseCsv, parseXlsxBuffer, IMPORT_LIMITS } from "@/lib/import/parse";
import { detectMapping, applyMapping, wouldConflict, normalizeHeader, ignoredReasonForHeader, excludeAggregateTotalRows } from "@/lib/import/mapping";
import { normalizeAndValidateRow, detectDuplicates } from "@/lib/import/validate";
import { generateCsvTemplate, generateXlsxTemplate } from "@/lib/import/template";
import { REQUIRED_FIELDS, OPTIONAL_FIELDS, type CanonicalField, type DetectedMapping, type NormalizedRow, type RawTable, type RowIssue } from "@/lib/import/types";
import { detectExportPlatform, findAdPlatformProfile, AD_PLATFORM_PROFILES, resolveMetaResultForRow, detectReportCurrency, classifyExportProfile, isVerifiedWithRealExport, type PlatformDetectionResult, type AdPlatformId, type RowResultResolution, type CurrencyDetectionResult } from "@/lib/import/platformExports";
import { suggestObjectiveFromCampaignNames } from "@/lib/import/suggestions";
// CAMPAIGN IMPORT INTELLIGENCE PHASE 1: pure, per-row objective
// classification (DETECTED/SUGGESTED/UNKNOWN — never an LLM, never a
// numeric score) and DERIVED/PRESENTATIONAL-ONLY funnel derivation.
// Neither module touches Supabase or mutates a NormalizedRow itself —
// this file gathers the evidence and decides what to do with the
// result (see each module's own header comment for the full,
// approved evidence-precedence design).
import { classifyRowObjective, type ObjectiveClassificationResult, type ObjectiveEvidenceTier } from "@/lib/import/objectiveClassification";
import { derive3StageFunnel, derive5StageEcommerceFunnel, type FunnelStage3Result, type EcommerceFunnelResult } from "@/lib/import/funnelClassification";
// PHASE 25 (§9/§10): cross-import duplicate detection — a SEPARATE
// check from detectDuplicates above (which only catches repeats WITHIN
// this same file). buildRawSignature is a pure helper, safe to import
// client-side; checkImportDuplicatesAction is the "use server" action
// that queries the owner's own previously-imported campaigns.
import { buildRawSignature, type DuplicateMatch } from "@/lib/import/duplicates";
import { checkImportDuplicatesAction, type DuplicateCheckCandidate } from "@/lib/import/duplicateActions";
import { computeDataCoverage, DERIVED_METRIC_LABELS } from "@/lib/contribute/coverage";

type Mode = "landing" | "quick" | "upload";
type UploadStep = "file" | "columns" | "review" | "confirm" | "done";

const FIELD_LABEL_KEYS: Record<CanonicalField, string> = {
  platform: "contribute.field.platform", objective: "contribute.field.objective", vertical: "contribute.field.vertical",
  country: "contribute.field.country", business_model: "contribute.field.businessModel", audience_strategy: "contribute.field.audienceStrategy",
  funnel_stage: "contribute.field.funnelStage", start_date: "contribute.field.startDate", end_date: "contribute.field.endDate",
  currency: "contribute.field.currency", ad_spend: "contribute.field.adSpend", impressions: "contribute.field.impressions",
  reach: "contribute.field.reach", clicks: "contribute.field.clicks", link_clicks: "contribute.field.linkClicks",
  landing_page_views: "contribute.field.landingPageViews", video_views: "contribute.field.videoViews",
  engagements: "contribute.field.engagements", conversions: "contribute.field.conversions",
  attributed_revenue: "contribute.field.attributedRevenue", total_revenue: "contribute.field.totalRevenue",
  campaign_name: "contribute.field.campaignName",
  campaign_type: "contribute.field.campaignType",
};

// §I: identify the row AND the specific field, in plain language —
// never a bare technical validation string. This is a presentation-
// only helper: it prefixes the SAME shared messageKey/messageVars
// lib/import/validate.ts already produces (which other import flows
// also rely on unchanged) with the field's own translated label, it
// never touches validate.ts's message keys themselves.
function formatIssue(issue: RowIssue, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const message = t(issue.messageKey, issue.messageVars);
  if (issue.field && FIELD_LABEL_KEYS[issue.field]) {
    return `${t(FIELD_LABEL_KEYS[issue.field])}: ${message}`;
  }
  return message;
}

export function ContributeLanding({ taxonomies }: { taxonomies: ContributionTaxonomies }) {
  const { t, locale } = useTranslation();
  const { user, loading: userLoading } = useSupabaseUser();
  const [searchOpen, setSearchOpen] = useState(false);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("landing");

  // Quick entry delegates entirely to the existing, unmodified,
  // already-shelled wizard — no shell duplication.
  if (mode === "quick") return <ContributeWizard taxonomies={taxonomies} />;

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={(filters) => router.push(benchmarkHrefForCohortFilters(filters))} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-4xl px-4 py-6 md:px-8">
          {mode === "landing" && (
            <LandingChooser
              t={t}
              userLoading={userLoading}
              signedIn={!!user}
              taxonomies={taxonomies}
              onQuick={() => setMode("quick")}
              onUpload={() => setMode("upload")}
            />
          )}
          {mode === "upload" && (
            <UploadFlow t={t} locale={locale} taxonomies={taxonomies} onBack={() => setMode("landing")} />
          )}
        </main>
      </div>
    </div>
  );
}

function LandingChooser({
  t, userLoading, signedIn, taxonomies, onQuick, onUpload,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  userLoading: boolean;
  signedIn: boolean;
  taxonomies: ContributionTaxonomies;
  onQuick: () => void;
  onUpload: () => void;
}) {
  function downloadCsv() {
    const blob = new Blob([generateCsvTemplate()], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, "cucurucho-plantilla.csv");
  }
  function downloadXlsx() {
    // CAMPAIGN IMPORT INTELLIGENCE PHASE 1: the "Valores válidos" sheet
    // is built ONLY from real, already-fetched taxonomy rows (this
    // component already has them as a prop for the rest of the
    // contribution flow) — never an invented or hardcoded list. See
    // generateXlsxTemplate's own doc comment.
    const validValues = [
      { label: "Objetivo", values: taxonomies.objectives.map((o) => o.display_label) },
      { label: "Vertical", values: taxonomies.verticals.map((v) => v.display_label) },
      { label: "País", values: taxonomies.countries.map((c) => c.display_label) },
      { label: "Plataforma", values: taxonomies.platforms.map((p) => p.display_label) },
      { label: "Modelo de negocio", values: taxonomies.businessModels.map((b) => b.display_label) },
      { label: "Audiencia", values: taxonomies.audienceStrategies.map((a) => a.display_label) },
      { label: "Etapa del funnel", values: taxonomies.funnelStages.map((f) => f.display_label) },
    ].filter((group) => group.values.length > 0);
    const blob = new Blob([generateXlsxTemplate(validValues)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    triggerDownload(blob, "cucurucho-plantilla.xlsx");
  }

  return (
    <div>
      <h1 className="font-display text-xl font-semibold text-ink-900">{t("contribute.pageTitle")}</h1>
      <p className="mt-1 text-sm text-ink-600">{t("contribute.pageIntro")}</p>

      {!userLoading && !signedIn && (
        <p className="mt-4 rounded-xl border border-line bg-surface2 px-4 py-3 text-sm text-ink-700">
          {t("contribute.signInRequired")}
        </p>
      )}

      {/* Post-MVP §B: reverse the old model — instead of four equally
          weighted cards, the normal campaign-data workflow (a report
          exported straight from an ad platform) is now one obvious,
          visually dominant primary action. Platform recognizability
          (§C's real AD_PLATFORM_PROFILES, not a separately maintained
          UI list) tells the user Cucurucho already knows their export
          shape without asking them to pick a platform up front. */}
      <button
        onClick={onUpload}
        className="group mt-6 w-full rounded-3xl border border-line bg-surface p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md sm:p-8"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brandMint/20">
          <Upload size={22} className="text-brandMint" aria-hidden="true" />
        </span>
        <p className="mt-4 font-display text-lg font-semibold text-ink-900">{t("contribute.primaryTitle")}</p>
        <p className="mt-1.5 max-w-xl text-sm text-ink-600">{t("contribute.primaryBody")}</p>
        <div className="mt-4 flex flex-wrap gap-1.5">
          {/* PHASE 24 (§17): honestly distinguish platforms verified
              against a real export (Meta, Google) from those that are
              only generically compatible — never a blanket "supported"
              claim. isVerifiedWithRealExport reuses the SAME signal as
              the download-guidance registry, never a second, separately
              maintained truth source. */}
          {AD_PLATFORM_PROFILES.map((p) => {
            const verified = isVerifiedWithRealExport(p);
            return (
              <span
                key={p.id}
                title={verified ? t("contribute.platformVerifiedLabel") : t("contribute.platformPendingLabel")}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  verified ? "border-brandMint/40 bg-brandMint/10 text-ink-700" : "border-line bg-surface2 text-ink-500"
                }`}
              >
                {verified && <Check size={11} className="text-brandMint" aria-hidden="true" />}
                {p.displayLabel}
              </span>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-ink-500">{t("contribute.import.platformSupportLegend")}</p>
        <span className="mt-5 inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white group-hover:opacity-90">
          {t("contribute.primaryCta")}
        </span>
      </button>

      {/* Secondary contribution paths — real, still fully supported,
          just no longer competing visually with the primary upload
          workflow. */}
      <h2 className="mt-8 text-xs font-medium uppercase tracking-wide text-ink-500">{t("contribute.secondaryTitle")}</h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button onClick={onQuick} className="group rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brandLavender/20">
            <Edit3 size={16} className="text-brandLavender" aria-hidden="true" />
          </span>
          <p className="mt-2.5 text-sm font-semibold text-ink-900">{t("contribute.pathQuickTitle")}</p>
          <p className="mt-1 text-xs text-ink-600">{t("contribute.pathQuickBody")}</p>
        </button>
        <Link href="/contribute/public-metrics" className="group rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral/20">
            <BarChart3 size={16} className="text-coral" aria-hidden="true" />
          </span>
          <p className="mt-2.5 text-sm font-semibold text-ink-900">{t("contribute.pathPublicMetricsTitle")}</p>
          <p className="mt-1 text-xs text-ink-600">{t("contribute.pathPublicMetricsBody")}</p>
        </Link>
        <Link href="/contribute/rate-cards" className="group rounded-2xl border border-line bg-surface p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brandPeach/20">
            <FileDown size={16} className="text-brandPeach" aria-hidden="true" />
          </span>
          <p className="mt-2.5 text-sm font-semibold text-ink-900">{t("contribute.pathRateCardsTitle")}</p>
          <p className="mt-1 text-xs text-ink-600">{t("contribute.pathRateCardsBody")}</p>
        </Link>
      </div>

      {/* Template download is an explicit fallback, not a sixth
          competing card — §4 (Template Discoverability) only adds the
          FileDown icon so this callout scans at the same glance level
          as the secondary cards above it; the templates themselves
          (generateCsvTemplate/generateXlsxTemplate), their
          REQUIRED_FIELDS/OPTIONAL_FIELDS validation semantics, and this
          exact same download mechanism are all untouched. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line bg-surface2/40 px-4 py-3 text-xs text-ink-600">
        <FileDown size={14} className="text-ink-400" aria-hidden="true" />
        <span>{t("contribute.pathTemplateQuestion")}</span>
        <button onClick={downloadCsv} className="rounded-full border border-line bg-surface px-3 py-1 font-medium text-ink-700 hover:border-primary hover:text-primary">CSV</button>
        <button onClick={downloadXlsx} className="rounded-full border border-line bg-surface px-3 py-1 font-medium text-ink-700 hover:border-primary hover:text-primary">XLSX</button>
      </div>
    </div>
  );
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function UploadFlow({
  t, locale, taxonomies, onBack,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: Locale;
  taxonomies: ContributionTaxonomies;
  onBack: () => void;
}) {
  const [step, setStep] = useState<UploadStep>("file");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [table, setTable] = useState<RawTable | null>(null);
  const [mappings, setMappings] = useState<DetectedMapping[]>([]);
  const [normalizedRows, setNormalizedRows] = useState<NormalizedRow[]>([]);
  const [sourceType, setSourceType] = useState<"csv" | "xlsx">("csv");
  // PHASE 25 (§9/§10): cross-import duplicate verdicts, keyed by
  // rowNumber, populated by an async check kicked off once review rows
  // are ready — never blocks reaching the review step, since a slow or
  // failed check should never hold up a real import. skipRows is the
  // user's own explicit choice per §10 ("Skip" / "Import anyway") —
  // never auto-populated, never auto-rejected.
  const [dupVerdicts, setDupVerdicts] = useState<Map<number, DuplicateMatch>>(new Map());
  const [skipRows, setSkipRows] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  // Post-MVP §D: deterministic platform-export detection, run once per
  // uploaded file. `manualPlatformOverride` (a real taxonomies.platforms
  // display_label, or "" for none) always wins over the detector when
  // set — the user can correct a wrong/ambiguous/unknown guess, and the
  // detector never silently overrides an explicit choice.
  const [platformDetection, setPlatformDetection] = useState<PlatformDetectionResult | null>(null);
  const [manualPlatformOverride, setManualPlatformOverride] = useState<string>("");
  // Post-MVP row-level fix (§4): the file's detected report currency
  // (from header currency-code suffixes), computed once per upload.
  const [currencyDetection, setCurrencyDetection] = useState<CurrencyDetectionResult | null>(null);
  // §2: the per-row "Resultados"/"Indicador de resultado" resolution for
  // THIS file, in the same row order as normalizedRows — populated by
  // runValidation, read by the review step to show a per-campaign
  // result column instead of a single file-wide guess.
  const [rowResultResolutions, setRowResultResolutions] = useState<RowResultResolution[]>([]);
  // CAMPAIGN IMPORT INTELLIGENCE PHASE 1: per-row objective
  // classification + derived funnel stages, in the same row order as
  // normalizedRows — populated by runValidation, read by the review
  // step. rowFunnel3/rowFunnel5 are PRESENTATIONAL ONLY (see
  // lib/import/funnelClassification.ts's header comment) and are never
  // sent to bulkSubmitContributionsAction or persisted anywhere.
  const [rowObjectiveClassifications, setRowObjectiveClassifications] = useState<ObjectiveClassificationResult[]>([]);
  const [rowFunnel3, setRowFunnel3] = useState<FunnelStage3Result[]>([]);
  const [rowFunnel5, setRowFunnel5] = useState<EcommerceFunnelResult[]>([]);
  // A row whose objective was explicitly set by the user — either via
  // the per-row "Cambiar" control or the deliberate bulk-apply action —
  // always labeled "Manual" in the UI, taking precedence over whatever
  // confidence the classifier originally produced for that row.
  const [manualOverrideRows, setManualOverrideRows] = useState<Set<number>>(new Set());
  // Which row's inline objective <select> is currently expanded — null
  // means every row shows its plain label + badge, not an editable
  // control (keeps the table calm by default, per the brief's own
  // "lightweight edit control" instruction).
  const [editingObjectiveRow, setEditingObjectiveRow] = useState<number | null>(null);
  // The separate, deliberately-clicked bulk-override action (§A/§P
  // redesign) always requires a second, explicit confirmation click —
  // this tracks whether that confirmation is currently showing.
  const [bulkOverridePending, setBulkOverridePending] = useState(false);
  // §10: optional, explicit "where did you download this from" hint —
  // never required, never silently forces a mapping; only pre-fills
  // the manual override when auto-detection itself couldn't confirm a
  // platform, and is otherwise just informational.
  const [platformHint, setPlatformHint] = useState<AdPlatformId | "other" | "">("");
  // POST-MVP IMPORT FIX 3 (§J): aggregate "Total: ..." rows excluded
  // from this file before any mapping/validation ever sees them —
  // tracked purely so the review UI can say how many were dropped,
  // never used to change validation behavior.
  const [totalRowsExcludedCount, setTotalRowsExcludedCount] = useState(0);
  // CONTRIBUTION UX SAFETY PASS A (§4): null when the file was under the
  // 5000-row limit (the common case — most files never show this).
  // Set only when parse.ts's own truncated flag is true, carrying the
  // real original row count alongside the limit actually applied — the
  // limit itself (IMPORT_LIMITS.maxRows) is never changed by this pass.
  const [truncationInfo, setTruncationInfo] = useState<{ original: number } | null>(null);
  // §D/§G: a report-level date range recovered from skipped preamble
  // lines (e.g. Google's own "18 de septiembre de 2026 - ..." line) —
  // null for any file with no such preamble (every existing shape).
  const [reportDateRange, setReportDateRange] = useState<{ start: string; end: string } | null>(null);
  // CAMPAIGN IMPORT INTELLIGENCE PHASE 1: the recognized Cucurucho
  // template version, when present (see lib/import/template.ts's
  // detectTemplateVersion) — purely informational, null for a legacy
  // template, a real ad-platform export, or any other generic file,
  // all of which import identically either way.
  const [detectedTemplateVersion, setDetectedTemplateVersion] = useState<number | null>(null);
  // §A/§P: the file-level "Contexto del reporte" — selected ONCE and
  // applied to every row that doesn't already have its own value (see
  // runValidation's injection below). Plain internal_key/iso_code
  // strings, resolved through the exact same matchTaxonomyValue() every
  // other field already goes through — no new resolution mechanism.
  const [contextObjective, setContextObjective] = useState("");
  const [contextVertical, setContextVertical] = useState("");
  const [contextCountry, setContextCountry] = useState("");
  const [contextBusinessModel, setContextBusinessModel] = useState("");
  const [contextAudienceStrategy, setContextAudienceStrategy] = useState("");
  const [contextFunnelStage, setContextFunnelStage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileError(null);
    if (file.size > IMPORT_LIMITS.maxFileSizeBytes) {
      setFileError(t("contribute.import.errorTooLarge", { mb: Math.round(IMPORT_LIMITS.maxFileSizeBytes / 1024 / 1024) }));
      return;
    }
    const isCsv = file.name.toLowerCase().endsWith(".csv");
    const isXlsx = file.name.toLowerCase().endsWith(".xlsx");
    if (!isCsv && !isXlsx) {
      setFileError(t("contribute.import.errorUnsupportedType"));
      return;
    }

    const result = isCsv
      ? parseCsv(await file.text())
      : parseXlsxBuffer(await file.arrayBuffer());

    if (!result.ok) {
      setFileError(t(`contribute.import.error.${result.errorKey}`));
      return;
    }

    setFileName(file.name);
    setSourceType(isCsv ? "csv" : "xlsx");
    setReportDateRange(result.reportDateRange);
    setDetectedTemplateVersion(result.templateVersion);
    // CONTRIBUTION UX SAFETY PASS A (§4): surface the truncation that
    // parse.ts already performs silently — never a new limit, just a
    // visible signal when the existing one was hit.
    setTruncationInfo(result.truncated ? { original: result.originalRowCount } : null);

    // POST-MVP IMPORT FIX 3 (§J): drop aggregate "Total: ..." rows
    // BEFORE anything else (detection/mapping/validation) ever sees
    // them — they must never be counted as campaigns or double-count
    // against the real rows they summarize. Generic/platform-agnostic
    // (see excludeAggregateTotalRows) — a file with no campaign-identity
    // column safely no-ops.
    const { table: cleanedTable, excludedCount } = excludeAggregateTotalRows(result.table);
    setTable(cleanedTable);
    setTotalRowsExcludedCount(excludedCount);

    const baseMappings = detectMapping(cleanedTable);
    setMappings(baseMappings);
    // §2 is resolved PER ROW (runValidation, once the columns step is
    // confirmed) — "Resultados"/"Indicador de resultado" are already
    // classified "ignored"/"row_semantic" by detectMapping itself (see
    // mapping.ts's IGNORED_HEADERS), so there's no file-wide mapping to
    // adjust here any more.

    // §M: the common dual-strategy currency detector — tries a real
    // currency COLUMN first (e.g. Google's own "Código de moneda",
    // stronger direct evidence), falling back to Meta's header-suffix
    // inference only when no currency column was mapped at all.
    setCurrencyDetection(detectReportCurrency(cleanedTable, baseMappings));

    const detection = detectExportPlatform(cleanedTable.headers);
    setPlatformDetection(detection);
    // §10: the hint pre-fills the manual override ONLY when detection
    // itself couldn't confirm a platform — it never overrides a
    // confident (possibly different) automatic detection.
    const hintProfile = platformHint && platformHint !== "other" ? findAdPlatformProfile(platformHint) : null;
    setManualPlatformOverride(detection.state !== "detected" && hintProfile ? hintProfile.displayLabel : "");
    // §A: a fresh file starts with no file-level context chosen — never
    // carried over from a previous upload in the same session.
    setContextObjective("");
    setContextVertical("");
    setContextCountry("");
    setContextBusinessModel("");
    setContextAudienceStrategy("");
    setContextFunnelStage("");
    setStep("columns");
  }, [t, platformHint]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function updateMapping(columnIndex: number, field: CanonicalField | "ignore") {
    setMappings((prev) => prev.map((m) => {
      if (m.sourceColumnIndex !== columnIndex) return m;
      if (field === "ignore") return { ...m, canonicalField: null, state: "ignored" as const };
      return { ...m, canonicalField: field, state: "mapped" as const };
    }));
  }

  // Post-MVP §D/§F: an ad-platform export is inherently single-platform
  // and typically has no per-row "Platform" column at all — this is the
  // ONLY new value this task injects into a row, it never invents a
  // taxonomy value (the label used is either the user's own explicit
  // choice, or the exact real platforms.display_label the detector
  // matched, still resolved through the same matchTaxonomyValue() every
  // other field goes through) and it never overrides a column the user
  // (or auto-mapping) already mapped to "platform".
  function resolvedPlatformLabel(): string | null {
    if (manualPlatformOverride) return manualPlatformOverride;
    if (platformDetection?.state === "detected" && platformDetection.platformId) {
      return findAdPlatformProfile(platformDetection.platformId).displayLabel;
    }
    return null;
  }

  function runValidation() {
    if (!table) return;
    const mapped = applyMapping(table, mappings);
    const platformColumnMapped = mappings.some((m) => m.state === "mapped" && m.canonicalField === "platform");
    const inferredPlatform = platformColumnMapped ? null : resolvedPlatformLabel();
    const rowsWithPlatform = inferredPlatform ? mapped.map((row) => ({ ...row, platform: row.platform ?? inferredPlatform })) : mapped;

    // POST-MVP IMPORT FIX 3 (§L): a real Google Ads export's own number
    // notation is unambiguously English-style — known upfront by the
    // resolved PLATFORM, never inferred from the numbers themselves.
    // Every other platform keeps the exact pre-existing "auto" (LATAM-
    // primary ambiguity) behavior.
    const resolvedPlatformId: AdPlatformId | null = manualPlatformOverride
      ? AD_PLATFORM_PROFILES.find((p) => p.displayLabel === manualPlatformOverride)?.id ?? null
      : platformDetection?.state === "detected" ? platformDetection.platformId : null;
    const numberFormat = resolvedPlatformId ? findAdPlatformProfile(resolvedPlatformId).numberFormat ?? "auto" : "auto";

    // §4: inject the file-detected report currency into every row, same
    // injection pattern as platform above — only when no column is
    // already statically mapped to "currency", and only when detection
    // is unambiguous (an ambiguous file is flagged for review below,
    // never guessed).
    const currencyColumnMapped = mappings.some((m) => m.state === "mapped" && m.canonicalField === "currency");
    const inferredCurrency = !currencyColumnMapped && currencyDetection?.state === "detected" ? currencyDetection.currency : null;
    const rowsWithCurrency = inferredCurrency
      ? rowsWithPlatform.map((row) => ({ ...row, currency: row.currency ?? inferredCurrency }))
      : rowsWithPlatform;

    // §2: resolve "Resultados"/"Indicador de resultado" PER ROW — never
    // a single file-wide guess. Reads the raw table values directly
    // (both columns are "ignored"/row_semantic in `mappings`, so
    // applyMapping never carries them into `mapped`), and injects the
    // resolved field only when Cucurucho has a safe canonical field for
    // THAT row's indicator and no column already explicitly claims it.
    const resultsIdx = table.headers.findIndex((h) => normalizeHeader(h) === "resultados");
    const indicatorIdx = table.headers.findIndex((h) => normalizeHeader(h) === "indicador de resultado");
    const resolutions: RowResultResolution[] = [];
    const rowsWithResults = resultsIdx === -1
      ? rowsWithCurrency
      : rowsWithCurrency.map((row, i) => {
          const resultsRaw = table.rows[i]?.[resultsIdx];
          const indicatorRaw = indicatorIdx !== -1 ? table.rows[i]?.[indicatorIdx] : undefined;
          const resolution = resolveMetaResultForRow(resultsRaw, indicatorRaw);
          resolutions.push(resolution);
          if (resolution.reason === "mapped" && resolution.canonicalField && row[resolution.canonicalField] === undefined) {
            return { ...row, [resolution.canonicalField]: resultsRaw };
          }
          return row;
        });
    setRowResultResolutions(resolutions);

    // POST-MVP IMPORT FIX 3 (§D/§G): a real Google Ads export has NO
    // per-row date columns at all — the report's only date evidence is
    // the preamble range line parsed in lib/import/parse.ts. Injected
    // ONLY for whichever of start/end date has no mapped column at all
    // (never overriding a real per-row date column, even a blank cell
    // in it), using the same `row.field ?? value` pattern as platform/
    // currency above.
    const startDateColumnMapped = mappings.some((m) => m.state === "mapped" && m.canonicalField === "start_date");
    const endDateColumnMapped = mappings.some((m) => m.state === "mapped" && m.canonicalField === "end_date");
    const rowsWithDates = reportDateRange && (!startDateColumnMapped || !endDateColumnMapped)
      ? rowsWithResults.map((row) => ({
          ...row,
          start_date: !startDateColumnMapped ? row.start_date ?? reportDateRange.start : row.start_date,
          end_date: !endDateColumnMapped ? row.end_date ?? reportDateRange.end : row.end_date,
        }))
      : rowsWithResults;

    // CAMPAIGN IMPORT INTELLIGENCE PHASE 1: per-ROW objective
    // classification — evidence precedence (structured Meta/Google
    // signal, then campaign-name keyword) is entirely inside
    // classifyRowObjective; this file only gathers the evidence and
    // applies the fill-if-missing injection pattern already used above
    // for platform/currency/dates. Resolved ONCE per file: Google's
    // video-report evidence is a header-level signal (classifyExportProfile,
    // reused rather than re-implemented), so it applies uniformly to
    // every row in a video-report file — exactly like the real
    // underlying evidence (the file either has the quartile columns or
    // it doesn't).
    const profileForObjectiveEvidence = resolvedPlatformId ? classifyExportProfile(resolvedPlatformId, table, mappings) : null;
    const googleHasVideoViewEvidence = profileForObjectiveEvidence?.profileId === "google_video_campaign_report";
    const isStructuredEvidenceTier = (tier?: ObjectiveEvidenceTier) => tier === "meta_result_indicator" || tier === "google_metric_presence";
    const objectiveClassifications: ObjectiveClassificationResult[] = [];
    const rowsWithObjective = rowsWithDates.map((row, i) => {
      const classification = classifyRowObjective(
        {
          metaIndicatorNormalized: resolvedPlatformId === "meta_ads" ? resolutions[i]?.indicatorSample ?? null : null,
          googleHasVideoViewEvidence: resolvedPlatformId === "google_ads" && googleHasVideoViewEvidence,
          // Row-level: a generic "Conversiones" column can be mapped for
          // the whole file yet still be blank on a specific row — only a
          // row with an actual value counts as ambiguous-conversions
          // evidence for THAT row.
          googleConversionsPresent: resolvedPlatformId === "google_ads" && !!row.conversions?.trim(),
          campaignName: row.campaign_name ?? null,
        },
        taxonomies.objectives
      );
      objectiveClassifications.push(classification);
      // Fill-if-missing only — a real per-row objective column (however
      // it was mapped) always wins, exactly like every other injection
      // in this function. The file-level "Contexto del reporte" fallback
      // just below then only ever applies to whatever THIS step still
      // leaves unfilled (brief: "fallback for UNKNOWN rows... must NOT
      // automatically overwrite a DETECTED/SUGGESTED row-level
      // objective").
      if (!row.objective && classification.objectiveKey) {
        return { ...row, objective: classification.objectiveKey };
      }
      return row;
    });

    // POST-MVP IMPORT FIX 3 (§A/§P): the file-level "Contexto del
    // reporte" — Objective/Vertical/Country (plus the optional business
    // model/audience strategy/funnel stage) selected ONCE and applied to
    // every row that doesn't already carry its own value from a mapped
    // column. Exactly the same optional-injection pattern already used
    // for platform/currency above — no new mechanism, and a row with a
    // real per-row value is never overwritten (§P: "if some rows already
    // have a safe value, don't overwrite it unnecessarily"). For
    // Objective specifically, "already have a value" now also covers
    // whatever the row-level classification above just resolved.
    const contextValues: Partial<Record<CanonicalField, string>> = {};
    if (contextObjective) contextValues.objective = contextObjective;
    if (contextVertical) contextValues.vertical = contextVertical;
    if (contextCountry) contextValues.country = contextCountry;
    if (contextBusinessModel) contextValues.business_model = contextBusinessModel;
    if (contextAudienceStrategy) contextValues.audience_strategy = contextAudienceStrategy;
    if (contextFunnelStage) contextValues.funnel_stage = contextFunnelStage;
    const contextEntries = Object.entries(contextValues) as [CanonicalField, string][];
    const rowsWithContext = contextEntries.length > 0
      ? rowsWithObjective.map((row) => {
          const merged = { ...row };
          for (const [field, value] of contextEntries) {
            if (!merged[field]) merged[field] = value;
          }
          return merged;
        })
      : rowsWithObjective;

    const normalizedBase = rowsWithContext.map((row, i) => normalizeAndValidateRow(i + 2, row, taxonomies, { numberFormat })); // +2: row 1 is the header

    // §4: an ambiguous report currency can't be safely defaulted to any
    // single code — every row is flagged for review rather than
    // silently keeping validate.ts's normal USD fallback (which is only
    // meant for the "no currency information at all" case).
    const normalized = currencyDetection?.state === "ambiguous"
      ? normalizedBase.map((row) => row.status === "duplicate" ? row : {
          ...row,
          status: "needs_review" as const,
          issues: [...row.issues, { field: "currency" as const, severity: "warning" as const, messageKey: "import.issue.ambiguousReportCurrency" }],
        })
      : normalizedBase;

    const finalRows = detectDuplicates(normalized);
    setNormalizedRows(finalRows);
    setRowObjectiveClassifications(objectiveClassifications);
    // CAMPAIGN IMPORT INTELLIGENCE PHASE 1: funnel derivation reads the
    // FINAL, taxonomy-resolved objective (normalizeAndValidateRow's own
    // matchTaxonomyValue already turned the classifier's internal_key
    // string into the exact same resolved value every other field
    // goes through) — never re-derives objective itself. "Structured"
    // evidence (for the Store Visits gate — see derive3StageFunnel's
    // own comment) means tier 2/3 of the classifier, never a
    // campaign-name guess and never the manual/report-level fallback.
    setRowFunnel3(finalRows.map((row, i) => derive3StageFunnel(row.objective, { hasStructuredObjectiveEvidence: isStructuredEvidenceTier(objectiveClassifications[i]?.evidenceTier) })));
    setRowFunnel5(finalRows.map((row) => derive5StageEcommerceFunnel(row.objective, {
      audienceStrategyKey: row.audienceStrategy,
      funnelStageKey: row.funnelStage,
      campaignName: row.campaignName,
    })));
    setManualOverrideRows(new Set());
    setEditingObjectiveRow(null);
    setBulkOverridePending(false);
    setDupVerdicts(new Map());
    setSkipRows(new Set());
    setStep("review");

    // PHASE 25 (§9): a single batched check against the owner's own
    // previously-imported campaigns — fired after the review rows are
    // already shown, never gating the review step itself. Best-effort:
    // a failed check just means no duplicate banner shows, it never
    // blocks anything the user can do next.
    const candidates: DuplicateCheckCandidate[] = finalRows
      .filter((r) => r.status === "valid" && r.platform && r.startDate && r.endDate && r.adSpend !== null)
      .map((r) => ({
        rowNumber: r.rowNumber,
        platformKey: r.platform!,
        campaignName: r.campaignName,
        startDate: r.startDate!,
        endDate: r.endDate!,
        adSpend: r.adSpend!,
        rawSignature: buildRawSignature(r.rawMetrics),
      }));
    if (candidates.length > 0) {
      checkImportDuplicatesAction(candidates)
        .then((results) => {
          const map = new Map<number, DuplicateMatch>();
          for (const entry of results) {
            if (entry.match.verdict !== "new") map.set(entry.rowNumber, entry.match);
          }
          setDupVerdicts(map);
        })
        .catch(() => {});
    }
  }

  async function confirmImport() {
    setSubmitting(true);
    const res = await bulkSubmitContributionsAction(normalizedRows, sourceType, {
      sourceFilename: fileName || null,
      exportProfileId: exportProfile?.profileId ?? null,
      skipRowNumbers: Array.from(skipRows),
    });
    setSubmitting(false);
    setResult({ imported: res.imported, failed: res.failed });
    setStep("done");
  }

  // CAMPAIGN IMPORT INTELLIGENCE PHASE 1: the per-row "Cambiar"/Change
  // control — a deliberate, single-row edit, distinct from the bulk
  // override below. Clears only this row's objective-related issues
  // (never touches any other field's issues), recomputes its status,
  // and marks it "Manual" — which always takes visual precedence over
  // whatever confidence the classifier originally produced for it.
  function changeRowObjective(rowNumber: number, newObjectiveKey: string) {
    const idx = normalizedRows.findIndex((r) => r.rowNumber === rowNumber);
    if (idx === -1) return;
    const targetRow = normalizedRows[idx];
    setNormalizedRows((prev) => prev.map((row, i) => {
      if (i !== idx) return row;
      const issues = row.issues.filter((iss) => iss.field !== "objective");
      const hasError = issues.some((iss) => iss.severity === "error");
      return { ...row, objective: newObjectiveKey, issues, status: row.status === "duplicate" ? "duplicate" : (hasError ? "needs_review" : "valid") };
    }));
    setManualOverrideRows((prev) => new Set(prev).add(rowNumber));
    setRowFunnel3((prev) => prev.map((f, i) => i === idx ? derive3StageFunnel(newObjectiveKey, { hasStructuredObjectiveEvidence: false }) : f));
    setRowFunnel5((prev) => prev.map((f, i) => i === idx ? derive5StageEcommerceFunnel(newObjectiveKey, {
      audienceStrategyKey: targetRow.audienceStrategy,
      funnelStageKey: targetRow.funnelStage,
      campaignName: targetRow.campaignName,
    }) : f));
    setEditingObjectiveRow(null);
  }

  // The separate, deliberately-clicked bulk-override action (§A/§P
  // redesign): force-overwrites EVERY row's objective to the chosen
  // report-level contextObjective — unlike the automatic fallback
  // merge in runValidation, this one DOES replace an already
  // detected/suggested row-level value, which is exactly why it always
  // requires its own explicit confirmation click (see the "Aplicar..."
  // button below) rather than ever firing on its own. Re-runs
  // detectDuplicates afterward: changing every row's objective can
  // create or resolve within-file duplicates (the dup key includes
  // objective), so the duplicate flags must be recomputed, not left
  // stale.
  function applyObjectiveToAllRows() {
    if (!contextObjective) return;
    const overridden = normalizedRows.map((row) => {
      const issues = row.issues.filter((iss) => iss.field !== "objective" && iss.messageKey !== "import.issue.possibleDuplicate");
      const hasError = issues.some((iss) => iss.severity === "error");
      return { ...row, objective: contextObjective, issues, status: hasError ? ("needs_review" as const) : ("valid" as const) };
    });
    const reDuped = detectDuplicates(overridden);
    setNormalizedRows(reDuped);
    setManualOverrideRows(new Set(reDuped.map((r) => r.rowNumber)));
    setRowFunnel3(reDuped.map((row) => derive3StageFunnel(row.objective, { hasStructuredObjectiveEvidence: false })));
    setRowFunnel5(reDuped.map((row) => derive5StageEcommerceFunnel(row.objective, {
      audienceStrategyKey: row.audienceStrategy,
      funnelStageKey: row.funnelStage,
      campaignName: row.campaignName,
    })));
    setBulkOverridePending(false);
  }

  // §9-style plain-language explanation, mirroring renderResultCell's
  // own pattern: a label + confidence badge, "Manual" always winning
  // over the classifier's own original confidence once the user has
  // deliberately changed a row (per-row or via the bulk action).
  function objectiveConfidenceBadge(rowNumber: number, classification: ObjectiveClassificationResult | undefined) {
    const isManual = manualOverrideRows.has(rowNumber);
    const confidence = isManual ? "manual" : classification?.confidence ?? "unknown";
    const toneClass = confidence === "detected"
      ? "bg-pistachio-soft text-pistachio"
      : confidence === "suggested"
      ? "bg-vanilla-soft text-vanilla"
      : confidence === "manual"
      ? "bg-brandLavender/20 text-brandLavender"
      : "bg-surface2 text-ink-500";
    const labelKey = confidence === "detected"
      ? "contribute.import.objectiveConfidence.detected"
      : confidence === "suggested"
      ? "contribute.import.objectiveConfidence.suggested"
      : confidence === "manual"
      ? "contribute.import.objectiveConfidence.manual"
      : "contribute.import.objectiveConfidence.unknown";
    const reasonTitle = !isManual && classification?.reasonKey ? t(classification.reasonKey, classification.reasonVars) : undefined;
    return (
      <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium ${toneClass}`} title={reasonTitle}>
        {t(labelKey)}
      </span>
    );
  }

  // Funnel cell: 3-stage label always shown, with the optional 5-stage
  // ecommerce label + both detection reasons folded into the title
  // tooltip — never a second visible column, per the brief's own
  // "without excessively widening the table" instruction.
  function renderFunnelCell(idx: number) {
    const f3 = rowFunnel3[idx];
    const f5 = rowFunnel5[idx];
    if (!f3) return <span className="text-ink-400">—</span>;
    const stage3Label = t(`contribute.import.funnel3Stage.${f3.stage}`);
    const stage5Label = f5?.stage ? t(`contribute.import.funnel5Stage.${f5.stage}`) : null;
    const titleParts = [t(f3.reasonKey)];
    if (f5) titleParts.push(t(f5.reasonKey));
    return (
      <span className="text-ink-800" title={titleParts.join(" · ")}>
        {stage3Label}
        {stage5Label && <span className="text-ink-400"> · {stage5Label}</span>}
      </span>
    );
  }

  const validCount = normalizedRows.filter((r) => r.status === "valid").length;
  // §10: what will actually be imported once explicit duplicate skips
  // are taken into account — distinct from validCount (which only
  // reflects lib/import/validate.ts's own row-level validity).
  const effectiveValidCount = normalizedRows.filter((r) => r.status === "valid" && !skipRows.has(r.rowNumber)).length;
  const reviewCount = normalizedRows.filter((r) => r.status !== "valid").length;
  const recognizedMappingCount = mappings.filter((m) => m.state === "mapped").length;
  const reviewMappingCount = mappings.filter((m) => m.state === "needs_review").length;
  // §8: "Resultados"/"Indicador de resultado" are counted and shown
  // separately from the general "no necesarias" group — they aren't
  // unneeded, their meaning is just resolved per row (see the
  // "row_semantic" group below), so lumping them into a plain ignored
  // count would misrepresent them as simply unused.
  const ignoredMappingCount = mappings.filter((m) => m.state === "ignored" && ignoredReasonForHeader(m.sourceHeader) !== "row_semantic").length;
  const rowSemanticMappingCount = mappings.filter((m) => m.state === "ignored" && ignoredReasonForHeader(m.sourceHeader) === "row_semantic").length;
  const detectedPlatformLabel = platformDetection?.state === "detected" && platformDetection.platformId
    ? findAdPlatformProfile(platformDetection.platformId).displayLabel
    : null;
  // §10: only a soft note, never a forced correction — the file's own
  // detected evidence and the user's stated hint disagree, so both are
  // shown and the user picks.
  const platformHintMismatch = !!(
    detectedPlatformLabel && platformHint && platformHint !== "other" && platformHint !== platformDetection?.platformId
  );

  // §1/§2/§20: a SEPARATE second classification — which export FAMILY
  // this file belongs to (e.g. "Search report" vs. a plain "Campaign
  // report") — computed only once a platform is resolved and never
  // conflated with platform detection itself. Purely additive: it only
  // feeds the columns-step banner label, it never changes any mapping,
  // currency, or validation decision.
  const resolvedDetectionPlatformId: AdPlatformId | null = manualPlatformOverride
    ? AD_PLATFORM_PROFILES.find((p) => p.displayLabel === manualPlatformOverride)?.id ?? null
    : platformDetection?.state === "detected" ? platformDetection.platformId : null;
  const exportProfile = table && resolvedDetectionPlatformId
    ? classifyExportProfile(resolvedDetectionPlatformId, table, mappings)
    : null;

  // §3/§9: whether campaign identity was found in this file at all —
  // gates the additive "Campaign" review column and the
  // persistence-limitation caption, so a generic (non-campaign) import
  // looks exactly as it did before this fix.
  const hasCampaignNames = mappings.some((m) => m.state === "mapped" && m.canonicalField === "campaign_name");
  // §8/§9: the rest of the additive per-campaign review columns (dates,
  // reach, currency, result) are only useful together with campaign
  // identity or on a confirmed Meta import — never shown for a plain
  // generic CSV, so its review table stays visually unchanged.
  const isMetaImport = detectedPlatformLabel === "Meta Ads" || manualPlatformOverride === "Meta Ads";
  const showCampaignReviewColumns = hasCampaignNames || isMetaImport;

  // POST-MVP IMPORT FIX 3 (§B): objective auto-suggestion for the
  // file-level context section — a strong keyword in a campaign's own
  // name (never the file name, never Google's own campaign TYPE) may
  // suggest an objective. Always labeled "Sugerido" in the UI below and
  // never applied without an explicit click — see suggestions.ts.
  const campaignNameMapping = mappings.find((m) => m.state === "mapped" && m.canonicalField === "campaign_name");
  const objectiveSuggestion = table && campaignNameMapping
    ? suggestObjectiveFromCampaignNames(
        table.rows.map((r) => r[campaignNameMapping.sourceColumnIndex] ?? ""),
        taxonomies.objectives
      )
    : null;
  const suggestedObjectiveLabel = objectiveSuggestion
    ? translateTaxonomyLabel("objective", objectiveSuggestion.internalKey, taxonomies.objectives.find((o) => o.internal_key === objectiveSuggestion.internalKey)?.display_label ?? objectiveSuggestion.internalKey, locale)
    : null;
  // CAMPAIGN IMPORT INTELLIGENCE PHASE 1: the chosen report-context
  // objective's own display label, used only by the bulk-override
  // confirmation copy below — never a new resolution mechanism.
  const contextObjectiveLabel = contextObjective
    ? translateTaxonomyLabel("objective", contextObjective, taxonomies.objectives.find((o) => o.internal_key === contextObjective)?.display_label ?? contextObjective, locale)
    : null;
  function objectiveDisplayLabel(internalKey: string | null): string {
    if (!internalKey) return "—";
    return translateTaxonomyLabel("objective", internalKey, taxonomies.objectives.find((o) => o.internal_key === internalKey)?.display_label ?? internalKey, locale);
  }

  // §9: a plain-language explanation for a per-row "Resultado
  // contextual" result — never a raw technical reason code.
  function renderResultCell(resolution?: RowResultResolution) {
    if (!resolution) return <span className="text-ink-400">—</span>;
    if (resolution.reason === "mapped" && resolution.canonicalField) {
      return (
        <span className="text-ink-800" title={resolution.indicatorSample ?? ""}>
          {t(FIELD_LABEL_KEYS[resolution.canonicalField])}: {resolution.resultValue ?? "—"}
        </span>
      );
    }
    const reasonKey = resolution.reason === "duplicates_existing_metric"
      ? "contribute.import.resultReasonDuplicatesMetric"
      : resolution.reason === "unknown_indicator"
      ? "contribute.import.resultReasonUnknownIndicator"
      : resolution.reason === "no_indicator"
      ? "contribute.import.resultReasonNoIndicator"
      : "contribute.import.resultReasonNoValue";
    const title = resolution.indicatorSample
      ? `${t(reasonKey)} (${resolution.indicatorSample}${resolution.resultValue ? `: ${resolution.resultValue}` : ""})`
      : t(reasonKey);
    return (
      <span className="text-ink-500" title={title}>
        {t("contribute.import.resultContextualLabel")}
      </span>
    );
  }

  const STEP_LABELS: { key: UploadStep; labelKey: string }[] = [
    { key: "file", labelKey: "contribute.import.step.file" },
    { key: "columns", labelKey: "contribute.import.step.columns" },
    { key: "review", labelKey: "contribute.import.step.review" },
    { key: "confirm", labelKey: "contribute.import.step.confirm" },
  ];

  return (
    <div>
      <button onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-primary">
        <ArrowLeft size={13} aria-hidden="true" /> {t("contribute.backToOptions")}
      </button>

      {step !== "done" && (
        <ol className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-ink-500" aria-label={t("contribute.import.stepperLabel")}>
          {STEP_LABELS.map((s, i) => (
            <li key={s.key} className={`flex items-center gap-2 ${step === s.key ? "font-semibold text-primary" : ""}`} aria-current={step === s.key ? "step" : undefined}>
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${step === s.key ? "bg-primary text-white" : "bg-surface2 text-ink-500"}`}>{i + 1}</span>
              {t(s.labelKey)}
              {i < STEP_LABELS.length - 1 && <span aria-hidden="true" className="mx-1 hidden text-ink-300 sm:inline">›</span>}
            </li>
          ))}
        </ol>
      )}

      {step === "file" && (
        <div>
          {/* §10: optional platform hint — auto-detection works fully
              without it; this only pre-fills the manual override when
              detection itself can't confirm a platform, and is never
              forced onto a confident, disagreeing automatic result. */}
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-ink-600">
            <label htmlFor="platform-hint">{t("contribute.import.platformHintLabel")}</label>
            <select
              id="platform-hint"
              value={platformHint}
              onChange={(e) => setPlatformHint(e.target.value as AdPlatformId | "other" | "")}
              className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-ink-900"
            >
              <option value="">{t("contribute.import.platformHintPlaceholder")}</option>
              {AD_PLATFORM_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>{p.displayLabel}</option>
              ))}
              <option value="other">{t("contribute.import.platformHintOther")}</option>
            </select>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${dragActive ? "border-primary bg-primary-soft" : "border-line bg-surface"}`}
          >
            <Upload size={28} className="mx-auto text-ink-400" aria-hidden="true" />
            <p className="mt-3 text-sm text-ink-700">{t("contribute.import.dropzoneText")}</p>
            <p className="mt-1 text-xs text-ink-500">{t("contribute.import.supportedFormats")}</p>
            <label className="mt-4 inline-block cursor-pointer rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
              {t("contribute.import.browseButton")}
              <input
                ref={inputRef}
                type="file"
                accept=".csv,.xlsx"
                className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </label>
            {fileError && (
              <p role="alert" className="mt-3 inline-flex items-center gap-1.5 text-xs text-caution">
                <AlertTriangle size={12} aria-hidden="true" /> {fileError}
              </p>
            )}
          </div>

          {/* §19/§20: registry-driven download guidance — one generic
              lookup against the platform's own profile instead of a
              hardcoded if-per-platform chain. Platforms without a
              confirmed real export path yet (TikTok/Pinterest/Mercado
              Libre) fall back to a generic "upload it as-is" line built
              from their display label, rather than fabricating steps
              nobody has verified. The "flexible" note is always shown,
              making explicit that partial/alternate column sets work. */}
          <div className="mt-3 rounded-xl border border-dashed border-line bg-surface2/40 px-4 py-3 text-xs text-ink-600">
            <p>{t("contribute.import.downloadGuidanceGeneric")}</p>
            {platformHint && platformHint !== "other" && (() => {
              const hintProfile = findAdPlatformProfile(platformHint);
              return hintProfile.downloadGuidanceKey ? (
                <p className="mt-1.5 whitespace-pre-line">{t(hintProfile.downloadGuidanceKey)}</p>
              ) : (
                <p className="mt-1.5">{t("contribute.import.downloadGuidanceOtherPlatform", { platform: hintProfile.displayLabel })}</p>
              );
            })()}
            <p className="mt-1.5">{t("contribute.import.downloadGuidanceFlexible")}</p>
            <p className="mt-1.5">{t("contribute.import.downloadGuidanceRecommendedFields")}</p>
          </div>

          {/* CAMPAIGN IMPORT INTELLIGENCE PHASE 1 (§ export guidance):
              ONLY the exact column names the approved brief itself
              verified against a real Meta/Google export fixture in this
              project — never a speculative alias (Optimization Goal,
              Buying Type, Conversion Action/Category, Advertising
              Channel Subtype, etc. are deliberately absent; see
              lib/import/objectiveClassification.ts's own header comment
              for why those are never guessed at either). Collapsed by
              default — detailed reference, not the primary instruction
              (that's downloadGuidanceMeta/Google above). */}
          <details className="mt-2 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-ink-600">
            <summary className="cursor-pointer list-none font-medium text-ink-700 [&::-webkit-details-marker]:hidden">
              {t("contribute.import.exportGuidanceDetailsTitle")}
            </summary>
            <div className="mt-2 space-y-2">
              <p><span className="font-medium text-ink-800">Meta Ads — </span>{t("contribute.import.exportGuidanceMetaMin")}</p>
              <p className="text-ink-500">{t("contribute.import.exportGuidanceMetaRecommended")}</p>
              <p><span className="font-medium text-ink-800">Google Ads — </span>{t("contribute.import.exportGuidanceGoogleMin")}</p>
              <p className="text-ink-500">{t("contribute.import.exportGuidanceGoogleRecommended")}</p>
            </div>
          </details>
        </div>
      )}

      {step === "columns" && table && (
        <div>
          {/* Post-MVP §D: platform auto-detection banner. Never silently
              picks a platform on weak evidence — "ambiguous"/"unknown"
              both surface an explicit manual choice instead of a guess. */}
          <div className="rounded-xl border border-line bg-surface2/40 px-4 py-3 text-sm">
            {detectedPlatformLabel && !manualPlatformOverride ? (
              <p className="font-medium text-ink-800">{t("contribute.import.detectedPlatform", { platform: detectedPlatformLabel })}</p>
            ) : (
              <p className="font-medium text-ink-800">
                {platformDetection?.state === "ambiguous" ? t("contribute.import.detectionAmbiguousTitle") : t("contribute.import.detectionUnknownTitle")}
              </p>
            )}
            {platformHintMismatch && (
              <p className="mt-1 text-xs text-caution">{t("contribute.import.platformHintMismatch", { detected: detectedPlatformLabel ?? "", hint: findAdPlatformProfile(platformHint as AdPlatformId).displayLabel })}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="text-xs text-ink-500" htmlFor="platform-override">{t("contribute.import.platformOverrideLabel")}</label>
              <select
                id="platform-override"
                value={manualPlatformOverride}
                onChange={(e) => setManualPlatformOverride(e.target.value)}
                className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-ink-900"
              >
                <option value="">
                  {detectedPlatformLabel ? `${t("contribute.import.platformOverrideChange")} (${detectedPlatformLabel})` : t("contribute.import.platformOverridePlaceholder")}
                </option>
                {taxonomies.platforms.map((p) => (
                  <option key={p.id} value={p.display_label}>{p.display_label}</option>
                ))}
              </select>
            </div>
            {/* §5/§7: the export-profile label — a second, separate line
                under the platform banner ("Meta Ads" / "Reporte de
                campañas"), never merged into the platform decision
                itself (§2). Only rendered once a profile could actually
                be classified. */}
            {exportProfile && (
              <p className="mt-2 text-xs font-medium text-ink-700">{t(exportProfile.labelKey)}</p>
            )}
            {/* CAMPAIGN IMPORT INTELLIGENCE PHASE 1: purely informational
                — never shown as a warning, and absent for a legacy
                template/real export/any other generic file, all of
                which import identically regardless. */}
            {detectedTemplateVersion !== null && (
              <p className="mt-2 text-xs text-ink-500">{t("contribute.import.templateVersionDetected", { version: detectedTemplateVersion })}</p>
            )}
          </div>

          {/* §5/§7: a compact summary line instead of a wall of per-
              column dropdowns — currency/campaigns/columns at a glance,
              then how many columns fall into each bucket. */}
          <p className="mt-4 text-sm text-ink-700">
            {t("contribute.import.mappingIntro", { file: fileName, count: table.rows.length })}
          </p>
          <p className="mt-1 text-xs text-ink-600">
            {t("contribute.import.reportStatsLine", {
              currency: currencyDetection?.state === "detected" ? currencyDetection.currency ?? "—" : "—",
              campaigns: table.rows.length,
              columns: mappings.length,
            })}
          </p>
          <p className="mt-1 text-xs text-ink-600">
            {t("contribute.import.recognizedCount", { n: recognizedMappingCount })}
            {ignoredMappingCount > 0 && <> · {t("contribute.import.ignoredCount", { n: ignoredMappingCount })}</>}
            {rowSemanticMappingCount > 0 && <> · {t("contribute.import.statContextualResults", { n: rowSemanticMappingCount })}</>}
          </p>

          {/* §4/§8: currency and campaign-count facts, shown only when
              this file actually has evidence for them — a plain generic
              import shows neither line. */}
          {currencyDetection && currencyDetection.state !== "none" && (
            <p className="mt-1 text-xs text-ink-600">
              {currencyDetection.state === "detected"
                ? t("contribute.import.currencyDetected", { currency: currencyDetection.currency ?? "" })
                : <span className="text-caution">{t("contribute.import.currencyAmbiguous")}</span>}
            </p>
          )}
          {hasCampaignNames && (
            <p className="mt-1 text-xs text-ink-600">{t("contribute.import.campaignCount", { n: table.rows.length })}</p>
          )}
          {/* CONTRIBUTION UX SAFETY PASS A (§4): the 5000-row cap
              (IMPORT_LIMITS.maxRows, lib/import/parse.ts) is unchanged —
              this only makes a hit against it visible instead of silent.
              A genuinely attention-getting box, not a small gray line
              like the other row-count facts above, since rows are
              actually being dropped here. */}
          {truncationInfo && (
            <div className="mt-2 flex items-start gap-2 rounded-xl border border-caution/30 bg-caution-soft p-3 text-xs text-ink-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-caution" aria-hidden="true" />
              <p>{t("contribute.import.truncationWarning", { original: truncationInfo.original, imported: IMPORT_LIMITS.maxRows })}</p>
            </div>
          )}
          {/* §J: aggregate "Total: ..." rows were already excluded in
              handleFile, before this table's row count was ever computed
              — shown here so the exclusion is visible, never silent. */}
          {totalRowsExcludedCount > 0 && (
            <p className="mt-1 text-xs text-ink-600">{t("contribute.import.totalRowsExcluded", { n: totalRowsExcludedCount })}</p>
          )}

          {/* POST-MVP IMPORT FIX 3 (§A/§B/§P): the file-level "Contexto
              del reporte" — Objective/Vertical/Country selected ONCE and
              applied to every campaign row (runValidation's context
              injection), instead of forcing the user to repeat them per
              row. Optional business model/audience strategy/funnel stage
              alongside. */}
          <div className="mt-4 rounded-xl border border-line bg-surface p-4">
            <p className="text-sm font-semibold text-ink-900">{t("contribute.import.contextTitle")}</p>
            <p className="mt-1 text-xs text-ink-600">{t("contribute.import.contextIntro")}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-ink-700">
                {t("contribute.field.objective")} *
                <select
                  value={contextObjective}
                  onChange={(e) => setContextObjective(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink-900"
                >
                  <option value="">{t("contribute.import.selectField")}</option>
                  {taxonomies.objectives.map((o) => (
                    <option key={o.internal_key} value={o.internal_key}>{translateTaxonomyLabel("objective", o.internal_key, o.display_label, locale)}</option>
                  ))}
                </select>
                {/* §B: a suggested objective is always labeled "Sugerido"
                    and requires an explicit click to apply — never
                    silently canonicalized. */}
                {objectiveSuggestion && contextObjective !== objectiveSuggestion.internalKey && (
                  <span className="mt-1 flex items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-vanilla-soft px-2 py-0.5 font-medium text-vanilla">{t("contribute.import.objectiveSuggested")}</span>
                    <button
                      type="button"
                      onClick={() => setContextObjective(objectiveSuggestion.internalKey)}
                      className="font-medium text-primary hover:underline"
                    >
                      {t("contribute.import.useSuggestion", { objective: suggestedObjectiveLabel ?? "" })}
                    </button>
                  </span>
                )}
                {/* CAMPAIGN IMPORT INTELLIGENCE PHASE 1 (§A/§P redesign):
                    this field is now an explicit FALLBACK, not a
                    file-wide override — Cucurucho already classifies
                    most rows per campaign. Vertical/Country keep their
                    exact pre-existing "applies to every row that
                    doesn't already have a value" behavior unchanged;
                    only Objective gets this more specific explanation,
                    plus the separate deliberate bulk-apply action. */}
                <p className="mt-1 text-[11px] text-ink-500">{t("contribute.import.objectiveContextFallbackNote")}</p>
              </label>
              <label className="text-xs text-ink-700">
                {t("contribute.field.vertical")} *
                <select
                  value={contextVertical}
                  onChange={(e) => setContextVertical(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink-900"
                >
                  <option value="">{t("contribute.import.selectField")}</option>
                  {taxonomies.verticals.map((v) => (
                    <option key={v.internal_key} value={v.internal_key}>{translateTaxonomyLabel("vertical", v.internal_key, v.display_label, locale)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-700">
                {t("contribute.field.country")} *
                <select
                  value={contextCountry}
                  onChange={(e) => setContextCountry(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink-900"
                >
                  <option value="">{t("contribute.import.selectField")}</option>
                  {taxonomies.countries.map((c) => (
                    <option key={c.iso_code} value={c.iso_code}>{translateTaxonomyLabel("country", c.iso_code, c.display_label, locale)}</option>
                  ))}
                </select>
              </label>
            </div>

            <p className="mt-3 text-[11px] font-medium uppercase tracking-wide text-ink-500">{t("contribute.import.contextOptionalTitle")}</p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs text-ink-700">
                {t("contribute.field.businessModel")}
                <select
                  value={contextBusinessModel}
                  onChange={(e) => setContextBusinessModel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink-900"
                >
                  <option value="">{t("contribute.import.selectField")}</option>
                  {taxonomies.businessModels.map((b) => (
                    <option key={b.internal_key} value={b.internal_key}>{translateTaxonomyLabel("businessModel", b.internal_key, b.display_label, locale)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-700">
                {t("contribute.field.audienceStrategy")}
                <select
                  value={contextAudienceStrategy}
                  onChange={(e) => setContextAudienceStrategy(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink-900"
                >
                  <option value="">{t("contribute.import.selectField")}</option>
                  {taxonomies.audienceStrategies.map((a) => (
                    <option key={a.internal_key} value={a.internal_key}>{translateTaxonomyLabel("audienceStrategy", a.internal_key, a.display_label, locale)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-ink-700">
                {t("contribute.field.funnelStage")}
                <select
                  value={contextFunnelStage}
                  onChange={(e) => setContextFunnelStage(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-1.5 text-xs text-ink-900"
                >
                  <option value="">{t("contribute.import.selectField")}</option>
                  {taxonomies.funnelStages.map((f) => (
                    <option key={f.internal_key} value={f.internal_key}>{translateTaxonomyLabel("funnelStage", f.internal_key, f.display_label, locale)}</option>
                  ))}
                </select>
              </label>
            </div>

            <p className="mt-3 text-[11px] text-ink-500">
              {t("contribute.import.contextApplyHint", { n: table.rows.length })} {t("contribute.import.contextRequiredNote")}
            </p>
          </div>

          {/* §7: automatic and no-config-needed columns are collapsed by
              default behind "Ver columnas" — nothing to confirm, so
              nothing forces itself onto the screen. */}
          {(["mapped", "ignored"] as const).map((groupState) => {
            const groupMappings = groupState === "ignored"
              ? mappings.filter((m) => m.state === "ignored" && ignoredReasonForHeader(m.sourceHeader) !== "row_semantic")
              : mappings.filter((m) => m.state === groupState);
            if (groupMappings.length === 0) return null;
            const groupLabelKey = groupState === "mapped" ? "contribute.import.groupRecognized" : "contribute.import.groupIgnored";
            return (
              <details key={groupState} className="mt-3 rounded-xl border border-line bg-surface px-3 py-2">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500 [&::-webkit-details-marker]:hidden">
                  <Check size={12} className="text-pistachio" aria-hidden="true" />
                  {t(groupLabelKey)} · {groupMappings.length}
                  <span className="font-normal normal-case text-ink-400">— {t("contribute.import.viewColumns")}</span>
                </summary>
                <div className="mt-2 space-y-2">
                  {groupMappings.map((m) => {
                    const conflict = m.state === "mapped" && m.canonicalField ? wouldConflict(mappings, m.sourceColumnIndex, m.canonicalField) : false;
                    return (
                      <div key={m.sourceColumnIndex} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface2/40 px-3 py-2">
                        <span className="min-w-[140px] truncate text-sm font-medium text-ink-900">{m.sourceHeader}</span>
                        <span aria-hidden="true" className="text-ink-400">→</span>
                        <label className="sr-only" htmlFor={`map-${m.sourceColumnIndex}`}>{t("contribute.import.mapToLabel", { column: m.sourceHeader })}</label>
                        <select
                          id={`map-${m.sourceColumnIndex}`}
                          value={m.state === "ignored" ? "ignore" : m.canonicalField ?? ""}
                          onChange={(e) => updateMapping(m.sourceColumnIndex, e.target.value === "ignore" ? "ignore" : e.target.value as CanonicalField)}
                          className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-ink-900"
                        >
                          <option value="" disabled>{t("contribute.import.selectField")}</option>
                          {[...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((f) => (
                            <option key={f} value={f}>{t(FIELD_LABEL_KEYS[f])}</option>
                          ))}
                          <option value="ignore">{t("contribute.import.ignoreColumn")}</option>
                        </select>
                        {m.state === "mapped" && !conflict && <Check size={14} className="text-pistachio" aria-hidden="true" />}
                        {conflict && <span className="text-[11px] text-caution">{t("contribute.import.duplicateMapping")}</span>}
                        {m.state === "ignored" && (
                          <span className="text-[11px] text-ink-400">
                            {ignoredReasonForHeader(m.sourceHeader) === "derived" ? t("contribute.import.ignoredHintDerived") : t("contribute.import.ignoredHintContext")}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
            );
          })}

          {/* §8/§13: contextual "Results" columns keep their own small,
              always-visible explanation — never collapsed into the plain
              "no necesitan configuración" group, since their meaning is
              resolved per row (see review), not simply unused. */}
          {rowSemanticMappingCount > 0 && (
            <div className="mt-3 rounded-xl border border-line bg-surface px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contribute.import.groupRowSemantic")} · {rowSemanticMappingCount}</p>
              <p className="mt-1 text-xs text-ink-500">{t("contribute.import.groupRowSemanticNote")}</p>
              <div className="mt-2 space-y-2">
                {mappings.filter((m) => m.state === "ignored" && ignoredReasonForHeader(m.sourceHeader) === "row_semantic").map((m) => (
                  <div key={m.sourceColumnIndex} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface2/40 px-3 py-2">
                    <span className="min-w-[140px] truncate text-sm font-medium text-ink-900">{m.sourceHeader}</span>
                    <span className="text-[11px] text-ink-500">{t("contribute.import.rowSemanticHint")}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* §6/§7: the ONLY group ever shown expanded by default — real
              ambiguous columns Cucurucho genuinely can't place on its
              own. Zero of these means the user can continue right away,
              with an explicit "we understood everything" message instead
              of an empty section. */}
          {reviewMappingCount > 0 ? (
            <div className="mt-3 rounded-xl border border-vanilla/40 bg-vanilla-soft/30 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-700">{t("contribute.import.groupNeedsReview")} · {reviewMappingCount}</p>
              <div className="mt-2 space-y-2">
                {mappings.filter((m) => m.state === "needs_review").map((m) => (
                  <div key={m.sourceColumnIndex} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                    <span className="min-w-[140px] truncate text-sm font-medium text-ink-900">{m.sourceHeader}</span>
                    <span aria-hidden="true" className="text-ink-400">→</span>
                    <label className="sr-only" htmlFor={`map-${m.sourceColumnIndex}`}>{t("contribute.import.mapToLabel", { column: m.sourceHeader })}</label>
                    <select
                      id={`map-${m.sourceColumnIndex}`}
                      value={m.canonicalField ?? ""}
                      onChange={(e) => updateMapping(m.sourceColumnIndex, e.target.value === "ignore" ? "ignore" : e.target.value as CanonicalField)}
                      className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-ink-900"
                    >
                      <option value="" disabled>{t("contribute.import.selectField")}</option>
                      {[...REQUIRED_FIELDS, ...OPTIONAL_FIELDS].map((f) => (
                        <option key={f} value={f}>{t(FIELD_LABEL_KEYS[f])}</option>
                      ))}
                      <option value="ignore">{t("contribute.import.ignoreColumn")}</option>
                    </select>
                    <span className="text-[11px] text-vanilla">{t("contribute.import.needsReview")}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-xs text-ink-600">{t("contribute.import.allColumnsUnderstood")}</p>
          )}

          <button onClick={runValidation} className="mt-5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
            {t("contribute.import.continueToReview")}
          </button>
        </div>
      )}

      {step === "review" && (
        <div>
          {/* Post-MVP §H: the review screen answers four plain-language
              questions instead of exposing raw table/DB terminology. */}
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contribute.import.reviewQDetected")}</p>
          <p className="mt-1 text-sm text-ink-700">
            {detectedPlatformLabel || manualPlatformOverride
              ? t("contribute.import.detectedSummary", { platform: manualPlatformOverride || detectedPlatformLabel || "", file: fileName, count: normalizedRows.length })
              : t("contribute.import.noPlatformDetectedSummary", { file: fileName, count: normalizedRows.length })}
          </p>

          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contribute.import.reviewQWillImport")}</p>
          <div className="mt-2 flex flex-wrap gap-3">
            <SummaryPill tone="pistachio" label={t("contribute.import.readyCount", { n: validCount })} />
            <SummaryPill tone="vanilla" label={t("contribute.import.reviewCount", { n: reviewCount })} />
          </div>

          {/* PHASE 25 (§4): campaign identity is now actually persisted
              (performance_datasets.campaign_name, migration 0018) —
              this note used to warn it was review-only and has been
              updated to say the opposite, honestly: it's saved, and
              it's private to the importing user, never shown to anyone
              else or exposed by the public benchmark engine. */}
          {hasCampaignNames && (
            <p className="mt-2 rounded-lg border border-dashed border-line bg-surface2/40 px-3 py-2 text-[11px] text-ink-500">
              {t("contribute.import.campaignNameNotPersisted")}
            </p>
          )}

          {/* CAMPAIGN IMPORT INTELLIGENCE PHASE 1 (§A/§P redesign): the
              separate, deliberately-clicked bulk-override action — only
              shown when a report-level Objective was actually chosen in
              the previous step, and always requiring its own explicit
              second click before anything is overwritten. This is the
              ONLY thing in this feature that replaces an already
              DETECTED/SUGGESTED row-level objective; the automatic
              fallback in runValidation never does. */}
          {contextObjective && (
            <div className="mt-3 rounded-xl border border-dashed border-line bg-surface2/40 px-3 py-2 text-xs">
              {!bulkOverridePending ? (
                <button
                  type="button"
                  onClick={() => setBulkOverridePending(true)}
                  className="font-medium text-primary hover:underline"
                >
                  {t("contribute.import.objectiveApplyBulkLabel")}
                </button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-700">
                    {t("contribute.import.objectiveApplyBulkConfirm", { objective: contextObjectiveLabel ?? "", n: normalizedRows.length })}
                  </span>
                  <button
                    type="button"
                    onClick={applyObjectiveToAllRows}
                    className="rounded-full bg-primary px-3 py-1 font-semibold text-white hover:opacity-90"
                  >
                    {t("contribute.import.objectiveApplyBulkConfirmButton")}
                  </button>
                  <button type="button" onClick={() => setBulkOverridePending(false)} className="font-medium text-ink-500 hover:underline">
                    {t("contribute.import.cancel")}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* POST-MVP MOBILE PASS §9/§13C: below md, the desktop review
              TABLE is replaced by one campaign-review CARD per row —
              never squeezed desktop columns at 320px. Same data, same
              row order, same gating (hasCampaignNames/
              showCampaignReviewColumns) as the table beside it; only
              the presentation differs. */}
          <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto md:hidden">
            {normalizedRows.map((row, idx) => (
              <div key={row.rowNumber} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold text-ink-900 line-clamp-2">
                    {hasCampaignNames ? row.campaignName ?? "—" : `${t("contribute.import.colRow")} ${row.rowNumber}`}
                  </p>
                  {row.status === "valid" ? (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-pistachio-soft px-2 py-0.5 text-[10px] font-medium text-pistachio"><Check size={10} aria-hidden="true" />{t("contribute.import.statusReady")}</span>
                  ) : (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-vanilla-soft px-2 py-0.5 text-[10px] font-medium text-vanilla" title={row.issues.map((i) => formatIssue(i, t)).join(" · ")}>
                      <AlertTriangle size={10} aria-hidden="true" />{t("contribute.import.statusReview")}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  {row.platform ?? "—"}
                  {showCampaignReviewColumns && row.campaignType ? ` · ${row.campaignType}` : ""}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {showCampaignReviewColumns && (
                    <div className="col-span-2">
                      <dt className="text-ink-400">{t("contribute.import.colDates")}</dt>
                      <dd className="text-ink-800">{row.startDate ?? "—"}{row.endDate ? ` → ${row.endDate}` : ""}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-ink-400">{t("contribute.field.adSpend")}</dt>
                    <dd className="tabular text-ink-800">{row.adSpend ?? "—"}</dd>
                  </div>
                  {/* CAMPAIGN IMPORT INTELLIGENCE PHASE 1: row-level
                      objective (label + confidence badge + inline
                      "Cambiar" control) and the derived, never-persisted
                      funnel stage — mirrors the desktop table's own
                      cells below. */}
                  <div className="col-span-2">
                    <dt className="text-ink-400">{t("contribute.field.objective")}</dt>
                    <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 text-ink-800">
                      {editingObjectiveRow === row.rowNumber ? (
                        <select
                          autoFocus
                          defaultValue={row.objective ?? ""}
                          onChange={(e) => e.target.value && changeRowObjective(row.rowNumber, e.target.value)}
                          onBlur={() => setEditingObjectiveRow(null)}
                          className="rounded-lg border border-line bg-canvas px-1.5 py-1 text-[11px] text-ink-900"
                        >
                          <option value="" disabled>{t("contribute.import.selectField")}</option>
                          {taxonomies.objectives.map((o) => (
                            <option key={o.internal_key} value={o.internal_key}>{translateTaxonomyLabel("objective", o.internal_key, o.display_label, locale)}</option>
                          ))}
                        </select>
                      ) : (
                        <>
                          <span>{objectiveDisplayLabel(row.objective)}</span>
                          {objectiveConfidenceBadge(row.rowNumber, rowObjectiveClassifications[idx])}
                          <button type="button" onClick={() => setEditingObjectiveRow(row.rowNumber)} className="text-[11px] font-medium text-primary hover:underline">
                            {t("contribute.import.objectiveChangeControl")}
                          </button>
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-ink-400">{t("contribute.import.colFunnel")}</dt>
                    <dd>{renderFunnelCell(idx)}</dd>
                  </div>
                  {showCampaignReviewColumns && (
                    <div>
                      <dt className="text-ink-400">{t("contribute.field.reach")} / {t("contribute.field.impressions")}</dt>
                      <dd className="tabular text-ink-800">{row.rawMetrics.reach ?? "—"} / {row.rawMetrics.impressions ?? "—"}</dd>
                    </div>
                  )}
                  {showCampaignReviewColumns && (
                    <div>
                      <dt className="text-ink-400">{t("contribute.field.currency")}</dt>
                      <dd className="text-ink-800">{row.currency}</dd>
                    </div>
                  )}
                  {showCampaignReviewColumns && (
                    <div className="col-span-2">
                      <dt className="text-ink-400">{t("contribute.import.colResult")}</dt>
                      <dd>{renderResultCell(rowResultResolutions[idx])}</dd>
                    </div>
                  )}
                </dl>
              </div>
            ))}
          </div>

          <div className="mt-4 hidden max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-line md:block">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-surface2 text-ink-500">
                <tr>
                  <th scope="col" className="px-3 py-2">{t("contribute.import.colRow")}</th>
                  {hasCampaignNames && <th scope="col" className="px-3 py-2">{t("contribute.field.campaignName")}</th>}
                  {/* §9: campaign-centric column order — Campaign,
                      Platform, Campaign type, then the file-level context
                      fields kept for verification value. */}
                  <th scope="col" className="px-3 py-2">{t("contribute.field.platform")}</th>
                  {/* POST-MVP IMPORT FIX 3 (§N/§O): campaign subtype
                      context (e.g. Google's "Búsqueda"/"Máximo
                      rendimiento") — review-only, never persisted. */}
                  {showCampaignReviewColumns && <th scope="col" className="px-3 py-2">{t("contribute.field.campaignType")}</th>}
                  <th scope="col" className="px-3 py-2">{t("contribute.field.objective")}</th>
                  {/* CAMPAIGN IMPORT INTELLIGENCE PHASE 1: derived,
                      never-persisted funnel stage — always shown right
                      next to Objective, never a second competing
                      "source of truth" column; see
                      lib/import/funnelClassification.ts. */}
                  <th scope="col" className="px-3 py-2">{t("contribute.import.colFunnel")}</th>
                  <th scope="col" className="px-3 py-2">{t("contribute.field.country")}</th>
                  {showCampaignReviewColumns && <th scope="col" className="px-3 py-2">{t("contribute.import.colDates")}</th>}
                  <th scope="col" className="px-3 py-2">{t("contribute.field.adSpend")}</th>
                  {showCampaignReviewColumns && <th scope="col" className="px-3 py-2">{t("contribute.field.impressions")}</th>}
                  {showCampaignReviewColumns && <th scope="col" className="px-3 py-2">{t("contribute.field.reach")}</th>}
                  {showCampaignReviewColumns && <th scope="col" className="px-3 py-2">{t("contribute.field.clicks")}</th>}
                  {showCampaignReviewColumns && <th scope="col" className="px-3 py-2">{t("contribute.field.conversions")}</th>}
                  {showCampaignReviewColumns && <th scope="col" className="px-3 py-2">{t("contribute.field.attributedRevenue")}</th>}
                  {showCampaignReviewColumns && <th scope="col" className="px-3 py-2">{t("contribute.field.currency")}</th>}
                  {showCampaignReviewColumns && <th scope="col" className="px-3 py-2">{t("contribute.import.colResult")}</th>}
                  <th scope="col" className="px-3 py-2">{t("contribute.import.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {normalizedRows.map((row, idx) => (
                  <tr key={row.rowNumber} className="border-t border-line">
                    <td className="px-3 py-2 text-ink-500">{row.rowNumber}</td>
                    {hasCampaignNames && <td className="px-3 py-2 text-ink-800">{row.campaignName ?? "—"}</td>}
                    <td className="px-3 py-2 text-ink-800">{row.platform ?? "—"}</td>
                    {showCampaignReviewColumns && <td className="px-3 py-2 text-ink-800">{row.campaignType ?? "—"}</td>}
                    <td className="px-3 py-2">
                      {/* CAMPAIGN IMPORT INTELLIGENCE PHASE 1: label +
                          confidence badge + inline "Cambiar" control —
                          every row gets a working edit control, never
                          just a plain static string. */}
                      {editingObjectiveRow === row.rowNumber ? (
                        <select
                          autoFocus
                          defaultValue={row.objective ?? ""}
                          onChange={(e) => e.target.value && changeRowObjective(row.rowNumber, e.target.value)}
                          onBlur={() => setEditingObjectiveRow(null)}
                          className="rounded-lg border border-line bg-canvas px-1.5 py-1 text-[11px] text-ink-900"
                        >
                          <option value="" disabled>{t("contribute.import.selectField")}</option>
                          {taxonomies.objectives.map((o) => (
                            <option key={o.internal_key} value={o.internal_key}>{translateTaxonomyLabel("objective", o.internal_key, o.display_label, locale)}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1.5 text-ink-800">
                          {objectiveDisplayLabel(row.objective)}
                          {objectiveConfidenceBadge(row.rowNumber, rowObjectiveClassifications[idx])}
                          <button type="button" onClick={() => setEditingObjectiveRow(row.rowNumber)} className="text-[11px] font-medium text-primary hover:underline">
                            {t("contribute.import.objectiveChangeControl")}
                          </button>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">{renderFunnelCell(idx)}</td>
                    <td className="px-3 py-2 text-ink-800">{row.country ?? "—"}</td>
                    {showCampaignReviewColumns && (
                      <td className="px-3 py-2 text-ink-800">{row.startDate ?? "—"}{row.endDate ? ` → ${row.endDate}` : ""}</td>
                    )}
                    <td className="px-3 py-2 text-ink-800">{row.adSpend ?? "—"}</td>
                    {showCampaignReviewColumns && <td className="px-3 py-2 text-ink-800">{row.rawMetrics.impressions ?? "—"}</td>}
                    {showCampaignReviewColumns && <td className="px-3 py-2 text-ink-800">{row.rawMetrics.reach ?? "—"}</td>}
                    {showCampaignReviewColumns && <td className="px-3 py-2 text-ink-800">{row.rawMetrics.clicks ?? "—"}</td>}
                    {showCampaignReviewColumns && <td className="px-3 py-2 text-ink-800">{row.rawMetrics.conversions ?? "—"}</td>}
                    {showCampaignReviewColumns && <td className="px-3 py-2 text-ink-800">{row.rawMetrics.attributed_revenue ?? row.rawMetrics.total_revenue ?? "—"}</td>}
                    {showCampaignReviewColumns && <td className="px-3 py-2 text-ink-800">{row.currency}</td>}
                    {showCampaignReviewColumns && <td className="px-3 py-2">{renderResultCell(rowResultResolutions[idx])}</td>}
                    <td className="px-3 py-2">
                      {row.status === "valid" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-pistachio-soft px-2 py-0.5 text-[10px] font-medium text-pistachio"><Check size={10} aria-hidden="true" />{t("contribute.import.statusReady")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-vanilla-soft px-2 py-0.5 text-[10px] font-medium text-vanilla" title={row.issues.map((i) => formatIssue(i, t)).join(" · ")}>
                          <AlertTriangle size={10} aria-hidden="true" />{t("contribute.import.statusReview")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {reviewCount > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contribute.import.reviewQNeedsReview")}</p>
              <div className="mt-2 space-y-1 text-xs text-ink-600">
                {normalizedRows.filter((r) => r.status !== "valid").slice(0, 8).map((row) => (
                  <p key={row.rowNumber}>
                    {t("contribute.import.rowLabel", { n: row.rowNumber })}: {row.issues.map((i) => formatIssue(i, t)).join(" · ")}
                  </p>
                ))}
              </div>
            </>
          )}

          {ignoredMappingCount > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contribute.import.reviewQIgnored")}</p>
              <p className="mt-1 text-xs text-ink-600">{t("contribute.import.ignoredColumnsSummary", { n: ignoredMappingCount })}</p>
            </>
          )}

          {/* PHASE 25 (§9/§10): "you may have already imported this" —
              a separate, explicit banner per suspected row, never an
              auto-reject and never silently merged/overwritten. Each
              row keeps its own Skip toggle so a real coincidence (two
              genuinely different campaigns that happen to share a
              period and spend) can still be imported anyway. */}
          {dupVerdicts.size > 0 && (
            <>
              <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ink-500">{t("contribute.import.duplicateSectionTitle")}</p>
              <div className="mt-2 space-y-2">
                {Array.from(dupVerdicts.entries()).map(([rowNumber, match]) => {
                  const row = normalizedRows.find((r) => r.rowNumber === rowNumber);
                  if (!row) return null;
                  const skipped = skipRows.has(rowNumber);
                  return (
                    <div key={rowNumber} className="rounded-xl border border-caution/40 bg-caution-soft/30 px-3 py-2.5 text-xs">
                      <p className="font-medium text-ink-800">{t("contribute.import.duplicateWarning")}</p>
                      <p className="mt-0.5 text-ink-600">
                        {row.campaignName ?? t("contribute.import.rowLabel", { n: rowNumber })} · {row.platform ?? "—"} · {row.startDate ?? "—"}{row.endDate ? ` → ${row.endDate}` : ""}
                      </p>
                      <p className="mt-0.5 text-[11px] text-ink-500">
                        {match.verdict === "likely_duplicate" ? t("contribute.import.duplicateLikely") : t("contribute.import.duplicatePossible")}
                      </p>
                      <label className="mt-1.5 inline-flex items-center gap-1.5 text-ink-700">
                        <input
                          type="checkbox"
                          checked={skipped}
                          onChange={(e) => {
                            setSkipRows((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(rowNumber); else next.delete(rowNumber);
                              return next;
                            });
                          }}
                        />
                        {skipped ? t("contribute.import.duplicateSkipped") : t("contribute.import.duplicateSkipToggle")}
                      </label>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <button
            onClick={() => setStep("confirm")}
            disabled={effectiveValidCount === 0}
            className="mt-5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {t("contribute.import.continueToConfirm")}
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-800">{t("contribute.import.confirmIntro", { n: effectiveValidCount, file: fileName })}</p>
          {reviewCount > 0 && <p className="mt-2 text-xs text-ink-500">{t("contribute.import.confirmSkipped", { n: reviewCount })}</p>}
          {skipRows.size > 0 && <p className="mt-1 text-xs text-ink-500">{t("contribute.import.confirmSkippedDuplicates", { n: skipRows.size })}</p>}
          <button
            onClick={confirmImport}
            disabled={submitting}
            aria-busy={submitting}
            className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? t("contribute.import.submitting") : t("contribute.import.confirmButton")}
          </button>
        </div>
      )}

      {step === "done" && result && (() => {
        // PHASE 26 (§8): "Compare this campaign" — pre-fills ONLY the
        // dimensions this exact import actually persisted (platform/
        // objective/vertical/country, already resolved to real taxonomy
        // keys by normalizeAndValidateRow), taken from the first
        // successfully-imported row. Never infers audience/funnel/time
        // window, and never appears when no row actually has all four
        // (e.g. every row failed).
        const compareRow = result.imported > 0
          ? normalizedRows.find((r) => r.status === "valid" && r.platform && r.objective && r.vertical && r.country)
          : undefined;
        const compareHref = compareRow
          ? `/benchmark?prefillPlatform=${encodeURIComponent(compareRow.platform!)}&prefillObjective=${encodeURIComponent(compareRow.objective!)}&prefillVertical=${encodeURIComponent(compareRow.vertical!)}&prefillCountry=${encodeURIComponent(compareRow.country!)}`
          : null;
        // PHASE 25 (§13): "Benchmark-ready: CPM — 3, CTR — 2, ..." —
        // reuses the exact same calculateDerivedMetrics-backed coverage
        // helper Phase 26's homepage workspace already uses (lib/
        // contribute/coverage.ts), applied only to the rows that were
        // actually imported this time (valid, and not explicitly
        // skipped as a duplicate) — never a fabricated or re-derived
        // formula just for this screen.
        const importedRows = result.imported > 0
          ? normalizedRows.filter((r) => r.status === "valid" && !skipRows.has(r.rowNumber))
          : [];
        const readyCoverage = computeDataCoverage(
          importedRows.map((r) => ({ id: String(r.rowNumber), raw: { ad_spend: r.adSpend ?? undefined, ...r.rawMetrics } }))
        ).filter((c) => c.campaignCount > 0);
        return (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center">
            <Check size={24} className="mx-auto text-pistachio" aria-hidden="true" />
            <p className="mt-3 font-display text-base font-semibold text-ink-900">{t("contribute.import.doneTitle")}</p>
            <p className="mt-1 text-sm text-ink-600">{t("contribute.import.doneSummary", { imported: result.imported, failed: result.failed })}</p>
            {/* PHASE 28 (§8): a successful import never looks like a
                failure — this note only clarifies that benchmark
                eligibility is a separate, still-pending curator
                decision, never framed as something wrong with the
                import itself. */}
            {result.imported > 0 && (
              <p className="mt-1 text-xs text-ink-500">{t("contribute.import.benchmarkValidationPendingNote")}</p>
            )}
            {readyCoverage.length > 0 && (
              <p className="mt-1 text-xs text-ink-500">
                {t("contribute.import.benchmarkReadySummaryLabel")}: {readyCoverage.map((c) => `${DERIVED_METRIC_LABELS[c.metric]} — ${c.campaignCount}`).join(", ")}
              </p>
            )}
            {/* PHASE 31 item 6: exactly two STRONG next actions after a
                successful import — "Ver mis aportes" (their own
                contributions list, where the "En revisión" status this
                same screen just mentioned is visible) and "Comparar
                benchmark" (this exact campaign's cohort when it's
                resolvable, the same compareHref this screen already
                computed — otherwise the plain /benchmark page). Every
                other pre-existing action (contribute more, back home)
                is kept, never removed, but demoted to a plain text
                link — real navigation still one tap away, without
                competing with the two primary actions. */}
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <a href="/account/contributions" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">{t("contribute.import.ctaViewMyContributions")}</a>
              <a
                href={compareHref ?? "/benchmark"}
                className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
              >
                {compareHref ? t("contribute.import.ctaCompareThisCampaign") : t("contribute.import.ctaViewBenchmarks")}
              </a>
            </div>
            <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
              <button onClick={onBack} className="text-xs font-medium text-ink-500 hover:text-primary hover:underline">{t("contribute.import.ctaContributeMore")}</button>
              <a href="/" className="text-xs font-medium text-ink-500 hover:text-primary hover:underline">{t("contribute.import.ctaHome")}</a>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function SummaryPill({ tone, label }: { tone: "pistachio" | "vanilla"; label: string }) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-medium ${tone === "pistachio" ? "bg-pistachio-soft text-pistachio" : "bg-vanilla-soft text-vanilla"}`}>
      {label}
    </span>
  );
}
