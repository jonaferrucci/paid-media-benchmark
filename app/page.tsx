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
// unchanged by this phase), and the discovery-only components already
// on this page (Workspace = real signed-in data, QuickActions = plain
// navigation, no numbers) were already correct. This page's job now IS
// what the product brief calls for: a discovery layer that routes into
// the real tools — Comparar benchmarks (DiscoveryWizard → /benchmark),
// Planificar medios, Explorar medios, Aportar datos (QuickActions), and
// Mis comparaciones / Workspace (real, when signed in) — never a
// second, fabricated copy of any of them.
//
// DiscoveryWizard itself is kept exactly as it was: it only ever
// collects filter selections from the real, protected taxonomy option
// lists (lib/mock/taxonomies — a static reference catalog of
// selectable platforms/verticals/countries/etc., not a source of
// fabricated benchmark NUMBERS, so out of this phase's scope) and never
// computed or displayed a benchmark result itself. Only what happened
// on completion changes: instead of rendering a fake local result, it
// now hands the collected filters to the real /benchmark page via the
// same prefillPlatform/prefillObjective/prefillVertical/prefillCountry
// query params app/contribute/ContributeLanding.tsx's "compare this
// campaign" link already uses — no new prefill mechanism invented.
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
function cohortFiltersToPrefillQuery(filters: Partial<CohortFilters>): string {
  const params = new URLSearchParams();
  if (filters.platform) params.set("prefillPlatform", filters.platform);
  if (filters.objective) params.set("prefillObjective", filters.objective);
  if (filters.verticalId) params.set("prefillVertical", filters.verticalId);
  if (filters.country) params.set("prefillCountry", filters.country);
  if (filters.audienceStrategy) params.set("prefillAudienceStrategy", filters.audienceStrategy);
  return params.toString();
}

export default function OverviewPage() {
  const router = useRouter();
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

        {/* PHASE 26 (§1/§2): the signed-in workspace hub — renders
            nothing for a signed-out visitor or while loading, so the
            marketing/discovery experience below is unaffected. Real
            data only (lib/contribute/workspaceActions.ts), untouched
            by this phase. */}
        <Workspace />

        <QuickActions />

        <div className="space-y-10 pb-16">
          <DiscoveryWizard onComplete={goToBenchmark} />
        </div>
      </div>
    </div>
  );
}
