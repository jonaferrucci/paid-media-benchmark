"use client";

// PHASE 26: the signed-in home workspace hub. Renders nothing for a
// signed-out visitor (§2/§13: "do not remove first-time usability" —
// the existing marketing/discovery homepage below this component is
// completely unaffected) and nothing while the summary is still
// loading (same no-flash pattern the component it supersedes,
// components/dashboard/RecentWork.tsx, already used). Supersedes
// RecentWork entirely: "Continue working" (§7) is now one section
// inside this hub instead of a separate component, reusing the exact
// same saved-comparisons/saved-plans actions — no new persistence.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { getWorkspaceSummaryAction, type WorkspaceSummary } from "@/lib/contribute/workspaceActions";
import { DERIVED_METRIC_LABELS, type DerivedMetricKey } from "@/lib/contribute/coverage";

// §5: one translation key per raw field a gap can point at — never a
// generic interpolated field/metric identifier leaking into the UI.
const GAP_MESSAGE_KEYS: Record<string, string> = {
  impressions: "workspace.gapImpressions",
  clicks: "workspace.gapClicks",
  conversions: "workspace.gapConversions",
  attributed_revenue: "workspace.gapAttributedRevenue",
  total_revenue: "workspace.gapTotalRevenue",
  reach: "workspace.gapReach",
  video_views: "workspace.gapVideoViews",
  engagements: "workspace.gapEngagements",
};

function formatUpdatedAt(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", { day: "numeric", month: "short" }).format(new Date(iso));
}

// submittedOnIso is already a bare YYYY-MM-DD (see groupRecentImports) —
// appending a fixed local midnight avoids a UTC-parsing day-shift.
function formatDay(dayIso: string, locale: string): string {
  return formatUpdatedAt(`${dayIso}T00:00:00`, locale);
}

export function Workspace() {
  const { t, locale } = useTranslation();
  const { user, loading: userLoading } = useSupabaseUser();
  const [summary, setSummary] = useState<WorkspaceSummary | null>(null);

  useEffect(() => {
    if (!user) { setSummary(null); return; }
    getWorkspaceSummaryAction().then(setSummary);
  }, [user]);

  if (userLoading || !user || !summary) return null;

  // §13: the clearest onboarding state for a signed-in user with
  // nothing yet — never an empty dashboard shell.
  if (!summary.hasAnyData) {
    return (
      <section className="mx-auto mb-8 max-w-4xl px-4">
        <div className="rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
          <p className="font-display text-base font-semibold text-ink-900">{t("workspace.emptyTitle")}</p>
          <ol className="mx-auto mt-3 max-w-sm space-y-1 text-left text-sm text-ink-600">
            <li>{t("workspace.emptyStep1")}</li>
            <li>{t("workspace.emptyStep2")}</li>
            <li>{t("workspace.emptyStep3")}</li>
          </ol>
          <Link
            href="/contribute"
            className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
          >
            <Upload size={13} aria-hidden="true" /> {t("workspace.emptyCta")}
          </Link>
        </div>
      </section>
    );
  }

  const hasContinueItems = summary.comparisons.length > 0 || summary.plans.length > 0;

  return (
    <section className="mx-auto mb-8 max-w-4xl space-y-6 px-4">
      {/* §7/§14: "Continue working" — the exact same saved comparisons/
          saved planning scenarios RecentWork used to render, never a
          new persistence mechanism. */}
      {hasContinueItems && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("comparisons.recentWorkTitle")}</p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {summary.comparisons.map((c) => (
              <Link
                key={`cmp-${c.id}`}
                href={`/benchmark?saved=${c.id}`}
                className="group rounded-xl border border-l-[3px] border-l-brandLavender border-line bg-surface p-3 transition-colors hover:bg-surface2/40"
              >
                <p className="line-clamp-2 text-xs font-semibold text-ink-900">{c.name}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-ink-400">{formatUpdatedAt(c.updatedAt, locale)}</span>
                  <ArrowRight size={11} className="text-ink-400 group-hover:text-primary" aria-hidden="true" />
                </div>
              </Link>
            ))}
            {summary.plans.map((p) => (
              <Link
                key={`plan-${p.id}`}
                href="/planner"
                className="group rounded-xl border border-l-[3px] border-l-brandPeach border-line bg-surface p-3 transition-colors hover:bg-surface2/40"
              >
                <p className="line-clamp-2 text-xs font-semibold text-ink-900">{p.name}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-[10px] text-ink-400">{formatUpdatedAt(p.updatedAt, locale)}</span>
                  <ArrowRight size={11} className="text-ink-400 group-hover:text-primary" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* §3: recent imports — an honest, documented approximation (see
          lib/contribute/coverage.ts's groupRecentImports comment) since
          there is no separate import-batch table to group by. */}
      {summary.recentImports.length > 0 && (
        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("workspace.recentImportsTitle")}</p>
            <Link href="/account/contributions" className="text-xs font-medium text-primary hover:underline">
              {t("workspace.recentImportsCta")}
            </Link>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
            {summary.recentImports.map((group, i) => (
              <div key={i} className="rounded-xl border border-line bg-surface p-3">
                <p className="text-xs font-semibold text-ink-900">{group.platformLabel}</p>
                <p className="mt-0.5 text-[11px] text-ink-500">{t("workspace.recentImportsCampaignCount", { n: group.campaignCount })}</p>
                <p className="mt-1 text-[10px] text-ink-400">{formatDay(group.submittedOnIso, locale)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* §4: factual, formula-derived coverage — no arbitrary score. */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("workspace.coverageTitle")}</p>
        {summary.coverage.length === 0 ? (
          <p className="mt-2 text-xs text-ink-500">{t("workspace.coverageEmpty")}</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink-600">{t("workspace.coverageSubtitle")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {summary.coverage.map((entry) => (
                <span key={entry.metric} className="rounded-full border border-line bg-surface2 px-3 py-1.5 text-[11px] text-ink-700">
                  <span className="font-semibold text-ink-900">{DERIVED_METRIC_LABELS[entry.metric as DerivedMetricKey]}</span>
                  {" · "}
                  {t("workspace.coverageCampaignCount", { n: entry.campaignCount })}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* §5: actionable, never-fabricated data gaps. */}
      {summary.gaps.length > 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface2/40 p-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("workspace.gapsTitle")}</p>
            <Link href="/contribute" className="text-xs font-medium text-primary hover:underline">
              {t("workspace.gapsCta")}
            </Link>
          </div>
          <ul className="mt-2 space-y-1.5 text-xs text-ink-600">
            {summary.gaps.map((gap) => (
              <li key={gap.missingField}>{t(GAP_MESSAGE_KEYS[gap.missingField], { n: gap.campaignCount })}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
