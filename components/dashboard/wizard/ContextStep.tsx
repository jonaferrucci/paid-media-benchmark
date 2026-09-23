"use client";

import { useState } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { CohortFilters } from "@/lib/types";
import { AUDIENCE_STRATEGIES, FUNNEL_STAGES, TIME_WINDOWS } from "@/lib/mock/taxonomies";
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

// PHASE 39 (§7/§15): this is now the wizard's final "results" screen —
// the 4 required dimensions (Platform/Objective/Vertical/Country) are
// already picked by the time the user lands here, so the primary CTA
// ("Ver benchmark") is reachable immediately. Audience — previously a
// forced, separate full-screen step (AudienceStep, removed) — now lives
// here alongside the other already-optional advanced fields, collapsed
// by default under "Afinar benchmark" (renamed from "Más opciones"),
// exactly matching how audienceStrategy is already just one more
// optional filter on the real /benchmark page (BenchmarkExplorer.tsx).
// No methodological dimension was removed — only the forced ordering.
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
          // PHASE 39.1 (§1): "custom" is excluded here even though
          // TIME_WINDOWS (lib/mock/taxonomies.ts) lists it — this form
          // (and /benchmark's own, which Home now prefills into) has no
          // start/end date input anywhere, and app/benchmark/actions.ts's
          // toTimeWindowInput() has never implemented a "custom" case
          // either (it silently falls back to last_12_months for
          // anything unrecognized). Offering "Período personalizado"
          // here would show that label while the computed benchmark
          // silently used a different window — exactly the mismatch
          // this phase exists to eliminate. Only real, end-to-end
          // supported windows are offered.
          options={TIME_WINDOWS.filter((tw) => tw.id !== "custom").map((tw) => ({ value: tw.id, label: t(`timeWindows.${tw.id}`) }))}
          onChange={(v) => onChange({ timeWindow: v as CohortFilters["timeWindow"] })}
        />

        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          aria-expanded={showAdvanced}
          className="mt-4 flex items-center gap-1.5 text-xs font-medium text-ink-600 hover:text-primary"
        >
          <SlidersHorizontal size={13} />
          {t("wizard.moreOptions")}
        </button>

        {showAdvanced && (
          <div className="mt-3 grid grid-cols-1 gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <Field
              label={t("finder.audience")}
              value={draft.audienceStrategy ?? ""}
              options={[
                { value: "", label: t("finder.any") },
                ...AUDIENCE_STRATEGIES.map((a) => ({ value: a.id, label: t(`audiences.${a.id}`) })),
              ]}
              onChange={(v) => onChange({ audienceStrategy: (v || null) as CohortFilters["audienceStrategy"] })}
            />
            <Field
              label={t("finder.funnelStage")}
              value={draft.funnelStage ?? ""}
              options={[
                { value: "", label: t("finder.any") },
                ...FUNNEL_STAGES.map((f) => ({ value: f.id, label: t(`funnel.${f.id}`) })),
              ]}
              onChange={(v) => onChange({ funnelStage: (v || null) as CohortFilters["funnelStage"] })}
            />
            {/* PHASE 39.1 (§2): Age was removed from this panel — Home
                let a user pick minAge/maxAge here, but BenchmarkExplorer
                .tsx (app/benchmark/BenchmarkExplorer.tsx) has no age
                concept anywhere in its own Draft or query building, so
                there was no honest prefill target for it (unlike
                Audience/Funnel/Spend/Duration/Time Window, all real
                fields there). A control that looks like it works and
                then silently gets dropped is worse than no control at
                all. minAge/maxAge remain real, unchanged fields on
                CohortFilters (lib/types.ts) and wherever the benchmark
                engine itself already supports age filtering outside
                Home — only this Home panel drops the input, and only
                until Home -> Benchmark gets real end-to-end age support. */}
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
          type="button"
          onClick={onSubmit}
          className="mt-5 w-full rounded-full bg-primary py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          {t("wizard.viewBenchmark")} →
        </button>
      </div>
    </div>
  );
}
