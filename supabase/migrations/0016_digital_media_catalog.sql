-- 0016_digital_media_catalog.sql
-- Purpose: Phase 21 — expand Cucurucho's DIGITAL media catalog and
-- commercial-format taxonomy so the planner/catalog have genuinely
-- useful coverage, without redesigning any table. Additive only: no
-- existing column, row, id, or internal_key from 0001–0015 is altered
-- in a way that changes current behavior. Never applied to hosted
-- Supabase automatically (production safety rule) — local/tested only.
--
-- Scope discipline (Phase 21 §1/§7/§26): every media_categories/
-- media_formats/platforms row below is TAXONOMY or CATALOG IDENTITY
-- only. No price, audience number, reach, CPM, CTR, view count, or
-- benchmark sample is inserted anywhere in this file.

-- ---------------------------------------------------------------------
-- §1/§7: digital media taxonomy review. The brief's target concept
-- list (paid_social, search, online_video, marketplace_ads,
-- programmatic, streaming_live, digital_publisher, digital_news,
-- digital_audio, creator_social_native) was checked against the
-- EXISTING categories from 0012 before adding anything new:
--
--   - paid_social, search, online_video, marketplace_ads,
--     programmatic, streaming_live, digital_publisher already exist
--     verbatim — no change needed.
--   - "digital_news" is already what digital_publisher's seeded
--     outlets (La Nación, Clarín, Infobae) actually are — a general
--     news publisher IS a digital publisher. Adding a second,
--     near-identical category would fragment one real concept into
--     two taxonomy rows a curator would have to choose between for
--     every future outlet. Refined via display_label instead (below).
--   - "creator_social_native" describes exactly the outlets already
--     seeded under streaming_live (Luzu TV, OLGA, Blender, Vorterix,
--     etc. — creator-led, social-native streaming). Same reasoning:
--     label refinement, not a second category.
--   - "digital_audio" is already representable by the existing
--     "podcast" category (podcast IS digital audio; it was never in
--     NON_DIGITAL_CATEGORY_KEYS, so it already surfaces in digital-
--     only discovery today). Label refined below; no new category.
--
-- This is "prefer UI/display-label refinement over schema churn"
-- applied literally — display_label is the only thing that changes
-- for these three concepts, and none of it is a breaking change since
-- nothing in the codebase branches on display_label text.
-- ---------------------------------------------------------------------
update media_categories set display_label = 'Digital Publishers / Digital News' where internal_key = 'digital_publisher';
update media_categories set display_label = 'Streaming / Social-Native Media' where internal_key = 'streaming_live';
update media_categories set display_label = 'Podcast / Digital Audio' where internal_key = 'podcast';

