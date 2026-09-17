"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { Upload, ArrowLeft, Check, AlertTriangle, FileDown, Database } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { parseCsv, parseXlsxBuffer, IMPORT_LIMITS } from "@/lib/import/parse";
import {
  detectCatalogMapping,
  applyCatalogMapping,
  validateCatalogRow,
  markCatalogDuplicates,
  type CatalogColumnMapping,
  type ValidatedCatalogRow,
  type CatalogField,
} from "@/lib/media/importCatalog";
import { generateCatalogCsvTemplate, generateCatalogXlsxTemplate } from "@/lib/media/catalogTemplate";
import { bulkSubmitCatalogAction } from "@/lib/media/catalogImportActions";
import type { RawTable } from "@/lib/import/types";

// Phase 21 items 13/15/17/18 — same Archivo → Columnas → Revisar →
// Confirmar shape as app/contribute/rate-cards/RateCardImportFlow.tsx
// (never a second, differently-shaped import UI). The one structural
// difference: this flow is reachable only from /curation (item 16 —
// catalog mutation is curator-only), never from /contribute.

type Step = "file" | "columns" | "review" | "confirm" | "done";

const CATALOG_FIELDS: CatalogField[] = ["media_outlet", "display_name", "country", "media_category", "status", "website_domain"];
const FIELD_LABEL_KEYS: Record<CatalogField, string> = {
  media_outlet: "curation.catalogImport.field.mediaOutlet",
  display_name: "curation.catalogImport.field.displayName",
  country: "media.countryLabel",
  media_category: "curation.catalogImport.field.mediaCategory",
  status: "curation.catalogImport.field.status",
  website_domain: "curation.catalogImport.field.websiteDomain",
};

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

