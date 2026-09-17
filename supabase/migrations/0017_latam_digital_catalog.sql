-- 0017_latam_digital_catalog.sql
-- Purpose: Phase 21B — begin LATAM digital catalog coverage beyond
-- Argentina, and correct country display-name localization. Additive
-- only: no existing column, row, id, or internal_key from 0001–0016 is
-- altered in a way that changes current behavior. Never applied to
-- hosted Supabase automatically (production safety rule) — local/
-- tested only.
--
-- Scope discipline (same as 0016 §7/§26): every row below is TAXONOMY
-- or CATALOG IDENTITY only — display name, slug, country, digital
-- category, and a verified website domain. No price, audience number,
-- reach, CPM, CTR, view/subscriber count, or benchmark sample is
-- inserted anywhere in this file.

-- ---------------------------------------------------------------------
-- §10: country display names must be localized (Spanish) as the
-- PRIMARY label, not ISO codes and not English spellings. The original
-- seed (supabase/seed.sql) stored English display_labels for Mexico,
-- Brazil and Peru even though the product is Spanish-first — Uruguay,
-- Chile, Colombia and Paraguay were already spelled identically in
-- both languages, so only these three need correcting. Guarded so this
-- migration is safe to re-run.
-- ---------------------------------------------------------------------
update countries set display_label = 'México' where iso_code = 'MX' and display_label <> 'México';
update countries set display_label = 'Brasil' where iso_code = 'BR' and display_label <> 'Brasil';
update countries set display_label = 'Perú' where iso_code = 'PE' and display_label <> 'Perú';

-- ---------------------------------------------------------------------
-- §4: LATAM expansion needs Ecuador and Bolivia added to the countries
-- table (not present in the original seed) before any catalog entity
-- can be scoped to them. Guarded via the table's own canonical unique
-- constraint on iso_code (0002_taxonomies.sql) rather than a manual
-- not-exists check, so this is safe to re-run after a partial failure
-- of this migration on hosted Supabase.
-- ---------------------------------------------------------------------
insert into countries (iso_code, display_label, display_order) values
  ('EC', 'Ecuador', 11)
on conflict (iso_code) do nothing;

insert into countries (iso_code, display_label, display_order) values
  ('BO', 'Bolivia', 12)
on conflict (iso_code) do nothing;

