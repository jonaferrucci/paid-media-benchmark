"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ShieldAlert, Info } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { ContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { runBenchmarkQuery, type BenchmarkFormInput, type BenchmarkResponse } from "./actions";
import { Select } from "./Select";
import type { RelaxableDimension } from "@/lib/benchmark/cohortRules";
import { formatMetricValue } from "@/lib/comparison/classify";
import { ComparisonDetail } from "./ComparisonDetail";
import { CampaignExplorer } from "./CampaignExplorer";
import { SaveComparisonButton } from "@/app/comparisons/SaveComparisonButton";
import { getSavedComparisonAction, type SavedComparison } from "@/app/comparisons/actions";

const PRIMARY_METRICS = ["cpm", "ctr", "cpc", "reach", "frequency", "cpv"];

interface Draft {
  metric: string;
  platform: string;
  objective: string;
  vertical: string;
  country: string;
  audienceStrategy: string;
  funnelStage: string;
  businessModel: string;
  spendBand: string;
  durationBand: string;
  timeWindow: string;
}

const DEFAULT_DRAFT: Draft = {
  metric: "cpm",
  platform: "",
  objective: "",
  vertical: "",
  country: "",
  audienceStrategy: "",
  funnelStage: "",
  businessModel: "",
  spendBand: "",
  durationBand: "",
  timeWindow: "last_12_months",
};

