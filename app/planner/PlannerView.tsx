"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Compass, Wallet, Bookmark, X, AlertTriangle, Info, TrendingUp, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { EntityCard } from "@/components/ui/EntityCard";
import { EntityAvatar } from "@/components/ui/EntityAvatar";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { SUPPORTED_CURRENCIES } from "@/lib/config/currencies";
import { freshnessLabel } from "@/lib/media/trend";
import type { MediaCatalog } from "@/lib/media/catalog";
import type { PlanningResult } from "@/lib/planning/queries";
import { hasCurrentCommercialOffer, toggleOpportunitySelection } from "@/lib/planning/opportunity";
import { assessPriceComparability, type ComparabilityState } from "@/lib/planning/comparability";
import { explainPriceComparability, explainMissingRateCard, explainMissingEfficiencyEstimate, explainRequiresCommercialReview } from "@/lib/planning/explain";
import { computeMultiOpportunityTotals, requiresCommercialReview, type PlannedLineItem } from "@/lib/planning/budget";
import { resolveMediaContext, resolveIdContext, contributeRateCardHref } from "@/lib/media/contextLinks";
import { buildPlanSummaryLines, groupPlannerWarnings, countStaleSignals } from "@/lib/intelligence/plannerIntelligence";
import { fetchPlanningOpportunitiesAction, saveScenarioAction, deleteScenarioAction, getScenarioAction, type SavedPlanningScenario } from "./actions";

type Opportunity = PlanningResult["opportunities"][number];

function formatPrice(price: number, currency: string): string {
  return `${currency} ${new Intl.NumberFormat("es-AR").format(price)}`;
}

function opportunityKey(o: Opportunity): string {
  const identity = o.rateCardGroup?.identity;
  return [o.platformId, o.propertyId ?? "", o.mediaFormatId, identity?.currency ?? "", identity?.pricingUnit ?? ""].join("|");
}

const COMPARABILITY_TONE: Record<ComparabilityState, "success" | "warning" | "destructive" | "neutral"> = {
  comparable: "success",
  partially_comparable: "warning",
  not_comparable: "destructive",
  insufficient_data: "neutral",
};

interface PlannerViewProps {
  catalog: MediaCatalog;
  initialScenarios: SavedPlanningScenario[];
}

