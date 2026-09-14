-- 0002_taxonomies.sql
-- Purpose: normalized controlled-vocabulary tables. Every taxonomy uses a
-- stable internal_key (never renamed) plus a display_label (may change
-- without affecting historical relationships) — see
-- 02-DATA-DIMENSIONS-AND-TAXONOMIES.md "Taxonomy Governance".

-- ---------------------------------------------------------------------
-- platforms
-- ---------------------------------------------------------------------
create table platforms (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table platforms is
  'Advertising platforms. YouTube is intentionally NOT a row here — '
  'planner-facing "YouTube" maps to platform = google_ads with '
  'campaign_types.internal_key = video_youtube. See campaign_types below '
  'and 12-FUTURE-INTEGRATIONS-AND-API.md / Phase 1.5 notes.';

-- ---------------------------------------------------------------------
-- campaign_types
-- Platform-specific campaign/channel types (e.g. Google Ads: Search,
-- Performance Max, Display, Video/YouTube, Shopping; Meta Ads: standard).
-- This is the mechanical home of the YouTube mapping: YouTube is a
-- campaign_type row scoped to the google_ads platform, never a distinct
-- platform row. See 01-PLATFORMS-AND-METRICS.md "Google Ads" section.
-- ---------------------------------------------------------------------
create table campaign_types (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references platforms(id) on delete cascade,
  internal_key text not null,
  display_label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform_id, internal_key)
);

comment on table campaign_types is
  'Platform-specific campaign/channel types. YouTube = the row with '
  'internal_key = video_youtube scoped to the google_ads platform_id. '
  'Never create a "youtube" row in platforms.';

-- ---------------------------------------------------------------------
-- objectives
-- Awareness and Reach are separate objectives per the approved taxonomy
-- (02-DATA-DIMENSIONS-AND-TAXONOMIES.md "Objective"), reversing the
-- Phase 1 frontend mock simplification that had merged them.
-- ---------------------------------------------------------------------
create table objectives (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- verticals
-- Protected benchmark dimension — never silently relaxed by the engine.
-- Optional parent_id supports future subcategories without a redesign.
-- ---------------------------------------------------------------------
create table verticals (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  parent_id uuid references verticals(id) on delete set null,
  active boolean not null default true,
  display_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- audience_strategies
-- ---------------------------------------------------------------------
create table audience_strategies (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- funnel_stages
-- ---------------------------------------------------------------------
create table funnel_stages (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- countries
-- ISO 3166-1 alpha-2 codes. Architecture supports all countries; seed
-- data prioritizes LATAM per the approved MVP UI focus.
-- ---------------------------------------------------------------------
create table countries (
  id uuid primary key default gen_random_uuid(),
  iso_code text not null unique check (char_length(iso_code) = 2),
  display_label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_campaign_types_platform on campaign_types(platform_id);
create index idx_verticals_parent on verticals(parent_id);
