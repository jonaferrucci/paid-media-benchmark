"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { ContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { submitContributionAction } from "./actions";
import { SUPPORTED_CURRENCIES, isSupportedCurrencyCode } from "@/lib/config/currencies";
import { platformsForCategory, platformsForCountry, formatsForCategory, metricsForCategory } from "@/lib/media/filter";
import { resolveContributionSuccessActions } from "@/lib/intelligence/contributionIntelligence";

interface Draft {
  platformUiId: string | null;
  platformId: string | null;
  campaignTypeId: string | null;
  objectiveId: string | null;
  verticalId: string | null;
  countryId: string | null;
  businessModelId: string | null;
  performanceScope: string;
  audienceStrategyId: string | null;
  funnelStageId: string | null;
  minAge: string;
  maxAge: string;
  genderTargeting: string;
  geographicScope: string;
  startDate: string;
  endDate: string;
  currency: string;
  adSpend: string;
  rawMetrics: Record<string, string>;
  videoViewVariantId: string | null;
  // Phase 19B item 2 — category-aware fields. mediaCategoryId/
  // mediaFormatId narrow which "Medio" options and which metrics are
  // shown (progressive disclosure per Cucurucho UX & Information
  // Architecture.md); they don't change what gets submitted below —
  // performance_datasets has no media_format_id column (formats are a
  // rate-card/commercial concept, migration 0012), so introducing one
  // is out of scope here (Phase 19B §8 limits new migrations to
  // curator governance). See CUCURUCHO_HANDOFF-facing report for this
  // called out as a genuine open item.
  mediaCategoryId: string | null;
  mediaFormatId: string | null;
}

const DEFAULT_DRAFT: Draft = {
  platformUiId: null,
  platformId: null,
  campaignTypeId: null,
  objectiveId: null,
  verticalId: null,
  countryId: null,
  businessModelId: null,
  performanceScope: "full_account",
  audienceStrategyId: null,
  funnelStageId: null,
  minAge: "",
  maxAge: "",
  genderTargeting: "not_specified",
  geographicScope: "",
  startDate: "",
  endDate: "",
  currency: "",
  adSpend: "",
  rawMetrics: {},
  videoViewVariantId: null,
  mediaCategoryId: null,
  mediaFormatId: null,
};

const STEP_KEYS = ["stepContext", "stepAudience", "stepPeriod", "stepMetrics", "stepReview"] as const;

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-600">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
  allowEmpty,
  emptyLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allowEmpty?: boolean;
  emptyLabel?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl border border-line bg-surface py-2.5 pl-3 pr-8 text-sm text-ink-900 outline-none focus-visible:border-primary"
      >
        {allowEmpty && <option value="">{emptyLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
    </div>
  );
}

