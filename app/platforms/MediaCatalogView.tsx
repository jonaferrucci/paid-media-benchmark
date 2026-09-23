"use client";

import { useMemo, useState } from "react";
import { Search, Layers, Info } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { EntityCard } from "@/components/ui/EntityCard";
import { EntityAvatar } from "@/components/ui/EntityAvatar";
import { Badge } from "@/components/ui/Badge";
import { PLATFORM_LOGO } from "@/components/dashboard/PlatformLogo";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { MediaCatalog } from "@/lib/media/catalog";
import { platformsForCategory, platformsForCountry, searchCatalogAcrossFields, splitPlatformsAndMedia } from "@/lib/media/filter";

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

// Phase 21B item B2: YouTube stays intentionally absent from `platforms`
// (see migration 0002's comment, respected again by 0016) — planner-
// facing "YouTube" is google_ads + campaign_types.video_youtube. This
// view never queries or filters by a "youtube" platform row; it only
// makes the existing Google Ads card visibly note that YouTube lives
// there, using the same bundled PLATFORM_LOGO.youtube glyph already
// used elsewhere (EntityAvatar, benchmark wizard) — a presentational
// addition only, never a new filterable entity.
const YOUTUBE_HOST_PLATFORM_KEY = "google_ads";

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
    // Phase 21 item 23: search matches outlet/platform name, category,
    // or country — not just the display name.
    result = searchCatalogAcrossFields(result, catalog.categories, catalog.countries, catalog.platformCountries, query);
    return result;
  }, [catalog, categoryId, countryId, query]);

  const { adPlatforms, media } = useMemo(
    () => splitPlatformsAndMedia(filtered, catalog.categories),
    [filtered, catalog.categories]
  );

  // Phase 21B item B10: country chips should not prominently show a
  // country with zero digital entities in the catalog. Computed against
  // the FULL (unfiltered by category/search) digital catalog, so the
  // country chip list itself doesn't flicker as someone changes the
  // category or search filters — only reflects "does this country have
  // any digital media at all today."
  const countriesWithEntities = useMemo(
    () => catalog.countries.filter((c) => platformsForCountry(catalog.platforms, catalog.platformCountries, c.id).length > 0),
    [catalog]
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
  // Phase 21B item B8: a third, honest secondary status — an outlet can
  // have real public data (audience/traffic signals) without a rate
  // card, and that is different from having nothing at all.
  const hasPublicData = new Set(catalog.platformsWithPublicData ?? []);

  function resetFilters() {
    setCategoryId(null);
    setCountryId(null);
    setQuery("");
  }

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
            {/* MVP RELEASE FIX (#2): same fix as SearchOverlay — the
                border lives on this wrapper, so focus-within (not the
                input's own focus-visible) is what needs to change color;
                reuses the same border-primary token every input in this
                app already uses. */}
            <div className="flex max-w-sm items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 transition-colors focus-within:border-primary">
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

          {/* Phase 21B item A: wrapping chip groups replace the old
              horizontal-scroll-row pattern (edge-bleed margins plus a
              scrolling overflow axis) — every option is visible at
              once, wrapping into extra rows rather than hiding behind
              a scrollbar, on desktop AND at narrow (~375px) widths.
              Each group now has a small, always-VISIBLE label above it
              (not just an aria-label) — filter logic and chip
              selected-state styling are both untouched. */}
          <div className="mt-4">
            <p id="catalog-category-label" className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {t("media.categoryLabel")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-labelledby="catalog-category-label">
              <FilterChip label={t("media.allCategories")} active={categoryId === null} onClick={() => setCategoryId(null)} />
              {catalog.categories.map((c) => (
                <FilterChip key={c.id} label={c.display_label} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} />
              ))}
            </div>
          </div>
          <div className="mt-3">
            <p id="catalog-country-label" className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {t("media.countryLabel")}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5" role="group" aria-labelledby="catalog-country-label">
              <FilterChip label={t("media.allCountries")} active={countryId === null} onClick={() => setCountryId(null)} />
              {countriesWithEntities.map((c) => (
                <FilterChip key={c.id} label={c.display_label} active={countryId === c.id} onClick={() => setCountryId(c.id)} />
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
              <Info size={20} className="mx-auto text-ink-400" aria-hidden="true" />
              <p className="mt-3 text-sm text-ink-700">{t("media.emptyResults")}</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={resetFilters}
                  className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink-700 hover:border-primary/50"
                >
                  {t("media.clearFiltersCta")}
                </button>
                {countryId !== null && (
                  <button
                    type="button"
                    onClick={() => setCountryId(null)}
                    className="rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink-700 hover:border-primary/50"
                  >
                    {t("media.changeCountryCta")}
                  </button>
                )}
                <a href="/contribute" className="inline-block rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                  {t("media.ctaContribute")}
                </a>
              </div>
            </div>
          ) : (
            <>
              <p className="mt-4 text-xs text-ink-500">{t("media.filteredCount", { n: filtered.length })}</p>

              {adPlatforms.length > 0 && (
                <section className="mt-3">
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
                            {p.internal_key === YOUTUBE_HOST_PLATFORM_KEY && (
                              <p className="mt-1 flex items-center gap-1 text-ink-500">
                                {(() => {
                                  const yt = PLATFORM_LOGO.youtube;
                                  const YtIcon = yt.Icon;
                                  return <YtIcon size={12} style={{ color: yt.color }} aria-hidden="true" />;
                                })()}
                                {t("media.includesYoutube")}
                              </p>
                            )}
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
                            <p>
                              {hasRateCard.has(p.id)
                                ? t("media.hasRateCard")
                                : hasPublicData.has(p.id)
                                ? t("media.hasPublicData")
                                : t("media.noDataYet")}
                            </p>
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
