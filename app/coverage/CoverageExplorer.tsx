"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { Select } from "@/app/benchmark/Select";
import type { CoverageTaxonomies, CoverageTaxonomyOption } from "@/lib/benchmark/coverage";
import { fetchCoverageGrid } from "./actions";
import { CoverageGrid, type CoverageCellData, type SelectedCoverageCellKey } from "./CoverageGrid";
import { CoverageStatusLegend } from "./CoverageStatusLegend";
import { CoverageMetricVisibilityControl } from "./CoverageMetricVisibilityControl";
import { CoverageCellPanel } from "./CoverageCellPanel";
import { CoverageEmptyState } from "./CoverageEmptyState";
import { translateTaxonomyLabel, type TaxonomyKind } from "@/lib/i18n/taxonomyLabels";
import { benchmarkHrefForCohortFilters } from "@/lib/benchmark/prefillQuery";
import type { Locale } from "@/lib/i18n/translations";

// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1 (CUCURUCHO INTELLIGENCE 4.1
// — COVERAGE MAP UX POLISH added the metric-visibility control, status
// legend, contextual cell panel, and all-no-data empty state below; see
// each section's own comment).
//
// Platform + Objective + Country is a PRECONDITION (per the locked
// spec) — the matrix only renders once all three are selected. Vertical
// is never a precondition: it's the grid's own row axis, always the
// full canonical taxonomy (never filtered down to "only verticals with
// data" — an empty vertical must still appear, as a no_data row).

// INTELLIGENCE 4.1 (§1): a NEUTRAL default visible-metric subset, never
// an objective-derived one — this codebase has no canonical objective
// <-> metric compatibility mapping anywhere (platform_metrics and
// media_category_metrics are keyed by platform/media category, not by
// objective; see supabase/migrations/0003_metrics.sql and
// 0012_media_universe.sql). Per the spec's own explicit instruction
// ("if no canonical compatibility mapping exists, use a neutral default
// subset... and allow the user to change visible metrics"), these four
// are simply the most broadly applicable across every objective (cost
// per impression, click-through, cost per click, cost per acquisition)
// — never a claim that they are "the right" metrics for any specific
// objective. The user can add/remove any metric from Coverage's own
// canonical universe via CoverageMetricVisibilityControl below, purely
// as client-side presentation state — the full metric universe is
// already present in every fetchCoverageGrid response (see
// app/coverage/actions.ts), so toggling visibility never triggers a new
// query.
const DEFAULT_VISIBLE_METRIC_KEYS = ["cpm", "ctr", "cpc", "cpa"];

