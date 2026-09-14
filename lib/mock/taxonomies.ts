import { AudienceStrategy, FunnelStage, Objective, Platform, Vertical } from "@/lib/types";

// Verticals are a controlled taxonomy (see 02-DATA-DIMENSIONS-AND-TAXONOMIES.md).
// For the prototype, a representative subset carries realistic mock
// benchmark data; the remainder exist for the filter list and correctly
// return an insufficient-data state, matching production behavior for a
// vertical with too few contributed datasets.
export const VERTICALS: Vertical[] = [
  { id: "beauty_personal_care", label: "Beauty & Personal Care" },
  { id: "fashion_apparel", label: "Fashion & Apparel" },
  { id: "home_kitchen", label: "Home & Kitchen" },
  { id: "consumer_electronics", label: "Consumer Electronics" },
  { id: "automotive", label: "Automotive" },
  { id: "financial_services", label: "Financial Services" },
  { id: "health_wellness", label: "Health & Wellness" },
  { id: "food_beverage", label: "Food & Beverage" },
  { id: "real_estate", label: "Real Estate" },
  { id: "travel_tourism", label: "Travel & Tourism" },
  { id: "saas", label: "SaaS" },
  { id: "gaming", label: "Gaming" },
];

// Verticals with enough mock observations to render full benchmarks.
// Real Estate and Gaming intentionally simulate an insufficient-data
// state, so both the "populated vertical" and "not enough data yet"
// paths remain visible in the prototype.
export const VERTICALS_WITH_DATA = new Set([
  "beauty_personal_care",
  "fashion_apparel",
  "home_kitchen",
  "consumer_electronics",
  "automotive",
  "financial_services",
  "health_wellness",
  "food_beverage",
  "travel_tourism",
  "saas",
]);

export const AUDIENCE_STRATEGIES: { id: AudienceStrategy; label: string }[] = [
  { id: "broad", label: "Broad" },
  { id: "interest_based", label: "Interest-Based" },
  { id: "lookalike", label: "Lookalike" },
  { id: "remarketing", label: "Remarketing" },
  { id: "customer_list", label: "Customer List" },
  { id: "automated_algorithmic", label: "Automated / Algorithmic" },
];

export const FUNNEL_STAGES: { id: FunnelStage; label: string }[] = [
  { id: "prospecting", label: "Prospecting" },
  { id: "consideration", label: "Consideration" },
  { id: "remarketing", label: "Remarketing" },
  { id: "retention", label: "Retention" },
];

export const OBJECTIVES: { id: Objective; label: string }[] = [
  { id: "awareness", label: "Awareness" },
  { id: "reach", label: "Reach" },
  { id: "traffic", label: "Traffic" },
  { id: "video_views", label: "Video Views" },
  { id: "engagement", label: "Engagement" },
  { id: "sales", label: "Sales" },
  { id: "leads", label: "Leads" },
];

// Wizard-facing objective cards. Status: Awareness/Reach split APPROVED
// — Phase 2.1. "reach" and "awareness" are now two fully distinct
// objective values, matching the database's objectives taxonomy
// (supabase/migrations + seed.sql already seeded both separately since
// Phase 2; only this application-layer mapping needed the fix).
export const OBJECTIVE_CARDS: { uiKey: string; objective: Objective }[] = [
  { uiKey: "reach", objective: "reach" },
  { uiKey: "awareness", objective: "awareness" },
  { uiKey: "traffic", objective: "traffic" },
  { uiKey: "video_views", objective: "video_views" },
  { uiKey: "engagement", objective: "engagement" },
  { uiKey: "leads", objective: "leads" },
  { uiKey: "sales", objective: "sales" },
];

export const PLATFORMS: { id: Platform; label: string; availableInPrototype: boolean }[] = [
  { id: "meta_ads", label: "Meta Ads", availableInPrototype: true },
  { id: "google_ads", label: "Google Ads", availableInPrototype: false },
  { id: "tiktok_ads", label: "TikTok Ads", availableInPrototype: false },
  { id: "mercado_libre_ads", label: "Mercado Libre Ads", availableInPrototype: false },
  { id: "pinterest_ads", label: "Pinterest Ads", availableInPrototype: false },
  { id: "dsp_programmatic", label: "DSP / Programmatic", availableInPrototype: false },
];

// Planner-facing platform cards for the Step 1 discovery screen.
// Status: Phase 1.5 APPROVED — all cards are now visually and
// functionally selectable (the mock data layer supports any platform
// choice, per Phase 1.5 item 3: "do not show disabled/Próximamente on
// every card — we need to visually test the complete multi-platform
// experience").
// IMPORTANT: "youtube" is NOT a new Platform taxonomy value — it is a
// UI-only card that maps to the existing "google_ads" platform under
// the hood (uiId → platform), per Phase 1.5 item 4. Whether YouTube
// deserves its own Platform value (vs. being a Campaign Type under
// Google Ads) remains an open architectural question, not decided here.
export const PLATFORM_CARDS: {
  uiId: string;
  platform: Platform;
  label: string;
  descriptionKey: string;
}[] = [
  { uiId: "meta_ads", platform: "meta_ads", label: "Meta Ads", descriptionKey: "platformDesc.meta_ads" },
  { uiId: "google_ads", platform: "google_ads", label: "Google Ads", descriptionKey: "platformDesc.google_ads" },
  { uiId: "youtube", platform: "google_ads", label: "YouTube", descriptionKey: "platformDesc.youtube" },
  { uiId: "tiktok_ads", platform: "tiktok_ads", label: "TikTok Ads", descriptionKey: "platformDesc.tiktok_ads" },
  { uiId: "mercado_libre_ads", platform: "mercado_libre_ads", label: "Mercado Libre Ads", descriptionKey: "platformDesc.mercado_libre_ads" },
  { uiId: "pinterest_ads", platform: "pinterest_ads", label: "Pinterest Ads", descriptionKey: "platformDesc.pinterest_ads" },
  { uiId: "dsp_programmatic", platform: "dsp_programmatic", label: "DSP / Programmatic", descriptionKey: "platformDesc.dsp_programmatic" },
];

export const COUNTRIES: { id: string; label: string; flag: string }[] = [
  { id: "AR", label: "Argentina", flag: "🇦🇷" },
  { id: "MX", label: "Mexico", flag: "🇲🇽" },
  { id: "UY", label: "Uruguay", flag: "🇺🇾" },
  { id: "BR", label: "Brazil", flag: "🇧🇷" },
  { id: "CL", label: "Chile", flag: "🇨🇱" },
  { id: "CO", label: "Colombia", flag: "🇨🇴" },
  { id: "PE", label: "Peru", flag: "🇵🇪" },
  { id: "PY", label: "Paraguay", flag: "🇵🇾" },
];

export const TIME_WINDOWS: { id: string; label: string }[] = [
  { id: "current_year", label: "Current Year" },
  { id: "last_3_months", label: "Last 3 Months" },
  { id: "last_6_months", label: "Last 6 Months" },
  { id: "last_12_months", label: "Last 12 Months" },
  { id: "custom", label: "Custom Period" },
];
