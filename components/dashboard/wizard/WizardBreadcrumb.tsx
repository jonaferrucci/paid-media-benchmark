"use client";

import { Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface BreadcrumbStep {
  label: string;
  value: string | null;
}

interface WizardBreadcrumbProps {
  steps: BreadcrumbStep[];
  currentIndex: number;
  onJump: (index: number) => void;
}

export function WizardBreadcrumb({ steps, currentIndex, onJump }: WizardBreadcrumbProps) {
  const { t } = useTranslation();

  return (
    <div className="mb-6 px-4">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-2">
        {steps.map((step, idx) => {
          const isDone = idx < currentIndex && step.value;
          const isCurrent = idx === currentIndex;
          if (isDone) {
            return (
              <button
                key={step.label}
                onClick={() => onJump(idx)}
                className="flex items-center gap-1.5 rounded-full bg-pistachio-soft px-3 py-1.5 text-xs font-medium text-pistachio transition-opacity hover:opacity-80"
              >
                <Check size={12} />
                {step.value}
              </button>
            );
          }
          return (
            <span
              key={step.label}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                isCurrent ? "bg-primary text-white" : "bg-surface2 text-ink-400"
              }`}
            >
              {step.label}
            </span>
          );
        })}
      </div>
      {/* PHASE 39 (§8): once every required dimension is picked
          (currentIndex reaches the optional refine/results screen,
          past the last counted step), stop counting — "Paso 5 de 4"
          would be nonsensical. All 4 pills already read as done above. */}
      {currentIndex < steps.length && (
        <p className="mt-2 text-center text-[11px] text-ink-400 sm:hidden">
          {t("wizard.stepOf", { current: currentIndex + 1, total: steps.length })}
        </p>
      )}
    </div>
  );
}
