"use client";

import Link from "next/link";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { useTranslation } from "@/lib/i18n/LanguageContext";

// CUCURUCHO INTELLIGENCE 3 — one neutral, safe state for every way the
// /compare URL can fail to resolve to a viable 2-5-campaign comparison:
// too few ids, too many ids, or ids that parsed fine but didn't come
// back RLS-scoped as real, readable, owned campaigns (someone else's
// id, a stale link, a typo). "unavailable" deliberately never
// distinguishes "doesn't exist" from "not yours" — see
// app/account/contributions/compare/page.tsx's own SECURITY comment on
// why that distinction is never surfaced.
export function NotEnoughCampaigns({ reason }: { reason: "too_few" | "too_many" | "invalid" | "unavailable" }) {
  const { t } = useTranslation();

  const message =
    reason === "too_many"
      ? t("contributions.compare.tooMany")
      : reason === "unavailable"
        ? t("contributions.compare.unavailable")
        : t("contributions.compare.tooFew");

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => {}} />
      <DashboardSidebar />
      <div className="md:pl-[var(--sidebar-inset)] transition-[padding-left] duration-150">
        <main className="mx-auto max-w-2xl px-4 py-8 md:px-8">
          <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
            <p className="text-sm text-ink-600">{message}</p>
            <Link
              href="/account/contributions"
              className="mt-4 inline-block rounded-full bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {t("contributions.compare.backToList")}
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