export function CatalogImportFlow({
  knownCategories,
  knownCountries,
  knownPlatforms,
}: {
  knownCategories: { internal_key: string; display_label: string }[];
  knownCountries: { iso_code: string; display_label: string }[];
  knownPlatforms: { internal_key: string; display_label: string }[];
}) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [step, setStep] = useState<Step>("file");
  const [fileName, setFileName] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [table, setTable] = useState<RawTable | null>(null);
  const [mappings, setMappings] = useState<CatalogColumnMapping[]>([]);
  const [validatedRows, setValidatedRows] = useState<ValidatedCatalogRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ created: number; skippedExisting: number; failed: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const categoryByKey = new Map(knownCategories.map((c) => [c.internal_key, c]));

  const handleFile = useCallback(
    async (file: File) => {
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
      const parsed = isCsv ? parseCsv(await file.text()) : parseXlsxBuffer(await file.arrayBuffer());
      if (!parsed.ok) {
        setFileError(t(`contribute.import.error.${parsed.errorKey}`));
        return;
      }
      setFileName(file.name);
      setTable(parsed.table);
      setMappings(detectCatalogMapping(parsed.table));
      setStep("columns");
    },
    [t]
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function updateMapping(columnIndex: number, field: CatalogField | "ignore") {
    setMappings((prev) => prev.map((m) => (m.sourceColumnIndex === columnIndex ? { ...m, field: field === "ignore" ? null : field } : m)));
  }

  function runValidation() {
    if (!table) return;
    const rawRows = applyCatalogMapping(table, mappings);
    const validated = rawRows.map((row) => validateCatalogRow(row, knownCategories, knownCountries, knownPlatforms));
    setValidatedRows(markCatalogDuplicates(validated));
    setStep("review");
  }

  async function confirmImport() {
    setSubmitting(true);
    const payload = validatedRows
      .filter((r) => r.status_ === "valid")
      .map((r) => ({
        slug: r.slug!,
        displayName: r.displayName,
        countryIso: r.countryIso!,
        mediaCategoryKey: r.mediaCategoryKey!,
        status: r.status!,
        websiteDomain: r.websiteDomain,
      }));
    const res = await bulkSubmitCatalogAction(payload);
    setSubmitting(false);
    setResult({ created: res.created, skippedExisting: res.skippedExisting, failed: res.failed });
    setStep("done");
  }

  const validCount = validatedRows.filter((r) => r.status_ === "valid").length;
  const existingCount = validatedRows.filter((r) => r.status_ === "existing").length;
  const reviewCount = validatedRows.filter((r) => r.status_ === "needs_review" || r.status_ === "duplicate").length;

  const STEP_LABELS: { key: Step; labelKey: string }[] = [
    { key: "file", labelKey: "contribute.import.step.file" },
    { key: "columns", labelKey: "contribute.import.step.columns" },
    { key: "review", labelKey: "contribute.import.step.review" },
    { key: "confirm", labelKey: "contribute.import.step.confirm" },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-4xl px-4 py-6 md:px-8">
          <Link href="/curation" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-primary">
            <ArrowLeft size={13} aria-hidden="true" /> {t("curation.catalogImport.backToCuration")}
          </Link>

          <div className="flex items-center gap-2">
            <Database size={18} className="text-brandLavender" aria-hidden="true" />
            <h1 className="font-display text-xl font-semibold text-ink-900">{t("curation.catalogImport.title")}</h1>
          </div>
          <p className="mt-1 text-sm text-ink-600">{t("curation.catalogImport.subtitle")}</p>
          <p className="mt-1 text-xs text-ink-400">{t("curation.catalogImport.note")}</p>

          {step === "file" && (
            <div className="mt-3">
              <button
                onClick={() => triggerDownload(new Blob([generateCatalogCsvTemplate()], { type: "text/csv" }), "cucurucho-catalogo.csv")}
                className="mr-2 inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary"
              >
                <FileDown size={12} aria-hidden="true" /> CSV
              </button>
              <button
                onClick={() =>
                  triggerDownload(
                    new Blob([generateCatalogXlsxTemplate()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
                    "cucurucho-catalogo.xlsx"
                  )
                }
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary"
              >
                <FileDown size={12} aria-hidden="true" /> XLSX
              </button>
            </div>
          )}

          {step !== "done" && (
            <ol className="my-6 flex items-center gap-2 text-xs text-ink-500" aria-label={t("contribute.import.stepperLabel")}>
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
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
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
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
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
                {mappings.map((m) => (
                  <div key={m.sourceColumnIndex} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                    <span className="min-w-[140px] truncate text-sm font-medium text-ink-900">{m.sourceHeader}</span>
                    <span aria-hidden="true" className="text-ink-400">→</span>
                    <label className="sr-only" htmlFor={`map-${m.sourceColumnIndex}`}>{t("contribute.import.mapToLabel", { column: m.sourceHeader })}</label>
                    <select
                      id={`map-${m.sourceColumnIndex}`}
                      value={m.field ?? "ignore"}
                      onChange={(e) => updateMapping(m.sourceColumnIndex, e.target.value === "ignore" ? "ignore" : (e.target.value as CatalogField))}
                      className="rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-ink-900"
                    >
                      <option value="ignore">{t("contribute.import.ignoreColumn")}</option>
                      {CATALOG_FIELDS.map((f) => (
                        <option key={f} value={f}>{t(FIELD_LABEL_KEYS[f])}</option>
                      ))}
                    </select>
                    {m.field && <Check size={14} className="text-pistachio" aria-hidden="true" />}
                  </div>
                ))}
              </div>
              <button onClick={runValidation} className="mt-5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                {t("contribute.import.continueToReview")}
              </button>
            </div>
          )}

          {step === "review" && (
            <div>
              <div className="flex flex-wrap gap-3">
                <span className="rounded-full bg-pistachio-soft px-3 py-1 text-xs font-medium text-pistachio">{t("contribute.import.readyCount", { n: validCount })}</span>
                <span className="rounded-full bg-surface2 px-3 py-1 text-xs font-medium text-ink-600">{t("curation.catalogImport.existingCount", { n: existingCount })}</span>
                <span className="rounded-full bg-vanilla-soft px-3 py-1 text-xs font-medium text-vanilla">{t("contribute.import.reviewCount", { n: reviewCount })}</span>
              </div>
              <div className="mt-4 max-h-96 overflow-y-auto overflow-x-auto rounded-xl border border-line">
                <table className="w-full min-w-[560px] text-left text-xs">
                  <thead className="sticky top-0 bg-surface2 text-ink-500">
                    <tr>
                      <th scope="col" className="px-3 py-2">{t("contribute.import.colRow")}</th>
                      <th scope="col" className="px-3 py-2">{t("curation.catalogImport.field.displayName")}</th>
                      <th scope="col" className="px-3 py-2">{t("curation.catalogImport.field.mediaCategory")}</th>
                      <th scope="col" className="px-3 py-2">{t("media.countryLabel")}</th>
                      <th scope="col" className="px-3 py-2">{t("contribute.import.colStatus")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validatedRows.slice(0, 200).map((row) => (
                      <tr key={row.rowNumber} className="border-t border-line">
                        <td className="px-3 py-2 text-ink-500">{row.rowNumber}</td>
                        <td className="px-3 py-2 text-ink-800">{row.displayName || "—"}</td>
                        <td className="px-3 py-2 text-ink-800">{row.mediaCategoryKey ? categoryByKey.get(row.mediaCategoryKey)?.display_label : "—"}</td>
                        <td className="px-3 py-2 text-ink-800">{row.countryIso ?? "—"}</td>
                        <td className="px-3 py-2">
                          {row.status_ === "valid" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-pistachio-soft px-2 py-0.5 text-[10px] font-medium text-pistachio">
                              <Check size={10} aria-hidden="true" />
                              {t("contribute.import.statusReady")}
                            </span>
                          ) : row.status_ === "existing" ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-ink-600">
                              {t("curation.catalogImport.statusExisting")}
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-vanilla-soft px-2 py-0.5 text-[10px] font-medium text-vanilla"
                              title={row.status_ === "duplicate" ? t("curation.catalogImport.statusDuplicate") : row.errors.map((e) => t(e)).join(" · ")}
                            >
                              <AlertTriangle size={10} aria-hidden="true" />
                              {t("contribute.import.statusReview")}
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
                  {validatedRows
                    .filter((r) => r.status_ === "needs_review" || r.status_ === "duplicate")
                    .slice(0, 8)
                    .map((row) => (
                      <p key={row.rowNumber}>
                        {t("contribute.import.rowLabel", { n: row.rowNumber })}:{" "}
                        {row.status_ === "duplicate" ? t("curation.catalogImport.statusDuplicate") : row.errors.map((e) => t(e)).join(" · ")}
                      </p>
                    ))}
                </div>
              )}
              <button onClick={() => setStep("confirm")} disabled={validCount === 0} className="mt-5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40">
                {t("contribute.import.continueToConfirm")}
              </button>
            </div>
          )}

          {step === "confirm" && (
            <div className="rounded-2xl border border-line bg-surface p-5">
              <p className="text-sm text-ink-800">{t("curation.catalogImport.confirmIntro", { n: validCount })}</p>
              <p className="mt-1 text-xs text-ink-500">{t("curation.catalogImport.note")}</p>
              <button onClick={confirmImport} disabled={submitting} aria-busy={submitting} className="mt-4 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-60">
                {submitting ? t("contribute.import.submitting") : t("contribute.import.confirmButton")}
              </button>
            </div>
          )}

          {step === "done" && result && (
            <div className="rounded-2xl border border-line bg-surface p-6 text-center">
              <Check size={24} className="mx-auto text-pistachio" aria-hidden="true" />
              <p className="mt-3 font-display text-base font-semibold text-ink-900">{t("contribute.import.doneTitle")}</p>
              <p className="mt-1 text-sm text-ink-600">{t("curation.catalogImport.doneSummary", { created: result.created, skipped: result.skippedExisting, failed: result.failed })}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Link href="/platforms" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">{t("media.backToCatalog")}</Link>
                <Link href="/curation" className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink-700 hover:bg-surface2">{t("curation.catalogImport.backToCuration")}</Link>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