export function ContributeWizard({ taxonomies }: { taxonomies: ContributionTaxonomies }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [searchOpen, setSearchOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const [spendError, setSpendError] = useState<string | null>(null);
  const [currencyError, setCurrencyError] = useState<string | null>(null);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  const googleAds = taxonomies.platforms.find((p) => p.internal_key === "google_ads");
  const youtubeCampaignType = taxonomies.campaignTypes.find(
    (c) => c.internal_key === "video_youtube" && c.platform_id === googleAds?.id
  );

  // Phase 19B item 2 — category-aware "Medio" list. Reuses the SAME
  // pure filters already proven by the media catalog/profile pages
  // (lib/media/filter.ts) rather than a second parallel filtering
  // rule: Tipo de medio -> País narrows which outlets are offered,
  // exactly like /platforms and /contribute/rate-cards already do.
  // Every existing platform now carries a media_category_id (migration
  // 0012 tagged meta_ads/google_ads/etc. alongside the newer streaming/
  // publisher outlets), so this applies uniformly — no special-casing
  // "old" vs "new" platforms.
  const categoryFilteredPlatforms = useMemo(() => {
    const byCategory = platformsForCategory(taxonomies.platforms, draft.mediaCategoryId);
    return platformsForCountry(byCategory, taxonomies.platformCountries, draft.countryId);
  }, [taxonomies.platforms, taxonomies.platformCountries, draft.mediaCategoryId, draft.countryId]);

  const showsYoutubeOption =
    !!googleAds && !!youtubeCampaignType && categoryFilteredPlatforms.some((p) => p.id === googleAds.id);

  const platformOptions = [
    ...categoryFilteredPlatforms.map((p) => ({ uiId: p.internal_key, id: p.id, label: p.display_label })),
    ...(showsYoutubeOption ? [{ uiId: "youtube", id: googleAds!.id, label: "YouTube" }] : []),
  ];

  function selectPlatform(uiId: string) {
    const option = platformOptions.find((p) => p.uiId === uiId);
    if (!option) return;
    setDraft((d) => ({
      ...d,
      platformUiId: uiId,
      platformId: option.id,
      campaignTypeId: uiId === "youtube" ? youtubeCampaignType?.id ?? null : null,
      mediaFormatId: null,
    }));
  }

  function selectMediaCategory(categoryId: string) {
    setDraft((d) => ({
      ...d,
      mediaCategoryId: categoryId || null,
      // Selecting a category can invalidate the previously-chosen
      // outlet/format — never leave a stale, no-longer-visible
      // selection silently submitted.
      platformUiId: null,
      platformId: null,
      campaignTypeId: null,
      mediaFormatId: null,
    }));
  }

  function selectCountry(countryId: string) {
    setDraft((d) => ({
      ...d,
      countryId: countryId || null,
      platformUiId: null,
      platformId: null,
      campaignTypeId: null,
      mediaFormatId: null,
    }));
  }

  const selectedPlatform = taxonomies.platforms.find((p) => p.id === draft.platformId);

  // Formato: only offered when the selected outlet's category actually
  // has formats defined (today: streaming_live/digital_publisher —
  // media_formats is empty for paid_social/search/marketplace_ads/
  // programmatic, so this step is invisible there, exactly like the
  // existing rate-card contribution form's format selector). Purely a
  // progressive-disclosure/metrics-scoping input for the campaign
  // wizard — see the Draft interface comment above for why it isn't
  // persisted on performance_datasets.
  const formatOptions = useMemo(() => {
    if (!selectedPlatform?.media_category_id) return [];
    return formatsForCategory(taxonomies.mediaFormats, selectedPlatform.media_category_id);
  }, [selectedPlatform, taxonomies.mediaFormats]);

  // Item 2/17B.1: category-level metric applicability (media_category_
  // metrics) takes priority when the selected outlet's category
  // defines one — this is what makes streaming/publisher outlets show
  // their own relevant metrics instead of the paid-social set. When a
  // category has NO applicability rows yet (every pre-existing paid-
  // media category: paid_social/search/marketplace_ads/programmatic),
  // this falls back EXACTLY to the original platform_metrics-driven
  // behavior — existing paid-media workflows are byte-for-byte
  // unchanged, never a large if/else chain per platform.
  const categoryApplicableMetrics = useMemo(() => {
    if (!selectedPlatform?.media_category_id) return [];
    return metricsForCategory(taxonomies.categoryMetrics, taxonomies.metrics, selectedPlatform.media_category_id);
  }, [selectedPlatform, taxonomies.categoryMetrics, taxonomies.metrics]);

  // Dynamic metric inputs: only base metrics this platform actually
  // supports, excluding ad_spend (collected in the Period & Investment
  // step already).
  const availableMetrics = useMemo(() => {
    if (!draft.platformId) return [];
    if (categoryApplicableMetrics.length > 0) {
      return categoryApplicableMetrics
        .map((cm) => cm.metric)
        .filter((m) => m.metric_kind === "base" && m.internal_key !== "ad_spend");
    }
    const compatibleMetricIds = new Set(
      taxonomies.platformMetrics
        .filter((pm) => pm.platform_id === draft.platformId)
        .map((pm) => pm.metric_id)
    );
    return taxonomies.metrics.filter(
      (m) => m.metric_kind === "base" && m.internal_key !== "ad_spend" && compatibleMetricIds.has(m.id)
    );
  }, [draft.platformId, categoryApplicableMetrics, taxonomies]);

  const videoViewsMetric = taxonomies.metrics.find((m) => m.internal_key === "video_views");
  const videoViewVariants = taxonomies.metricVariants.filter((v) => v.metric_id === videoViewsMetric?.id);
  const showsVideoViews = availableMetrics.some((m) => m.internal_key === "video_views");

  function validatePeriodStep(): boolean {
    let ok = true;
    if (draft.endDate && draft.startDate && draft.endDate < draft.startDate) {
      setDateError(t("contribute.errorInvalidDateRange"));
      ok = false;
    } else {
      setDateError(null);
    }
    const spend = Number(draft.adSpend);
    if (draft.adSpend === "" || !Number.isFinite(spend) || spend < 0) {
      setSpendError(t("contribute.errorInvalidSpend"));
      ok = false;
    } else {
      setSpendError(null);
    }
    if (!isSupportedCurrencyCode(draft.currency)) {
      setCurrencyError(t("contribute.errorInvalidCurrency"));
      ok = false;
    } else {
      setCurrencyError(null);
    }
    return ok;
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);

    const rawMetrics: Partial<Record<string, number>> = {};
    for (const [key, value] of Object.entries(draft.rawMetrics)) {
      if (value === "" || value === undefined) continue;
      const n = Number(value);
      if (Number.isFinite(n)) rawMetrics[key] = n;
    }

    const result = await submitContributionAction({
      platformId: draft.platformId!,
      campaignTypeId: draft.campaignTypeId,
      objectiveId: draft.objectiveId!,
      verticalId: draft.verticalId!,
      countryId: draft.countryId!,
      businessModelId: draft.businessModelId,
      performanceScope: draft.performanceScope,
      audienceStrategyId: draft.audienceStrategyId,
      funnelStageId: draft.funnelStageId,
      minAge: draft.minAge ? Number(draft.minAge) : null,
      maxAge: draft.maxAge ? Number(draft.maxAge) : null,
      genderTargeting: draft.genderTargeting,
      geographicScope: draft.geographicScope || null,
      startDate: draft.startDate,
      endDate: draft.endDate,
      currency: draft.currency.trim().toUpperCase(),
      adSpend: Number(draft.adSpend),
      rawMetrics,
      videoViewVariantId: draft.videoViewVariantId,
    });

    setSubmitting(false);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    setSubmitted(true);
  }

  const platformLabel = platformOptions.find((p) => p.uiId === draft.platformUiId)?.label;
  const objectiveLabel = taxonomies.objectives.find((o) => o.id === draft.objectiveId)?.display_label;
  const verticalLabel = taxonomies.verticals.find((v) => v.id === draft.verticalId)?.display_label;
  const countryLabel = taxonomies.countries.find((c) => c.id === draft.countryId)?.display_label;
  const businessModelLabel = taxonomies.businessModels.find((b) => b.id === draft.businessModelId)?.display_label;
  const audienceLabel = taxonomies.audienceStrategies.find((a) => a.id === draft.audienceStrategyId)?.display_label;
  const funnelLabel = taxonomies.funnelStages.find((f) => f.id === draft.funnelStageId)?.display_label;

  const canProceedContext = draft.platformId && draft.objectiveId && draft.verticalId && draft.countryId;

  if (submitted) {
    // Phase 23 §19: "Listo." alone never explains what happens next.
    // "Qué se cargó" reuses the exact context the user just chose (no
    // re-fetch, no new data); "Qué pasa ahora" is the same pending-
    // review fact submitSuccess already states; "Dónde continuar" is a
    // restrained, contextual set of links (never all destinations).
    const nextActions = resolveContributionSuccessActions("campaign_results");
    const ACTION_HREF: Record<string, string> = {
      view_benchmarks: "/benchmark",
      explore_media: "/platforms",
      view_contributions: "/account/contributions",
      home: "/",
    };
    const ACTION_LABEL_KEY: Record<string, string> = {
      view_benchmarks: "contribute.successViewBenchmarks",
      explore_media: "media.exploreCta",
      view_contributions: "contribute.viewMyContributions",
      home: "nav.home",
    };
    return (
      <Shell searchOpen={searchOpen} setSearchOpen={setSearchOpen}>
        <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-sm">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-pistachio-soft text-pistachio">
            <Check size={22} />
          </span>
          <p className="mt-4 text-sm text-ink-900">{t("contribute.submitSuccess")}</p>
          <p className="mt-2 text-xs text-ink-600">
            {t("contribute.successLoaded", { platform: platformLabel ?? "—", objective: objectiveLabel ?? "—" })}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {nextActions.map((action) => (
              <button
                key={action}
                onClick={() => router.push(ACTION_HREF[action])}
                className={
                  action === nextActions[0]
                    ? "rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90"
                    : "rounded-full border border-line px-5 py-2.5 text-sm font-medium text-ink-700 hover:bg-surface2"
                }
              >
                {t(ACTION_LABEL_KEY[action])}
              </button>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  return (
    <Shell searchOpen={searchOpen} setSearchOpen={setSearchOpen}>
      <h1 className="font-display text-xl font-semibold text-ink-900">{t("contribute.title")}</h1>
      <p className="mt-1 max-w-xl text-xs text-ink-600">{t("contribute.privacyNote")}</p>

      <div className="mt-5 flex flex-wrap gap-2">
        {STEP_KEYS.map((key, idx) => (
          <span
            key={key}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              idx === step ? "bg-primary text-white" : idx < step ? "bg-pistachio-soft text-pistachio" : "bg-surface2 text-ink-400"
            }`}
          >
            {t(`contribute.${key}`)}
          </span>
        ))}
      </div>

      <div className="mt-6 max-w-xl rounded-2xl border border-line bg-surface p-6 shadow-sm">
        {step === 0 && (
          <div className="space-y-3">
            {/* Phase 19B item 2 — category-aware ordering: Tipo de
                medio -> País -> Medio -> Formato, each narrowing the
                next (progressive disclosure per Cucurucho UX & IA),
                before the pre-existing objective/vertical/business-
                model/scope fields. */}
            <Field label={t("contribute.mediaCategory")}>
              <Select
                value={draft.mediaCategoryId ?? ""}
                allowEmpty
                emptyLabel={t("contribute.allMediaCategories")}
                onChange={selectMediaCategory}
                options={taxonomies.mediaCategories.map((c) => ({ value: c.id, label: c.display_label }))}
              />
            </Field>
            <Field label={t("contribute.country")}>
              <Select
                value={draft.countryId ?? ""}
                allowEmpty
                emptyLabel="—"
                onChange={selectCountry}
                options={taxonomies.countries.map((c) => ({ value: c.id, label: c.display_label }))}
              />
            </Field>
            <Field label={t("contribute.platform")}>
              <Select
                value={draft.platformUiId ?? ""}
                allowEmpty
                emptyLabel="—"
                onChange={selectPlatform}
                options={platformOptions.map((p) => ({ value: p.uiId, label: p.label }))}
              />
            </Field>
            {formatOptions.length > 0 && (
              <Field label={`${t("contribute.format")} (${t("contribute.optional")})`}>
                <Select
                  value={draft.mediaFormatId ?? ""}
                  allowEmpty
                  emptyLabel="—"
                  onChange={(v) => update("mediaFormatId", v || null)}
                  options={formatOptions.map((f) => ({ value: f.id, label: f.display_label }))}
                />
              </Field>
            )}
            <Field label={t("contribute.objective")}>
              <Select
                value={draft.objectiveId ?? ""}
                allowEmpty
                emptyLabel="—"
                onChange={(v) => update("objectiveId", v)}
                options={taxonomies.objectives.map((o) => ({ value: o.id, label: o.display_label }))}
              />
            </Field>
            <Field label={t("contribute.vertical")}>
              <Select
                value={draft.verticalId ?? ""}
                allowEmpty
                emptyLabel="—"
                onChange={(v) => update("verticalId", v)}
                options={taxonomies.verticals.map((v) => ({ value: v.id, label: v.display_label }))}
              />
            </Field>
            <Field label={`${t("contribute.businessModel")} (${t("contribute.optional")})`}>
              <Select
                value={draft.businessModelId ?? ""}
                allowEmpty
                emptyLabel="—"
                onChange={(v) => update("businessModelId", v || null)}
                options={taxonomies.businessModels.map((b) => ({ value: b.id, label: b.display_label }))}
              />
            </Field>
            <Field label={t("contribute.performanceScope")}>
              <Select
                value={draft.performanceScope}
                onChange={(v) => update("performanceScope", v)}
                options={[
                  { value: "full_account", label: "Full Account" },
                  { value: "campaign_group", label: "Campaign Group" },
                  { value: "individual_campaign", label: "Individual Campaign" },
                ]}
              />
            </Field>
            <StepButtons
              onNext={() => setStep(1)}
              nextDisabled={!canProceedContext}
              t={t}
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Field label={`${t("contribute.audienceStrategy")} (${t("contribute.optional")})`}>
              <Select
                value={draft.audienceStrategyId ?? ""}
                allowEmpty
                emptyLabel="—"
                onChange={(v) => update("audienceStrategyId", v || null)}
                options={taxonomies.audienceStrategies.map((a) => ({ value: a.id, label: a.display_label }))}
              />
            </Field>
            <Field label={`${t("contribute.funnelStage")} (${t("contribute.optional")})`}>
              <Select
                value={draft.funnelStageId ?? ""}
                allowEmpty
                emptyLabel="—"
                onChange={(v) => update("funnelStageId", v || null)}
                options={taxonomies.funnelStages.map((f) => ({ value: f.id, label: f.display_label }))}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={`${t("contribute.ageMin")} (${t("contribute.optional")})`}>
                <input
                  type="number"
                  value={draft.minAge}
                  onChange={(e) => update("minAge", e.target.value)}
                  className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
                />
              </Field>
              <Field label={`${t("contribute.ageMax")} (${t("contribute.optional")})`}>
                <input
                  type="number"
                  value={draft.maxAge}
                  onChange={(e) => update("maxAge", e.target.value)}
                  className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
                />
              </Field>
            </div>
            <Field label={`${t("contribute.genderTargeting")} (${t("contribute.optional")})`}>
              <Select
                value={draft.genderTargeting}
                onChange={(v) => update("genderTargeting", v)}
                options={["all", "female", "male", "platform_defined", "not_specified"].map((key) => ({
                  value: key,
                  label: t(`contribute.genders.${key}`),
                }))}
              />
            </Field>
            <Field label={`${t("contribute.geographicScope")} (${t("contribute.optional")})`}>
              <Select
                value={draft.geographicScope}
                allowEmpty
                emptyLabel="—"
                onChange={(v) => update("geographicScope", v)}
                options={["national", "regional", "state_province", "city", "local_radius", "multiple_regions", "international", "other"].map(
                  (key) => ({ value: key, label: t(`contribute.geoScopes.${key}`) })
                )}
              />
            </Field>
            <StepButtons onBack={() => setStep(0)} onNext={() => setStep(2)} t={t} />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("contribute.startDate")}>
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => update("startDate", e.target.value)}
                  className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
                />
              </Field>
              <Field label={t("contribute.endDate")}>
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => update("endDate", e.target.value)}
                  className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
                />
              </Field>
            </div>
            {dateError && <p className="text-xs text-caution">{dateError}</p>}
            <Field label={t("contribute.currency")}>
              <Select
                value={draft.currency}
                allowEmpty
                emptyLabel="—"
                onChange={(v) => update("currency", v)}
                options={SUPPORTED_CURRENCIES.map((c) => ({ value: c.code, label: c.displayLabel }))}
              />
            </Field>
            {currencyError && <p className="text-xs text-caution">{currencyError}</p>}
            <Field label={t("contribute.adSpend")}>
              <input
                type="number"
                min={0}
                step="0.01"
                value={draft.adSpend}
                onChange={(e) => update("adSpend", e.target.value)}
                className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
              />
            </Field>
            {spendError && <p className="text-xs text-caution">{spendError}</p>}
            <StepButtons
              onBack={() => setStep(1)}
              onNext={() => validatePeriodStep() && setStep(3)}
              t={t}
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            {availableMetrics.length === 0 && (
              <p className="text-xs text-ink-400">—</p>
            )}
            {availableMetrics.map((m) => (
              <Field key={m.id} label={`${t(`contribute.rawMetrics.${m.internal_key}`)} (${t("contribute.optional")})`}>
                <input
                  type="number"
                  min={0}
                  value={draft.rawMetrics[m.internal_key] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, rawMetrics: { ...d.rawMetrics, [m.internal_key]: e.target.value } }))
                  }
                  className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm text-ink-900 outline-none focus-visible:border-primary"
                />
              </Field>
            ))}
            {showsVideoViews && videoViewVariants.length > 0 && (
              <Field label={t("contribute.videoViewDefinition")}>
                <Select
                  value={draft.videoViewVariantId ?? ""}
                  allowEmpty
                  emptyLabel="—"
                  onChange={(v) => update("videoViewVariantId", v || null)}
                  options={videoViewVariants.map((v) => ({ value: v.id, label: v.display_label }))}
                />
              </Field>
            )}
            <StepButtons onBack={() => setStep(2)} onNext={() => setStep(4)} t={t} />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-1 text-sm text-ink-900">
              <p className="font-medium">
                {platformLabel} · {objectiveLabel}
              </p>
              <p className="text-ink-600">
                {verticalLabel} · {countryLabel}
                {businessModelLabel ? ` · ${businessModelLabel}` : ""}
              </p>
              {(audienceLabel || funnelLabel) && (
                <p className="text-ink-600">
                  {[audienceLabel, funnelLabel].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="text-ink-600">
                {draft.startDate} – {draft.endDate}
              </p>
              <p className="text-ink-600">
                {t("contribute.adSpend")}: {draft.currency} {draft.adSpend}
              </p>
              {Object.entries(draft.rawMetrics)
                .filter(([, v]) => v !== "")
                .map(([key, value]) => (
                  <p key={key} className="text-ink-600">
                    {t(`contribute.rawMetrics.${key}`)}: {value}
                  </p>
                ))}
            </div>

            {submitError && <p className="text-xs text-caution">{t(`authErrors.${submitError}`)}</p>}

            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep(0)}
                className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-700 hover:border-primary/40"
              >
                {t("contribute.edit")}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? t("contribute.submitting") : t("contribute.submit")}
              </button>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}

function StepButtons({
  onBack,
  onNext,
  nextDisabled,
  t,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextDisabled?: boolean;
  t: (key: string) => string;
}) {
  return (
    <div className="flex items-center gap-2 pt-2">
      {onBack && (
        <button
          onClick={onBack}
          className="rounded-full border border-line px-4 py-2 text-sm font-medium text-ink-700 hover:border-primary/40"
        >
          {t("contribute.back")}
        </button>
      )}
      <button
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-full bg-primary px-5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
      >
        {t("contribute.next")}
      </button>
    </div>
  );
}

function Shell({
  children,
  searchOpen,
  setSearchOpen,
}: {
  children: React.ReactNode;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
}) {
  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="px-4 py-8 md:px-8">{children}</main>
      </div>
    </div>
  );
}