export function BenchmarkExplorer({ taxonomies }: { taxonomies: ContributionTaxonomies }) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"single" | "campaign">("single");
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<BenchmarkResponse | null>(null);
  const [relaxed, setRelaxed] = useState<RelaxableDimension[]>([]);
  const [initialUserValue, setInitialUserValue] = useState<number | null>(null);
  const [campaignInit, setCampaignInit] = useState<SavedComparison | null>(null);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [reopenLoading, setReopenLoading] = useState(false);

  // Phase 14 reopen flow: /benchmark?saved=<id>. Explicit, robust,
  // handles missing/deleted/other-owner cases with a user-facing
  // message (getSavedComparisonAction already returns null for all of
  // those — RLS makes another user's row simply not exist from this
  // session's point of view, no distinction needed or leaked).
  useEffect(() => {
    const savedId = searchParams.get("saved");
    if (!savedId) return;

    let cancelled = false;
    setReopenLoading(true);
    getSavedComparisonAction(savedId).then((saved) => {
      if (cancelled) return;
      setReopenLoading(false);
      if (!saved) {
        setReopenError(t("comparisons.reopenNotFound"));
        return;
      }
      if (saved.comparisonType === "campaign") {
        setMode("campaign");
        setCampaignInit(saved);
        return;
      }
      const restoredDraft: Draft = {
        metric: saved.metric ?? DEFAULT_DRAFT.metric,
        platform: saved.platform,
        objective: saved.objective,
        vertical: saved.vertical,
        country: saved.country,
        audienceStrategy: saved.audienceStrategy ?? "",
        funnelStage: saved.funnelStage ?? "",
        businessModel: saved.businessModel ?? "",
        spendBand: saved.spendBand ?? "",
        durationBand: saved.durationBand ?? "",
        timeWindow: saved.timeWindow ?? DEFAULT_DRAFT.timeWindow,
      };
      setMode("single");
      setDraft(restoredDraft);
      setInitialUserValue(saved.userValue);
      handleSubmit(undefined, restoredDraft);
    });

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setResponse(null);
    setRelaxed([]);
  }

  const isReach = draft.metric === "reach";
  const canSubmit = draft.platform && draft.objective && draft.vertical && draft.country;

  async function handleSubmit(overrideRelaxed?: RelaxableDimension[], overrideDraft?: Draft) {
    const effectiveDraft = overrideDraft ?? draft;
    const effectiveCanSubmit =
      effectiveDraft.platform && effectiveDraft.objective && effectiveDraft.vertical && effectiveDraft.country;
    if (!effectiveCanSubmit) return;
    setLoading(true);
    const activeRelaxed = overrideRelaxed ?? relaxed;

    const input: BenchmarkFormInput = {
      metric: effectiveDraft.metric,
      platform: effectiveDraft.platform,
      objective: effectiveDraft.objective,
      vertical: effectiveDraft.vertical,
      country: effectiveDraft.country,
      audienceStrategy: effectiveDraft.audienceStrategy || null,
      funnelStage: effectiveDraft.funnelStage || null,
      businessModel: effectiveDraft.businessModel || null,
      spendBand: effectiveDraft.spendBand || null,
      durationBand: effectiveDraft.durationBand || null,
      timeWindow: effectiveDraft.timeWindow,
      relaxedDimensions: activeRelaxed,
    };

    try {
      const result = await runBenchmarkQuery(input);
      setResponse(result);
    } catch {
      // Defensive second layer: the server action itself already
      // catches engine failures (see actions.ts), but a transport-level
      // failure calling the action could still throw here. Never show
      // the raw error — same generic "error" status either way.
      setResponse({
        metric: effectiveDraft.metric,
        value: null,
        unit: "count",
        benchmarkDirection: "contextual",
        statistics: { p25: null, median: null, p75: null, mean: null },
        sampleSize: 0,
        cohortSampleSize: 0,
        cohort: { requested: {}, applied: {}, relaxed: [] },
        status: "error",
        message: "generic_error",
      });
    } finally {
      setLoading(false);
    }
  }

  function applyRelaxationSuggestion() {
    if (!response?.relaxationSuggestion) return;
    const nextRelaxed = [...relaxed, response.relaxationSuggestion.dimension];
    setRelaxed(nextRelaxed);
    handleSubmit(nextRelaxed);
  }

  const platformLabel = (key: string) => taxonomies.platforms.find((p) => p.internal_key === key)?.display_label ?? key;
  const objectiveLabel = (key: string) => taxonomies.objectives.find((o) => o.internal_key === key)?.display_label ?? key;
  const verticalLabel = (key: string) => taxonomies.verticals.find((v) => v.internal_key === key)?.display_label ?? key;
  const countryLabel = (key: string) => taxonomies.countries.find((c) => c.iso_code === key)?.display_label ?? key;

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-56">
        <main className={`mx-auto space-y-6 px-4 py-8 md:px-8 ${response && mode === "single" ? "max-w-[1400px]" : "max-w-2xl"}`}>
          <div>
            <h1 className="font-display text-xl font-semibold text-ink-900">{t("benchmarkLive.title")}</h1>
            <p className="mt-1 text-sm text-ink-600">{t("benchmarkLive.subtitle")}</p>
          </div>

          <div className="flex gap-2 rounded-full bg-surface2 p-1">
            <button
              onClick={() => setMode("single")}
              className={`flex-1 rounded-full px-2 py-2 text-sm font-medium transition-colors ${mode === "single" ? "bg-surface text-ink-900 shadow-sm" : "text-ink-600"}`}
            >
              {t("benchmarkLive.modeSingle")}
            </button>
            <button
              onClick={() => setMode("campaign")}
              className={`flex-1 rounded-full px-2 py-2 text-sm font-medium transition-colors ${mode === "campaign" ? "bg-surface text-ink-900 shadow-sm" : "text-ink-600"}`}
            >
              {t("benchmarkLive.modeCampaign")}
            </button>
          </div>

          {reopenLoading && (
            <p className="mb-4 text-center text-xs text-ink-500">{t("comparisons.reopenLoading")}</p>
          )}
          {reopenError && (
            <div className="mb-4 rounded-2xl border border-caution/30 bg-caution-soft p-4 text-center">
              <p className="text-sm text-ink-800">{reopenError}</p>
            </div>
          )}

          {mode === "campaign" ? (
            <CampaignExplorer taxonomies={taxonomies} initialSaved={campaignInit} />
          ) : (
            <>
          <div className={response ? "lg:flex lg:items-start lg:gap-8" : ""}>
          <section className="rounded-2xl border border-line bg-surface p-6 shadow-sm lg:w-[380px] lg:shrink-0">
            {/* Section 1 — "¿Qué querés comparar?" (Metric + Platform) */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("benchmarkLive.section1Title")}</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Select
                  label={t("benchmarkLive.metric")}
                  value={draft.metric}
                  onChange={(v) => update("metric", v)}
                  options={PRIMARY_METRICS.map((m) => ({ value: m, label: m.toUpperCase() }))}
                />
                <Select
                  label={t("contribute.platform")}
                  value={draft.platform}
                  onChange={(v) => update("platform", v)}
                  allowEmpty
                  required
                  options={taxonomies.platforms.map((p) => ({ value: p.internal_key, label: p.display_label }))}
                />
              </div>
            </div>

            {/* Section 2 — "Mercado" (Objective + Vertical + Country) */}
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("benchmarkLive.section2Title")}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Select
                  label={t("contribute.objective")}
                  value={draft.objective}
                  onChange={(v) => update("objective", v)}
                  allowEmpty
                  required
                  options={taxonomies.objectives.map((o) => ({ value: o.internal_key, label: o.display_label }))}
                />
                <Select
                  label={t("contribute.vertical")}
                  value={draft.vertical}
                  onChange={(v) => update("vertical", v)}
                  allowEmpty
                  required
                  options={taxonomies.verticals.map((v) => ({ value: v.internal_key, label: v.display_label }))}
                />
                <Select
                  label={t("contribute.country")}
                  value={draft.country}
                  onChange={(v) => update("country", v)}
                  allowEmpty
                  required
                  options={taxonomies.countries.map((c) => ({ value: c.iso_code, label: c.display_label }))}
                />
              </div>
            </div>

            {/* Section 3 — "Refinar comparación" (collapsible, secondary controls).
                Native <details> — free keyboard/a11y support, no extra state.
                Reach's Spend Range/Duration Band stay visually emphasized and
                marked required exactly as before; nothing about which fields
                are methodologically required has changed. */}
            <details className="mt-6 border-t border-line pt-5" open={isReach}>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-ink-500 hover:text-primary">
                {t("benchmarkLive.section3Title")}
              </summary>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Select
                  label={t("contribute.audienceStrategy")}
                  value={draft.audienceStrategy}
                  onChange={(v) => update("audienceStrategy", v)}
                  allowEmpty
                  options={taxonomies.audienceStrategies.map((a) => ({ value: a.internal_key, label: a.display_label }))}
                />
                <Select
                  label={t("contribute.funnelStage")}
                  value={draft.funnelStage}
                  onChange={(v) => update("funnelStage", v)}
                  allowEmpty
                  options={taxonomies.funnelStages.map((f) => ({ value: f.internal_key, label: f.display_label }))}
                />
                <Select
                  label={t("contribute.businessModel")}
                  value={draft.businessModel}
                  onChange={(v) => update("businessModel", v)}
                  allowEmpty
                  options={taxonomies.businessModels.map((b) => ({ value: b.internal_key, label: b.display_label }))}
                />
              </div>

              {/* Spend Range / Duration Band — visually emphasized/required for Reach, optional for everything else (Phase 5 item 5) */}
              <div className={`mt-3 grid grid-cols-2 gap-3 rounded-xl p-3 ${isReach ? "border-2 border-coral/50 bg-coral-soft/40" : ""}`}>
                {isReach && (
                  <p className="col-span-2 text-xs font-medium text-coral">{t("benchmarkLive.reachScaleRequired")}</p>
                )}
                <Select
                  label={t("finder.spendRange")}
                  value={draft.spendBand}
                  onChange={(v) => update("spendBand", v)}
                  allowEmpty
                  required={isReach}
                  options={[
                    { value: "under_500", label: "< USD 500" },
                    { value: "500_2000", label: "USD 500-2,000" },
                    { value: "2000_10000", label: "USD 2,000-10,000" },
                    { value: "10000_50000", label: "USD 10,000-50,000" },
                    { value: "50000_100000", label: "USD 50,000-100,000" },
                    { value: "100000_plus", label: "USD 100,000+" },
                  ]}
                />
                <Select
                  label={t("finder.duration")}
                  value={draft.durationBand}
                  onChange={(v) => update("durationBand", v)}
                  allowEmpty
                  required={isReach}
                  options={[
                    { value: "1_7", label: "1-7" },
                    { value: "8_14", label: "8-14" },
                    { value: "15_30", label: "15-30" },
                    { value: "31_60", label: "31-60" },
                    { value: "61_90", label: "61-90" },
                    { value: "91_180", label: "91-180" },
                    { value: "181_365", label: "181-365" },
                    { value: "365_plus", label: "365+" },
                  ]}
                />
              </div>
            </details>

            <button
              onClick={() => handleSubmit()}
              disabled={!canSubmit || loading}
              aria-busy={loading}
              className="mt-6 w-full rounded-full bg-brandGradient py-3 text-sm font-semibold text-[#23232B] transition-all hover:opacity-90 disabled:opacity-40 motion-safe:active:scale-[0.99]"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#23232B]/30 border-t-[#23232B]" aria-hidden="true" />
                  {t("benchmarkLive.loading")}
                </span>
              ) : (
                t("benchmarkLive.getBenchmark")
              )}
            </button>
          </section>

          {response && (
            <div className="mt-6 min-w-0 space-y-6 lg:mt-0 lg:flex-1">
              <ResultView
                response={response}
                t={t}
                onApplySuggestion={applyRelaxationSuggestion}
                platformLabel={platformLabel(draft.platform)}
                objectiveLabel={objectiveLabel(draft.objective)}
                verticalLabel={verticalLabel(draft.vertical)}
                countryLabel={countryLabel(draft.country)}
                draft={draft}
                initialUserValue={initialUserValue}
              />

              {process.env.NODE_ENV !== "production" && (
                <details className="rounded-2xl border border-dashed border-line bg-surface2 p-4 text-xs">
                  <summary className="cursor-pointer font-medium text-ink-600">
                    Debug: requested cohort / applied cohort / sample size / status (dev-only, never shown in production)
                  </summary>
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-700">
                    {JSON.stringify(response, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          )}
          </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export function ResultView({
  response,
  t,
  onApplySuggestion,
  platformLabel,
  objectiveLabel,
  verticalLabel,
  countryLabel,
  draft,
  initialUserValue,
}: {
  response: BenchmarkResponse;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onApplySuggestion: () => void;
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  countryLabel: string;
  draft?: Draft;
  initialUserValue?: number | null;
}) {
  if (response.status === "error") {
    return (
      <section className="rounded-2xl border border-caution/30 bg-caution-soft p-6 text-center">
        <AlertCircle size={20} className="mx-auto text-caution" aria-hidden="true" />
        <p className="mt-2 font-display text-base font-semibold text-ink-900">{t("benchmarkLive.errorTitle")}</p>
        <p className="mt-2 text-sm text-ink-700">{t("benchmarkLive.errorBody")}</p>
      </section>
    );
  }

  if (response.status === "methodology_block") {
    return (
      <section className="rounded-2xl border border-caution/30 bg-caution-soft p-6">
        <ShieldAlert size={20} className="text-caution" aria-hidden="true" />
        <p className="mt-2 font-display text-base font-semibold text-ink-900">{t("benchmarkLive.reachBlockTitle")}</p>
        <p className="mt-2 text-sm text-ink-700">{t("benchmarkLive.reachBlockBody")}</p>
      </section>
    );
  }

  if (response.status === "no_data") {
    return (
      <section className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
        <Info size={20} className="mx-auto text-ink-400" aria-hidden="true" />
        <p className="mt-2 font-display text-base font-semibold text-ink-900">{t("benchmarkLive.noDataTitle")}</p>
        <p className="mt-2 text-sm text-ink-600">{t("benchmarkLive.noDataBody")}</p>
      </section>
    );
  }

  if (response.status === "insufficient_sample") {
    return (
      <section className="rounded-2xl border border-caution/30 bg-caution-soft p-6">
        <Info size={20} className="text-caution" aria-hidden="true" />
        <p className="mt-2 font-display text-base font-semibold text-ink-900">{t("benchmarkLive.insufficientTitle")}</p>
        <p className="mt-2 text-sm text-ink-700">{t("benchmarkLive.insufficientBody")}</p>
        <p className="mt-1 text-xs text-ink-600">
          n = {response.sampleSize} (cohort: {response.cohortSampleSize})
        </p>
        {response.relaxationSuggestion && (
          <button
            onClick={onApplySuggestion}
            className="mt-3 rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-900 hover:border-primary hover:text-primary"
          >
            {t("benchmarkLive.applySuggestion")}: {t(`benchmarkLive.dimensionLabels.${response.relaxationSuggestion.dimension}`)} (
            ~{response.relaxationSuggestion.estimatedSampleSize})
          </button>
        )}
      </section>
    );
  }

  // status === "success"
  const { p25, median, p75 } = response.statistics;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <div className="h-1 bg-brandGradient" aria-hidden="true" />
      <div className="p-6">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
        {platformLabel} · {objectiveLabel}
      </p>
      <p className="mt-1 font-display text-lg font-semibold text-primary">{verticalLabel}</p>
      <p className="text-sm text-ink-600">{countryLabel}</p>

      <div className="mt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{response.metric.toUpperCase()}</p>
        <p className="tabular mt-1 font-display text-4xl font-semibold text-ink-900">
          {median !== null ? formatMetricValue(median, response.unit) : "\u2014"}
        </p>
        <p className="mt-1 text-sm text-ink-500">{t("benchmarkLive.marketMedianLabel")}</p>
      </div>

      {/* Sample size: given real visual prominence per Phase 6/10, not
          buried as secondary metadata, but no longer competing with the
          headline number for attention either. */}
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary">
        {t("benchmarkLive.sampleSizeProminent", { n: response.sampleSize })}
      </p>

      {(response.cohort.applied as { spendBand?: string; durationBand?: string }).spendBand && (
        <p className="mt-2 text-xs font-medium text-coral">
          {t("benchmarkLive.scaleContext")}: {(response.cohort.applied as { spendBand?: string }).spendBand} ·{" "}
          {(response.cohort.applied as { durationBand?: string }).durationBand}
        </p>
      )}

      {response.cohort.relaxed.length > 0 && (
        <div className="mt-3 rounded-xl bg-primary-soft p-3 text-xs text-ink-700">
          <p className="font-semibold text-primary">{t("benchmarkLive.relaxedNotice")}</p>
          {response.cohort.relaxed.map((dim) => (
            <p key={dim} className="mt-1">
              {t("benchmarkLive.relaxedExplain", { dimension: t(`benchmarkLive.dimensionLabels.${dim}`) })}
            </p>
          ))}
        </div>
      )}

      {p25 !== null && p75 !== null && median !== null && (
        <ComparisonSection
          response={response}
          t={t}
          platformLabel={platformLabel}
          objectiveLabel={objectiveLabel}
          verticalLabel={verticalLabel}
          countryLabel={countryLabel}
          draft={draft}
          initialUserValue={initialUserValue}
        />
      )}
      </div>
    </section>
  );
}

// Per-metric example values so the placeholder clarifies expected
// magnitude/decimal format without ever transforming what the user
// actually types (Phase 10 "Numeric Input UX" — never silently divide
// or reinterpret input).
const METRIC_EXAMPLES: Record<string, string> = {
  cpm: "4.50",
  ctr: "1.25",
  cpc: "0.45",
  roas: "3.20",
  cpa: "12.50",
  cpl: "8.00",
  reach: "250000",
  frequency: "2.50",
  cpv: "0.03",
};

function ComparisonSection({
  response,
  t,
  platformLabel,
  objectiveLabel,
  verticalLabel,
  countryLabel,
  draft,
  initialUserValue,
}: {
  response: BenchmarkResponse;
  t: (key: string, vars?: Record<string, string | number>) => string;
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  countryLabel: string;
  draft?: Draft;
  initialUserValue?: number | null;
}) {
  const [inputValue, setInputValue] = useState(initialUserValue != null ? String(initialUserValue) : "");
  const [compared, setCompared] = useState<number | null>(initialUserValue ?? null);
  const inputId = "your-result-input";
  const example = METRIC_EXAMPLES[response.metric] ?? "1.00";
  const median = response.statistics.median;

  // Soft, non-blocking hint only — never prevents submission, never
  // alters the value. Flags a result that's wildly outside a plausible
  // range for this cohort (>20x the median) as a nudge to double-check
  // decimal placement, without asserting the value is wrong.
  const parsedPreview = Number(inputValue);
  const looksUnusual =
    inputValue.trim() !== "" &&
    Number.isFinite(parsedPreview) &&
    median !== null &&
    median > 0 &&
    (parsedPreview > median * 20 || (parsedPreview > 0 && parsedPreview < median / 20));

  function handleCompare() {
    const parsed = Number(inputValue);
    if (inputValue.trim() === "" || !Number.isFinite(parsed)) return;
    setCompared(parsed);
  }

  return (
    <div className="mt-6 border-t border-line pt-5">
      <label htmlFor={inputId} className="flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-3">
        <span className="block w-full sm:flex-1">
          <span className="text-xs font-medium text-ink-600">{t("benchmarkLive.yourResult")}</span>
          <input
            id={inputId}
            type="number"
            inputMode="decimal"
            step="0.01"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              setCompared(null);
            }}
            placeholder={t("benchmarkLive.yourResultExample", { example, unit: response.unit })}
            aria-describedby={`${inputId}-hint`}
            className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-primary sm:w-44"
          />
          <span id={`${inputId}-hint`} className="mt-1 block text-[11px] text-ink-400">
            {t(`benchmarkLive.unitHint.${response.unit}`)}
          </span>
          {looksUnusual && (
            <span role="status" className="mt-1 block text-[11px] text-vanilla">
              {t("benchmarkLive.unusualValueHint")}
            </span>
          )}
        </span>
        <button
          onClick={handleCompare}
          className="mt-2 rounded-full bg-ink-900 px-5 py-2 text-sm font-medium text-white transition-transform hover:opacity-90 motion-safe:active:scale-[0.98] sm:mt-0"
        >
          {t("benchmarkLive.compareButton")}
        </button>
      </label>

      {compared !== null && (
        <div className="mt-3 motion-safe:animate-[fadeIn_0.2s_ease]">
          <ComparisonDetail
            response={response}
            userValue={compared}
            t={t}
            platformLabel={platformLabel}
            objectiveLabel={objectiveLabel}
            verticalLabel={verticalLabel}
            countryLabel={countryLabel}
          />
          {draft && (
            <div className="mt-4 border-t border-line pt-4">
              <SaveComparisonButton
                defaultName={`${platformLabel} · ${objectiveLabel} · ${countryLabel}`}
                buildPayload={() => ({
                  comparisonType: "single_metric",
                  platform: draft.platform,
                  objective: draft.objective,
                  vertical: draft.vertical,
                  country: draft.country,
                  audienceStrategy: draft.audienceStrategy || null,
                  funnelStage: draft.funnelStage || null,
                  businessModel: draft.businessModel || null,
                  spendBand: draft.spendBand || null,
                  durationBand: draft.durationBand || null,
                  timeWindow: draft.timeWindow || null,
                  metric: draft.metric,
                  userValue: compared,
                })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
