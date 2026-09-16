-- 0012_media_universe.sql
-- Purpose: Phase 17 — extend Cucurucho from a paid-digital-media
-- benchmark tool toward an extensible LATAM media benchmarking
-- architecture (streaming, digital publishers, and eventually
-- TV/radio/OOH/podcast/etc.), without disturbing the existing,
-- statistically-validated benchmark engine or any prior migration.
--
-- ARCHITECTURE DECISION (per Phase 17 item 4): existing `platforms`
-- remains the SINGLE source of truth for "what a user selects as
-- their media outlet" — it is already deeply referenced by
-- performance_datasets, campaign_types, platform_metrics, the
-- benchmark cohort engine, and saved_comparisons. Rather than
-- introducing a competing `media_outlets` entity (which would fork
-- that identity), this migration EXTENDS `platforms` with the new
-- taxonomy metadata it needs (media category, country availability,
-- governance status). Every existing platform row and its id/
-- internal_key is completely untouched — this is purely additive.

-- ---------------------------------------------------------------------
-- Media categories: canonical, extensible, stable slugs. i18n display
-- labels belong here (display_label) and in the app's own i18n system
-- for UI chrome — never duplicated as hardcoded arrays in components.
-- ---------------------------------------------------------------------
create table media_categories (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table media_categories is
  'Top-level LATAM media taxonomy (paid_social, streaming_live,
   digital_publisher, television, radio, ooh, dooh, podcast, etc.).
   platforms.media_category_id references this table.';

-- ---------------------------------------------------------------------
-- Extend platforms (additive only — no existing column touched).
-- ---------------------------------------------------------------------
alter table platforms add column media_category_id uuid references media_categories(id);
alter table platforms add column is_global boolean not null default false;
alter table platforms add column status text not null default 'active'
  check (status in ('active', 'inactive', 'pending'));
alter table platforms add column website_domain text;

comment on column platforms.is_global is
  'True for platforms available across most/all supported countries
   (e.g. Meta Ads, Google Ads) — see platform_countries for the
   explicit per-country availability of non-global outlets.';
comment on column platforms.status is
  'Governance state, distinct from `active` (which controls whether a
   row appears in taxonomy pickers at all). "pending" is for
   user-suggested outlets awaiting curator review — see item 24/25:
   arbitrary contributor-entered outlet names never automatically
   become "active" catalog entries.';

-- ---------------------------------------------------------------------
-- Country availability (many-to-many). Reuses the existing countries
-- table — no second country taxonomy. A row here is only expected for
-- non-global platforms/outlets; a global platform's availability is
-- represented by is_global=true above instead of one row per country.
-- ---------------------------------------------------------------------
create table platform_countries (
  platform_id uuid not null references platforms(id) on delete cascade,
  country_id uuid not null references countries(id) on delete cascade,
  primary key (platform_id, country_id)
);

create index idx_platform_countries_country on platform_countries(country_id);

-- ---------------------------------------------------------------------
-- Media formats: per-category inventory types (feed/stories/reels for
-- paid social; branded_integration/pre_roll for streaming; etc.).
-- Deliberately NOT modeling a separate "media property" concept in
-- this phase (Phase 17 item 11 explicitly allows deferring it) — the
-- category → format relationship is sufficient to prove the
-- extensible architecture without over-modeling editorial hierarchies.
-- ---------------------------------------------------------------------
create table media_formats (
  id uuid primary key default gen_random_uuid(),
  media_category_id uuid not null references media_categories(id) on delete cascade,
  internal_key text not null,
  display_label text not null,
  active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (media_category_id, internal_key)
);

-- ---------------------------------------------------------------------
-- Metric families: a cross-media grouping concept (DELIVERY, TRAFFIC,
-- VIDEO, COST, AUDIENCE, ...) layered on top of the EXISTING metrics
-- table — no metric is redefined, only categorized.
-- ---------------------------------------------------------------------
create table metric_families (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  display_order integer not null default 0
);

alter table metrics add column metric_family_id uuid references metric_families(id);

-- ---------------------------------------------------------------------
-- Metric applicability: which metrics make sense for which media
-- category. This is the data-driven answer to "which metrics should
-- the contribution UI show for this media type" (Phase 17 item 14),
-- replacing what would otherwise become a large if/else chain in
-- frontend code.
-- ---------------------------------------------------------------------
create table media_category_metrics (
  media_category_id uuid not null references media_categories(id) on delete cascade,
  metric_id uuid not null references metrics(id) on delete cascade,
  required boolean not null default false,
  primary key (media_category_id, metric_id)
);

create index idx_media_category_metrics_metric on media_category_metrics(metric_id);