export function PlannerView({ catalog, initialScenarios }: PlannerViewProps) {
  const { t, locale } = useTranslation();
  const { user } = useSupabaseUser();
  const [searchOpen, setSearchOpen] = useState(false);
  const searchParams = useSearchParams();

  // Phase 22 §D/§S: arriving from "Planificar con este medio" (a media
  // profile page) carries ?media=<internal_key> and, when the outlet
  // has one, its own category id as ?category=<id> — both resolved
  // against the REAL catalog this component already has (never
  // trusted blindly; an unknown/stale value simply resolves to null
  // and the planner falls back to its normal empty start state). This
  // never bypasses validation: it only pre-selects the same filters a
  // person could pick by hand.
  const mediaContext = useMemo(
    () => resolveMediaContext(searchParams.get("media"), catalog.platforms),
    [searchParams, catalog.platforms]
  );

  // §3: discovery filters — progressive disclosure (category -> country
  // -> format), never the full taxonomy dumped at once.
  const [categoryId, setCategoryId] = useState<string>(
    () => resolveIdContext(searchParams.get("category"), catalog.categories)?.id ?? mediaContext?.media_category_id ?? ""
  );
  const [countryId, setCountryId] = useState<string>(() => resolveIdContext(searchParams.get("country"), catalog.countries)?.id ?? "");
  const [mediaFormatId, setMediaFormatId] = useState<string>("");
  const [hasSearched, setHasSearched] = useState(() => !!(searchParams.get("media") || searchParams.get("category") || searchParams.get("country")));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<PlanningResult | null>(null);

  // Runs once, only when arriving with real navigation context — a
  // plain visit to /planner still starts from the friendly empty state
  // (§F), never an automatic query nobody asked for.
  useEffect(() => {
    if (hasSearched) runSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §6: 2-4 selected opportunities, keyed by exact commercial variant.
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  // §15/§16: budget scenario.
  const [budgetAmount, setBudgetAmount] = useState<string>("");
  const [budgetCurrency, setBudgetCurrency] = useState<string>(SUPPORTED_CURRENCIES[0].code);

  // §28: saved scenarios.
  const [scenarios, setScenarios] = useState<SavedPlanningScenario[]>(initialScenarios);
  const [scenarioName, setScenarioName] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [scenarioLoadError, setScenarioLoadError] = useState(false);

  const formatsForFilter = categoryId ? catalog.formats.filter((f) => f.media_category_id === categoryId) : catalog.formats;

  async function runSearch(overrides?: { categoryId?: string }) {
    setLoading(true);
    setHasSearched(true);
    try {
      const data = await fetchPlanningOpportunitiesAction({
        categoryId: (overrides?.categoryId ?? categoryId) || null,
        countryId: countryId || null,
        mediaFormatId: mediaFormatId || null,
      });
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  // §13: one-click "Explorar" shortcuts from the friendly start state —
  // real categories from the catalog, never an invented "most popular"
  // ranking (no usage data exists to back that claim).
  function quickExplore(catId: string) {
    setCategoryId(catId);
    setMediaFormatId("");
    runSearch({ categoryId: catId });
  }

  const opportunities = result?.opportunities ?? [];

  function labelForOpportunity(o: Opportunity) {
    const platform = result?.platforms.find((p) => p.id === o.platformId);
    const property = o.propertyId ? result?.properties.find((p) => p.id === o.propertyId) : null;
    const format = result?.formats.find((f) => f.id === o.mediaFormatId);
    const category = result?.categories.find((c) => c.id === platform?.media_category_id);
    return {
      outlet: platform?.display_label ?? "—",
      property: property?.display_label ?? null,
      format: format?.display_label ?? "—",
      category: category?.display_label ?? "—",
    };
  }

  function toggleSelect(o: Opportunity) {
    const key = opportunityKey(o);
    setSelectedKeys((prev) => toggleOpportunitySelection(prev, key)); // §6: cap at 4, never a duplicate
  }

  const selectedOpportunities = useMemo(
    () => selectedKeys.map((key) => opportunities.find((o) => opportunityKey(o) === key)).filter((o): o is Opportunity => !!o),
    [selectedKeys, opportunities]
  );

  // §9: pairwise comparability across the selected set — never a
  // single collapsed verdict for the whole set.
  const pairwiseComparability = useMemo(() => {
    const offers = selectedOpportunities.map((o) => (o.rateCardGroup?.current ? { currency: o.rateCardGroup.current.currency, pricingUnit: o.rateCardGroup.current.pricingUnit } : null));
    const results: { a: Opportunity; b: Opportunity; result: ReturnType<typeof assessPriceComparability> }[] = [];
    for (let i = 0; i < offers.length; i++) {
      for (let j = i + 1; j < offers.length; j++) {
        results.push({ a: selectedOpportunities[i], b: selectedOpportunities[j], result: assessPriceComparability(offers[i], offers[j]) });
      }
    }
    return results;
  }, [selectedOpportunities]);

  // §19: manual per-opportunity quantities -> subtotal/total/remaining.
  const budgetAmountNum = Number(budgetAmount);
  const budgetValid = budgetAmount.trim() !== "" && Number.isFinite(budgetAmountNum) && budgetAmountNum > 0;

  const lineItems: PlannedLineItem[] = selectedOpportunities.map((o) => {
    const current = o.rateCardGroup?.current ?? null;
    return {
      offer: current ? { price: current.price, currency: current.currency, pricingUnit: current.pricingUnit } : { price: 0, currency: "", pricingUnit: "" },
      quantity: quantities[opportunityKey(o)] ?? 0,
      hasCurrentOffer: hasCurrentCommercialOffer(o),
    };
  });

  const totals = budgetValid ? computeMultiOpportunityTotals(lineItems, budgetAmountNum, budgetCurrency) : null;

  // Phase 23 §14/§15: a concise, factual restatement of the plan
  // state already computed above — no new math, no score, no winner.
  const withRateCardCount = selectedOpportunities.filter(hasCurrentCommercialOffer).length;
  const planSummaryLines = buildPlanSummaryLines(
    {
      selectedCount: selectedOpportunities.length,
      withRateCardCount,
      budgetValid: !!totals,
      overBudget: totals?.overBudget ?? false,
      formattedBudgetDelta: totals ? formatPrice(Math.abs(totals.difference), budgetCurrency) : null,
    },
    locale
  );
  const plannerWarnings = groupPlannerWarnings({
    pairwiseReasons: pairwiseComparability.map((p) => p.result.reasons),
    missingRateCardCount: selectedOpportunities.length - withRateCardCount,
    staleSignalCount: countStaleSignals(
      selectedOpportunities.flatMap((o) => result?.latestSignalsByPlatform[o.platformId] ?? []),
      new Date()
    ),
  });

  async function handleSaveScenario() {
    if (!user) return;
    setSaveStatus("saving");
    const result = await saveScenarioAction({
      name: scenarioName,
      budgetAmount: budgetValid ? budgetAmountNum : null,
      budgetCurrency: budgetValid ? budgetCurrency : null,
      opportunities: selectedOpportunities.map((o) => ({
        platformId: o.platformId,
        propertyId: o.propertyId,
        mediaFormatId: o.mediaFormatId,
        quantity: quantities[opportunityKey(o)] ?? 0,
      })),
    });
    if (result.ok) {
      setSaveStatus("saved");
      setScenarioName("");
      setScenarios((prev) => [result.scenario, ...prev.filter((s) => s.id !== result.scenario.id)]);
    } else {
      setSaveStatus("error");
    }
  }

  async function handleLoadScenario(id: string) {
    setScenarioLoadError(false);
    const recalculated = await getScenarioAction(id);
    if (!recalculated) {
      setScenarioLoadError(true);
      return;
    }
    setBudgetAmount(recalculated.scenario.budgetAmount !== null ? String(recalculated.scenario.budgetAmount) : "");
    if (recalculated.scenario.budgetCurrency) setBudgetCurrency(recalculated.scenario.budgetCurrency);
    setResult((prev) => ({
      opportunities: recalculated.opportunities,
      platforms: prev?.platforms ?? [],
      categories: prev?.categories ?? [],
      formats: prev?.formats ?? [],
      properties: prev?.properties ?? [],
      metricDefinitions: prev?.metricDefinitions ?? [],
      latestSignalsByPlatform: prev?.latestSignalsByPlatform ?? {},
    }));
    const nextQuantities: Record<string, number> = {};
    const nextSelected: string[] = [];
    for (const stored of recalculated.scenario.opportunities) {
      const match = recalculated.opportunities.find(
        (o) => o.platformId === stored.platformId && o.propertyId === stored.propertyId && o.mediaFormatId === stored.mediaFormatId
      );
      if (match) {
        const key = opportunityKey(match);
        nextSelected.push(key);
        nextQuantities[key] = stored.quantity;
      }
    }
    setSelectedKeys(nextSelected);
    setQuantities(nextQuantities);
    setHasSearched(true);
  }

  async function handleDeleteScenario(id: string) {
    const res = await deleteScenarioAction(id);
    if (res.ok) setScenarios((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8">
          <div className="flex items-center gap-2">
            <Compass size={18} className="text-brandLavender" aria-hidden="true" />
            <h1 className="font-display text-xl font-semibold text-ink-900">{t("mediaPlanner.title")}</h1>
          </div>
          <p className="mt-1 max-w-2xl text-sm text-ink-600">{t("mediaPlanner.subtitle")}</p>

          {/* Phase 22 §D: honest confirmation that arriving-with-context
              actually took — never silent, and never implying anything
              beyond "this filter is pre-selected for you". */}
          {mediaContext && (
            <p className="mt-2 inline-block rounded-full border border-primary/30 bg-primary-soft/30 px-3 py-1 text-xs font-medium text-ink-700">
              {t("mediaPlanner.contextBannerLabel", { name: mediaContext.display_label })}
            </p>
          )}

          {/* §3: discovery start state */}
          <Card className="mt-4">
            <h2 className="font-display text-sm font-semibold text-ink-900">{t("mediaPlanner.startQuestion")}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-ink-600">
                {t("mediaPlanner.filters.category")}
                <select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setMediaFormatId("");
                  }}
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-primary"
                >
                  <option value="">{t("mediaPlanner.filters.categoryPlaceholder")}</option>
                  {catalog.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-ink-600">
                {t("mediaPlanner.filters.country")}
                <select
                  value={countryId}
                  onChange={(e) => setCountryId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-primary"
                >
                  <option value="">{t("mediaPlanner.filters.countryPlaceholder")}</option>
                  {catalog.countries.map((c) => (
                    <option key={c.id} value={c.id}>{c.display_label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-ink-600">
                {t("mediaPlanner.filters.format")}
                <select
                  value={mediaFormatId}
                  onChange={(e) => setMediaFormatId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-primary"
                >
                  <option value="">{t("mediaPlanner.filters.formatPlaceholder")}</option>
                  {formatsForFilter.map((f) => (
                    <option key={f.id} value={f.id}>{f.display_label}</option>
                  ))}
                </select>
              </label>
            </div>
            <Button className="mt-3" onClick={() => runSearch()} disabled={loading}>
              {loading ? t("mediaPlanner.opportunitiesLoading") : t("mediaPlanner.filters.search")}
            </Button>
          </Card>

          {/* §13: friendly start state — never a bare, technical empty
              filter panel. Category shortcuts are real catalog
              categories, "Explorar" rather than an invented "most
              popular" ranking (no usage data backs that claim). */}
          {!hasSearched && (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
              <Compass size={20} className="mx-auto text-brandLavender" aria-hidden="true" />
              <p className="mt-2 font-display text-sm font-semibold text-ink-900">{t("mediaPlanner.startStateTitle")}</p>
              <p className="mt-1 text-xs text-ink-500">{t("mediaPlanner.startStateBody")}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {catalog.categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => quickExplore(c.id)}
                    className="rounded-full border border-line bg-canvas px-3.5 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary"
                  >
                    {c.display_label} — {t("media.exploreCta")}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Opportunity discovery grid */}
          {hasSearched && (
            <section className="mt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-sm font-semibold text-ink-900">{t("mediaPlanner.opportunitiesTitle")}</h2>
                {/* §8: compact, always-visible selection count once the
                    user has made at least one pick — never obstructive,
                    just a small pill beside the section heading. */}
                {selectedKeys.length > 0 && (
                  <span className="rounded-full bg-surface2 px-2.5 py-1 text-[11px] font-medium text-ink-600">
                    {t("mediaPlanner.selectionCount", { n: selectedKeys.length })}
                  </span>
                )}
              </div>
              {selectedKeys.length >= 4 && (
                <p className="mt-1 text-xs text-vanilla">{t("mediaPlanner.selectionLimitReached")}</p>
              )}
              {loading ? (
                <p className="mt-2 text-sm text-ink-500">{t("mediaPlanner.opportunitiesLoading")}</p>
              ) : opportunities.length === 0 ? (
                // Phase 21 item 24/25: an empty result answers what's
                // missing and offers one concrete next action — adjust
                // the filters, or contribute the missing data — rather
                // than a bare sentence with nothing to do next.
                <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
                  <Info size={18} className="mx-auto text-ink-400" aria-hidden="true" />
                  <p className="mt-2 text-sm text-ink-700">{t("mediaPlanner.opportunitiesEmpty")}</p>
                  <p className="mt-1 text-xs text-ink-500">{t("mediaPlanner.opportunitiesEmptyHint")}</p>
                  <a href="/contribute" className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                    {t("media.ctaContribute")}
                  </a>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {opportunities.map((o) => {
                    const key = opportunityKey(o);
                    const labels = labelForOpportunity(o);
                    const selected = selectedKeys.includes(key);
                    const current = o.rateCardGroup?.current ?? null;
                    const signals = result?.latestSignalsByPlatform[o.platformId] ?? [];
                    return (
                      <EntityCard
                        key={key}
                        avatar={<EntityAvatar label={labels.outlet} size={32} />}
                        title={labels.outlet}
                        meta={`${labels.category}${labels.property ? ` · ${labels.property}` : ""} · ${labels.format}`}
                        selectable
                        selected={selected}
                        disabled={!selected && selectedKeys.length >= 4}
                        onSelect={() => toggleSelect(o)}
                        body={
                          <div className="mt-1 rounded-lg bg-canvas p-2">
                            {current ? (
                              <p className="tabular text-sm font-semibold text-ink-900">
                                {formatPrice(current.price, current.currency)}
                                <span className="ml-1 text-xs font-normal text-ink-500">/ {t(`media.pricingUnit.${current.pricingUnit}`)}</span>
                              </p>
                            ) : (
                              <p className="text-xs text-ink-500">{explainMissingRateCard(locale)}</p>
                            )}
                            <div className="mt-1 text-[11px] text-ink-500">
                              {signals.length > 0 ? (
                                <p className="flex items-center gap-1"><TrendingUp size={11} aria-hidden="true" /> {signals.length} {t("mediaPlanner.dimension.publicSignal").toLowerCase()}</p>
                              ) : (
                                <p>{t("mediaPlanner.publicSignalNone")}</p>
                              )}
                            </div>
                          </div>
                        }
                        footer={
                          <p className={`text-xs font-medium ${selected ? "text-primary" : "text-ink-500"}`}>
                            {selected ? t("mediaPlanner.selectedCta") : t("mediaPlanner.selectCta")}
                          </p>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* §14/§15: "medios seleccionados" is its own visible step
              ahead of the comparison table, and always communicates
              whether another opportunity can still be added — the
              workspace never reads as fixed to exactly two. */}
          {selectedOpportunities.length > 0 && (
            <section className="mt-5">
              <h2 className="font-display text-sm font-semibold text-ink-900">{t("mediaPlanner.selectedSectionTitle")}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedOpportunities.map((o) => {
                  const label = labelForOpportunity(o).outlet;
                  return (
                    <span key={opportunityKey(o)} className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft/30 py-1.5 pl-3 pr-2 text-xs font-medium text-ink-800">
                      {label}
                      <button
                        type="button"
                        onClick={() => toggleSelect(o)}
                        aria-label={`${t("mediaPlanner.removeFromComparison")} — ${label}`}
                        className="rounded-full p-0.5 text-ink-400 hover:bg-white/40 hover:text-destructive"
                      >
                        <X size={11} aria-hidden="true" />
                      </button>
                    </span>
                  );
                })}
                {selectedOpportunities.length < 4 ? (
                  <span className="inline-flex items-center rounded-full border border-dashed border-line px-3 py-1.5 text-xs text-ink-500">
                    + {t("mediaPlanner.addAnotherHint")}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-vanilla-soft px-3 py-1.5 text-xs text-vanilla">
                    {t("mediaPlanner.selectionLimitReached")}
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Phase 23 §14: a plain-language restatement of the plan's
              current state — no score, no winner, just what's already
              true about the selection above. */}
          {planSummaryLines.length > 0 && (
            <section className="mt-3 rounded-xl border border-line bg-canvas p-3">
              <ul className="space-y-0.5 text-xs text-ink-700">
                {planSummaryLines.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Phase 23 §15: warnings grouped by category (never scattered
              — the per-card detail below still exists for context, this
              is the "at a glance" roll-up). */}
          {plannerWarnings.length > 0 && (
            <section className="mt-2 flex flex-wrap gap-2">
              {plannerWarnings.map((w) => (
                <span key={w.id} className="inline-flex items-center gap-1 rounded-full bg-vanilla-soft px-2.5 py-1 text-[11px] font-medium text-vanilla">
                  <AlertTriangle size={11} aria-hidden="true" />
                  {t(`mediaPlanner.warnings.${w.id}`, { n: w.count })}
                </span>
              ))}
            </section>
          )}

          {/* §6/§7: comparison workspace */}
          {selectedOpportunities.length > 0 && (
            <section className="mt-5">
              <h2 className="font-display text-sm font-semibold text-ink-900">{t("mediaPlanner.comparisonTitle")}</h2>
              {selectedOpportunities.length < 2 ? (
                <p className="mt-2 text-sm text-ink-500">{t("mediaPlanner.comparisonEmpty")}</p>
              ) : (
                <>
                  {pairwiseComparability.map(({ a, b, result: cmp }, idx) => (
                    <div key={idx} className="mt-2 flex items-start gap-2 rounded-xl border border-line bg-surface p-3">
                      <Badge tone={COMPARABILITY_TONE[cmp.state]}>{t(`mediaPlanner.comparability.${cmp.state}`)}</Badge>
                      <p className="text-xs text-ink-600">
                        <span className="font-medium">{labelForOpportunity(a).outlet}</span> vs <span className="font-medium">{labelForOpportunity(b).outlet}</span>: {" "}
                        {explainPriceComparability(cmp, a.rateCardGroup?.current ?? null, b.rateCardGroup?.current ?? null, locale)}
                      </p>
                    </div>
                  ))}

                  {/* §31: stacked cards on mobile, grid on larger screens — never a forced 4-column squeeze at 375px. */}
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {selectedOpportunities.map((o) => {
                      const key = opportunityKey(o);
                      const labels = labelForOpportunity(o);
                      const group = o.rateCardGroup;
                      const current = group?.current ?? null;
                      const signals = result?.latestSignalsByPlatform[o.platformId] ?? [];
                      const outletSlug = result?.platforms.find((p) => p.id === o.platformId)?.internal_key ?? null;
                      return (
                        <Card key={key} className="relative p-4">
                          <button
                            type="button"
                            onClick={() => toggleSelect(o)}
                            aria-label={t("mediaPlanner.removeFromComparison")}
                            className="absolute right-3 top-3 rounded-full p-1 text-ink-400 hover:bg-surface2 hover:text-ink-700"
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                          <p className="text-sm font-semibold text-ink-900">{labels.outlet}</p>
                          <p className="text-xs text-ink-500">{labels.category}{labels.property ? ` · ${labels.property}` : ""}</p>

                          <dl className="mt-3 space-y-2 text-xs">
                            <div>
                              <dt className="text-ink-400">{t("mediaPlanner.dimension.format")}</dt>
                              <dd className="text-ink-800">{labels.format}</dd>
                            </div>
                            <div>
                              <dt className="text-ink-400">{t("mediaPlanner.dimension.price")}</dt>
                              <dd className="tabular text-ink-800">
                                {current ? (
                                  `${formatPrice(current.price, current.currency)} / ${t(`media.pricingUnit.${current.pricingUnit}`)}`
                                ) : (
                                  <>
                                    {explainMissingRateCard(locale)}{" "}
                                    {/* Phase 21B item B9 / Phase 22 §R: an outlet without a current
                                        rate card stays discoverable and comparable (never hidden), but
                                        is honestly labeled and links to the EXISTING contribution flow
                                        — no new flow is created here, only this exact outlet's own real
                                        slug carried along so the destination knows who it's for. */}
                                    <a href={contributeRateCardHref(outletSlug)} className="font-medium text-primary hover:underline">
                                      {t("mediaPlanner.contributeRateCardCta")}
                                    </a>
                                  </>
                                )}
                              </dd>
                            </div>
                            {group?.previous && group.change && current && (
                              <div>
                                <dt className="text-ink-400">{t("mediaPlanner.dimension.change")}</dt>
                                <dd className="tabular text-ink-800">
                                  {group.change.absolute >= 0 ? "+" : ""}
                                  {formatPrice(group.change.absolute, current.currency)}
                                  {group.change.percent !== null && ` (${group.change.percent >= 0 ? "+" : ""}${group.change.percent.toFixed(1)}%)`}
                                </dd>
                              </div>
                            )}
                            <div>
                              <dt className="text-ink-400">{t("mediaPlanner.dimension.publicSignal")}</dt>
                              <dd className="text-ink-800">
                                {signals.length > 0
                                  ? signals.map((s) => `${s.value} (${freshnessLabel(s.observed_at, new Date(), locale)})`).join(" · ")
                                  : t("mediaPlanner.publicSignalNone")}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-ink-400">{t("mediaPlanner.dimension.efficiency")}</dt>
                              <dd className="text-ink-800">{explainMissingEfficiencyEstimate(locale)}</dd>
                            </div>
                          </dl>

                          {current && (current.validFrom || current.source) && (
                            <details className="mt-2 text-xs text-ink-600">
                              <summary className="cursor-pointer select-none font-medium text-ink-500 outline-none focus-visible:text-primary">
                                {t("mediaPlanner.moreDetails")}
                              </summary>
                              <dl className="mt-1.5 space-y-1.5">
                                <div>
                                  <dt className="text-ink-400">{t("mediaPlanner.dimension.validity")}</dt>
                                  <dd className="text-ink-800">{current.validFrom}{current.validTo ? ` – ${current.validTo}` : ""}</dd>
                                </div>
                                <div>
                                  <dt className="text-ink-400">{t("mediaPlanner.dimension.source")}</dt>
                                  <dd className="text-ink-800">{current.source}</dd>
                                </div>
                              </dl>
                            </details>
                          )}

                          {current && (
                            <div className="mt-3 border-t border-line pt-2">
                              <label className="text-[11px] font-medium text-ink-600">
                                {t("mediaPlanner.quantityLabel")}
                                <input
                                  type="number"
                                  min={0}
                                  step={1}
                                  value={quantities[key] ?? 0}
                                  disabled={requiresCommercialReview(current.pricingUnit)}
                                  onChange={(e) => setQuantities((prev) => ({ ...prev, [key]: Math.max(0, Math.trunc(Number(e.target.value) || 0)) }))}
                                  className="mt-1 w-full rounded-lg border border-line bg-canvas px-2 py-1 text-sm text-ink-900 outline-none transition-colors focus-visible:border-primary disabled:opacity-50"
                                  aria-label={`${t("mediaPlanner.quantityLabel")} — ${labels.outlet}`}
                                />
                              </label>
                              {requiresCommercialReview(current.pricingUnit) && (
                                <p className="mt-1 text-[10px] text-vanilla">{explainRequiresCommercialReview(locale)}</p>
                              )}
                              {!requiresCommercialReview(current.pricingUnit) && current.currency !== budgetCurrency && budgetValid && (
                                <p className="mt-1 text-[10px] text-vanilla">{t("mediaPlanner.currencyMismatch")}</p>
                              )}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          )}

          {/* §15-§21: budget scenario */}
          {selectedOpportunities.length > 0 && (
            <section className="mt-5">
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-brandMint" aria-hidden="true" />
                <h2 className="font-display text-sm font-semibold text-ink-900">{t("mediaPlanner.budgetTitle")}</h2>
              </div>
              <Card className="mt-2">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="text-xs font-medium text-ink-600 sm:col-span-2">
                    {t("mediaPlanner.budgetAmountLabel")}
                    <Input
                      type="number"
                      min={0}
                      value={budgetAmount}
                      onChange={(e) => setBudgetAmount(e.target.value)}
                      className="mt-1"
                      inputMode="decimal"
                    />
                  </label>
                  <label className="text-xs font-medium text-ink-600">
                    {t("mediaPlanner.budgetCurrencyLabel")}
                    <select
                      value={budgetCurrency}
                      onChange={(e) => setBudgetCurrency(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-900 outline-none focus-visible:border-primary"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>{c.code}</option>
                      ))}
                    </select>
                  </label>
                </div>

                {!budgetValid ? (
                  <p className="mt-3 text-xs text-ink-500">{t("mediaPlanner.budgetNotSet")}</p>
                ) : totals ? (
                  <div className="mt-4 rounded-xl border border-line bg-canvas p-3">
                    {/* POST-MVP MOBILE PASS §8: a single readable column
                        below sm — a 2-up grid of currency-formatted
                        stats got tight/wrappy at 320-425px; full width
                        stays "compact but visible" per §8's own note on
                        "Seleccionados (N/4)". */}
                    <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-4">
                      <div>
                        <p className="text-ink-400">{t("mediaPlanner.summaryBudget")}</p>
                        <p className="tabular font-semibold text-ink-900">{formatPrice(budgetAmountNum, budgetCurrency)}</p>
                      </div>
                      <div>
                        <p className="text-ink-400">{t("mediaPlanner.summaryPlanned")}</p>
                        <p className="tabular font-semibold text-ink-900">{formatPrice(totals.totalPlanned, budgetCurrency)}</p>
                      </div>
                      <div>
                        <p className="text-ink-400">{totals.overBudget ? t("mediaPlanner.summaryOverBudget") : t("mediaPlanner.summaryRemaining")}</p>
                        <p className={`tabular font-semibold ${totals.overBudget ? "text-destructive" : "text-ink-900"}`}>
                          {formatPrice(Math.abs(totals.difference), budgetCurrency)}
                        </p>
                      </div>
                      <div>
                        <p className="text-ink-400">{t("mediaPlanner.summaryWarnings")}</p>
                        <p className="font-semibold text-ink-900">{totals.excludedCount}</p>
                      </div>
                    </div>
                    {totals.overBudget && (
                      <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
                        <AlertTriangle size={13} aria-hidden="true" /> {t("mediaPlanner.summaryOverBudget")}
                      </p>
                    )}
                  </div>
                ) : null}
              </Card>
            </section>
          )}

          {/* §28: save / reopen scenarios */}
          <section className="mt-5">
            <div className="flex items-center gap-2">
              <Bookmark size={16} className="text-brandPeach" aria-hidden="true" />
              <h2 className="font-display text-sm font-semibold text-ink-900">{t("mediaPlanner.savedScenariosTitle")}</h2>
            </div>

            {!user ? (
              <p className="mt-2 text-sm text-ink-500">{t("mediaPlanner.signInRequired")}</p>
            ) : (
              <>
                {selectedOpportunities.length > 0 && (
                  <Card className="mt-2">
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Input
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        placeholder={t("mediaPlanner.saveNamePlaceholder")}
                        className="sm:flex-1"
                      />
                      <Button onClick={handleSaveScenario} disabled={saveStatus === "saving" || scenarioName.trim() === ""}>
                        {t("mediaPlanner.saveCta")}
                      </Button>
                    </div>
                    {saveStatus === "saved" && <p className="mt-2 text-xs text-pistachio">{t("mediaPlanner.saveSuccess")}</p>}
                    {saveStatus === "error" && <p className="mt-2 text-xs text-destructive">{t("mediaPlanner.saveError")}</p>}
                  </Card>
                )}

                {scenarioLoadError && <p className="mt-2 text-xs text-destructive">{t("mediaPlanner.saveError")}</p>}

                {scenarios.length === 0 ? (
                  <p className="mt-2 text-sm text-ink-500">{t("mediaPlanner.savedScenariosEmpty")}</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {scenarios.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-3">
                        <div>
                          <p className="text-sm font-medium text-ink-900">{s.name}</p>
                          <p className="text-xs text-ink-500">
                            {s.opportunities.length} · {s.budgetAmount !== null && s.budgetCurrency ? formatPrice(s.budgetAmount, s.budgetCurrency) : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => handleLoadScenario(s.id)} className="text-xs font-medium text-primary hover:underline">
                            {t("mediaPlanner.loadScenario")}
                          </button>
                          <button
                            onClick={() => handleDeleteScenario(s.id)}
                            aria-label={`${t("mediaPlanner.deleteScenario")} — ${s.name}`}
                            className="rounded-full p-1 text-ink-400 hover:bg-surface2 hover:text-destructive"
                          >
                            <Trash2 size={14} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>

          <div className="mt-6 flex items-start gap-2 rounded-xl border border-dashed border-line bg-surface p-3">
            <Info size={14} className="mt-0.5 shrink-0 text-ink-400" aria-hidden="true" />
            <p className="text-xs text-ink-600">{t("mediaPlanner.disclaimerNoWinner")}</p>
          </div>
        </main>
      </div>
    </div>
  );
}
