"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { Select } from "@/app/benchmark/Select";
import type { CoverageTaxonomies } from "@/lib/benchmark/coverage";
import { fetchCoverageGrid } from "./actions";
import { CoverageGrid } from "./CoverageGrid";

// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1.
//
// Platform + Objective + Country is a PRECONDITION (per the locked
// spec) — the matrix only renders once all three are selected. Vertical
// is never a precondition: it's the grid's own row axis, always the
// full canonical taxonomy (never filtered down to "only verticals with
// data" — an empty vertical must still appear, as a no_data row).
export function CoverageExplorer({ taxonomies }: { taxonomies: CoverageTaxonomies }) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [platform, setPlatform] = useState("");
  const [objective, setObjective] = useState("");
  const [country, setCountry] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [grid, setGrid] = useState<Awaited<ReturnType<typeof fetchCoverageGrid>> | null>(null);

  const ready = Boolean(platform && objective && country);

  async function loadGrid(nextPlatform: string, nextObjective: string, nextCountry: string) {
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

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
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
              options={taxonomies.objectives.map((o) => ({ value: o.value, label: o.label }))}
            />
            <Select
              label={t("contribute.country")}
              value={country}
              onChange={handleCountryChange}
              allowEmpty
              required
              options={taxonomies.countries.map((c) => ({ value: c.value, label: c.label }))}
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
            <CoverageGrid
              verticals={taxonomies.verticals}
              metrics={grid.grid.metrics}
              cells={grid.grid.cells}
              platform={platform}
              objective={objective}
              country={country}
            />
          )}
        </main>
      </div>
    </div>
  );
}
