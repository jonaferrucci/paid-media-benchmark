-- seed.sql
-- Purpose: deterministic reference/taxonomy seed data. This is NOT
-- benchmark observation data — no performance_datasets or
-- dataset_metric_values rows are seeded here. Mock frontend benchmark
-- numbers (lib/mock/*.ts) remain entirely separate from this database
-- and are not affected by anything in this file.

-- ---------------------------------------------------------------------
-- platforms
-- ---------------------------------------------------------------------
insert into platforms (internal_key, display_label, display_order) values
('meta_ads', 'Meta Ads', 1),
('google_ads', 'Google Ads', 2),
('tiktok_ads', 'TikTok Ads', 3),
('mercado_libre_ads', 'Mercado Libre Ads', 4),
('pinterest_ads', 'Pinterest Ads', 5),
('dsp_programmatic', 'DSP / Programmatic', 6);

-- ---------------------------------------------------------------------
-- campaign_types (platform-specific). YouTube mapping lives here:
-- video_youtube scoped to google_ads — see Phase 2 item 8 / migration
-- 0002 comments. Never a "youtube" row in platforms.
-- ---------------------------------------------------------------------
insert into campaign_types (platform_id, internal_key, display_label, display_order)
select id, v.internal_key, v.display_label, v.display_order
from platforms, (values
  ('search', 'Search', 1),
  ('performance_max', 'Performance Max', 2),
  ('display', 'Display', 3),
  ('demand_gen', 'Demand Gen', 4),
  ('video_youtube', 'Video / YouTube', 5),
  ('shopping', 'Shopping', 6),
  ('app', 'App', 7),
  ('other', 'Other', 8)
) as v(internal_key, display_label, display_order)
where platforms.internal_key = 'google_ads';

insert into campaign_types (platform_id, internal_key, display_label, display_order)
select id, 'standard', 'Standard', 1 from platforms where internal_key = 'meta_ads';

insert into campaign_types (platform_id, internal_key, display_label, display_order)
select id, 'standard', 'Standard', 1 from platforms where internal_key = 'tiktok_ads';

insert into campaign_types (platform_id, internal_key, display_label, display_order)
select id, v.internal_key, v.display_label, v.display_order
from platforms, (values
  ('product_ads', 'Product Ads', 1),
  ('brand_ads', 'Brand Ads', 2)
) as v(internal_key, display_label, display_order)
where platforms.internal_key = 'mercado_libre_ads';

insert into campaign_types (platform_id, internal_key, display_label, display_order)
select id, 'standard', 'Standard', 1 from platforms where internal_key = 'pinterest_ads';

insert into campaign_types (platform_id, internal_key, display_label, display_order)
select id, 'standard', 'Standard', 1 from platforms where internal_key = 'dsp_programmatic';

-- ---------------------------------------------------------------------
-- objectives — Awareness and Reach are separate (Architecture Freeze V1).
-- ---------------------------------------------------------------------
insert into objectives (internal_key, display_label, display_order) values
('awareness', 'Awareness', 1),
('reach', 'Reach', 2),
('traffic', 'Traffic', 3),
('video_views', 'Video Views', 4),
('engagement', 'Engagement', 5),
('leads', 'Leads', 6),
('sales', 'Sales', 7),
('app', 'App', 8),
('store_visits', 'Store Visits', 9),
('other', 'Other', 10);

-- ---------------------------------------------------------------------
-- verticals (controlled taxonomy, 02-DATA-DIMENSIONS-AND-TAXONOMIES.md)
-- ---------------------------------------------------------------------
insert into verticals (internal_key, display_label, display_order) values
('beauty_personal_care', 'Beauty & Personal Care', 1),
('fashion_apparel', 'Fashion & Apparel', 2),
('home_kitchen', 'Home & Kitchen', 3),
('consumer_electronics', 'Consumer Electronics', 4),
('automotive', 'Automotive', 5),
('financial_services', 'Financial Services', 6),
('insurance', 'Insurance', 7),
('education', 'Education', 8),
('real_estate', 'Real Estate', 9),
('travel_tourism', 'Travel & Tourism', 10),
('food_beverage', 'Food & Beverage', 11),
('health_wellness', 'Health & Wellness', 12),
('fitness', 'Fitness', 13),
('b2b_services', 'B2B Services', 14),
('saas', 'SaaS', 15),
('retail', 'Retail', 16),
('entertainment', 'Entertainment', 17),
('gaming', 'Gaming', 18),
('telecommunications', 'Telecommunications', 19),
('professional_services', 'Professional Services', 20),
('construction', 'Construction', 21),
('industrial_manufacturing', 'Industrial & Manufacturing', 22),
('agriculture', 'Agriculture', 23),
('pet_care', 'Pet Care', 24),
('baby_kids', 'Baby & Kids', 25),
('sports_outdoor', 'Sports & Outdoor', 26),
('jewelry_accessories', 'Jewelry & Accessories', 27),
('marketplace', 'Marketplace', 28),
('other', 'Other', 29);

-- ---------------------------------------------------------------------
-- audience_strategies
-- ---------------------------------------------------------------------
insert into audience_strategies (internal_key, display_label, display_order) values
('broad', 'Broad', 1),
('interest_based', 'Interest-Based', 2),
('lookalike', 'Lookalike', 3),
('remarketing', 'Remarketing', 4),
('customer_list', 'Customer List', 5),
('contextual', 'Contextual', 6),
('keyword_based', 'Keyword-Based', 7),
('automated_algorithmic', 'Automated / Algorithmic', 8),
('mixed', 'Mixed', 9),
('other', 'Other', 10),
('unknown', 'Unknown / Not Provided', 11);

-- ---------------------------------------------------------------------
-- funnel_stages
-- ---------------------------------------------------------------------
insert into funnel_stages (internal_key, display_label, display_order) values
('prospecting', 'Prospecting', 1),
('consideration', 'Consideration', 2),
('remarketing', 'Remarketing', 3),
('retention', 'Retention', 4),
('mixed', 'Mixed', 5),
('other', 'Other', 6),
('unknown', 'Unknown / Not Provided', 7);

-- ---------------------------------------------------------------------
-- countries — LATAM priority; architecture supports all ISO codes.
-- ---------------------------------------------------------------------
insert into countries (iso_code, display_label, display_order) values
('AR', 'Argentina', 1),
('MX', 'Mexico', 2),
('UY', 'Uruguay', 3),
('BR', 'Brazil', 4),
('CL', 'Chile', 5),
('CO', 'Colombia', 6),
('PE', 'Peru', 7),
('PY', 'Paraguay', 8),
('US', 'United States', 9),
('ES', 'Spain', 10);

-- ---------------------------------------------------------------------
-- metrics — base metrics first, then derived.
-- ---------------------------------------------------------------------
insert into metrics (internal_key, display_label, metric_kind, unit_type, benchmark_direction, formula_identifier, benchmark_eligible) values
('ad_spend', 'Ad Spend', 'base', 'currency', 'contextual', null, false),
('impressions', 'Impressions', 'base', 'count', 'contextual', null, true),
('reach', 'Reach', 'base', 'count', 'contextual', null, true),
('clicks', 'Clicks', 'base', 'count', 'contextual', null, false),
('link_clicks', 'Link Clicks', 'base', 'count', 'contextual', null, false),
('landing_page_views', 'Landing Page Views', 'base', 'count', 'contextual', null, true),
('video_views', 'Video Views', 'base', 'count', 'contextual', null, true),
('engagements', 'Engagements', 'base', 'count', 'contextual', null, false),
('conversions', 'Conversions', 'base', 'count', 'contextual', null, false),
('attributed_revenue', 'Attributed Revenue', 'base', 'currency', 'contextual', null, false),
('total_revenue', 'Total Revenue', 'base', 'currency', 'contextual', null, false)
;

insert into metrics (internal_key, display_label, metric_kind, unit_type, benchmark_direction, formula_identifier, benchmark_eligible) values
('cpm', 'CPM', 'derived', 'currency', 'lower_is_better', 'ad_spend / impressions * 1000', true),
('ctr', 'CTR', 'derived', 'percentage', 'higher_is_better', 'clicks / impressions * 100', true),
('cpc', 'CPC', 'derived', 'currency', 'lower_is_better', 'ad_spend / clicks', true),
('frequency', 'Frequency', 'derived', 'multiplier', 'contextual', 'impressions / reach', true),
('cpv', 'CPV', 'derived', 'currency', 'lower_is_better', 'ad_spend / video_views', true),
('vtr', 'VTR', 'derived', 'percentage', 'higher_is_better', 'completed_views / impressions * 100', true),
('cpe', 'CPE', 'derived', 'currency', 'lower_is_better', 'ad_spend / engagements', true),
('cpa', 'CPA', 'derived', 'currency', 'lower_is_better', 'ad_spend / conversions', true),
('cpl', 'CPL', 'derived', 'currency', 'lower_is_better', 'ad_spend / leads', true),
('conversion_rate', 'Conversion Rate', 'derived', 'percentage', 'higher_is_better', 'conversions / relevant_traffic * 100', true),
('roas', 'ROAS', 'derived', 'multiplier', 'higher_is_better', 'attributed_revenue / ad_spend', true),
('acos', 'ACOS', 'derived', 'percentage', 'lower_is_better', 'ad_spend / attributed_revenue * 100', true),
('tacos', 'TACOS', 'derived', 'percentage', 'lower_is_better', 'ad_spend / total_revenue * 100', true)
;

-- ---------------------------------------------------------------------
-- metric_definition_variants — seeded conservatively; more may be added
-- later without a schema change.
-- ---------------------------------------------------------------------
insert into metric_definition_variants (metric_id, internal_key, display_label, is_unknown_default)
select m.id, v.internal_key, v.display_label, v.is_unknown_default
from metrics m, (values
  ('2_second_view', '2-Second View', false),
  ('3_second_view', '3-Second View', false),
  ('6_second_view', '6-Second View', false),
  ('completed_view', 'Completed View', false),
  ('sound_on_view', 'Sound-On View', false),
  ('thruplay', 'ThruPlay', false),
  ('platform_default_view', 'Unknown / Platform-Default', true)
) as v(internal_key, display_label, is_unknown_default)
where m.internal_key = 'video_views';

insert into metric_definition_variants (metric_id, internal_key, display_label, is_unknown_default)
select m.id, v.internal_key, v.display_label, v.is_unknown_default
from metrics m, (values
  ('2_second_view', '2-Second View', false),
  ('completed_view', 'Completed View', false),
  ('thruplay', 'ThruPlay', false),
  ('platform_default_view', 'Unknown / Platform-Default', true)
) as v(internal_key, display_label, is_unknown_default)
where m.internal_key = 'cpv';

insert into metric_definition_variants (metric_id, internal_key, display_label, is_unknown_default)
select m.id, v.internal_key, v.display_label, v.is_unknown_default
from metrics m, (values
  ('2_second_view', '2-Second View', false),
  ('completed_view', 'Completed View', false),
  ('platform_default_view', 'Unknown / Platform-Default', true)
) as v(internal_key, display_label, is_unknown_default)
where m.internal_key = 'vtr';

insert into metric_definition_variants (metric_id, internal_key, display_label, is_unknown_default)
select m.id, v.internal_key, v.display_label, v.is_unknown_default
from metrics m, (values
  ('all_clicks', 'All Clicks', false),
  ('link_clicks', 'Link Clicks Only', false),
  ('platform_default_click', 'Unknown / Platform-Default', true)
) as v(internal_key, display_label, is_unknown_default)
where m.internal_key = 'ctr';

insert into metric_definition_variants (metric_id, internal_key, display_label, is_unknown_default)
select m.id, v.internal_key, v.display_label, v.is_unknown_default
from metrics m, (values
  ('all_clicks', 'All Clicks', false),
  ('link_clicks', 'Link Clicks Only', false),
  ('outbound_clicks', 'Outbound Clicks', false),
  ('platform_default_click', 'Unknown / Platform-Default', true)
) as v(internal_key, display_label, is_unknown_default)
where m.internal_key = 'cpc';

-- ---------------------------------------------------------------------
-- platform_metrics — compatibility per 01-PLATFORMS-AND-METRICS.md.
-- Seeded for the two platforms with fully specified metric sets in the
-- docs (Meta Ads, Google Ads); other platforms can be extended the
-- same way without a schema change.
-- ---------------------------------------------------------------------
insert into platform_metrics (platform_id, metric_id, required)
select p.id, m.id, req
from platforms p
join (values
  ('ad_spend', true), ('impressions', true), ('reach', true), ('clicks', false),
  ('link_clicks', false), ('landing_page_views', false), ('video_views', false),
  ('engagements', false), ('cpm', true), ('ctr', true), ('cpc', true),
  ('cpv', false), ('vtr', false), ('cpe', false), ('frequency', true)
) as reqs(metric_key, req) on true
join metrics m on m.internal_key = reqs.metric_key
where p.internal_key = 'meta_ads';

insert into platform_metrics (platform_id, metric_id, required)
select p.id, m.id, req
from platforms p
join (values
  ('ad_spend', true), ('impressions', true), ('clicks', true), ('cpm', false),
  ('ctr', true), ('cpc', true), ('video_views', false), ('cpv', false), ('vtr', false)
) as reqs(metric_key, req) on true
join metrics m on m.internal_key = reqs.metric_key
where p.internal_key = 'google_ads';

-- ---------------------------------------------------------------------
-- Phase 2.1: remaining platform_metrics coverage — TikTok Ads,
-- Mercado Libre Ads, Pinterest Ads, DSP / Programmatic.
-- ---------------------------------------------------------------------

insert into platform_metrics (platform_id, metric_id, required)
select p.id, m.id, req
from platforms p
join (values
  ('ad_spend', true), ('impressions', true), ('reach', false), ('clicks', false),
  ('landing_page_views', false), ('video_views', false), ('conversions', false),
  ('attributed_revenue', false), ('cpm', true), ('ctr', true), ('cpc', true),
  ('frequency', false), ('cpv', false), ('vtr', false), ('cpa', false),
  ('cpl', false), ('conversion_rate', false), ('roas', false)
) as reqs(metric_key, req) on true
join metrics m on m.internal_key = reqs.metric_key
where p.internal_key = 'tiktok_ads';

-- Mercado Libre Ads: retail-media environment. Reach, Frequency and CPV
-- are intentionally NOT added — the approved Mercado Libre methodology
-- does not support them (Phase 2.1 item 3), not merely omitted for
-- brevity. ACOS/TACOS are more prominent here than on upper-funnel
-- social/video platforms, per 01-PLATFORMS-AND-METRICS.md.
insert into platform_metrics (platform_id, metric_id, required)
select p.id, m.id, req
from platforms p
join (values
  ('ad_spend', true), ('impressions', false), ('clicks', true),
  ('conversions', false), ('attributed_revenue', false), ('total_revenue', false),
  ('cpm', false), ('ctr', true), ('cpc', true), ('roas', false),
  ('acos', false), ('tacos', false), ('conversion_rate', false)
) as reqs(metric_key, req) on true
join metrics m on m.internal_key = reqs.metric_key
where p.internal_key = 'mercado_libre_ads';

insert into platform_metrics (platform_id, metric_id, required)
select p.id, m.id, req
from platforms p
join (values
  ('ad_spend', true), ('impressions', true), ('reach', false), ('clicks', false),
  ('video_views', false), ('conversions', false), ('attributed_revenue', false),
  ('cpm', true), ('ctr', true), ('cpc', true), ('frequency', false),
  ('cpv', false), ('cpa', false), ('conversion_rate', false), ('roas', false)
) as reqs(metric_key, req) on true
join metrics m on m.internal_key = reqs.metric_key
where p.internal_key = 'pinterest_ads';

-- DSP / Programmatic: normalized generic layer. Individual DSP-specific
-- compatibility (per-vendor nuances) can be added later without a
-- schema change — this is the conservative shared baseline.
insert into platform_metrics (platform_id, metric_id, required)
select p.id, m.id, req
from platforms p
join (values
  ('ad_spend', true), ('impressions', true), ('reach', false), ('clicks', false),
  ('video_views', false), ('conversions', false), ('attributed_revenue', false),
  ('cpm', true), ('ctr', true), ('cpc', true), ('frequency', false),
  ('cpv', false), ('vtr', false), ('cpa', false), ('conversion_rate', false), ('roas', false)
) as reqs(metric_key, req) on true
join metrics m on m.internal_key = reqs.metric_key
where p.internal_key = 'dsp_programmatic';

-- ---------------------------------------------------------------------
-- business_models (Phase 2.2) — separate dimension from Vertical.
-- ---------------------------------------------------------------------
insert into business_models (internal_key, display_label, display_order) values
('ecommerce', 'Ecommerce', 1),
('marketplace_seller', 'Marketplace Seller', 2),
('lead_generation', 'Lead Generation', 3),
('retail', 'Retail', 4),
('b2b', 'B2B', 5),
('saas', 'SaaS', 6),
('app', 'App', 7),
('subscription', 'Subscription', 8),
('services', 'Services', 9),
('local_business', 'Local Business', 10),
('omnichannel', 'Omnichannel', 11),
('other', 'Other', 12),
('unknown', 'Unknown / Not Provided', 13);