-- ---------------------------------------------------------------------
-- RLS: reference/catalog tables use the exact same "public read active
-- rows" pattern already established for platforms/countries/objectives
-- in 0007_row_level_security.sql. These are public taxonomy, never
-- private contribution data — performance_datasets/dataset_metric_
-- values/saved_comparisons RLS from prior migrations is untouched.
-- ---------------------------------------------------------------------
alter table media_categories enable row level security;
alter table media_formats enable row level security;
alter table metric_families enable row level security;
alter table media_category_metrics enable row level security;
alter table platform_countries enable row level security;

create policy "public read active media categories" on media_categories
  for select using (active = true);
create policy "public read active media formats" on media_formats
  for select using (active = true);
create policy "public read metric families" on metric_families
  for select using (true);
create policy "public read media category metrics" on media_category_metrics
  for select using (true);
create policy "public read platform countries" on platform_countries
  for select using (true);

-- Matches 0010_taxonomy_read_grants.sql's defensive explicit-grant
-- pattern for the anon/authenticated roles reading taxonomy tables.
grant select on media_categories, media_formats, metric_families, media_category_metrics, platform_countries
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- Seed: existing paid-media platforms get their category tagged
-- (backward-compatible — no id/internal_key changes), plus the
-- explicitly-requested small, conservative Argentina catalog. No
-- benchmark/audience/pricing values are invented anywhere below —
-- these are taxonomy rows only.
-- ---------------------------------------------------------------------
insert into media_categories (internal_key, display_label, display_order) values
  ('paid_social', 'Paid Social', 1),
  ('search', 'Search', 2),
  ('marketplace_ads', 'Marketplace Ads', 3),
  ('online_video', 'Online Video', 4),
  ('streaming_live', 'Streaming / Live Digital', 5),
  ('digital_publisher', 'Digital Publishers', 6),
  ('print', 'Print', 7),
  ('television', 'Television', 8),
  ('radio', 'Radio', 9),
  ('ooh', 'OOH', 10),
  ('dooh', 'DOOH', 11),
  ('podcast', 'Podcast', 12),
  ('programmatic', 'Programmatic', 13),
  ('other', 'Other', 99);

-- Tag existing platforms with their category. is_global=true for the
-- digital ad platforms already usable across every supported market.
update platforms set media_category_id = (select id from media_categories where internal_key = 'paid_social'), is_global = true
  where internal_key in ('meta_ads', 'tiktok_ads', 'pinterest_ads');
update platforms set media_category_id = (select id from media_categories where internal_key = 'search'), is_global = true
  where internal_key = 'google_ads';
update platforms set media_category_id = (select id from media_categories where internal_key = 'marketplace_ads'), is_global = false
  where internal_key = 'mercado_libre_ads';
update platforms set media_category_id = (select id from media_categories where internal_key = 'programmatic'), is_global = true
  where internal_key = 'dsp_programmatic';

-- New Argentina catalog entries (item 32). Country-scoped, not global.
insert into platforms (internal_key, display_label, media_category_id, is_global, status, display_order)
select v.internal_key, v.display_label, mc.id, false, 'active', v.display_order
from (values
  ('luzu_tv', 'Luzu TV', 'streaming_live', 20),
  ('olga', 'OLGA', 'streaming_live', 21),
  ('blender', 'Blender', 'streaming_live', 22),
  ('la_nacion', 'La Nación', 'digital_publisher', 30),
  ('clarin', 'Clarín', 'digital_publisher', 31),
  ('infobae', 'Infobae', 'digital_publisher', 32)
) as v(internal_key, display_label, category_key, display_order)
join media_categories mc on mc.internal_key = v.category_key;

insert into platform_countries (platform_id, country_id)
select p.id, c.id
from platforms p, countries c
where p.internal_key in ('luzu_tv', 'olga', 'blender', 'la_nacion', 'clarin', 'infobae')
  and c.iso_code = 'AR';

-- Metric families (grouping only — no existing metric row is altered).
insert into metric_families (internal_key, display_label, display_order) values
  ('delivery', 'Delivery', 1),
  ('traffic', 'Traffic', 2),
  ('video', 'Video', 3),
  ('cost', 'Cost', 4),
  ('audience', 'Audience', 5),
  ('branded_content', 'Branded Content / Integrations', 6);

update metrics set metric_family_id = (select id from metric_families where internal_key = 'delivery') where internal_key in ('impressions', 'reach', 'frequency');
update metrics set metric_family_id = (select id from metric_families where internal_key = 'traffic') where internal_key in ('clicks', 'link_clicks', 'ctr', 'cpc', 'landing_page_views');
update metrics set metric_family_id = (select id from metric_families where internal_key = 'video') where internal_key in ('video_views', 'cpv', 'vtr');
update metrics set metric_family_id = (select id from metric_families where internal_key = 'cost') where internal_key in ('ad_spend', 'cpm');
update metrics set metric_family_id = (select id from metric_families where internal_key = 'branded_content') where internal_key in ('engagements', 'cpe');

