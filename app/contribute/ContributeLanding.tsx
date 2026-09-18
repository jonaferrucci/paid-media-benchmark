"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Edit3, Upload, FileDown, BarChart3, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import type { ContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { ContributeWizard } from "./ContributeWizard";
import { bulkSubmitContributionsAction } from "./bulk-actions";
import { parseCsv, parseXlsxBuffer, IMPORT_LIMITS } from "@/lib/import/parse";
import { detectMapping, applyMapping, wouldConflict, normalizeHeader, ignoredReasonForHeader, excludeAggregateTotalRows } from "@/lib/import/mapping";
import { normalizeAndValidateRow, detectDuplicates } from "@/lib/import/validate";
import { generateCsvTemplate, generateXlsxTemplate } from "@/lib/import/template";
import { REQUIRED_FIELDS, OPTIONAL_FIELDS, type CanonicalField, type DetectedMapping, type NormalizedRow, type RawTable, type RowIssue } from "@/lib/import/types";
import { detectExportPlatform, findAdPlatformProfile, AD_PLATFORM_PROFILES, resolveMetaResultForRow, detectReportCurrency, classifyExportProfile, type PlatformDetectionResult, type AdPlatformId, type RowResultResolution, type CurrencyDetectionResult } from "@/lib/import/platformExports";
import { suggestObjectiveFromCampaignNames } from "@/lib/import/suggestions";

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
  const { t } = useTranslation();
  const { user, loading: userLoading } = useSupabaseUser();
  const [searchOpen, setSearchOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("landing");

  // Quick entry delegates entirely to the existing, unmodified,
  // already-shelled wizard — no shell duplication.
  if (mode === "quick") return <ContributeWizard taxonomies={taxonomies} />;

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-4xl px-4 py-6 md:px-8">
          {mode === "landing" && (
            <LandingChooser
              t={t}
              userLoading={userLoading}
              signedIn={!!user}
              onQuick={() => setMode("quick")}
              onUpload={() => setMode("upload")}
            />
          )}
          {mode === "upload" && (
            <UploadFlow t={t} taxonomies={taxonomies} onBack={() => setMode("landing")} />
          )}
        </main>
      </div>
    </div>
  );
}

