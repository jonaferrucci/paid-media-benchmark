"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { Hero } from "@/components/dashboard/Hero";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { Workspace } from "@/components/dashboard/Workspace";
import { DiscoveryWizard } from "@/components/dashboard/wizard/DiscoveryWizard";
import { CohortFilters } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

// PHASE 29 — REMOVE PROTOTYPE DATA FROM PRODUCTION.
//
// This page used to compute and render its own parallel "benchmark
// result" (a local ResultView, entirely fed by lib/mock/benchmarks'
// getKpiResults/getReachBenchmark/getCohortSteps, plus three homepage
// modules — GlobalInsights, MiniTrend, FeaturedModules — showing
// specific fabricated CPM/CPV/CTR numbers via lib/mock/random's
// seededRandom/randomInRange, and an "Explore market" tab
// (ExploreMarket) built entirely the same way) — none of it backed by
// the real benchmark engine, all of it presented with full visual
// weight as if it were real. That entire fabricated surface is removed
// here rather than "fixed": the real, engine-backed, sample-size-safe
// equivalent already exists at /benchmark (lib/benchmark/engine.ts,
// unchanged by this phase). This page's job is a discovery layer that
// routes into the real tools — never a second, fabricated copy of any
// of them.
//
// PHASE 39 (§3/§14): reordered to Hero → Benchmark Finder (the one
// primary CTA) → Workspace (contextual: onboarding/status/continue-work
// for a signed-in user, nothing for signed-out) → secondary tools
// (Importar/Explorar/Planificar). Previously Workspace and QuickActions
// both sat ABOVE the Finder, competing with it; the Finder is now the
// visual protagonist directly under the Hero, exactly as it already was
// on /benchmark's own real form.
//
// DiscoveryWizard itself only ever collects filter selections from the
// real, protected taxonomy option lists (lib/mock/taxonomies — a static
// reference catalog of selectable platforms/verticals/countries/etc.,
// not a source of fabricated benchmark NUMBERS) and never computes or
// displays a benchmark result itself. On completion it hands the
// collected filters to the real /benchmark page via the same
// prefillPlatform/prefillObjective/prefillVertical/prefillCountry query
// params app/contribute/ContributeLanding.tsx's "compare this campaign"
// link already uses — no new prefill mechanism invented, no auto-submit.
//
// PHASE 30 fix: SearchOverlay's "Broad"/"Remarketing" audience-strategy
// suggestions (components/dashboard/SearchOverlay.tsx) call onApply
// with ONLY `{ audienceStrategy: ... }` set — no platform/objective/
// vertical/country. Before this fix, this function silently dropped
// that value (it only ever read the four fields above), so clicking
// one of those chips produced an EMPTY query string and landed on a
// completely blank /benchmark — the exact "selección de Home que no se
// resuelve en /benchmark" this phase's audit was asked to find and fix.
// Fixed by extending the SAME existing prefill mechanism with one more
// param, prefillAudienceStrategy, read by BenchmarkExplorer.tsx right
// alongside the other four — not a second/parallel prefill mechanism.
//
// PHASE 39 (§10/§11): the wizard's "Afinar benchmark" panel now also
// collects funnelStage/spendBand/durationBand (see ContextStep.tsx) —
// this function was silently dropping all three (the exact same class
// of bug Phase 30 fixed for audienceStrategy) since it only ever read
// the original four fields. Fixed the same way: three more params,
// prefillFunnelStage/prefillSpendBand/prefillDurationBand, which
// BenchmarkExplorer.tsx already reads (added for the campaign-detail
// "Comparar con benchmark" activation in Phase 32) — still one prefill
// mechanism, no second one.
//
// PHASE 39.1 (§1/§2): closed the two remaining gaps Phase 39's own
// report flagged. Time Window now forwards as prefillTimeWindow, read
// by BenchmarkExplorer.tsx and validated there against the values
// actually implemented end-to-end (see SUPPORTED_PREFILL_TIME_WINDOWS
// in that file) — still one prefill mechanism. Age has NO equivalent
// fix: BenchmarkExplorer.tsx has no minAge/maxAge concept anywhere in
// its Draft/query, so there is no honest way to prefill it — instead
// the Age control was removed from Home's "Afinar benchmark" panel
// entirely (see ContextStep.tsx) rather than leave a control that looks
// like it works and silently doesn't.
function cohortFiltersToPrefillQuery(filters: Partial<CohortFilters>): string {
  const params = new URLSearchParams();
  if (filters.platform) params.set("prefillPlatform", filters.platform);
  if (filters.objective) params.set("prefillObjective", filters.objective);
  if (filters.verticalId) params.set("prefillVertical", filters.verticalId);
  if (filters.country) params.set("prefillCountry", filters.country);
  if (filters.audienceStrategy) params.set("prefillAudienceStrategy", filters.audienceStrategy);
  if (filters.funnelStage) params.set("prefillFunnelStage", filters.funnelStage);
  if (filters.spendBand) params.set("prefillSpendBand", filters.spendBand);
  if (filters.durationBand) params.set("prefillDurationBand", filters.durationBand);
  if (filters.timeWindow) params.set("prefillTimeWindow", filters.timeWindow);
  return params.toString();
}

export default function OverviewPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  function goToBenchmark(filters: Partial<CohortFilters>) {
    const query = cohortFiltersToPrefillQuery(filters);
    router.push(query ? `/benchmark?${query}` : "/benchmark");
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {/* PHASE 29: the quick-search overlay's suggestions were already
          honest (a fixed, non-fabricated list of real taxonomy values —
          "Meta Ads", "Beauty & Personal Care", etc., no numbers
          attached) — only its destination changes, from local fake
          result state to a real prefilled /benchmark navigation. */}
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={goToBenchmark} />}

      <div>
        <Hero />

        {/* PHASE 39 (§3/§14): the Benchmark Finder is Home's one
            protagonist action — a distinct card, directly under the
            Hero, its own heading reusing finder.title ("Encontrá tu
            benchmark") so it visually outweighs every other block on
            the page (Workspace's own headings and QuickActions'
            "Más herramientas" are both plain, unboxed text). */}
        <section className="mx-auto mb-10 max-w-4xl px-4">
          <div className="rounded-3xl border border-line bg-surface/60 pb-2 pt-6 shadow-sm sm:pt-8">
            <h2 className="px-4 text-center font-display text-xl font-semibold text-ink-900 sm:text-2xl">
              {t("finder.title")}
            </h2>
            <DiscoveryWizard onComplete={goToBenchmark} />
          </div>
        </section>

        {/* PHASE 26 (§1/§2): the signed-in workspace hub — renders
            nothing for a signed-out visitor or while loading, so the
            discovery experience above/below is unaffected. Real data
            only (lib/contribute/workspaceActions.ts), untouched by this
            phase beyond the internal section reorder (see
            Workspace.tsx). Placed right after the Finder (§12/§14: "para
            usuario nuevo autenticado, onboarding puede ubicarse cerca
            del Finder"). */}
        <Workspace />

        <QuickActions />
      </div>
    </div>
  );
}
