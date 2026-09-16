"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Layers, Info } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { MediaCatalog } from "@/lib/media/catalog";
import { platformsForCategory, platformsForCountry, searchCatalog } from "@/lib/media/filter";

export function MediaCatalogView({ catalog }: { catalog: MediaCatalog }) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [countryId, setCountryId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    let result = catalog.platforms;
    result = platformsForCategory(result, categoryId);
    result = platformsForCountry(result, catalog.platformCountries, countryId);
    result = searchCatalog(result, query);
    return result;
  }, [catalog, categoryId, countryId, query]);

  function categoryLabel(id: string | null): string {
    return catalog.categories.find((c) => c.id === id)?.display_label ?? "";
  }

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-56">
        <main className="mx-auto max-w-5xl px-4 py-6 md:px-8">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-primary" aria-hidden="true" />
            <h1 className="font-display text-xl font-semibold text-ink-900">{t("media.catalogTitle")}</h1>
          </div>
          <p className="mt-1 text-sm text-ink-600">{t("media.catalogSubtitle")}</p>

          {catalog.hasError && (
            <p className="mt-4 rounded-xl border border-caution/30 bg-caution-soft px-4 py-3 text-sm text-ink-700">
              {t("media.catalogLoadError")}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <label htmlFor="catalog-search" className="sr-only">{t("media.searchLabel")}</label>
            <div className="flex flex-1 items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 sm:max-w-xs">
              <Search size={14} className="text-ink-400" aria-hidden="true" />
              <input
                id="catalog-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("media.searchPlaceholder")}
                className="w-full bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
              />
            </div>

            <label htmlFor="catalog-category" className="sr-only">{t("media.categoryLabel")}</label>
            <select
              id="catalog-category"
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(e.target.value || null)}
              className="rounded-full border border-line bg-surface px-3 py-2 text-sm text-ink-900"
            >
              <option value="">{t("media.allCategories")}</option>
              {catalog.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.display_label}</option>
              ))}
            </select>

            <label htmlFor="catalog-country" className="sr-only">{t("media.countryLabel")}</label>
            <select
              id="catalog-country"
              value={countryId ?? ""}
              onChange={(e) => setCountryId(e.target.value || null)}
              className="rounded-full border border-line bg-surface px-3 py-2 text-sm text-ink-900"
            >
              <option value="">{t("media.allCountries")}</option>
              {catalog.countries.map((c) => (
                <option key={c.id} value={c.id}>{c.display_label}</option>
              ))}
            </select>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
              <Info size={20} className="mx-auto text-ink-400" aria-hidden="true" />
              <p className="mt-3 text-sm text-ink-700">{t("media.emptyResults")}</p>
              <Link href="/contribute" className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                {t("media.ctaContribute")}
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((p) => (
                <div key={p.id} className="rounded-2xl border border-line bg-surface p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/media/${p.internal_key}`} className="truncate font-display text-sm font-semibold text-ink-900 hover:text-primary">{p.display_label}</Link>
                    {p.status === "pending" && (
                      <span className="shrink-0 rounded-full bg-vanilla-soft px-2 py-0.5 text-[10px] font-medium text-vanilla">
                        {t("media.statusPending")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-ink-500">{categoryLabel(p.media_category_id)}</p>
                  <p className="mt-3 text-xs text-ink-400">{t("media.noBenchmarkYet")}</p>
                  <Link
                    href="/contribute"
                    className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {t("media.ctaContribute")}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
