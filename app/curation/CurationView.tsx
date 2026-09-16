"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import { AppHeader } from "@/components/dashboard/AppHeader";
import { DashboardSidebar } from "@/components/dashboard/DashboardSidebar";
import { SearchOverlay } from "@/components/dashboard/SearchOverlay";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import type { GovernanceQueue } from "@/lib/media/governanceQueries";
import { reviewRateCardAction, reviewSnapshotAction, reviewPlatformAction } from "@/lib/media/governanceActions";

type RowState = "idle" | "saving" | "error";

function ReviewRow({
  title,
  subtitle,
  meta,
  onApprove,
  onReject,
  approveLabel,
  rejectLabel,
}: {
  title: string;
  subtitle: string;
  meta: string;
  onApprove: () => Promise<{ ok: boolean }>;
  onReject: () => Promise<{ ok: boolean }>;
  approveLabel: string;
  rejectLabel: string;
}) {
  const { t } = useTranslation();
  const [state, setState] = useState<RowState>("idle");
  const [done, setDone] = useState(false);

  if (done) return null;

  async function handle(action: () => Promise<{ ok: boolean }>) {
    setState("saving");
    const result = await action();
    if (result.ok) setDone(true);
    else setState("error");
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-ink-800">{title}</p>
        <p className="text-xs text-ink-500">{subtitle}</p>
        <p className="mt-0.5 text-[10px] text-ink-400">{meta}</p>
        {state === "error" && <p className="mt-1 text-xs text-caution">{t("curation.actionError")}</p>}
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => handle(onApprove)}
          disabled={state === "saving"}
          className="inline-flex items-center gap-1 rounded-full bg-pistachio-soft px-3 py-1.5 text-xs font-semibold text-pistachio disabled:opacity-50"
        >
          <Check size={12} aria-hidden="true" /> {approveLabel}
        </button>
        <button
          onClick={() => handle(onReject)}
          disabled={state === "saving"}
          className="inline-flex items-center gap-1 rounded-full bg-destructive-soft px-3 py-1.5 text-xs font-semibold text-destructive disabled:opacity-50"
        >
          <X size={12} aria-hidden="true" /> {rejectLabel}
        </button>
      </div>
    </div>
  );
}

function Section({ title, count, empty, children }: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-sm font-semibold text-ink-900">{title}</h2>
        <span className="rounded-full bg-surface2 px-2 py-0.5 text-[10px] font-medium text-ink-500">{count}</span>
      </div>
      {count === 0 ? <p className="mt-2 text-xs text-ink-500">{empty}</p> : <div className="mt-3 space-y-2">{children}</div>}
    </section>
  );
}

export function CurationView({ queue }: { queue: GovernanceQueue }) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <div className="min-h-screen bg-canvas">
      <AppHeader onSearchClick={() => setSearchOpen(true)} />
      {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} onApply={() => {}} />}
      <DashboardSidebar />
      <div className="md:pl-56">
        <main className="mx-auto max-w-4xl px-4 py-6 md:px-8">
          <h1 className="font-display text-xl font-semibold text-ink-900">{t("curation.title")}</h1>
          <p className="mt-1 text-xs text-ink-600">{t("curation.subtitle")}</p>
          {queue.hasError && <p className="mt-2 text-xs text-caution">{t("curation.loadError")}</p>}

          <Section title={t("curation.rateCardsTitle")} count={queue.rateCards.length} empty={t("curation.rateCardsEmpty")}>
            {queue.rateCards.map((rc) => (
              <ReviewRow
                key={rc.id}
                title={`${rc.platform?.display_label ?? "—"} · ${rc.format?.display_label ?? "—"}`}
                subtitle={`${rc.currency} ${rc.price} / ${t(`media.pricingUnit.${rc.pricing_unit}`)} · ${t("media.validFrom")} ${rc.valid_from}`}
                meta={`${t("media.sourceLabel")}: ${rc.source}`}
                approveLabel={t("curation.approve")}
                rejectLabel={t("curation.reject")}
                onApprove={() => reviewRateCardAction(rc.id, "active")}
                onReject={() => reviewRateCardAction(rc.id, "rejected")}
              />
            ))}
          </Section>

          <Section title={t("curation.snapshotsTitle")} count={queue.snapshots.length} empty={t("curation.snapshotsEmpty")}>
            {queue.snapshots.map((s) => (
              <ReviewRow
                key={s.id}
                title={`${s.platform?.display_label ?? "—"} · ${s.metricDefinition?.display_label ?? "—"}`}
                subtitle={`${s.value} · ${s.observed_at}`}
                meta={`${t("media.sourceLabel")}: ${s.source}`}
                approveLabel={t("curation.approve")}
                rejectLabel={t("curation.reject")}
                onApprove={() => reviewSnapshotAction(s.id, "active")}
                onReject={() => reviewSnapshotAction(s.id, "rejected")}
              />
            ))}
          </Section>

          <Section title={t("curation.platformsTitle")} count={queue.platforms.length} empty={t("curation.platformsEmpty")}>
            {queue.platforms.map((p) => (
              <ReviewRow
                key={p.id}
                title={p.display_label}
                subtitle={p.internal_key}
                meta=""
                approveLabel={t("curation.approve")}
                rejectLabel={t("curation.deactivate")}
                onApprove={() => reviewPlatformAction(p.id, "active")}
                onReject={() => reviewPlatformAction(p.id, "inactive")}
              />
            ))}
          </Section>
        </main>
      </div>
    </div>
  );
}