-- Conservative formats: only for the two newly-seeded categories, per
-- item 12's "keep the initial seed conservative" and item 32's scope.
insert into media_formats (media_category_id, internal_key, display_label, display_order)
select mc.id, v.internal_key, v.display_label, v.display_order
from (values
  ('streaming_live', 'branded_integration', 'Branded Integration', 1),
  ('streaming_live', 'sponsorship', 'Sponsorship', 2),
  ('streaming_live', 'mention', 'Mention', 3),
  ('streaming_live', 'pre_roll', 'Pre-roll', 4),
  ('digital_publisher', 'display', 'Display', 1),
  ('digital_publisher', 'native', 'Native', 2),
  ('digital_publisher', 'branded_content', 'Branded Content', 3)
) as v(category_key, internal_key, display_label, display_order)
join media_categories mc on mc.internal_key = v.category_key;

-- Conservative metric applicability for the two new categories —
-- delivery/branded-content-style metrics only (never CTR/CPC as
-- required for streaming/publisher branded work, per item 14's
-- explicit OOH/CTR example of what NOT to force).
insert into media_category_metrics (media_category_id, metric_id, required)
select mc.id, m.id, v.required
from (values
  ('streaming_live', 'impressions', false),
  ('streaming_live', 'video_views', false),
  ('streaming_live', 'ad_spend', true),
  ('streaming_live', 'cpm', false),
  ('digital_publisher', 'impressions', false),
  ('digital_publisher', 'clicks', false),
  ('digital_publisher', 'ad_spend', true),
  ('digital_publisher', 'cpm', false)
) as v(category_key, metric_key, required)
join media_categories mc on mc.internal_key = v.category_key
join metrics m on m.internal_key = v.metric_key;

-- Existing paid-social/search/marketplace/programmatic categories keep
-- using the existing platform_metrics table (already governs which
-- metrics apply per platform) — media_category_metrics is additive
-- for the NEW category types, not a replacement for that mechanism.

-- =======================================================================
-- PHASE 17 EXTENSION: media intelligence foundation (public metrics,
-- commercial inventory/rate cards). Appended to the same migration
-- file (not yet applied anywhere) rather than renaming, to avoid
-- churn on already-verified structure above. Campaign actuals need NO
-- new column: performance_datasets.platform_id already references
-- the SAME `platforms` table extended above, so Luzu TV / OLGA / etc.
-- are already valid contribution targets through the existing Phase
-- 16 pipeline — this is a direct benefit of extending `platforms`
-- rather than forking a competing media_outlets entity.
-- =======================================================================

-- ---------------------------------------------------------------------
-- Media properties: OPTIONAL child of a platform/outlet (e.g. a
-- specific YouTube channel, publisher section, or streaming program).
-- Deliberately minimal — no speculative content seeded.
-- ---------------------------------------------------------------------
create table media_properties (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references platforms(id) on delete cascade,
  internal_key text not null,
  display_label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (platform_id, internal_key)
);

create index idx_media_properties_platform on media_properties(platform_id);

-- ---------------------------------------------------------------------
-- Outlet-specific format availability (optional override/addition on
-- top of the category-level applicability already expressed by
-- media_formats + media_category_metrics). Only used when a specific
-- outlet's actual sellable formats need to be represented distinctly
-- from the generic category list — not required for every outlet.
-- ---------------------------------------------------------------------
create table media_outlet_formats (
  platform_id uuid not null references platforms(id) on delete cascade,
  media_format_id uuid not null references media_formats(id) on delete cascade,
  primary key (platform_id, media_format_id)
);

-- ---------------------------------------------------------------------
-- Public media metric definitions: a small, extensible registry of
-- audience/media-level metric types. Distinct from the existing
-- `metrics` table (which is campaign-performance metrics) — public
-- audience signals are a different population and must never be
-- pooled with campaign metrics (Phase 17 item 2/45).
-- ---------------------------------------------------------------------
create table public_media_metric_definitions (
  id uuid primary key default gen_random_uuid(),
  internal_key text not null unique,
  display_label text not null,
  unit_type text not null default 'count' check (unit_type in ('count', 'rate', 'duration')),
  active boolean not null default true
);