-- ---------------------------------------------------------------------
-- §2: platform universe review. Meta Ads, Google Ads, TikTok Ads,
-- Mercado Libre Ads, Pinterest Ads, and DSP/Programmatic already exist
-- from the original seed (supabase/seed.sql) — no change needed, and
-- no canonical id/internal_key is touched here (§2: "do not rename
-- stable canonical IDs/slugs unnecessarily").
--
-- YouTube is intentionally NOT added as a platforms row. Migration
-- 0002's own comment on the platforms table is explicit: "YouTube is
-- intentionally NOT a row here — planner-facing 'YouTube' maps to
-- platform = google_ads with campaign_types.internal_key =
-- video_youtube. Never create a 'youtube' row in platforms." That is
-- a deliberate, pre-existing architecture decision from Phase 2, and
-- Phase 21 respects it rather than overriding it — see the final
-- report's "genuine unresolved items" for how this affects online_video
-- catalog coverage today.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- §3: Argentina digital media catalog. Reviewed against the existing
-- 0012/0013 seed first: Luzu TV, OLGA, Blender, Vorterix, Bondi Live,
-- Futurock (as futurock_fm), La Casa Streaming, AZZ, Picado TV, DGO
-- Stream, Carajo, and PRENDE are ALL already present — no duplicate
-- rows are inserted for any of them, and Carajo/PRENDE's pending
-- status is left exactly as the handoff instructs. The one genuine
-- gap against the brief's digital-publisher list is Perfil — added
-- below as a conservative, defensible addition (a clearly established
-- Argentine digital news outlet, same shape as the existing La Nación/
-- Clarín/Infobae rows). No other new outlet is added: the brief's own
-- instruction is "only add additional outlets if they are clearly
-- established digital media and category fit is defensible" — for
-- everything else Cucurucho does not have independently-verifiable
-- catalog-identity confidence for right now, so nothing is guessed.
-- ---------------------------------------------------------------------
insert into platforms (internal_key, display_label, media_category_id, is_global, status, display_order)
select 'perfil', 'Perfil', mc.id, false, 'active', 33
from media_categories mc
where mc.internal_key = 'digital_publisher'
  and not exists (select 1 from platforms where internal_key = 'perfil');

insert into platform_countries (platform_id, country_id)
select p.id, c.id
from platforms p, countries c
where p.internal_key = 'perfil' and c.iso_code = 'AR'
  and not exists (
    select 1 from platform_countries pc where pc.platform_id = p.id and pc.country_id = c.id
  );

-- ---------------------------------------------------------------------
-- §4/§8/§9: digital placements / commercial formats. These are FORMAT
-- DEFINITIONS only (media_formats rows) — never a claim that a given
-- outlet sells a given format (no media_outlet_formats row is inserted
-- here, per §8: "Only associate to specific outlets when actual data
-- supports it" — media_outlet_formats stays exactly as empty as it was
-- before this migration, so every outlet keeps falling back to its
-- full category format list, unchanged behavior).
--
-- display_label values are clean, human-facing strings — never a raw
-- internal_key (§9) — consistent with the existing convention already
-- used by 0012's formats (e.g. "Branded Integration", "Pre-roll").
-- Catalog/format display_label has never been a locale-split field in
-- this schema (categories/platforms already render the same label in
-- both ES/EN — see e.g. "Meta Ads", "Streaming / Live Digital"); this
-- migration keeps that established convention rather than introducing
-- a new display_label_en column purely for label polish, per §7's
-- "do not create a migration merely for naming polish" — see the
-- final report for this explicitly-considered tradeoff.
--
-- paid_social/search/marketplace_ads/programmatic had ZERO media_formats
-- rows before this migration (Phase 17 only ever seeded formats for the
-- two categories it introduced, streaming_live/digital_publisher — see
-- 0012's own closing comment). That left the planner's generic
-- category->format combo-building (lib/planning/queries.ts,
-- unchanged by this migration) with nothing to assemble for Meta Ads,
-- Google Ads, Mercado Libre Ads, or DSP/Programmatic — this migration
-- closes that real functional gap for the first time, using the exact
-- same generic media_formats/formatsForCategory mechanism every other
-- category already uses (§11: no giant if/else, no per-platform
-- special-casing).
-- ---------------------------------------------------------------------
insert into media_formats (media_category_id, internal_key, display_label, display_order)
select mc.id, v.internal_key, v.display_label, v.display_order
from (values
  -- Paid Social (§4)
  ('paid_social', 'feed', 'Feed', 1),
  ('paid_social', 'stories', 'Stories', 2),
  ('paid_social', 'reels', 'Reels', 3),
  ('paid_social', 'carousel', 'Carrusel', 4),
  ('paid_social', 'video', 'Video', 5),
  ('paid_social', 'lead_ad', 'Formulario de leads', 6),
  -- Search (§4)
  ('search', 'search_text', 'Búsqueda (texto)', 1),
  ('search', 'shopping', 'Shopping', 2),
  ('search', 'performance_max', 'Performance Max', 3),
  -- Online Video / YouTube-style placements (§4) — format definitions
  -- only; see the header comment on why no platform is tagged into
  -- this category yet.
  ('online_video', 'pre_roll', 'Pre-roll', 1),
  ('online_video', 'mid_roll', 'Mid-roll', 2),
  ('online_video', 'bumper', 'Bumper', 3),
  ('online_video', 'in_feed_video', 'Video in-feed', 4),
  ('online_video', 'shorts', 'Shorts', 5),
  -- Marketplace (§4)
  ('marketplace_ads', 'sponsored_product', 'Producto patrocinado', 1),
  ('marketplace_ads', 'sponsored_brand', 'Marca patrocinada', 2),
  ('marketplace_ads', 'display', 'Display', 3),
  ('marketplace_ads', 'brand_store', 'Tienda de marca', 4),
  -- Programmatic (§4)
  ('programmatic', 'display', 'Display', 1),
  ('programmatic', 'video', 'Video', 2),
  ('programmatic', 'native', 'Native', 3),
  ('programmatic', 'rich_media', 'Rich media', 4),
  -- Streaming / Social-native — additive to the 4 rows 0012 already
  -- seeded (branded_integration, sponsorship, mention, pre_roll).
  ('streaming_live', 'mid_roll', 'Mid-roll', 5),
  ('streaming_live', 'overlay_lower_third', 'Zócalo / overlay', 6),
  ('streaming_live', 'social_amplification', 'Amplificación en redes', 7),
  ('streaming_live', 'short_form_branded_content', 'Contenido de marca (formato corto)', 8),
  ('streaming_live', 'dedicated_branded_content', 'Contenido de marca dedicado', 9),
  -- Digital Publisher / News — additive to the 3 rows 0012 already
  -- seeded (display, native, branded_content).
  ('digital_publisher', 'homepage_takeover', 'Toma de homepage', 4),
  ('digital_publisher', 'sponsored_article', 'Artículo patrocinado', 5),
  ('digital_publisher', 'newsletter', 'Newsletter', 6),
  ('digital_publisher', 'video_pre_roll', 'Pre-roll de video', 7),
  ('digital_publisher', 'social_amplification', 'Amplificación en redes', 8),
  -- Podcast / Digital Audio (§4) — first formats ever seeded for this
  -- category.
  ('podcast', 'host_read', 'Lectura del conductor', 1),
  ('podcast', 'pre_roll', 'Pre-roll', 2),
  ('podcast', 'mid_roll', 'Mid-roll', 3),
  ('podcast', 'sponsorship', 'Sponsorship', 4)
) as v(category_key, internal_key, display_label, display_order)
join media_categories mc on mc.internal_key = v.category_key
where not exists (
  select 1 from media_formats mf where mf.media_category_id = mc.id and mf.internal_key = v.internal_key
);

-- ---------------------------------------------------------------------
-- §16/§19: curator-gated catalog import. Insert into `platforms` and
-- `platform_countries` had NO RLS insert policy at all before this
-- migration (0007 granted only public SELECT of active=true platforms;
-- 0014 added curator UPDATE(status) but never INSERT). A curator-only
-- bulk catalog-import workflow needs a real, un-bypassable INSERT path
-- for curators specifically — reusing 0014's exact fn_is_curator()
-- function (never a second authorization concept) rather than trusting
-- the application layer's own check alone.
--
-- Only `platforms`/`platform_countries` gain an insert policy: catalog
-- import creates OUTLET rows referencing EXISTING categories/countries,
-- it never creates new media_categories/countries rows itself (§15:
-- "Unknown category/country should error. Do not silently create
-- taxonomy values.") — so those taxonomy tables intentionally get no
-- new insert policy here.
-- ---------------------------------------------------------------------
create policy "curators insert platforms" on platforms
  for insert with check (fn_is_curator(auth.uid()));

create policy "curators insert platform countries" on platform_countries
  for insert with check (fn_is_curator(auth.uid()));

grant insert on platforms to authenticated;
grant insert on platform_countries to authenticated;
