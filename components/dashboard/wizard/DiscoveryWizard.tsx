"use client";

import { useState } from "react";
import { AudienceStrategy, CohortFilters } from "@/lib/types";
import { PLATFORM_CARDS, VERTICALS } from "@/lib/mock/taxonomies";
import { WizardBreadcrumb } from "./WizardBreadcrumb";
import { PlatformStep } from "./PlatformStep";
import { ObjectiveStep } from "./ObjectiveStep";
import { VerticalStep } from "./VerticalStep";
import { CountryStep } from "./CountryStep";
import { AudienceStep } from "./AudienceStep";
import { ContextStep } from "./ContextStep";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface DiscoveryWizardProps {
  onComplete: (filters: CohortFilters) => void;
  initialDraft?: Partial<WizardDraft>;
}

interface WizardDraft {
  platformUiId: string | null;
  objectiveUiKey: string | null;
  objective: CohortFilters["objective"] | null;
  verticalId: string | null;
  countryId: string | null;
  audienceStrategy: AudienceStrategy | null;
  context: Partial<CohortFilters>;
}

const DEFAULT_DRAFT: WizardDraft = {
  platformUiId: null,
  objectiveUiKey: null,
  objective: null,
  verticalId: null,
  countryId: null,
  audienceStrategy: null,
  context: { timeWindow: "last_12_months" },
};

export function DiscoveryWizard({ onComplete, initialDraft }: DiscoveryWizardProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<WizardDraft>({ ...DEFAULT_DRAFT, ...initialDraft });

  const platformLabel = PLATFORM_CARDS.find((p) => p.uiId === draft.platformUiId)?.label ?? null;
  const objectiveLabel = draft.objectiveUiKey ? t(`objectivesWizard.${draft.objectiveUiKey}`) : null;
  const verticalLabel = VERTICALS.find((v) => v.id === draft.verticalId)?.label ?? null;
  const countryLabel = draft.countryId ? t(`countries.${draft.countryId}`) : null;
  const audienceLabel = draft.audienceStrategy ? t(`audiences.${draft.audienceStrategy}`) : null;

  const breadcrumbSteps = [
    { label: t("wizard.stepPlatform"), value: platformLabel },
    { label: t("wizard.stepObjective"), value: objectiveLabel },
    { label: t("wizard.stepVertical"), value: verticalLabel },
    { label: t("wizard.stepCountry"), value: countryLabel },
    { label: t("wizard.stepAudience"), value: audienceLabel },
    { label: t("wizard.stepContext"), value: null },
  ];

  function handleSubmit() {
    if (!draft.platformUiId || !draft.objective || !draft.verticalId || !draft.countryId || !draft.audienceStrategy) return;
    const platform = PLATFORM_CARDS.find((p) => p.uiId === draft.platformUiId)!.platform;
    const filters: CohortFilters = {
      platform,
      country: draft.countryId,
      timeWindow: (draft.context.timeWindow as CohortFilters["timeWindow"]) ?? "last_12_months",
      verticalId: draft.verticalId,
      objective: draft.objective,
      audienceStrategy: draft.audienceStrategy,
      funnelStage: draft.context.funnelStage ?? null,
      minAge: draft.context.minAge ?? null,
      maxAge: draft.context.maxAge ?? null,
      campaignType: null,
      spendBand: draft.context.spendBand ?? null,
      durationBand: draft.context.durationBand ?? null,
    };
    onComplete(filters);
  }

  return (
    <div className="pb-16">
      <WizardBreadcrumb steps={breadcrumbSteps} currentIndex={step} onJump={setStep} />

      {step === 0 && (
        <PlatformStep
          selectedUiId={draft.platformUiId}
          onSelect={(uiId) => {
            setDraft((d) => ({ ...d, platformUiId: uiId }));
            setStep(1);
          }}
        />
      )}
      {step === 1 && (
        <ObjectiveStep
          onSelect={(uiKey) => {
            setDraft((d) => ({
              ...d,
              objectiveUiKey: uiKey,
              // Status: Awareness/Reach split APPROVED — Phase 2.1.
              // uiKey now maps 1:1 to a distinct Objective value; no
              // merge needed (see OBJECTIVE_CARDS in taxonomies.ts).
              objective: uiKey as CohortFilters["objective"],
            }));
            setStep(2);
          }}
        />
      )}
      {step === 2 && (
        <VerticalStep
          onSelect={(verticalId) => {
            setDraft((d) => ({ ...d, verticalId }));
            setStep(3);
          }}
        />
      )}
      {step === 3 && (
        <CountryStep
          onSelect={(countryId) => {
            setDraft((d) => ({ ...d, countryId }));
            setStep(4);
          }}
        />
      )}
      {step === 4 && (
        <AudienceStep
          onSelect={(audienceStrategy) => {
            setDraft((d) => ({ ...d, audienceStrategy }));
            setStep(5);
          }}
        />
      )}
      {step === 5 && (
        <ContextStep
          draft={draft.context}
          onChange={(partial) => setDraft((d) => ({ ...d, context: { ...d.context, ...partial } }))}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

// Re-exported so callers (e.g. featured discovery modules) can build a
// partial draft without reaching into wizard internals.
export type { WizardDraft };
