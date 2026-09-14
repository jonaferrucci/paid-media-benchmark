"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

export type RelaxationKind = "age" | "funnel" | "audience";

interface RelaxationOption {
  kind: RelaxationKind;
  resultingSampleSize: number;
}

interface InsufficientDataStateProps {
  verticalLabel: string;
  audienceLabel: string;
  funnelLabel: string;
  ageLabel: string;
  options: RelaxationOption[];
  onSelectOption: (kind: RelaxationKind) => void;
}

export function InsufficientDataState({
  verticalLabel,
  audienceLabel,
  funnelLabel,
  ageLabel,
  options,
  onSelectOption,
}: InsufficientDataStateProps) {
  const { t } = useTranslation();

  const optionLabel: Record<RelaxationKind, string> = {
    age: t("insufficient.withoutAge"),
    funnel: t("insufficient.withoutFunnel"),
    audience: t("insufficient.broaderAudience"),
  };

  return (
    <div className="rounded-2xl border border-caution/30 bg-caution-soft p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-caution" strokeWidth={1.75} />
        <div>
          <p className="font-display text-sm font-semibold text-ink-900">
            {t("insufficient.title")}
          </p>
          <p className="mt-1 text-sm text-ink-700">
            {verticalLabel} · {audienceLabel} · {funnelLabel} · {ageLabel}
          </p>
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-600">
            {t("insufficient.subtitle")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.map((option) => (
              <button
                key={option.kind}
                onClick={() => onSelectOption(option.kind)}
                className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-900 transition-colors hover:border-primary hover:text-primary"
              >
                {optionLabel[option.kind]}
                <span className="tabular ml-1.5 text-ink-400">
                  (~{option.resultingSampleSize})
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-600">{t("insufficient.protectedNote")}</p>
        </div>
      </div>
    </div>
  );
}
