"use client";

import { useMemo, useState } from "react";
import { Search, Layers, Info } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { EntityCard } from "@/components/ui/EntityCard";
import { EntityAvatar } from "@/components/ui/EntityAvatar";
import { Badge } from "@/components/ui/Badge";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { MediaCatalog } from "@/lib/media/catalog";
import { platformsForCategory, platformsForCountry, searchCatalog, splitPlatformsAndMedia } from "@/lib/media/filter";

// Phase 20C item D: progressive chip filters replace the two dropdown
// <select>s (a "filter wall") — the same platformsForCategory/
// platformsForCountry/searchCatalog pure helpers from Phase 17 are
// reused untouched, only the input controls change.
//
// Phase 20D item 5/10/11: PLATAFORMAS (ad platforms) and MEDIOS (outlets)
// are rendered as two distinct sections rather than one mixed grid —
// splitPlatformsAndMedia draws that line by category, in one shared
// place. Ad platform cards reuse the exact same lib/mock/taxonomies.ts
// PLATFORM_CARDS description copy already shown in the benchmark
// wizard (no new/invented copy); media cards surface real, non-
// fabricated rate-card presence instead.
const PLATFORM_DESC_KEYS = new Set([
  "meta_ads", "google_ads", "tiktok_ads", "mercado_libre_ads", "pinterest_ads", "dsp_programmatic",
]);

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-primary text-white" : "border border-line bg-surface text-ink-700 hover:border-primary/50"
      }`}
    >
      {label}
    </button>
  );
}

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

  const { adPlatforms, media } = useMemo(
    () => splitPlatformsAndMedia(filtered, catalog.categories),
    [filtered, catalog.categories]
  );

  function categoryLabel(id: string | null): string {
    return catalog.categories.find((c) => c.id === id)?.display_label ?? "";
  }

  function countryMetaFor(platformId: string, isGlobal: boolean): string {
    if (isGlobal) return t("media.globalAvailability");
    const ids = catalog.platformCountries.filter((pc) => pc.platform_id === platformId).map((pc) => pc.country_id);
    if (ids.length === 0) return "";
    if (ids.length === 1) return catalog.countries.find((c) => c.id === ids[0])?.display_label ?? "";
    return t("media.countryCount", { n: ids.length });
  }

  const hasRateCard = new Set(catalog.platformsWithRateCard ?? []);

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
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

          <div className="mt-5">
            <label htmlFor="catalog-search" className="sr-only">{t("media.searchLabel")}</label>
            <div className="flex max-w-sm items-center gap-2 rounded-full border border-line bg-surface px-3 py-2">
              <Search size={14} className="shrink-0 text-ink-400" aria-hidden="true" />
              <input
                id="catalog-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("media.searchPlaceholder")}
                className="w-full min-w-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-400"
              />
            </div>
          </div>

          <div className="mt-3 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label={t("media.categoryLabel")}>
            <FilterChip label={t("media.allCategories")} active={categoryId === null} onClick={() => setCategoryId(null)} />
            {catalog.categories.map((c) => (
              <FilterChip key={c.id} label={c.display_label} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} />
            ))}
          </div>
          <div className="mt-1.5 -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1" role="group" aria-label={t("media.countryLabel")}>
            <FilterChip label={t("media.allCountries")} active={countryId === null} onClick={() => setCountryId(null)} />
            {catalog.countries.map((c) => (
              <FilterChip key={c.id} label={c.display_label} active={countryId === c.id} onClick={() => setCountryId(c.id)} />
            ))}
          </div>

          {filtered.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
              <Info size={20} className="mx-auto text-ink-400" aria-hidden="true" />
              <p className="mt-3 text-sm text-ink-700">{t("media.emptyResults")}</p>
              <a href="/contribute" className="mt-3 inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                {t("media.ctaContribute")}
              </a>
            </div>
          ) : (
            <>
              {adPlatforms.length > 0 && (
                <section className="mt-6">
                  <h2 className="font-display text-sm font-semibold text-ink-900">{t("media.platformsSectionTitle")}</h2>
                  <p className="text-xs text-ink-500">{t("media.platformsSectionSubtitle")}</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {adPlatforms.map((p) => (
                      <EntityCard
                        key={p.id}
                        href={`/media/${p.internal_key}`}
                        avatar={<EntityAvatar label={p.display_label} platformUiId={p.internal_key} size={36} />}
                        title={p.display_label}
                        meta={categoryLabel(p.media_category_id)}
                        detail={
                          <>
                            {PLATFORM_DESC_KEYS.has(p.internal_key) && <p>{t(`platformDesc.${p.internal_key}`)}</p>}
                            <p className="mt-1 font-medium text-primary">{t("media.exploreCta")} →</p>
                          </>
                        }
                      />
                    ))}
                  </div>
                </section>
              )}

              {media.length > 0 && (
                <section className="mt-6">
                  <h2 className="font-display text-sm font-semibold text-ink-900">{t("media.mediaSectionTitle")}</h2>
                  <p className="text-xs text-ink-500">{t("media.mediaSectionSubtitle")}</p>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {media.map((p) => (
                      <EntityCard
                        key={p.id}
                        href={`/media/${p.internal_key}`}
                        avatar={<EntityAvatar label={p.display_label} platformUiId={p.internal_key} size={36} />}
                        title={p.display_label}
                        meta={[categoryLabel(p.media_category_id), countryMetaFor(p.id, p.is_global)].filter(Boolean).join(" · ")}
                        badge={p.status === "pending" ? <Badge tone="warning">{t("media.statusPending")}</Badge> : undefined}
                        detail={
                          <>
                            <p>{hasRateCard.has(p.id) ? t("media.hasRateCard") : t("media.noRateCard")}</p>
                            <p className="mt-1 font-medium text-primary">{t("media.viewMediaCta")} →</p>
                          </>
                        }
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
