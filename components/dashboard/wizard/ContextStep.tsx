"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { CohortFilters } from "@/lib/types";
import { FUNNEL_STAGES, TIME_WINDOWS } from "@/lib/mock/taxonomies";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface ContextStepProps {
  draft: Partial<CohortFilters>;
  onChange: (partial: Partial<CohortFilters>) => void;
  onSubmit: () => void;
}

function Field({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-600">{label}</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-line bg-surface py-2.5 pl-3 pr-8 text-sm text-ink-900 outline-none focus-visible:border-primary"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400" />
      </div>
    </label>
  );
}

export function ContextStep({ draft, onChange, onSubmit }: ContextStepProps) {
  const { t } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="mx-auto max-w-2xl px-4">
      <h2 className="mb-4 text-center font-display text-lg font-semibold text-ink-900">
        {t("wizard.questionContext")}
      </h2>

      <div className="mx-auto max-w-md rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <Field
          label={t("finder.timeWindow")}
          value={draft.timeWindow ?? "last_12_months"}
          options={TIME_WINDOWS.map((tw) => ({ value: tw.id, label: t(`timeWindows.${tw.id}`) }))}
          onChange={(v) => onChange({ timeWindow: v as CohortFilters["timeWindow"] })}
        />

        <button
          onClick={() => setShowAdvanced((s) => !s)}
          className="mt-4 flex items-center gap-1.5 text-xs font-medium text-ink-600 hover:text-primary"
        >
          <SlidersHorizontal size={13} />
          {t("wizard.moreOptions")}
        </button>

        {showAdvanced && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <Field
              label={t("finder.funnelStage")}
              value={draft.funnelStage ?? ""}
              options={[
                { value: "", label: t("finder.any") },
                ...FUNNEL_STAGES.map((f) => ({ value: f.id, label: t(`funnel.${f.id}`) })),
              ]}
              onChange={(v) => onChange({ funnelStage: (v || null) as CohortFilters["funnelStage"] })}
            />
            <Field
              label={t("finder.age")}
              value={draft.minAge ? `${draft.minAge}-${draft.maxAge}` : ""}
              options={[
                { value: "", label: t("finder.all") },
                // PHASE 31 item 1: "25-44" was a typo overlapping with
                // the very next band — an age band list must be a
                // partition (each age belongs to exactly one band), and
                // 25-44/35-44 both covered ages 35-44 while nothing
                // covered 25-34 at all. Corrected to the evidently
                // intended 18-24/25-34/35-44/45-54 sequence. This is a
                // wizard-only UI options list (not part of the DB
                // schema or the benchmark's own age methodology — see
                // lib/benchmark/spendBands.ts and the engine's actual
                // age-range handling, both untouched by this fix).
                { value: "18-24", label: "18–24" },
                { value: "25-34", label: "25–34" },
                { value: "35-44", label: "35–44" },
                { value: "45-54", label: "45–54" },
              ]}
              onChange={(v) => {
                if (!v) {
                  onChange({ minAge: null, maxAge: null });
                  return;
                }
                const [min, max] = v.split("-").map(Number);
                onChange({ minAge: min, maxAge: max });
              }}
            />
            <Field
              label={t("finder.spendRange")}
              value={draft.spendBand ?? ""}
              options={[
                { value: "", label: t("finder.all") },
                { value: "500_2000", label: "USD 500–2,000" },
                { value: "2000_10000", label: "USD 2,000–10,000" },
                { value: "10000_50000", label: "USD 10,000–50,000" },
              ]}
              onChange={(v) => onChange({ spendBand: (v || null) as CohortFilters["spendBand"] })}
            />
            <Field
              label={t("finder.duration")}
              value={draft.durationBand ?? ""}
              options={[
                { value: "", label: t("finder.all") },
                { value: "8_14", label: "8–14" },
                { value: "15_30", label: "15–30" },
                { value: "31_60", label: "31–60" },
              ]}
              onChange={(v) => onChange({ durationBand: (v || null) as CohortFilters["durationBand"] })}
            />
          </div>
        )}

        <button
          onClick={onSubmit}
          className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t("wizard.viewBenchmark")} →
        </button>
      </div>
    </div>
  );
}
