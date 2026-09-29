"use client";

import Link from "next/link";
import { Inbox } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

// CUCURUCHO INTELLIGENCE 4.1 — COVERAGE MAP UX POLISH (§5).
//
// Shown ONLY when every returned cell for the selected Platform+
// Objective+Country is canonical no_data — a pure presentation gate in
// front of an otherwise-giant, entirely-repetitive matrix. This never
// alters the underlying no_data results (CoverageExplorer.tsx computes
// allNoData from the full, unfiltered grid response); it only decides
// which view renders first. "Ver detalle por vertical" reveals the
// normal matrix on demand, for a user who explicitly wants to inspect
// the taxonomy anyway.
export function CoverageEmptyState({
  platformLabel,
  objectiveLabel,
  countryLabel,
  onViewMatrix,
}: {
  platformLabel: string;
  objectiveLabel: string;
  countryLabel: string;
  onViewMatrix: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl border border-dashed border-line bg-surface p-8 text-center">
      <Inbox size={22} className="mx-auto text-ink-400" aria-hidden="true" />
      <p className="mt-3 font-display text-base font-semibold text-ink-900">{t("coverageMap.allNoDataTitle")}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
        {t("coverageMap.allNoDataBody", { platform: platformLabel, objective: objectiveLabel, country: countryLabel })}
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link href="/contribute" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-white hover:opacity-90">
          {t("nav.contributeData")}
        </Link>
        <button
          type="button"
          onClick={onViewMatrix}
          className="rounded-full border border-line bg-canvas px-5 py-2.5 text-sm font-medium text-ink-900 hover:border-primary hover:text-primary"
        >
          {t("coverageMap.viewByVerticalCta")}
        </button>
      </div>
    </div>
  );
}