-- ---------------------------------------------------------------------
-- §4/§5: curated, quality-over-quantity initial digital catalog for
-- Mexico, Uruguay, Chile, Colombia, Peru, Brazil, Paraguay, Ecuador and
-- Bolivia. Every entity below is a well-established, independently
-- verifiable digital news/media outlet with a real, live website — the
-- same "clearly established digital media, defensible category fit"
-- bar the Argentina catalog (0012/0013/0016) already applied, using
-- the digital_publisher category exactly like AR's La Nación/Clarín/
-- Infobae/Perfil precedent (a legacy or digital-native outlet with a
-- genuine digital presence is a digital publisher regardless of its
-- print/broadcast origin — same reasoning 0016 §3 already used).
--
-- Bolivia's list deliberately excludes "Página Siete": web verification
-- during this migration's authoring turned up only stale references to
-- it (via other outlets' tag pages), not a currently live, independently
-- confirmable presence — so it is left out rather than guessed, and
-- La Razón Digital (confirmed live at larazon.bo) is included instead.
--
-- Fewer than 10 entities are seeded for some countries deliberately —
-- "quality over quantity ... where possible" (§4) means a shorter,
-- fully-defensible list is preferred over padding with less-certain
-- names. Streaming/creator-native (streaming_live) LATAM coverage is
-- intentionally deferred — see the final report's "genuine unresolved
-- issues" — rather than guessing at outlets without the same
-- confidence level Argentina's existing streaming_live rows have.
--
-- website_domain values are the outlet's own primary domain as
-- observed at authoring time — never invented, never a competitor's,
-- never a third-party aggregator.
-- ---------------------------------------------------------------------
insert into platforms (internal_key, display_label, media_category_id, is_global, status, display_order, website_domain)
select v.internal_key, v.display_label, mc.id, false, 'active', v.display_order, v.website_domain
from (values
  -- Mexico (MX)
  ('el_universal_mx', 'El Universal', 'digital_publisher', 50, 'eluniversal.com.mx'),
  ('milenio', 'Milenio', 'digital_publisher', 51, 'milenio.com'),
  ('animal_politico', 'Animal Político', 'digital_publisher', 52, 'animalpolitico.com'),
  ('expansion_mx', 'Expansión', 'digital_publisher', 53, 'expansion.mx'),
  ('la_silla_rota', 'La Silla Rota', 'digital_publisher', 54, 'lasillarota.com'),
  -- Uruguay (UY)
  ('el_pais_uy', 'El País', 'digital_publisher', 60, 'elpais.com.uy'),
  ('montevideo_portal', 'Montevideo Portal', 'digital_publisher', 61, 'montevideo.com.uy'),
  ('el_observador_uy', 'El Observador', 'digital_publisher', 62, 'elobservador.com.uy'),
  -- Chile (CL)
  ('el_mercurio', 'El Mercurio', 'digital_publisher', 70, 'elmercurio.com'),
  ('la_tercera', 'La Tercera', 'digital_publisher', 71, 'latercera.com'),
  ('biobiochile', 'BioBioChile', 'digital_publisher', 72, 'biobiochile.cl'),
  ('emol', 'Emol', 'digital_publisher', 73, 'emol.com'),
  -- Colombia (CO)
  ('el_tiempo_co', 'El Tiempo', 'digital_publisher', 80, 'eltiempo.com'),
  ('semana', 'Semana', 'digital_publisher', 81, 'semana.com'),
  ('la_silla_vacia', 'La Silla Vacía', 'digital_publisher', 82, 'lasillavacia.com'),
  ('pulzo', 'Pulzo', 'digital_publisher', 83, 'pulzo.com'),
  -- Peru (PE)
  ('el_comercio_pe', 'El Comercio', 'digital_publisher', 90, 'elcomercio.pe'),
  ('rpp', 'RPP Noticias', 'digital_publisher', 91, 'rpp.pe'),
  ('peru21', 'Perú21', 'digital_publisher', 92, 'peru21.pe'),
  ('la_republica_pe', 'La República', 'digital_publisher', 93, 'larepublica.pe'),
  -- Brazil (BR)
  ('uol', 'UOL', 'digital_publisher', 100, 'uol.com.br'),
  ('g1', 'G1', 'digital_publisher', 101, 'g1.globo.com'),
  ('folha', 'Folha de S.Paulo', 'digital_publisher', 102, 'folha.uol.com.br'),
  ('terra_br', 'Terra', 'digital_publisher', 103, 'terra.com.br'),
  -- Paraguay (PY)
  ('abc_color', 'ABC Color', 'digital_publisher', 110, 'abc.com.py'),
  ('ultima_hora_py', 'Última Hora', 'digital_publisher', 111, 'ultimahora.com'),
  ('la_nacion_py', 'La Nación', 'digital_publisher', 112, 'lanacion.com.py'),
  -- Ecuador (EC)
  ('el_comercio_ec', 'El Comercio', 'digital_publisher', 120, 'elcomercio.com'),
  ('el_universo', 'El Universo', 'digital_publisher', 121, 'eluniverso.com'),
  ('primicias', 'Primicias', 'digital_publisher', 122, 'primicias.ec'),
  -- Bolivia (BO)
  ('el_deber', 'El Deber', 'digital_publisher', 130, 'eldeber.com.bo'),
  ('los_tiempos', 'Los Tiempos', 'digital_publisher', 131, 'lostiempos.com'),
  ('la_razon_bo', 'La Razón Digital', 'digital_publisher', 132, 'larazon.bo')
) as v(internal_key, display_label, category_key, display_order, website_domain)
join media_categories mc on mc.internal_key = v.category_key
on conflict (internal_key) do nothing;

-- Bug fix (post-5b7de26): the previous version of this statement joined
-- `countries c on c.iso_code = v.iso_code` BEFORE `v` (the internal_key
-- → iso_code values table) was introduced later in the same FROM
-- clause — Postgres evaluates join conditions in join order, so `v` was
-- not yet in scope at that point (42P01: missing FROM-clause entry for
-- table "v"). Fixed by joining `v` first (it only depends on `p`, which
-- is already in scope), then joining `countries c` on `v.iso_code` once
-- `v` actually exists in the FROM clause. Also switched from a manual
-- not-exists guard to platform_countries' own canonical primary key
-- (platform_id, country_id) via ON CONFLICT DO NOTHING (0012_media_
-- universe.sql), so this statement is safe to re-run regardless of how
-- much of the previous, failed attempt actually committed on hosted
-- Supabase.
insert into platform_countries (platform_id, country_id)
select p.id, c.id
from platforms p
join (values
  ('el_universal_mx', 'MX'), ('milenio', 'MX'), ('animal_politico', 'MX'), ('expansion_mx', 'MX'), ('la_silla_rota', 'MX'),
  ('el_pais_uy', 'UY'), ('montevideo_portal', 'UY'), ('el_observador_uy', 'UY'),
  ('el_mercurio', 'CL'), ('la_tercera', 'CL'), ('biobiochile', 'CL'), ('emol', 'CL'),
  ('el_tiempo_co', 'CO'), ('semana', 'CO'), ('la_silla_vacia', 'CO'), ('pulzo', 'CO'),
  ('el_comercio_pe', 'PE'), ('rpp', 'PE'), ('peru21', 'PE'), ('la_republica_pe', 'PE'),
  ('uol', 'BR'), ('g1', 'BR'), ('folha', 'BR'), ('terra_br', 'BR'),
  ('abc_color', 'PY'), ('ultima_hora_py', 'PY'), ('la_nacion_py', 'PY'),
  ('el_comercio_ec', 'EC'), ('el_universo', 'EC'), ('primicias', 'EC'),
  ('el_deber', 'BO'), ('los_tiempos', 'BO'), ('la_razon_bo', 'BO')
) as v(internal_key, iso_code) on v.internal_key = p.internal_key
join countries c on c.iso_code = v.iso_code
on conflict (platform_id, country_id) do nothing;

-- ---------------------------------------------------------------------
-- No new media_formats or media_outlet_formats rows are needed: every
-- outlet above uses the existing digital_publisher category, which
-- already has a full format list from 0012/0016 (display, native,
-- branded_content, homepage_takeover, sponsored_article, newsletter,
-- video_pre_roll, social_amplification). New outlets inherit this
-- category-level applicability automatically — same reasoning 0013's
-- closing comment already established for AR's streaming_live outlets.
--
-- No new RLS policy is needed: 0016 already granted curator INSERT on
-- platforms/platform_countries broadly (not per-migration), and this
-- migration itself runs as the database owner, which bypasses RLS
-- entirely, same as every prior seed/catalog migration.
-- ---------------------------------------------------------------------
