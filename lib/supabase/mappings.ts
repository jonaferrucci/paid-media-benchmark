// Translation layer between the frontend's mock-data enums
// (lib/types.ts) and the database's taxonomy internal_key values
// (supabase/migrations/0002_taxonomies.sql + supabase/seed.sql).
//
// Per Phase 2 item 20 ("avoid duplicating inconsistent enums... one
// clean mapping layer"), this file is the single place that layer
// lives. It does not resolve every discrepancy — some are open
// architectural questions from earlier phases, documented below rather
// than silently papered over.

import type { AudienceStrategy, FunnelStage, Objective, Platform } from "@/lib/types";

// Platform: 1:1, no drift. Both sides use the same six internal keys.
export const PLATFORM_TO_DB_KEY: Record<Platform, string> = {
  meta_ads: "meta_ads",
  google_ads: "google_ads",
  tiktok_ads: "tiktok_ads",
  mercado_libre_ads: "mercado_libre_ads",
  pinterest_ads: "pinterest_ads",
  dsp_programmatic: "dsp_programmatic",
};

// Objective: SPLIT APPROVED AND IMPLEMENTED — Phase 2.1.
//
// The approved taxonomy (02-DATA-DIMENSIONS-AND-TAXONOMIES.md) and the
// database (Phase 2) both list Awareness and Reach as two separate
// objectives. As of Phase 2.1, the frontend's Objective type
// (lib/types.ts), OBJECTIVE_KPI_CONFIG, taxonomies.ts, translations,
// and the wizard's ObjectiveStep all treat them as fully distinct
// values — the drift flagged in Phases 1.4/1.5/2 is resolved. Both
// sides now use the same seven-value vocabulary.
export const OBJECTIVE_TO_DB_KEY: Record<Objective, string> = {
  awareness: "awareness",
  reach: "reach",
  traffic: "traffic",
  video_views: "video_views",
  engagement: "engagement",
  sales: "sales",
  leads: "leads",
};

// Audience Strategy: frontend uses a subset of the database's controlled
// vocabulary (DB additionally has contextual, keyword_based, mixed,
// other, unknown — none exposed in the current wizard UI).
export const AUDIENCE_STRATEGY_TO_DB_KEY: Record<AudienceStrategy, string> = {
  broad: "broad",
  interest_based: "interest_based",
  lookalike: "lookalike",
  remarketing: "remarketing",
  customer_list: "customer_list",
  automated_algorithmic: "automated_algorithmic",
};

// Funnel Stage: frontend uses a subset (DB additionally has mixed,
// other, unknown — not exposed in the current wizard UI).
export const FUNNEL_STAGE_TO_DB_KEY: Record<FunnelStage, string> = {
  prospecting: "prospecting",
  consideration: "consideration",
  remarketing: "remarketing",
  retention: "retention",
};

// YouTube UI-to-database mapping (Phase 1.4/1.5 "youtube" wizard card).
// Not a Platform value — see supabase/migrations/0002_taxonomies.sql.
export const YOUTUBE_DB_MAPPING = {
  platformKey: "google_ads",
  campaignTypeKey: "video_youtube",
} as const;

// Business Model (Phase 2.2): a normalized dimension independent of
// Vertical, Audience, Objective, and Platform — see
// 02-DATA-DIMENSIONS-AND-TAXONOMIES.md "Business Model" and
// supabase/migrations/0008_add_business_models.sql.
//
// This is intentionally NOT yet added to CohortFilters or any frontend
// enum. Per Phase 2.2 item 8, the current wizard is not being
// redesigned this phase — Business Model is data-layer-ready
// (business_models table + performance_datasets.business_model_id)
// but has no frontend field yet. When the frontend does add it (as an
// advanced/future filter, or as part of a submission form), the keys
// below are the source of truth to map against — do not invent a
// second competing list.
export const BUSINESS_MODEL_KEYS = [
  "ecommerce",
  "marketplace_seller",
  "lead_generation",
  "retail",
  "b2b",
  "saas",
  "app",
  "subscription",
  "services",
  "local_business",
  "omnichannel",
  "other",
  "unknown",
] as const;

export type BusinessModelKey = (typeof BUSINESS_MODEL_KEYS)[number];
