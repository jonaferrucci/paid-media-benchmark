"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Globe2 } from "lucide-react";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { Hero } from "@/components/dashboard/Hero";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { GlobalInsights } from "@/components/dashboard/GlobalInsights";
import { MiniTrend } from "@/components/dashboard/MiniTrend";
import { FeaturedModules } from "@/components/dashboard/FeaturedModules";
import { RecentWork } from "@/components/dashboard/RecentWork";
import { ExploreMarket } from "@/components/dashboard/ExploreMarket";
import { DiscoveryWizard, WizardDraft } from "@/components/dashboard/wizard/DiscoveryWizard";
import { PLATFORM_CARDS } from "@/lib/mock/taxonomies";
import { ActiveBenchmarkCard } from "@/components/dashboard/ActiveBenchmarkCard";
import { KPICard } from "@/components/dashboard/KPICard";
import { ReachCard } from "@/components/dashboard/ReachCard";
import { RangeVisualization } from "@/components/dashboard/RangeVisualization";
import { VerticalAudienceMatrix } from "@/components/dashboard/VerticalAudienceMatrix";
import { RelatedBenchmarks } from "@/components/dashboard/RelatedBenchmarks";
import { MethodologyNote } from "@/components/dashboard/MethodologyNote";
import { DetailedAnalysis } from "@/components/dashboard/DetailedAnalysis";
import { InsufficientDataState, RelaxationKind } from "@/components/dashboard/InsufficientDataState";
import { MetricTrendChart } from "@/components/dashboard/MetricTrendChart";
import { DistributionChart } from "@/components/dashboard/DistributionChart";
import { VerticalComparisonChart } from "@/components/dashboard/VerticalComparisonChart";
import { AudienceComparisonChart } from "@/components/dashboard/AudienceComparisonChart";
import { AudienceStrategy, CohortFilters } from "@/lib/types";
import {
  AUDIENCE_STRATEGIES,
  COUNTRIES,
  FUNNEL_STAGES,
  TIME_WINDOWS,
  VERTICALS,
  VERTICALS_WITH_DATA,
} from "@/lib/mock/taxonomies";
import { OBJECTIVE_KPI_CONFIG } from "@/lib/config/objectiveKpis";
import { getCohortSteps, getKpiResults, getReachBenchmark } from "@/lib/mock/benchmarks";
import { useTranslation } from "@/lib/i18n/LanguageContext";

function partialFiltersToDraft(partial: Partial<CohortFilters>): Partial<WizardDraft> {
  const draft: Partial<WizardDraft> = {};
  if (partial.platform) {
    const card = PLATFORM_CARDS.find((p) => p.platform === partial.platform);
    if (card) draft.platformUiId = card.uiId;
  }
  if (partial.objective) {
    draft.objective = partial.objective;
    draft.objectiveUiKey = partial.objective;
  }
  if (partial.verticalId) draft.verticalId = partial.verticalId;
  if (partial.country) draft.countryId = partial.country;
  if (partial.audienceStrategy) draft.audienceStrategy = partial.audienceStrategy;
  return draft;
}