-- ---------------------------------------------------------------------
-- Public media metric snapshots: time-series observations, never
-- overwritten (item 16). A later snapshot for the same outlet+metric
-- is simply a new row with a later observed_at — full history
-- preserved for future growth-over-time analysis.
-- ---------------------------------------------------------------------
create table public_media_metric_snapshots (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references platforms(id) on delete cascade,
  media_property_id uuid references media_properties(id) on delete cascade,
  metric_definition_id uuid not null references public_media_metric_definitions(id),
  value numeric not null,
  observed_at date not null,
  source text not null,
  source_reference text,
  submitted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index idx_public_metric_snapshots_lookup
  on public_media_metric_snapshots(platform_id, metric_definition_id, observed_at desc);

comment on table public_media_metric_snapshots is
  'Append-only history of public/audience metric observations. Never
   UPDATE value in place — always INSERT a new row with a later
   observed_at. "source" records provenance (e.g. youtube, media_kit,
   manual) so the profile UI can be honest about verification level;
   see item 17 — a user-submitted value is never labeled "verified".';

-- ---------------------------------------------------------------------
-- Rate cards: historical commercial offer pricing. A new price NEVER
-- overwrites a prior one — valid_to is set on the superseded row (or
-- left null on genuinely open-ended current pricing) so full price
-- history is queryable (item 20/21).
-- ---------------------------------------------------------------------
create table media_rate_cards (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid not null references platforms(id) on delete cascade,
  media_property_id uuid references media_properties(id) on delete cascade,
  media_format_id uuid not null references media_formats(id),
  price numeric not null check (price >= 0),
  currency text not null check (char_length(currency) = 3),
  pricing_unit text not null check (pricing_unit in
    ('per_integration', 'per_spot', 'per_mention', 'per_day', 'per_week', 'per_month', 'per_thousand', 'package', 'custom')),
  valid_from date not null,
  valid_to date,
  source text not null,
  source_reference text,
  notes text,
  status text not null default 'active' check (status in ('active', 'superseded', 'pending')),
  submitted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create index idx_media_rate_cards_lookup
  on media_rate_cards(platform_id, media_format_id, valid_from desc);

comment on table media_rate_cards is
  'Commercial OFFER/list price history — never campaign actuals. See
   performance_datasets for what advertisers actually paid; the two
   are intentionally separate tables/populations (item 3/23).';

-- ---------------------------------------------------------------------
-- RLS: media_properties/media_outlet_formats/public metric DEFINITIONS
-- are public reference data (same pattern as media_categories above).
-- Snapshots and rate cards are USER-CONTRIBUTED reference data: public
-- to read (it's about the media outlet, not a private campaign), but
-- writes require authentication and are attributed via submitted_by,
-- and a "pending" status keeps unverified submissions from silently
-- reading as canonical fact in the UI (item 11/35).
-- ---------------------------------------------------------------------
alter table media_properties enable row level security;
alter table media_outlet_formats enable row level security;
alter table public_media_metric_definitions enable row level security;
alter table public_media_metric_snapshots enable row level security;
alter table media_rate_cards enable row level security;

create policy "public read active media properties" on media_properties
  for select using (active = true);
create policy "public read media outlet formats" on media_outlet_formats
  for select using (true);
create policy "public read active public metric definitions" on public_media_metric_definitions
  for select using (active = true);

-- Snapshots/rate cards: readable by everyone (they describe public
-- media, not private campaigns), but only an authenticated user can
-- insert, and only as themselves (submitted_by = auth.uid()) — never
-- via the admin/service-role client, matching the Phase 14/16 pattern.
create policy "public read metric snapshots" on public_media_metric_snapshots
  for select using (true);
create policy "authenticated users insert own metric snapshots" on public_media_metric_snapshots
  for insert with check (submitted_by = auth.uid());

create policy "public read rate cards" on media_rate_cards
  for select using (true);
create policy "authenticated users insert own rate cards" on media_rate_cards
  for insert with check (submitted_by = auth.uid());

grant select on media_properties, media_outlet_formats, public_media_metric_definitions,
  public_media_metric_snapshots, media_rate_cards to anon, authenticated;
grant insert on public_media_metric_snapshots, media_rate_cards to authenticated;

-- ---------------------------------------------------------------------
-- Seed: metric definitions only (no fabricated observation values —
-- item 33/50: a definition registry is taxonomy, not data).
-- ---------------------------------------------------------------------
insert into public_media_metric_definitions (internal_key, display_label, unit_type) values
  ('subscriber_count', 'Subscribers', 'count'),
  ('follower_count', 'Followers', 'count'),
  ('total_views', 'Total Views', 'count'),
  ('video_count', 'Video Count', 'count'),
  ('videos_per_month', 'Videos per Month', 'rate'),
  ('average_views', 'Average Views', 'count'),
  ('median_views', 'Median Views', 'count'),
  ('average_concurrent_viewers', 'Average Concurrent Viewers', 'count'),
  ('peak_concurrent_viewers', 'Peak Concurrent Viewers', 'count'),
  ('engagement_rate', 'Engagement Rate', 'rate');

-- No rows inserted into public_media_metric_snapshots or
-- media_rate_cards — per item 33/50, no audience numbers or prices
-- are fabricated for Luzu TV/OLGA/Blender/La Nación/Clarín/Infobae or
-- any other seeded outlet. Their profile pages correctly show honest
-- empty states until real data is contributed.
