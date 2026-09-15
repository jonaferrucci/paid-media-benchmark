"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { listSavedComparisonsAction, type SavedComparison } from "@/app/comparisons/actions";

// Lightweight fallback formatter for stored internal_key values
// (e.g. "meta_ads" -> "Meta ads"). This component intentionally
// avoids a second taxonomy fetch from client code — the full,
// precise display-label lookup already happens on /comparisons
// (a server component with real taxonomy data). Here, on the
// homepage, a humanized key is sufficient for a glanceable card.
function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function formatUpdatedAt(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", { day: "numeric", month: "short" }).format(new Date(iso));
}

// Phase 14 item 10: sourced entirely from saved_comparisons (no new
// activity-tracking table), limited to 3, no engine rerun here — this
// only reads already-stored query/workflow metadata, never fetches or
// displays benchmark result values.
export function RecentWork() {
  const { t, locale } = useTranslation();
  const { user, loading: userLoading } = useSupabaseUser();
  const [items, setItems] = useState<SavedComparison[] | null>(null);

  useEffect(() => {
    if (!user) { setItems(null); return; }
    listSavedComparisonsAction(3).then(setItems);
  }, [user]);

  // Anonymous visitors: nothing to show, nothing to prompt (the save
  // flow itself already prompts sign-in at the point of saving).
  if (userLoading || !user) return null;

  return (
    <section className="mx-auto max-w-4xl px-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("comparisons.recentWorkTitle")}</p>
        {items && items.length > 0 && (
          <Link href="/comparisons" className="text-xs font-medium text-primary hover:underline">
            {t("comparisons.viewAll")}
          </Link>
        )}
      </div>

      {items === null ? null : items.length === 0 ? (
        <div className="mt-2 rounded-2xl border border-dashed border-line bg-surface p-4 text-center">
          <p className="text-xs text-ink-600">{t("comparisons.recentWorkEmptyTitle")}</p>
          <Link
            href="/benchmark"
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary hover:text-primary"
          >
            <Search size={12} aria-hidden="true" /> {t("comparisons.recentWorkEmptyCta")}
          </Link>
        </div>
      ) : (
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {items.map((c) => (
            <Link
              key={c.id}
              href={`/benchmark?saved=${c.id}`}
              className="group rounded-xl border border-line bg-surface p-3 transition-colors hover:border-primary/50"
            >
              <p className="truncate text-xs font-semibold text-ink-900">{c.name}</p>
              <p className="mt-0.5 truncate text-[11px] text-ink-500">
                {humanize(c.platform)} · {humanize(c.objective)} · {c.country}
              </p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] text-ink-400">{formatUpdatedAt(c.updatedAt, locale)}</span>
                <ArrowRight size={11} className="text-ink-400 group-hover:text-primary" aria-hidden="true" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
