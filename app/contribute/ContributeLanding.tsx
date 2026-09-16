"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Edit3, Upload, FileDown, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import type { ContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { ContributeWizard } from "./ContributeWizard";
import { bulkSubmitContributionsAction } from "./bulk-actions";
import { parseCsv, parseXlsxBuffer, IMPORT_LIMITS } from "@/lib/import/parse";
import { detectMapping, applyMapping, wouldConflict } from "@/lib/import/mapping";
import { normalizeAndValidateRow, detectDuplicates } from "@/lib/import/validate";
import { generateCsvTemplate, generateXlsxTemplate } from "@/lib/import/template";
import { REQUIRED_FIELDS, OPTIONAL_FIELDS, type CanonicalField, type DetectedMapping, type NormalizedRow, type RawTable } from "@/lib/import/types";

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
};

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
      <div className="md:pl-56">
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

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <button onClick={onQuick} className="group rounded-2xl border border-line bg-surface p-5 text-left shadow-sm transition-colors hover:border-primary/40">
          <Edit3 size={20} className="text-brandLavender" aria-hidden="true" />
          <p className="mt-3 font-display text-sm font-semibold text-ink-900">{t("contribute.pathQuickTitle")}</p>
          <p className="mt-1 text-xs text-ink-600">{t("contribute.pathQuickBody")}</p>
        </button>
        <button onClick={onUpload} className="group rounded-2xl border border-line bg-surface p-5 text-left shadow-sm transition-colors hover:border-primary/40">
          <Upload size={20} className="text-brandMint" aria-hidden="true" />
          <p className="mt-3 font-display text-sm font-semibold text-ink-900">{t("contribute.pathUploadTitle")}</p>
          <p className="mt-1 text-xs text-ink-600">{t("contribute.pathUploadBody")}</p>
        </button>
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <FileDown size={20} className="text-brandPeach" aria-hidden="true" />
          <p className="mt-3 font-display text-sm font-semibold text-ink-900">{t("contribute.pathTemplateTitle")}</p>
          <p className="mt-1 text-xs text-ink-600">{t("contribute.pathTemplateBody")}</p>
          <div className="mt-3 flex gap-2">
            <button onClick={downloadCsv} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary">CSV</button>
            <button onClick={downloadXlsx} className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary">XLSX</button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-dashed border-line bg-surface2/40 px-4 py-3">
        <p className="text-xs text-ink-600">{t("media.importMetricsFromContributeNote")}</p>
        <Link href="/contribute/public-metrics" className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          {t("media.importMetricsCta")}
        </Link>
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
    setTable(result.table);
    setMappings(detectMapping(result.table));
    setStep("columns");
  }, [t]);

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

  function runValidation() {
    if (!table) return;
    const mapped = applyMapping(table, mappings);
    const normalized = mapped.map((row, i) => normalizeAndValidateRow(i + 2, row, taxonomies)); // +2: row 1 is the header
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
      )}

      {step === "columns" && table && (
        <div>
          <p className="text-sm text-ink-700">{t("contribute.import.mappingIntro", { file: fileName, count: table.rows.length })}</p>
          <div className="mt-4 space-y-2">
            {mappings.map((m) => {
              const conflict = m.state === "mapped" && m.canonicalField ? wouldConflict(mappings, m.sourceColumnIndex, m.canonicalField) : false;
              return (
                <div key={m.sourceColumnIndex} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
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
                  {m.state === "needs_review" && <span className="text-[11px] text-vanilla">{t("contribute.import.needsReview")}</span>}
                </div>
              );
            })}
          </div>
          <button onClick={runValidation} className="mt-5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
            {t("contribute.import.continueToReview")}
          </button>
        </div>
      )}

      {step === "review" && (
        <div>
          <div className="flex flex-wrap gap-3">
            <SummaryPill tone="pistachio" label={t("contribute.import.readyCount", { n: validCount })} />
            <SummaryPill tone="vanilla" label={t("contribute.import.reviewCount", { n: reviewCount })} />
          </div>

          <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead className="sticky top-0 bg-surface2 text-ink-500">
                <tr>
                  <th scope="col" className="px-3 py-2">{t("contribute.import.colRow")}</th>
                  <th scope="col" className="px-3 py-2">{t("contribute.field.platform")}</th>
                  <th scope="col" className="px-3 py-2">{t("contribute.field.objective")}</th>
                  <th scope="col" className="px-3 py-2">{t("contribute.field.country")}</th>
                  <th scope="col" className="px-3 py-2">{t("contribute.field.adSpend")}</th>
                  <th scope="col" className="px-3 py-2">{t("contribute.import.colStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {normalizedRows.map((row) => (
                  <tr key={row.rowNumber} className="border-t border-line">
                    <td className="px-3 py-2 text-ink-500">{row.rowNumber}</td>
                    <td className="px-3 py-2 text-ink-800">{row.platform ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-800">{row.objective ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-800">{row.country ?? "—"}</td>
                    <td className="px-3 py-2 text-ink-800">{row.adSpend ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.status === "valid" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-pistachio-soft px-2 py-0.5 text-[10px] font-medium text-pistachio"><Check size={10} aria-hidden="true" />{t("contribute.import.statusReady")}</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-vanilla-soft px-2 py-0.5 text-[10px] font-medium text-vanilla" title={row.issues.map((i) => t(i.messageKey, i.messageVars)).join(" · ")}>
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
            <div className="mt-3 space-y-1 text-xs text-ink-600">
              {normalizedRows.filter((r) => r.status !== "valid").slice(0, 8).map((row) => (
                <p key={row.rowNumber}>
                  {t("contribute.import.rowLabel", { n: row.rowNumber })}: {row.issues.map((i) => t(i.messageKey, i.messageVars)).join(" · ")}
                </p>
              ))}
            </div>
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