function LandingChooser({
  t, userLoading, signedIn, onQuick, onUpload,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
  userLoading: boolean;
  signedIn: boolean;
  onQuick: () => void;
  onUpload: () => void;
}) {
  function downloadCsv() {
    const blob = new Blob([generateCsvTemplate()], { type: "text/csv;charset=utf-8" });
    triggerDownload(blob, "cucurucho-plantilla.csv");
  }
  function downloadXlsx() {
    const blob = new Blob([generateXlsxTemplate()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
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
          {AD_PLATFORM_PROFILES.map((p) => (
            <span key={p.id} className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-[11px] font-medium text-ink-600">
              {p.displayLabel}
            </span>
          ))}
        </div>
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

      {/* Template download is now an explicit fallback, not a fifth
          competing card. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line bg-surface2/40 px-4 py-3 text-xs text-ink-600">
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
  t, taxonomies, onBack,
}: {
  t: (key: string, vars?: Record<string, string | number>) => string;
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
  // §D/§G: a report-level date range recovered from skipped preamble
  // lines (e.g. Google's own "18 de septiembre de 2026 - ..." line) —
  // null for any file with no such preamble (every existing shape).
  const [reportDateRange, setReportDateRange] = useState<{ start: string; end: string } | null>(null);
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

    // POST-MVP IMPORT FIX 3 (§A/§P): the file-level "Contexto del
    // reporte" — Objective/Vertical/Country (plus the optional business
    // model/audience strategy/funnel stage) selected ONCE and applied to
    // every row that doesn't already carry its own value from a mapped
    // column. Exactly the same optional-injection pattern already used
    // for platform/currency above — no new mechanism, and a row with a
    // real per-row value is never overwritten (§P: "if some rows already
    // have a safe value, don't overwrite it unnecessarily").
    const contextValues: Partial<Record<CanonicalField, string>> = {};
    if (contextObjective) contextValues.objective = contextObjective;
    if (contextVertical) contextValues.vertical = contextVertical;
    if (contextCountry) contextValues.country = contextCountry;
    if (contextBusinessModel) contextValues.business_model = contextBusinessModel;
    if (contextAudienceStrategy) contextValues.audience_strategy = contextAudienceStrategy;
    if (contextFunnelStage) contextValues.funnel_stage = contextFunnelStage;
    const contextEntries = Object.entries(contextValues) as [CanonicalField, string][];
    const rowsWithContext = contextEntries.length > 0
      ? rowsWithDates.map((row) => {
          const merged = { ...row };
          for (const [field, value] of contextEntries) {
            if (!merged[field]) merged[field] = value;
          }
          return merged;
        })
      : rowsWithDates;

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

    setNormalizedRows(detectDuplicates(normalized));
    setStep("review");
  }

  async function confirmImport() {
    setSubmitting(true);
    const res = await bulkSubmitContributionsAction(normalizedRows, sourceType);
    setSubmitting(false);
    setResult({ imported: res.imported, failed: res.failed });
    setStep("done");
  }

  const validCount = normalizedRows.filter((r) => r.status === "valid").length;
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
    ? taxonomies.objectives.find((o) => o.internal_key === objectiveSuggestion.internalKey)?.display_label ?? objectiveSuggestion.internalKey
    : null;

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
        <ol className="mb-6 flex items-center gap-2 text-xs text-ink-500" aria-label={t("contribute.import.stepperLabel")}>
          {STEP_LABELS.map((s, i) => (
            <li key={s.key} className={`flex items-center gap-2 ${step === s.key ? "font-semibold text-primary" : ""}`} aria-current={step === s.key ? "step" : undefined}>
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${step === s.key ? "bg-primary text-white" : "bg-surface2 text-ink-500"}`}>{i + 1}</span>
              {t(s.labelKey)}
              {i < STEP_LABELS.length - 1 && <span aria-hidden="true" className="mx-1 text-ink-300">›</span>}
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
                    <option key={o.internal_key} value={o.internal_key}>{o.display_label}</option>
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
                    <option key={v.internal_key} value={v.internal_key}>{v.display_label}</option>
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
                    <option key={c.iso_code} value={c.iso_code}>{c.display_label}</option>
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
                    <option key={b.internal_key} value={b.internal_key}>{b.display_label}</option>
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
                    <option key={a.internal_key} value={a.internal_key}>{a.display_label}</option>
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
                    <option key={f.internal_key} value={f.internal_key}>{f.display_label}</option>
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

          {/* §3/§13: campaign identity is shown for review, but never
              persisted — the schema has no name/title column and this
              fix creates no migration to add one. Told plainly here
              rather than silently dropped from the review experience. */}
          {hasCampaignNames && (
            <p className="mt-2 rounded-lg border border-dashed border-line bg-surface2/40 px-3 py-2 text-[11px] text-ink-500">
              {t("contribute.import.campaignNameNotPersisted")}
            </p>
          )}

          <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-line">
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
                    <td className="px-3 py-2 text-ink-800">{row.objective ?? "—"}</td>
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

          <button
            onClick={() => setStep("confirm")}
            disabled={validCount === 0}
            className="mt-5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {t("contribute.import.continueToConfirm")}
          </button>
        </div>
      )}

      {step === "confirm" && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <p className="text-sm text-ink-800">{t("contribute.import.confirmIntro", { n: validCount, file: fileName })}</p>
          {reviewCount > 0 && <p className="mt-2 text-xs text-ink-500">{t("contribute.import.confirmSkipped", { n: reviewCount })}</p>}
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

      {step === "done" && result && (
        <div className="rounded-2xl border border-line bg-surface p-6 text-center">
          <Check size={24} className="mx-auto text-pistachio" aria-hidden="true" />
          <p className="mt-3 font-display text-base font-semibold text-ink-900">{t("contribute.import.doneTitle")}</p>
          <p className="mt-1 text-sm text-ink-600">{t("contribute.import.doneSummary", { imported: result.imported, failed: result.failed })}</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <a href="/benchmark" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">{t("contribute.import.ctaViewBenchmarks")}</a>
            <button onClick={onBack} className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink-700 hover:bg-surface2">{t("contribute.import.ctaContributeMore")}</button>
            <a href="/" className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink-700 hover:bg-surface2">{t("contribute.import.ctaHome")}</a>
          </div>
        </div>
      )}
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