function labelFor(options: CoverageTaxonomyOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

// RELEASE POLISH (Section 1 — taxonomy localization): same labelFor
// lookup, then resolved through the shared taxonomyLabels helper.
// Never used for `platforms` — platform names are real brand/proper
// nouns and are never translated (see lib/i18n/taxonomyLabels.ts).
function translatedLabelFor(kind: TaxonomyKind, options: CoverageTaxonomyOption[], value: string, locale: Locale): string {
  return translateTaxonomyLabel(kind, value, labelFor(options, value), locale);
}

export function CoverageExplorer({ taxonomies }: { taxonomies: CoverageTaxonomies }) {
  const { t, locale } = useTranslation();
  const router = useRouter();
  // RELEASE POLISH (Section 1): translated once here so CoverageGrid
  // (which renders `vertical.label` directly) and every other spot
  // that reads taxonomies.verticals for display show the same,
  // already-translated labels — never a second, divergent translation
  // path for the grid vs. the selector/cell panel.
  const translatedVerticals = useMemo(
    () => taxonomies.verticals.map((v) => ({ ...v, label: translateTaxonomyLabel("vertical", v.value, v.label, locale) })),
    [taxonomies.verticals, locale]
  );
  const [searchOpen, setSearchOpen] = useState(false);
  const [platform, setPlatform] = useState("");
  const [objective, setObjective] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [grid, setGrid] = useState<Awaited<ReturnType<typeof fetchCoverageGrid>> | null>(null);
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string>>(new Set(DEFAULT_VISIBLE_METRIC_KEYS));
  const [selectedCell, setSelectedCell] = useState<CoverageCellData | null>(null);
  // INTELLIGENCE 4.1 (§5): a user-driven override that reveals the
  // normal matrix even when every cell is no_data. Reset to false any
  // time the underlying selection/grid changes, so a stale override
  // never carries over to a different, unrelated Platform+Objective+
  // Country combination.
  const [showMatrixOverride, setShowMatrixOverride] = useState(false);

  const ready = Boolean(platform && objective && country);

  async function loadGrid(nextPlatform: string, nextObjective: string, nextCountry: string) {
    setSelectedCell(null);
    setShowMatrixOverride(false);
    if (!nextPlatform || !nextObjective || !nextCountry) {
      setGrid(null);
      setError(false);
      return;
    }
    setLoading(true);
    setError(false);
    const verticalKeys = taxonomies.verticals.map((v) => v.value);
    const result = await fetchCoverageGrid({ platform: nextPlatform, objective: nextObjective, country: nextCountry }, verticalKeys);
    setLoading(false);
    if (!result.ok) {
      setError(true);
      setGrid(null);
      return;
    }
    setGrid(result);
    // Re-derive visible metrics against THIS grid's own metric universe
    // (defensive — Coverage's metric universe is expected to be stable
    // across queries, but never assume the previous grid's set still
    // applies). Anything from the neutral default that this grid
    // actually returns stays visible; if none of the defaults are
    // present (should not happen in practice), fall back to the full
    // set so the matrix is never accidentally empty of columns.
    const defaultsPresent = result.grid.metrics.filter((m) => DEFAULT_VISIBLE_METRIC_KEYS.includes(m));
    setVisibleMetrics(new Set(defaultsPresent.length > 0 ? defaultsPresent : result.grid.metrics));
  }

  function handlePlatformChange(value: string) {
    setPlatform(value);
    loadGrid(value, objective, country);
  }
  function handleObjectiveChange(value: string) {
    setObjective(value);
    loadGrid(platform, value, country);
  }
  function handleCountryChange(value: string) {
    setCountry(value);
    loadGrid(platform, objective, value);
  }

  function handleToggleMetric(metric: string) {
    setVisibleMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(metric)) {
        // Never allow hiding the last visible metric — an empty matrix
        // would communicate nothing at all.
        if (next.size === 1) return prev;
        next.delete(metric);
      } else {
        next.add(metric);
      }
      return next;
    });
  }

  const platformLabel = labelFor(taxonomies.platforms, platform);
  const objectiveLabel = translatedLabelFor("objective", taxonomies.objectives, objective, locale);
  const countryLabel = translatedLabelFor("country", taxonomies.countries, country, locale);

  // INTELLIGENCE 4.1 (§5): computed from the FULL, unfiltered grid
  // response (every metric in Coverage's canonical universe, every
  // vertical) — never from the user's current visible-metric selection.
  // Metric visibility is presentation-only and must never change
  // whether this gate fires.
  const allNoData = Boolean(grid && grid.ok && grid.grid.cells.length > 0 && grid.grid.cells.every((c) => c.status === "no_data"));

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {/* RELEASE POLISH (Section 3): see BenchmarkExplorer.tsx's identical
          comment — a suggestion chip always means "go look at that
          benchmark", so applying one navigates to /benchmark with the
          same prefill query Home's chips already use. */}
      {searchOpen && (
        <SearchOverlay onClose={() => setSearchOpen(false)} onApply={(filters) => router.push(benchmarkHrefForCohortFilters(filters))} />
      )}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 md:px-8">
          <div>
            <h1 className="font-display text-xl font-semibold text-ink-900">{t("coverageMap.title")}</h1>
            <p className="mt-1 text-sm text-ink-600">{t("coverageMap.subtitle")}</p>
          </div>

          <div className="grid grid-cols-1 gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-3">
            <Select
              label={t("contribute.platform")}
              value={platform}
              onChange={handlePlatformChange}
              allowEmpty
              required
              options={taxonomies.platforms.map((p) => ({ value: p.value, label: p.label }))}
            />
            <Select
              label={t("contribute.objective")}
              value={objective}
              onChange={handleObjectiveChange}
              allowEmpty
              required
              options={taxonomies.objectives.map((o) => ({ value: o.value, label: translateTaxonomyLabel("objective", o.value, o.label, locale) }))}
            />
            <Select
              label={t("contribute.country")}
              value={country}
              onChange={handleCountryChange}
              allowEmpty
              required
              options={taxonomies.countries.map((c) => ({ value: c.value, label: translateTaxonomyLabel("country", c.value, c.label, locale) }))}
            />
          </div>

          {!ready && <p className="text-sm text-ink-600">{t("coverageMap.selectPrompt")}</p>}

          {ready && loading && <p className="text-sm text-ink-600">{t("coverageMap.loading")}</p>}

          {ready && !loading && error && (
            <div className="rounded-2xl border border-caution/30 bg-caution-soft p-6 text-center">
              <AlertCircle size={20} className="mx-auto text-caution" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-ink-900">{t("coverageMap.errorTitle")}</p>
              <p className="mt-1 text-xs text-ink-600">{t("coverageMap.errorBody")}</p>
              <button
                onClick={() => loadGrid(platform, objective, country)}
                className="mt-4 rounded-full border border-line bg-canvas px-4 py-2 text-xs font-medium text-ink-900 hover:border-primary hover:text-primary"
              >
                {t("coverageMap.retryCta")}
              </button>
            </div>
          )}

          {ready && !loading && !error && grid && grid.ok && (
            <>
              {allNoData && !showMatrixOverride ? (
                <CoverageEmptyState
                  platformLabel={platformLabel}
                  objectiveLabel={objectiveLabel}
                  countryLabel={countryLabel}
                  onViewMatrix={() => setShowMatrixOverride(true)}
                />
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
                    <CoverageMetricVisibilityControl allMetrics={grid.grid.metrics} visibleMetrics={visibleMetrics} onToggle={handleToggleMetric} />
                    <CoverageStatusLegend />
                  </div>

                  <CoverageGrid
                    verticals={translatedVerticals}
                    visibleMetrics={grid.grid.metrics.filter((m) => visibleMetrics.has(m))}
                    cells={grid.grid.cells}
                    selectedCell={selectedCell as SelectedCoverageCellKey | null}
                    onSelectCell={setSelectedCell}
                  />

                  {selectedCell && (
                    <CoverageCellPanel
                      cell={{
                        vertical: selectedCell.vertical,
                        verticalLabel: labelFor(translatedVerticals, selectedCell.vertical),
                        metric: selectedCell.metric,
                        status: selectedCell.status,
                      }}
                      platform={platform}
                      platformLabel={platformLabel}
                      objective={objective}
                      objectiveLabel={objectiveLabel}
                      country={country}
                      countryLabel={countryLabel}
                      onClose={() => setSelectedCell(null)}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
