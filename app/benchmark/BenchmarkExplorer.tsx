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
import { resolveNoDataAction } from "@/lib/intelligence/benchmarkIntelligence";
import { SINGLE_METRIC_OPTIONS } from "@/lib/benchmark/singleMetricOptions";

// PHASE 32: now the single shared source of truth (lib/benchmark/
// singleMetricOptions.ts) — the campaign-detail activation flow
// (app/account/contributions/[id]/page.tsx) validates a prefilled
// metric against the exact same list, never a duplicated one.
const PRIMARY_METRICS: readonly string[] = SINGLE_METRIC_OPTIONS;

// PHASE 33 (§8): extracted from the Spend Range / Duration Band <Select>
// options below so the new "Contexto del benchmark" section can render
// the same human labels for response.cohort.applied's band values —
// one real source of truth, never a second hardcoded copy that could
// drift from the actual selector options.
const SPEND_BAND_OPTIONS: { value: string; label: string }[] = [
  { value: "under_500", label: "< USD 500" },
  { value: "500_2000", label: "USD 500-2,000" },
  { value: "2000_10000", label: "USD 2,000-10,000" },
  { value: "10000_50000", label: "USD 10,000-50,000" },
  { value: "50000_100000", label: "USD 50,000-100,000" },
  { value: "100000_plus", label: "USD 100,000+" },
];
const DURATION_BAND_OPTIONS: { value: string; label: string }[] = [
  { value: "1_7", label: "1-7" },
  { value: "8_14", label: "8-14" },
  { value: "15_30", label: "15-30" },
  { value: "31_60", label: "31-60" },
  { value: "61_90", label: "61-90" },
  { value: "91_180", label: "91-180" },
  { value: "181_365", label: "181-365" },
  { value: "365_plus", label: "365+" },
];

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
    if (!savedId) {
      // PHASE 26 (§8): cross-link from a just-completed import —
      // /benchmark?prefillPlatform=...&prefillObjective=...&
      // prefillVertical=...&prefillCountry=.... Only ever pre-fills the
      // dimensions the caller actually persisted; never infers funnel/
      // time window and never auto-submits, so the user still reviews
      // and completes the search themselves.
      //
      // PHASE 30: prefillAudienceStrategy added alongside the original
      // four — home's SearchOverlay has suggestion chips (Broad,
      // Remarketing) that only ever set audienceStrategy, and with no
      // param to carry that value here, that selection silently
      // resolved to a blank /benchmark. Same mechanism, same param
      // naming convention, no second prefill system.
      //
      // PHASE 32 (§3/§4/§6): the campaign-detail "Comparar con
      // benchmark" activation (app/account/contributions/[id]) extends
      // the SAME mechanism with the real additional fields /benchmark
      // already has Draft/query support for (funnelStage, businessModel
      // — spendBand/durationBand only ever accompany the Reach metric,
      // since that's the one metric that requires them) plus the metric
      // itself and the campaign's own already-known value for it —
      // still never a second prefill system, still never auto-submitted
      // (the user still clicks "Ver benchmark" themselves; only the
      // inputs are pre-filled). See lib/benchmark/singleMetricOptions.ts
      // for why prefillMetric is validated against a real allow-list
      // rather than trusted as-is from the URL.
      const prefillPlatform = searchParams.get("prefillPlatform");
      const prefillObjective = searchParams.get("prefillObjective");
      const prefillVertical = searchParams.get("prefillVertical");
      const prefillCountry = searchParams.get("prefillCountry");
      const prefillAudienceStrategy = searchParams.get("prefillAudienceStrategy");
      const prefillFunnelStage = searchParams.get("prefillFunnelStage");
      const prefillBusinessModel = searchParams.get("prefillBusinessModel");
      const prefillSpendBand = searchParams.get("prefillSpendBand");
      const prefillDurationBand = searchParams.get("prefillDurationBand");
      const rawPrefillMetric = searchParams.get("prefillMetric");
      const prefillMetric = rawPrefillMetric && (SINGLE_METRIC_OPTIONS as readonly string[]).includes(rawPrefillMetric)
        ? rawPrefillMetric
        : null;
      const rawPrefillUserValue = searchParams.get("prefillUserValue");
      const parsedPrefillUserValue = rawPrefillUserValue !== null ? Number(rawPrefillUserValue) : null;
      const prefillUserValue = parsedPrefillUserValue !== null && Number.isFinite(parsedPrefillUserValue) ? parsedPrefillUserValue : null;

      if (
        prefillPlatform || prefillObjective || prefillVertical || prefillCountry || prefillAudienceStrategy ||
        prefillFunnelStage || prefillBusinessModel || prefillSpendBand || prefillDurationBand || prefillMetric
      ) {
        setDraft((d) => ({
          ...d,
          platform: prefillPlatform ?? d.platform,
          objective: prefillObjective ?? d.objective,
          vertical: prefillVertical ?? d.vertical,
          country: prefillCountry ?? d.country,
          audienceStrategy: prefillAudienceStrategy ?? d.audienceStrategy,
          funnelStage: prefillFunnelStage ?? d.funnelStage,
          businessModel: prefillBusinessModel ?? d.businessModel,
          spendBand: prefillSpendBand ?? d.spendBand,
          durationBand: prefillDurationBand ?? d.durationBand,
          metric: prefillMetric ?? d.metric,
        }));
      }
      // Only ever primes the "your result" input with a value the
      // campaign detail page already computed from this owner's own
      // data — never shown/compared until the user submits the search
      // themselves, exactly like every other prefill path here.
      if (prefillUserValue !== null) {
        setInitialUserValue(prefillUserValue);
      }
      return;
    }

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
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
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
              {/* POST-MVP MOBILE PASS §7: filters flow as one vertical
                  column below sm instead of squeezing two Select
                  dropdowns (each with its own label) side by side. */}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
              <div className={`mt-3 grid grid-cols-1 gap-3 rounded-xl p-3 sm:grid-cols-2 ${isReach ? "border-2 border-coral/50 bg-coral-soft/40" : ""}`}>
                {isReach && (
                  <p className="col-span-2 text-xs font-medium text-coral">{t("benchmarkLive.reachScaleRequired")}</p>
                )}
                <Select
                  label={t("finder.spendRange")}
                  value={draft.spendBand}
                  onChange={(v) => update("spendBand", v)}
                  allowEmpty
                  required={isReach}
                  options={SPEND_BAND_OPTIONS}
                />
                <Select
                  label={t("finder.duration")}
                  value={draft.durationBand}
                  onChange={(v) => update("durationBand", v)}
                  allowEmpty
                  required={isReach}
                  options={DURATION_BAND_OPTIONS}
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
                onRetry={() => handleSubmit()}
                platformLabel={platformLabel(draft.platform)}
                objectiveLabel={objectiveLabel(draft.objective)}
                verticalLabel={verticalLabel(draft.vertical)}
                countryLabel={countryLabel(draft.country)}
                draft={draft}
                initialUserValue={initialUserValue}
                taxonomies={taxonomies}
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
  onRetry,
  platformLabel,
  objectiveLabel,
  verticalLabel,
  countryLabel,
  draft,
  initialUserValue,
  taxonomies,
}: {
  response: BenchmarkResponse;
  t: (key: string, vars?: Record<string, string | number>) => string;
  onApplySuggestion: () => void;
  onRetry?: () => void;
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  countryLabel: string;
  draft?: Draft;
  initialUserValue?: number | null;
  taxonomies?: ContributionTaxonomies;
}) {
  if (response.status === "error") {
    // PHASE 33 (§11): explains what happened AND gives the user
    // something to do — previously this state was a dead end (no
    // action at all). "Reintentar" simply re-runs the exact same
    // query the user already built; it never retries silently or
    // changes any input.
    return (
      <section className="rounded-2xl border border-caution/30 bg-caution-soft p-6 text-center">
        <AlertCircle size={20} className="mx-auto text-caution" aria-hidden="true" />
        <p className="mt-2 font-display text-base font-semibold text-ink-900">{t("benchmarkLive.errorTitle")}</p>
        <p className="mt-2 text-sm text-ink-700">{t("benchmarkLive.errorBody")}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-3 inline-block rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-900 hover:border-primary hover:text-primary"
          >
            {t("benchmarkLive.retryCta")}
          </button>
        )}
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
    // §7: never stop at "no hay datos" — one useful action always
    // follows. There is no relaxation suggestion at all for a hard
    // no_data result (nothing computed to relax), so the honest next
    // step is contributing the missing campaigns.
    return (
      <section className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
        <Info size={20} className="mx-auto text-ink-400" aria-hidden="true" />
        <p className="mt-2 font-display text-base font-semibold text-ink-900">{t("benchmarkLive.noDataTitle")}</p>
        <p className="mt-2 text-sm text-ink-600">{t("benchmarkLive.noDataBody")}</p>
        <a href="/contribute" className="mt-3 inline-block rounded-full border border-line bg-canvas px-4 py-2 text-xs font-medium text-ink-900 hover:border-primary hover:text-primary">
          {t("media.ctaContribute")}
        </a>
      </section>
    );
  }

  if (response.status === "insufficient_sample") {
    const nextAction = resolveNoDataAction(!!response.relaxationSuggestion);
    return (
      <section className="rounded-2xl border border-caution/30 bg-caution-soft p-6">
        <Info size={20} className="text-caution" aria-hidden="true" />
        <p className="mt-2 font-display text-base font-semibold text-ink-900">{t("benchmarkLive.insufficientTitle")}</p>
        <p className="mt-2 text-sm text-ink-700">{t("benchmarkLive.insufficientBody")}</p>
        {/* PHASE 33 (§7): a plain-language sentence, not raw "n = X"
            technical notation — and keeps cohortSampleSize (the
            broader cohort before this specific metric's own data
            requirement) explicitly distinct from sampleSize (how many
            of those actually have this metric), never conflating the
            two into one number. */}
        <p className="mt-1 text-xs text-ink-600">
          {t("benchmarkLive.insufficientSampleDetail", { sampleSize: response.sampleSize, cohortSampleSize: response.cohortSampleSize })}
        </p>
        {nextAction === "expand_filters" && response.relaxationSuggestion ? (
          <button
            onClick={onApplySuggestion}
            className="mt-3 rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-900 hover:border-primary hover:text-primary"
          >
            {t("benchmarkLive.applySuggestion")}: {t(`benchmarkLive.dimensionLabels.${response.relaxationSuggestion.dimension}`)} (
            ~{response.relaxationSuggestion.estimatedSampleSize})
          </button>
        ) : (
          <a href="/contribute" className="mt-3 inline-block rounded-full border border-line bg-surface px-4 py-2 text-xs font-medium text-ink-900 hover:border-primary hover:text-primary">
            {t("media.ctaContribute")}
          </a>
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

      {/* PHASE 33 (§2/§3/§6): the P25/Median/P75 snapshot is now visible
          as soon as there's a result — never gated behind entering a
          "Tu resultado" value. §6's suggested plain three-number row
          (no new chart library, no dependency). Once the user compares
          their own value, ComparisonDetail's interactive track below
          shows these SAME three numbers again but WITH their marker
          positioned among them — a deliberate, minor overlap (richer
          view replaces the plain one in substance, not literally
          hidden) rather than lifting state up just to suppress it. */}
      {p25 !== null && median !== null && p75 !== null && (
        <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-ink-500">{t("benchmarkLive.typicalRangeLabel")}</p>
          <div className="mt-1.5 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] font-medium text-ink-400">P25</p>
              <p className="tabular text-sm font-semibold text-ink-800">{formatMetricValue(p25, response.unit)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-ink-400">{t("benchmarkLive.medianShort")}</p>
              <p className="tabular text-sm font-semibold text-ink-900">{formatMetricValue(median, response.unit)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium text-ink-400">P75</p>
              <p className="tabular text-sm font-semibold text-ink-800">{formatMetricValue(p75, response.unit)}</p>
            </div>
          </div>
        </div>
      )}

      {/* Sample size: given real visual prominence per Phase 6/10, not
          buried as secondary metadata, but no longer competing with the
          headline number for attention either. */}
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-medium text-primary">
        {t("benchmarkLive.sampleSizeProminent", { n: response.sampleSize })}
      </p>

      {/* PHASE 33 (§8): one compact "Contexto del benchmark" section
          replaces the old separate scale-context note and relaxed-
          dimension notice — same underlying facts (response.cohort),
          never a new computation, just consolidated so cohort
          information isn't scattered across the card. */}
      {taxonomies && <CohortContextSection response={response} taxonomies={taxonomies} t={t} />}

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

// PHASE 33 (§8): "Contexto del benchmark" — every applied cohort
// dimension in ONE compact, clearly-labeled place, using real display
// labels (never internal_key strings), showing only fields the query
// actually applied (a null/absent field is simply omitted, never shown
// as an empty or fabricated value). Platform/Objective/Vertical/
// Country are intentionally NOT repeated here — they're already shown
// directly above (the page's "what am I comparing" header) — this
// section only adds the fields not already visible there. Relaxation
// is folded in here too (was a separate floating notice before this
// phase) since it's about the SAME cohort fields this section already
// lists. response.cohort.applied is the engine's own, unmodified
// CohortDescriptor (lib/benchmark/engine.ts's buildCohortDescriptor) —
// this component only ever reads and labels it, never recomputes it.
function CohortContextSection({
  response,
  taxonomies,
  t,
}: {
  response: BenchmarkResponse;
  taxonomies: ContributionTaxonomies;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const applied = response.cohort.applied as {
    audienceStrategy?: string | null;
    funnelStage?: string | null;
    businessModel?: string | null;
    spendBand?: string | null;
    durationBand?: string | null;
    timeWindow?: string | null;
  };

  const rows: { label: string; value: string }[] = [];
  if (applied.audienceStrategy) {
    rows.push({ label: t("contribute.audienceStrategy"), value: taxonomies.audienceStrategies.find((a) => a.internal_key === applied.audienceStrategy)?.display_label ?? applied.audienceStrategy });
  }
  if (applied.funnelStage) {
    rows.push({ label: t("contribute.funnelStage"), value: taxonomies.funnelStages.find((f) => f.internal_key === applied.funnelStage)?.display_label ?? applied.funnelStage });
  }
  if (applied.businessModel) {
    rows.push({ label: t("contribute.businessModel"), value: taxonomies.businessModels.find((b) => b.internal_key === applied.businessModel)?.display_label ?? applied.businessModel });
  }
  if (applied.spendBand) {
    rows.push({ label: t("finder.spendRange"), value: SPEND_BAND_OPTIONS.find((o) => o.value === applied.spendBand)?.label ?? applied.spendBand });
  }
  if (applied.durationBand) {
    rows.push({ label: t("finder.duration"), value: DURATION_BAND_OPTIONS.find((o) => o.value === applied.durationBand)?.label ?? applied.durationBand });
  }
  if (applied.timeWindow) {
    rows.push({ label: t("finder.timeWindow"), value: t(`timeWindows.${applied.timeWindow}`) });
  }

  if (rows.length === 0 && response.cohort.relaxed.length === 0) return null;

  return (
    <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{t("benchmarkLive.cohortContextTitle")}</p>
      {rows.length > 0 && (
        <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-2 sm:justify-start">
              <dt className="text-ink-500">{row.label}</dt>
              <dd className="font-medium text-ink-800">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {response.cohort.relaxed.length > 0 && (
        <div className="mt-2 rounded-lg bg-primary-soft p-2 text-xs text-ink-700">
          <p className="font-semibold text-primary">{t("benchmarkLive.relaxedNotice")}</p>
          {response.cohort.relaxed.map((dim) => (
            <p key={dim} className="mt-0.5">
              {t("benchmarkLive.relaxedExplain", { dimension: t(`benchmarkLive.dimensionLabels.${dim}`) })}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

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

          {/* Phase 22 §E: navigation/context only, after a real result —
              never a claim that benchmark performance decides which
              media is "best" (no ranking, no ids carried across, both
              links are plain and generic on purpose). */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="text-xs text-ink-500">{t("benchmarkLive.nextActionsLabel")}</span>
            <a href="/platforms" className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary">
              {t("benchmarkLive.exploreMediaCta")}
            </a>
            <a href="/planner" className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary">
              {t("benchmarkLive.buildPlanCta")}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
