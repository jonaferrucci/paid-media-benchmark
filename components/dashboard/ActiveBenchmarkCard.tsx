"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { CohortStep } from "@/lib/types";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface ActiveBenchmarkCardProps {
  platformLabel: string;
  objectiveLabel: string;
  verticalLabel: string;
  audienceLabel: string | null;
  funnelLabel: string | null;
  ageLabel: string | null;
  countryLabel: string;
  timeWindowLabel: string;
  sampleSize: number;
  steps: CohortStep[];
}

export function ActiveBenchmarkCard({
  platformLabel,
  objectiveLabel,
  verticalLabel,
  audienceLabel,
  funnelLabel,
  ageLabel,
  countryLabel,
  timeWindowLabel,
  sampleSize,
  steps,
}: ActiveBenchmarkCardProps) {
  const { t } = useTranslation();
  const [showBreakdown, setShowBreakdown] = useState(false);
  const belowMinimum = sampleSize < 10;
  const chips = [audienceLabel, funnelLabel, ageLabel].filter(Boolean) as string[];

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
        {platformLabel} · {objectiveLabel}
      </p>

      <p className="mt-1.5 font-display text-xl font-semibold text-primary">{verticalLabel}</p>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip}
              className="rounded-full bg-pistachio-soft px-2.5 py-1 text-xs font-medium text-pistachio"
            >
              {chip}
            </span>
          ))}
        </div>
      )}

      <p className="mt-2.5 text-sm text-ink-600">
        {countryLabel} · {timeWindowLabel}
      </p>

      <p className={`mt-3 text-sm font-medium ${belowMinimum ? "text-caution" : "text-ink-900"}`}>
        {sampleSize.toLocaleString()} {t("cohort.comparableDatasets")}
      </p>

      <button
        onClick={() => setShowBreakdown((s) => !s)}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-ink-600 hover:text-primary"
      >
        {showBreakdown ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        {showBreakdown ? t("cohort.hideBreakdown") : t("cohort.showBreakdown")}
      </button>

      {showBreakdown && (
        <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2 border-t border-line pt-3">
          {steps.map((step, idx) => {
            const stepLabel =
              step.key === "age"
                ? t("cohort.stepAge", { range: step.ageRange ?? "" })
                : t(`cohort.step${step.key.charAt(0).toUpperCase()}${step.key.slice(1)}`);
            return (
              <div key={step.key} className="flex items-center gap-2">
                {idx > 0 && <span className="text-ink-400">→</span>}
                <div className="rounded-full bg-canvas px-2.5 py-1">
                  <span className="text-xs text-ink-600">{stepLabel}</span>{" "}
                  <span className="tabular text-xs font-semibold text-ink-900">
                    {step.sampleSize.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
