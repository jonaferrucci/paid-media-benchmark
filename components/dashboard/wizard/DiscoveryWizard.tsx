"use client";

import { useState } from "react";
import { CohortFilters } from "@/lib/types";
import { PLATFORM_CARDS, VERTICALS } from "@/lib/mock/taxonomies";
import { WizardBreadcrumb } from "./WizardBreadcrumb";
import { PlatformStep } from "./PlatformStep";
import { ObjectiveStep } from "./ObjectiveStep";
import { VerticalStep } from "./VerticalStep";
import { CountryStep } from "./CountryStep";
import { ContextStep } from "./ContextStep";
import { useTranslation } from "@/lib/i18n/LanguageContext";

interface DiscoveryWizardProps {
  onComplete: (filters: CohortFilters) => void;
  initialDraft?: Partial<WizardDraft>;
}

// PHASE 39 (§7/§8): only 4 dimensions are required to reach a result —
// Platform, Objective, Vertical, Country — matching the real /benchmark
// page, where Audience/Funnel/Age/Spend/Duration are all optional
// filters (see BenchmarkExplorer.tsx's own draft, none of them
// required there either). Everything past Country now lives in ONE
// combined "refine" screen (ContextStep) instead of a forced extra
// full-screen Audience step — audienceStrategy moved into `context`
// alongside the other already-optional advanced fields, no
// methodological dimension removed, only no longer gating submission.
interface WizardDraft {
  platformUiId: string | null;
  objectiveUiKey: string | null;
  objective: CohortFilters["objective"] | null;
  verticalId: string | null;
  countryId: string | null;
  context: Partial<CohortFilters>;
}

const DEFAULT_DRAFT: WizardDraft = {
  platformUiId: null,
  objectiveUiKey: null,
  objective: null,
  verticalId: null,
  countryId: null,
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

  // PHASE 39 (§8): only the 4 required dimensions are counted here, so
  // WizardBreadcrumb's mobile "Paso X de 4" reads correctly — the final
  // refine/results screen (step 4) is presented as "everything's
  // selected, now optionally refine" rather than a numbered 5th step.
  const breadcrumbSteps = [
    { label: t("wizard.stepPlatform"), value: platformLabel },
    { label: t("wizard.stepObjective"), value: objectiveLabel },
    { label: t("wizard.stepVertical"), value: verticalLabel },
    { label: t("wizard.stepCountry"), value: countryLabel },
  ];

  function handleSubmit() {
    if (!draft.platformUiId || !draft.objective || !draft.verticalId || !draft.countryId) return;
    const platform = PLATFORM_CARDS.find((p) => p.uiId === draft.platformUiId)!.platform;
    const filters: CohortFilters = {
      platform,
      country: draft.countryId,
      timeWindow: (draft.context.timeWindow as CohortFilters["timeWindow"]) ?? "last_12_months",
      verticalId: draft.verticalId,
      objective: draft.objective,
      audienceStrategy: draft.context.audienceStrategy ?? null,
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
    <div className="pb-4">
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