export default function OverviewPage() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"find" | "explore">("find");
  const [stage, setStage] = useState<"discovery" | "result">("discovery");
  const [showGlobalFromResult, setShowGlobalFromResult] = useState(false);
  const [filters, setFilters] = useState<CohortFilters | null>(null);
  const [wizardInitialDraft, setWizardInitialDraft] = useState<Partial<WizardDraft>>({});
  const [wizardKey, setWizardKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

  function applyPartial(partial: Partial<CohortFilters>) {
    setFilters((f) => (f ? { ...f, ...partial } : f));
  }

  function handleExploreFromInsight(partial: Partial<CohortFilters>) {
    setMode("find");
    setStage("discovery");
    setWizardInitialDraft(partialFiltersToDraft(partial));
    setWizardKey((k) => k + 1);
  }

  function handleQuickBenchmark(quickFilters: CohortFilters) {
    setFilters(quickFilters);
    setStage("result");
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={applyPartial} />}

      {stage === "discovery" && (
        <div>
          <Hero />

          <QuickActions />

          <div className="mx-auto mb-3 flex max-w-xs items-center gap-1 rounded-full border border-line bg-surface p-1">
            <button
              onClick={() => setMode("find")}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                mode === "find" ? "bg-primary text-white" : "text-ink-600"
              }`}
            >
              {t("modeTabs.findBenchmark")}
            </button>
            <button
              onClick={() => setMode("explore")}
              className={`flex-1 rounded-full px-3 py-2 text-xs font-semibold transition-colors ${
                mode === "explore" ? "bg-primary text-white" : "text-ink-600"
              }`}
            >
              {t("modeTabs.exploreMarket")}
            </button>
          </div>

          {mode === "find" ? (
            <div className="space-y-10">
              <DiscoveryWizard
                key={wizardKey}
                initialDraft={wizardInitialDraft}
                onComplete={(completedFilters) => {
                  setFilters(completedFilters);
                  setStage("result");
                }}
              />
              <MiniTrend onViewBenchmark={() => handleQuickBenchmark({
                platform: "meta_ads", country: "AR", timeWindow: "last_12_months",
                verticalId: "beauty_personal_care", objective: "traffic", audienceStrategy: "broad",
                funnelStage: null, minAge: null, maxAge: null, campaignType: null, spendBand: null, durationBand: null,
              })} />
              <GlobalInsights onExplore={handleExploreFromInsight} />
              <RecentWork />
              <FeaturedModules onQuickBenchmark={handleQuickBenchmark} />
            </div>
          ) : (
            <ExploreMarket />
          )}
        </div>
      )}

      {stage === "result" && filters && (
        <ResultView
          filters={filters}
          setFilters={setFilters}
          onEditSearch={() => setStage("discovery")}
          showGlobal={showGlobalFromResult}
          onShowGlobal={() => setShowGlobalFromResult(true)}
          onHideGlobal={() => setShowGlobalFromResult(false)}
        />
      )}
    </div>
  );
}

function ResultView({
  filters,
  setFilters,
  onEditSearch,
  showGlobal,
  onShowGlobal,
  onHideGlobal,
}: {
  filters: CohortFilters;
  setFilters: (updater: (f: CohortFilters | null) => CohortFilters | null) => void;
  onEditSearch: () => void;
  showGlobal: boolean;
  onShowGlobal: () => void;
  onHideGlobal: () => void;
}) {
  const { t } = useTranslation();

  const vertical = VERTICALS.find((v) => v.id === filters.verticalId)!;
  const audience = filters.audienceStrategy
    ? AUDIENCE_STRATEGIES.find((a) => a.id === filters.audienceStrategy) ?? null
    : null;
  const funnel = filters.funnelStage
    ? FUNNEL_STAGES.find((f) => f.id === filters.funnelStage) ?? null
    : null;
  const country = COUNTRIES.find((c) => c.id === filters.country)!;
  const timeWindow = TIME_WINDOWS.find((tw) => tw.id === filters.timeWindow)!;
  const ageLabel = filters.minAge !== null ? `${filters.minAge}–${filters.maxAge} ${t("finder.age").toLowerCase()}` : null;

  const kpiConfig = OBJECTIVE_KPI_CONFIG[filters.objective];
  const primaryMetrics = kpiConfig.primary.filter((m) => m !== "reach");
  const hasReachPrimary = kpiConfig.primary.includes("reach");
  const secondaryMetrics = kpiConfig.secondary.filter((m) => m !== "reach");
  const outcomeMetrics = kpiConfig.outcomes;
  const hasOutcomes = outcomeMetrics.length > 0;

  const kpiResults = useMemo(
    () => getKpiResults(filters, primaryMetrics),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(filters), filters.objective]
  );
  const secondaryResults = useMemo(
    () => (secondaryMetrics.length ? getKpiResults(filters, secondaryMetrics) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(filters), filters.objective]
  );
  const outcomeResults = useMemo(
    () => (outcomeMetrics.length ? getKpiResults(filters, outcomeMetrics) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(filters), filters.objective]
  );
  const reachBenchmark = useMemo(() => getReachBenchmark(filters), [JSON.stringify(filters)]);
  const cohortSteps = useMemo(() => getCohortSteps(filters), [JSON.stringify(filters)]);

  const exactCohortSampleSize = cohortSteps[cohortSteps.length - 1]?.sampleSize ?? 0;
  const showInsufficientState =
    VERTICALS_WITH_DATA.has(filters.verticalId) && exactCohortSampleSize < 10;

  const primaryKpiForVisualization = kpiResults.find((k) => !k.insufficientData) ?? kpiResults[0];

  function handleRelaxationChoice(kind: RelaxationKind) {
    if (kind === "age") setFilters((f) => (f ? { ...f, minAge: null, maxAge: null } : f));
    if (kind === "funnel") setFilters((f) => (f ? { ...f, funnelStage: null } : f));
    if (kind === "audience") setFilters((f) => (f ? { ...f, audienceStrategy: null } : f));
  }

  function handleMatrixCellSelect(verticalId: string, audienceStrategy: AudienceStrategy) {
    setFilters((f) => (f ? { ...f, verticalId, audienceStrategy } : f));
  }

  function applyPartial(partial: Partial<CohortFilters>) {
    setFilters((f) => (f ? { ...f, ...partial } : f));
  }

  return (
    <div>
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="space-y-6 px-4 py-6 md:px-8">
          <div className="flex items-center justify-between">
            <button
              onClick={onEditSearch}
              className="flex items-center gap-1.5 text-xs font-medium text-ink-600 hover:text-primary"
            >
              <ArrowLeft size={13} />
              {t("wizard.editSearch")}
            </button>
            {!showGlobal && (
              <button
                onClick={onShowGlobal}
                className="flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary"
              >
                <Globe2 size={13} />
                {t("market.viewGlobalOverview")}
              </button>
            )}
          </div>

          {showGlobal ? (
            <div>
              <button
                onClick={onHideGlobal}
                className="mb-4 flex items-center gap-1.5 text-xs font-medium text-ink-600 hover:text-primary"
              >
                <ArrowLeft size={13} />
                {t("market.backToBenchmark")}
              </button>
              <ExploreMarket />
            </div>
          ) : (
            <>
              <ActiveBenchmarkCard
                platformLabel="Meta Ads"
                objectiveLabel={t(`objectives.${filters.objective}`)}
                verticalLabel={vertical.label}
                audienceLabel={audience ? t(`audiences.${audience.id}`) : null}
                funnelLabel={funnel ? t(`funnel.${funnel.id}`) : null}
                ageLabel={ageLabel}
                countryLabel={t(`countries.${country.id}`)}
                timeWindowLabel={t(`timeWindows.${timeWindow.id}`)}
                sampleSize={exactCohortSampleSize}
                steps={cohortSteps}
              />

              {showInsufficientState && (
                <InsufficientDataState
                  verticalLabel={vertical.label}
                  audienceLabel={audience ? t(`audiences.${audience.id}`) : t("finder.any")}
                  funnelLabel={funnel ? t(`funnel.${funnel.id}`) : t("finder.all")}
                  ageLabel={ageLabel ?? t("finder.all")}
                  options={[
                    ...(filters.minAge
                      ? [{ kind: "age" as const, resultingSampleSize: Math.round(exactCohortSampleSize * 3.1) }]
                      : []),
                    ...(filters.funnelStage
                      ? [{ kind: "funnel" as const, resultingSampleSize: Math.round(exactCohortSampleSize * 1.6) }]
                      : []),
                    ...(filters.audienceStrategy
                      ? [{ kind: "audience" as const, resultingSampleSize: Math.round(exactCohortSampleSize * 2.4) }]
                      : []),
                  ]}
                  onSelectOption={handleRelaxationChoice}
                />
              )}

              <section>
                <h2 className="mb-3 font-display text-base font-semibold text-ink-900">
                  {hasOutcomes ? t("kpi.mediaEfficiency") : t("nav.benchmarks")}
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  {kpiResults.map((kpi) => (
                    <KPICard key={kpi.metric} kpi={kpi} variant="primary" />
                  ))}
                  {hasReachPrimary && <ReachCard reach={reachBenchmark} />}
                </div>
              </section>

              {secondaryResults.length > 0 && (
                <section>
                  <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-400">
                    {t("kpi.supportingMetrics")}
                  </h3>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                    {secondaryResults.map((kpi) => (
                      <KPICard key={kpi.metric} kpi={kpi} variant="supporting" />
                    ))}
                  </div>
                </section>
              )}

              {hasOutcomes && (
                <section>
                  <div className="mb-3 flex items-center gap-2">
                    <h2 className="font-display text-base font-semibold text-ink-900">
                      {t("kpi.businessOutcomes")}
                    </h2>
                    <span className="text-xs text-ink-400">{t("kpi.businessOutcomesNote")}</span>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {outcomeResults.map((kpi) => (
                      <KPICard key={kpi.metric} kpi={kpi} variant="outcome" />
                    ))}
                  </div>
                </section>
              )}

              {primaryKpiForVisualization && <RangeVisualization kpi={primaryKpiForVisualization} />}

              <VerticalAudienceMatrix filters={filters} onSelectCohort={handleMatrixCellSelect} />

              <RelatedBenchmarks verticalLabel={vertical.label} onSelect={applyPartial} />

              <MethodologyNote />

              <DetailedAnalysis>
                <MetricTrendChart filters={filters} />
                <VerticalComparisonChart filters={filters} />
                <AudienceComparisonChart filters={filters} />
                {primaryKpiForVisualization && !primaryKpiForVisualization.insufficientData && (
                  <DistributionChart kpi={primaryKpiForVisualization} />
                )}
              </DetailedAnalysis>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
