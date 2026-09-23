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
//
// PHASE 39.2 (§1/§8/§9/§10/§11/§12): Home had accumulated too much
// "operational density" below the Benchmark Finder — five independent
// headed sections in a row (Continuar trabajando / Estado de tus
// campañas / Importaciones recientes / Qué podés analizar / Podrías
// sumar más) made Home read like a dashboard again. This is a
// PRESENTATION-only change (§23) — same WorkspaceSummary fields, same
// queries (lib/contribute/workspaceActions.ts untouched), same links:
// status counts and the most recent import batch are now compact
// inline elements folded INTO one "Continuar trabajando" block instead
// of two extra headed sections; "Qué podés analizar" (coverage) is
// retired from Home entirely — its logic/labels
// (lib/contribute/coverage.ts's DERIVED_METRIC_LABELS) are untouched
// and still used on /account/contributions and /contribute; and the
// old per-gap bulleted list ("Podrías sumar más") collapses into ONE
// compact, actionable signal card. No new fetches, no query changes.
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { useSupabaseUser } from "@/lib/supabase/useUser";
import { getWorkspaceSummaryAction, type WorkspaceSummary } from "@/lib/contribute/workspaceActions";

function formatUpdatedAt(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-AR" : "en-US", { day: "numeric", month: "short" }).format(new Date(iso));
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
  //
  // PHASE 35 (§4): exactly two paths, matching the two real first steps
  // named in the onboarding list right below (never a third/tutorial
  // modal) — "encontrá un benchmark" and "importá una campaña" each get
  // their own real link now, instead of one CTA that only ever went to
  // /contribute.
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
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/benchmark"
              className="inline-flex items-center gap-1.5 rounded-full border border-line px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-surface2"
            >
              {t("workspace.emptyCtaBenchmark")}
            </Link>
            <Link
              href="/contribute"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-white hover:opacity-90"
            >
              <Upload size={13} aria-hidden="true" /> {t("workspace.emptyCta")}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const hasContinueItems = summary.comparisons.length > 0 || summary.plans.length > 0;
  const { statusCounts } = summary;
  const hasStatusCounts = statusCounts.pending > 0 || statusCounts.valid > 0 || statusCounts.comparisons > 0 || statusCounts.plans > 0;
  // PHASE 39.2 (§8): one continuity block instead of three independent
  // headed sections — shown as soon as ANY of its three ingredients has
  // real content, so a user who has only imported (no saved comparison
  // or plan yet) still sees that here, rather than nothing at all.
  const hasContinuity = hasContinueItems || hasStatusCounts || summary.recentImports.length > 0;

  return (
    <section className="mx-auto mb-8 max-w-4xl space-y-6 px-4">
      {/* PHASE 39.2 (§8/§9/§10): "Continuar trabajando" is now the single
          center of continuity — comparisons/plans to resume, THEN a
          compact status-chip row, THEN the single most recent import,
          all inside one block instead of three separately-headed
          sections. Same underlying data and links as before, only the
          presentation is merged. */}
      {hasContinuity && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{t("comparisons.recentWorkTitle")}</p>

          {hasContinueItems && (
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
          )}

          {/* PHASE 39.2 (§9): "Estado de tus campañas" folded in as a
              compact chip row — no section heading of its own, same
              real counts/links as before (PHASE 35 §2/§3). flex-wrap
              keeps this legible at 320px instead of a 3-column grid. */}
          {hasStatusCounts && (
            <div className="mt-2 flex flex-wrap gap-2">
              {statusCounts.pending > 0 && (
                <Link
                  href="/account/contributions"
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary/40"
                >
                  {t("workspace.statusPendingCount", { n: statusCounts.pending })}
                </Link>
              )}
              {statusCounts.valid > 0 && (
                <Link
                  href={summary.mostRecentValidId ? `/account/contributions/${summary.mostRecentValidId}` : "/account/contributions"}
                  className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-700 hover:border-primary/40"
                >
                  {t("workspace.statusValidCount", { n: statusCounts.valid })}
                </Link>
              )}
              {statusCounts.comparisons > 0 && (
                <span className="rounded-full border border-line bg-surface2/60 px-3 py-1.5 text-xs font-medium text-ink-600">
                  {t("workspace.statusComparisonsCount", { n: statusCounts.comparisons })}
                </span>
              )}
              {statusCounts.plans > 0 && (
                <span className="rounded-full border border-line bg-surface2/60 px-3 py-1.5 text-xs font-medium text-ink-600">
                  {t("workspace.statusPlansCount", { n: statusCounts.plans })}
                </span>
              )}
            </div>
          )}

          {/* PHASE 39.2 (§10): only the single most recent import batch,
              as one compact line — never the previous 3-card grid. Real
              data only: no invented date, and the real, already-stored
              filename (PHASE 27/35) only when this batch actually has
              one — same underlying recentImports array (PHASE 25 §16),
              just its first entry instead of a 3-card grid of all of
              them. */}
          {summary.recentImports.length > 0 && (() => {
            const lastImport = summary.recentImports[0];
            return (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                <p className="min-w-0 truncate text-xs text-ink-700">
                  <span className="font-semibold text-ink-900">{t("workspace.lastImportLabel")}</span>
                  {" · "}
                  {lastImport.platformLabel}
                  {lastImport.sourceFilename ? <span className="text-ink-500"> · {lastImport.sourceFilename}</span> : null}
                  {" · "}
                  {t("workspace.recentImportsCampaignCount", { n: lastImport.campaignCount })}
                </p>
                <Link href="/account/contributions" className="shrink-0 text-xs font-medium text-primary hover:underline">
                  {t("workspace.recentImportsCta")}
                </Link>
              </div>
            );
          })()}
        </div>
      )}

      {/* PHASE 39.2 (§11/§12/§13): "Qué podés analizar" (coverage) is
          retired from Home entirely — computeDataCoverage() still runs
          unchanged in workspaceActions.ts and DERIVED_METRIC_LABELS
          still backs /account/contributions and /contribute, only this
          render path is gone. The old per-gap bulleted list ("Podrías
          sumar más") collapses into ONE compact, actionable signal —
          the real computeDataGaps() result still decides whether this
          shows at all; there is no "all complete" message when there
          are no gaps, the block is simply absent. */}
      {summary.gaps.length > 0 && (
        <div className="rounded-xl border border-dashed border-line bg-surface2/40 p-4">
          <p className="font-display text-sm font-semibold text-ink-900">{t("workspace.gapsSummaryTitle")}</p>
          <p className="mt-1 text-xs text-ink-600">{t("workspace.gapsSummaryBody")}</p>
          <Link href="/contribute" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {t("workspace.gapsCta")} <ArrowRight size={11} aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}
