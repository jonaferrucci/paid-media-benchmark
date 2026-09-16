-- 0013_media_catalog_expansion.sql
-- Purpose: Phase 17B — close the explicit Phase 17 deferral on
-- additional Argentina catalog entries. Catalog rows only: no prices,
-- audience numbers, ownership, or benchmark values are invented here
-- (item 17B.5). Uses pending status for entries whose category fit is
-- less certain, active for clear streaming/publisher fits — a
-- conservative, reviewable governance choice, not a verification claim.

insert into platforms (internal_key, display_label, media_category_id, is_global, status, display_order)
select v.internal_key, v.display_label, mc.id, false, v.status, v.display_order
from (values
  ('la_casa_streaming', 'La Casa Streaming', 'streaming_live', 'active', 40),
  ('vorterix', 'Vorterix', 'streaming_live', 'active', 41),
  ('azz', 'AZZ', 'streaming_live', 'active', 42),
  ('bondi_live', 'Bondi Live', 'streaming_live', 'active', 43),
  ('picado_tv', 'Picado TV', 'streaming_live', 'active', 44),
  ('futurock_fm', 'Futurock FM', 'streaming_live', 'active', 45),
  ('dgo_stream', 'DGO Stream', 'streaming_live', 'active', 46),
  ('carajo', 'Carajo', 'streaming_live', 'pending', 47),
  ('prende', 'PRENDE', 'streaming_live', 'pending', 48)
) as v(internal_key, display_label, category_key, status, display_order)
join media_categories mc on mc.internal_key = v.category_key;

insert into platform_countries (platform_id, country_id)
select p.id, c.id
from platforms p, countries c
where p.internal_key in (
  'la_casa_streaming', 'vorterix', 'azz', 'bondi_live', 'picado_tv',
  'futurock_fm', 'dgo_stream', 'carajo', 'prende'
)
and c.iso_code = 'AR';

-- No format/property/metric-applicability seed is needed beyond what
-- 0012 already established for the streaming_live category — these
-- new outlets inherit the same category-level applicability
-- automatically (item 17B.6: "seed only generic relationships",
-- already satisfied by the existing category-level model, not
-- per-outlet duplication).
