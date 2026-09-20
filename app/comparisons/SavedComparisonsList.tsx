"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MoreVertical, Pencil, Copy, Trash2, ExternalLink, Search, Bookmark, FolderOpen } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import type { ContributionTaxonomies } from "@/lib/contribute/taxonomies";
import {
  type SavedComparison,
  renameComparisonAction,
  duplicateComparisonAction,
  deleteComparisonAction,
} from "./actions";
import { validateComparisonName } from "./pure";

function labelFor(list: { internal_key?: string; iso_code?: string; display_label: string }[], key: string): string {
  return list.find((item) => item.internal_key === key || item.iso_code === key)?.display_label ?? key;
}

function formatUpdatedAt(iso: string, locale: string): string {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export function SavedComparisonsList({
  initialComparisons,
  taxonomies,
}: {
  initialComparisons: SavedComparison[];
  taxonomies: ContributionTaxonomies;
}) {
  const { t, locale } = useTranslation();
  const { user, loading: userLoading } = useSupabaseUser();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [comparisons, setComparisons] = useState(initialComparisons);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  function contextLabel(c: SavedComparison): string {
    const parts = [
      labelFor(taxonomies.platforms, c.platform),
      labelFor(taxonomies.objectives, c.objective),
      labelFor(taxonomies.verticals, c.vertical),
      labelFor(taxonomies.countries, c.country),
    ];
    return parts.join(" · ");
  }

  function metricSummary(c: SavedComparison): string {
    if (c.comparisonType === "single_metric") {
      return c.metric ? `${c.metric.toUpperCase()}${c.userValue !== null ? `: ${c.userValue}` : ""}` : "";
    }
    const count = c.campaignRows?.length ?? 0;
    return t("comparisons.metricCount", { n: count });
  }

  function openComparison(c: SavedComparison) {
    router.push(`/benchmark?saved=${c.id}`);
  }

  async function handleRenameSubmit(id: string) {
    const check = validateComparisonName(renameValue);
    if (!check.ok) {
      setRenameError(check.reason === "empty" ? t("comparisons.errorEmptyName") : t("comparisons.errorNameTooLong"));
      return;
    }
    const result = await renameComparisonAction(id, renameValue);
    if (!result.ok) {
      setRenameError(t("comparisons.errorGeneric"));
      return;
    }
    setComparisons((prev) => prev.map((c) => (c.id === id ? { ...c, name: check.name } : c)));
    setRenamingId(null);
    setRenameError(null);
  }

  async function handleDuplicate(id: string) {
    setOpenMenuId(null);
    const result = await duplicateComparisonAction(id, t("comparisons.copySuffix"));
    if (result.ok) setComparisons((prev) => [result.comparison, ...prev]);
  }

  async function handleDelete(id: string) {
    const result = await deleteComparisonAction(id);
    if (result.ok) setComparisons((prev) => prev.filter((c) => c.id !== id));
    setConfirmDeleteId(null);
  }

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}

      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-4xl px-4 py-6 md:px-8">
          <div className="flex items-center gap-2">
            <Bookmark size={18} className="text-primary" aria-hidden="true" />
            <h1 className="font-display text-xl font-semibold text-ink-900">{t("comparisons.title")}</h1>
          </div>
          <p className="mt-1 text-sm text-ink-600">{t("comparisons.subtitle")}</p>

          {!userLoading && !user ? (
            // Item 24: a signed-out visitor gets the honest reason
            // (no account, not "nothing saved yet") — the same
            // sign-in/create-account prompt as /account, not a
            // misleading "you haven't saved a comparison" empty state.
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
              <FolderOpen size={22} className="mx-auto text-ink-400" aria-hidden="true" />
              <p className="mt-3 text-sm font-semibold text-ink-900">{t("account.signedOutTitle")}</p>
              <p className="mt-1 text-xs text-ink-500">{t("account.signedOutBenefits")}</p>
              <div className="mt-4 flex justify-center gap-2">
                <Link href="/auth/sign-in" className="rounded-full border border-line px-4 py-2 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary">
                  {t("account.signInCta")}
                </Link>
                <Link href="/auth/sign-up" className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90">
                  {t("account.createAccountCta")}
                </Link>
              </div>
            </div>
          ) : comparisons.length === 0 ? (
            <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
              <FolderOpen size={22} className="mx-auto text-ink-400" aria-hidden="true" />
              <p className="mt-3 text-sm text-ink-700">{t("comparisons.emptyTitle")}</p>
              <p className="mt-1 text-xs text-ink-500">{t("comparisons.emptyBody")}</p>
              <Link
                href="/benchmark"
                className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Search size={13} aria-hidden="true" />
                {t("comparisons.emptyCta")}
              </Link>
            </div>
          ) : (
            <ul className="mt-6 space-y-2">
              {comparisons.map((c) => (
                <li
                  key={c.id}
                  className={`overflow-visible rounded-2xl border border-l-4 border-line bg-surface p-4 shadow-sm transition-colors hover:bg-surface2/40 ${
                    c.comparisonType === "campaign" ? "border-l-brandMint" : "border-l-brandLavender"
                  }`}
                >
                  {/* POST-MVP MOBILE PASS §5: a dedicated responsive card
                      hierarchy — ONE set of interactive elements (never a
                      duplicated mobile/desktop tree, which would leave
                      two rename inputs with the same id, two "more
                      actions" menus, etc.), reflowed with responsive
                      classes. Below md: context caption on its own line,
                      the title gets its own full-width area and may wrap
                      to 2 lines (never truncated to "Meta A..."), the
                      type badge sits below the title instead of forcing
                      itself onto the same row, and the primary action
                      gets a full-width ~44px touch target. At >=768px
                      this collapses back to the original dense single
                      row (title+badge inline, truncated, actions beside
                      it) — the >=768 screenshot showed this already
                      working well (§17), so it's preserved verbatim. */}
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-3">
                    <div className="min-w-0 flex-1">
                      {renamingId === c.id ? (
                        <div>
                          <label htmlFor={`rename-${c.id}`} className="sr-only">
                            {t("comparisons.renameLabel")}
                          </label>
                          <input
                            id={`rename-${c.id}`}
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleRenameSubmit(c.id);
                              if (e.key === "Escape") { setRenamingId(null); setRenameError(null); }
                            }}
                            className="w-full rounded-lg border border-primary bg-canvas px-2.5 py-1.5 text-sm text-ink-900 outline-none ring-2 ring-primary/20 transition-shadow focus-visible:ring-primary/40"
                          />
                          {renameError && <p className="mt-1 text-xs text-caution">{renameError}</p>}
                          <div className="mt-2 flex gap-2">
                            <button onClick={() => handleRenameSubmit(c.id)} className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90">
                              {t("comparisons.save")}
                            </button>
                            <button onClick={() => { setRenamingId(null); setRenameError(null); }} className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface2">
                              {t("comparisons.cancel")}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-xs text-ink-500 md:hidden">{contextLabel(c)}</p>
                          <div className="mt-1 md:mt-0 md:flex md:items-center md:gap-2">
                            <p className="line-clamp-2 font-display text-[15px] font-semibold text-ink-900 md:min-w-0 md:flex-1 md:truncate md:leading-normal">
                              {c.name}
                            </p>
                            <span className="mt-1.5 inline-block w-fit shrink-0 rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500 md:mt-0">
                              {c.comparisonType === "campaign" ? t("comparisons.typeCampaign") : t("comparisons.typeSingle")}
                            </span>
                          </div>
                          <p className="mt-1.5 hidden text-xs text-ink-600 md:block md:truncate">{contextLabel(c)}</p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-400">
                            <span>{metricSummary(c)}</span>
                            <span aria-hidden="true" className="hidden md:inline">·</span>
                            <span>{t("comparisons.updated")} {formatUpdatedAt(c.updatedAt, locale)}</span>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2 md:gap-1">
                      <button
                        onClick={() => openComparison(c)}
                        className="flex h-11 flex-1 items-center justify-center gap-1 rounded-full bg-primary-soft px-3 text-xs font-medium text-primary transition-opacity hover:opacity-90 md:h-auto md:flex-none md:py-1.5"
                      >
                        {t("comparisons.open")} <ExternalLink size={12} aria-hidden="true" />
                      </button>
                      <div className="relative">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                          aria-label={t("comparisons.moreActions")}
                          aria-expanded={openMenuId === c.id}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-surface2 hover:text-ink-900 md:h-8 md:w-8"
                        >
                          <MoreVertical size={16} aria-hidden="true" />
                        </button>
                        {openMenuId === c.id && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-xl border border-line bg-surfaceElevated p-1 shadow-lg">
                            <button
                              onClick={() => { setRenamingId(c.id); setRenameValue(c.name); setOpenMenuId(null); }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-ink-700 hover:bg-surface2"
                            >
                              <Pencil size={13} aria-hidden="true" /> {t("comparisons.rename")}
                            </button>
                            <button
                              onClick={() => handleDuplicate(c.id)}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-ink-700 hover:bg-surface2"
                            >
                              <Copy size={13} aria-hidden="true" /> {t("comparisons.duplicate")}
                            </button>
                            <button
                              onClick={() => { setConfirmDeleteId(c.id); setOpenMenuId(null); }}
                              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-destructive hover:bg-destructive-soft"
                            >
                              <Trash2 size={13} aria-hidden="true" /> {t("comparisons.delete")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {confirmDeleteId === c.id && (
                    <div
                      role="alertdialog"
                      aria-label={t("comparisons.confirmDelete", { name: c.name })}
                      onKeyDown={(e) => { if (e.key === "Escape") setConfirmDeleteId(null); }}
                      className="mt-3 rounded-xl border border-destructive/30 bg-destructive-soft p-3"
                    >
                      <p className="text-xs text-ink-700">{t("comparisons.confirmDelete", { name: c.name })}</p>
                      <div className="mt-2 flex gap-2">
                        <button autoFocus onClick={() => handleDelete(c.id)} className="rounded-full bg-destructive px-3.5 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90">
                          {t("comparisons.delete")}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} className="rounded-full border border-line px-3.5 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface2">
                          {t("comparisons.cancel")}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    </div>
  );
}
