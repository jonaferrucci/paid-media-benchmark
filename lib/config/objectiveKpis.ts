import { MetricKey, Objective } from "@/lib/types";

// Drives which KPI cards render, and in what order, for a given
// objective. This is the "Objective + Platform decide WHAT" half of the
// KPI Architecture Principle (04-DASHBOARD-UX-AND-INFORMATION-ARCHITECTURE.md).
//
// Three tiers per objective:
// - primary:   dominant media-efficiency KPIs (always the visually largest cards)
// - secondary: supporting media metrics, shown smaller/muted below primary
// - outcomes:  business outcome metrics (CPA, CPL, ROAS, Conversion Rate).
//              Never merged into primary — rendered in a clearly separate
//              "Business Outcomes" section so the product stays media-first
//              (00-PROJECT-OVERVIEW.md: "ROAS, CPA, ACOS and TACOS must not
//              dominate the default product experience").
export interface ObjectiveKpiConfig {
  primary: MetricKey[];
  secondary: MetricKey[];
  outcomes: MetricKey[];
}

export const OBJECTIVE_KPI_CONFIG: Record<Objective, ObjectiveKpiConfig> = {
  traffic: {
    primary: ["cpc", "ctr", "cpm", "reach", "frequency"],
    secondary: [],
    outcomes: [],
  },
  awareness: {
    // Status: Awareness/Reach split APPROVED — Phase 2.1.
    // CPM leads for Awareness (brand recognition media efficiency);
    // Reach is present but not the headline metric.
    primary: ["cpm", "frequency", "impressions", "reach"],
    secondary: ["ctr", "cpc"],
    outcomes: [],
  },
  reach: {
    // Status: Awareness/Reach split APPROVED — Phase 2.1.
    // Reach/Unique Users leads for the Reach objective. Direct Reach
    // benchmarking still requires Spend Range + Duration Band — see
    // ReachCard, which enforces this regardless of objective.
    primary: ["reach", "frequency", "cpm", "impressions"],
    secondary: ["ctr", "cpc"],
    outcomes: [],
  },
  video_views: {
    primary: ["cpv", "vtr", "cpm", "frequency"],
    secondary: ["reach", "ctr"],
    outcomes: [],
  },
  engagement: {
    primary: ["cpe", "engagement_rate", "cpm", "reach", "frequency"],
    secondary: ["ctr", "cpc"],
    outcomes: [],
  },
  sales: {
    primary: ["cpm", "ctr", "cpc", "reach", "frequency"],
    secondary: [],
    outcomes: ["cpa", "conversion_rate", "roas"],
  },
  leads: {
    primary: ["cpm", "ctr", "cpc", "reach", "frequency"],
    secondary: [],
    outcomes: ["cpl", "conversion_rate"],
  },
};

export const METRIC_LABELS: Record<MetricKey, string> = {
  cpm: "CPM",
  ctr: "CTR",
  cpc: "CPC",
  reach: "Reach",
  frequency: "Frequency",
  cpv: "CPV",
  vtr: "VTR",
  impressions: "Impressions",
  engagement_rate: "Engagement Rate",
  cpe: "CPE",
  cpa: "CPA",
  conversion_rate: "Conversion Rate",
  roas: "ROAS",
  cpl: "CPL",
};

// Metrics selectable in the Vertical x Audience Matrix and the trend
// chart. Reach is intentionally excluded from simple cross-cohort
// comparisons — it is handled separately via ReachCard, which enforces
// the mandatory Spend Range + Duration Band requirement. Business
// outcome metrics are excluded here too: cross-vertical/audience
// benchmarking of ROAS/CPA is a separate, not-yet-approved feature.
export const COMPARABLE_METRICS: MetricKey[] = ["cpm", "ctr", "cpc", "frequency", "cpv"];
