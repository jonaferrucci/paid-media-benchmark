-- test-fixtures.sql
-- Purpose: ISOLATED TEST DATA ONLY. Never run this against a
-- production database and never merge it into seed.sql. This exists
-- solely to give the Phase 4 benchmark engine real rows to compute
-- against during development/testing. Frontend mock data
-- (lib/mock/*.ts) is completely separate and unaffected by this file.
--
-- Assumes seed.sql has already been applied (platforms, objectives,
-- verticals, audience_strategies, countries, metrics, metric_definition_
-- variants all exist).

-- A fixture test user (profile) to own all fixture datasets.
insert into auth.users (id) values ('aaaaaaaa-0000-0000-0000-000000000001') on conflict do nothing;
insert into profiles (id, display_name) values ('aaaaaaaa-0000-0000-0000-000000000001', 'Fixture User') on conflict do nothing;

-- Helper: a temp table listing the (platform, objective, vertical,
-- country, audience) combination used across most fixture rows below,
-- so INSERT statements can look up ids without repeating subqueries
-- fifty times.
do $$
declare
  v_meta uuid; v_tiktok uuid; v_mercadolibre uuid;
  v_traffic uuid; v_awareness uuid;
  v_beauty uuid; v_fashion uuid;
  v_ar uuid; v_mx uuid;
  v_broad uuid; v_remarketing uuid;
  v_prospecting uuid; v_funnel_remarketing uuid;
  v_cpm uuid; v_ctr uuid; v_cpc uuid; v_reach uuid; v_frequency uuid; v_video_views uuid; v_cpv uuid;
  v_variant_2s uuid; v_variant_completed uuid;
  v_dataset uuid;
begin
  select id into v_meta from platforms where internal_key = 'meta_ads';
  select id into v_tiktok from platforms where internal_key = 'tiktok_ads';
  select id into v_mercadolibre from platforms where internal_key = 'mercado_libre_ads';
  select id into v_traffic from objectives where internal_key = 'traffic';
  select id into v_awareness from objectives where internal_key = 'awareness';
  select id into v_beauty from verticals where internal_key = 'beauty_personal_care';
  select id into v_fashion from verticals where internal_key = 'fashion_apparel';
  select id into v_ar from countries where iso_code = 'AR';
  select id into v_mx from countries where iso_code = 'MX';
  select id into v_broad from audience_strategies where internal_key = 'broad';
  select id into v_remarketing from audience_strategies where internal_key = 'remarketing';
  select id into v_prospecting from funnel_stages where internal_key = 'prospecting';
  select id into v_funnel_remarketing from funnel_stages where internal_key = 'remarketing';
  select id into v_cpm from metrics where internal_key = 'cpm';
  select id into v_ctr from metrics where internal_key = 'ctr';
  select id into v_cpc from metrics where internal_key = 'cpc';
  select id into v_reach from metrics where internal_key = 'reach';
  select id into v_frequency from metrics where internal_key = 'frequency';
  select id into v_video_views from metrics where internal_key = 'video_views';
  select id into v_cpv from metrics where internal_key = 'cpv';
  select id into v_variant_2s from metric_definition_variants where metric_id = v_video_views and internal_key = '2_second_view';
  select id into v_variant_completed from metric_definition_variants where metric_id = v_video_views and internal_key = 'completed_view';

  -- -----------------------------------------------------------------
  -- SCENARIO A/B: exact cohort with sufficient sample (n=15), Meta +
  -- Traffic + Beauty + AR + Broad + Prospecting, all within the last
  -- 12 months, CPM values spread realistically plus one outlier.
  -- -----------------------------------------------------------------
  for i in 1..15 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, funnel_stage_id, start_date, end_date,
      original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_traffic, v_beauty, v_ar,
      v_broad, v_prospecting,
      (current_date - ((i * 7) || ' days')::interval)::date,
      (current_date - ((i * 7 - 6) || ' days')::interval)::date,
      'ARS', 'valid'
    ) returning id into v_dataset;

    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values
      (v_dataset, v_cpm, case when i = 1 then 25.0 else 2.5 + (i * 0.15) end), -- row 1 is a deliberate outlier
      (v_dataset, v_ctr, 1.2 + (i * 0.03)),
      (v_dataset, v_cpc, 0.20 + (i * 0.01));
  end loop;

  -- -----------------------------------------------------------------
  -- SCENARIO C: insufficient-sample cohort — same combination but
  -- Vertical = Fashion, only 4 datasets (below the n=10 threshold).
  -- -----------------------------------------------------------------
  for i in 1..4 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, funnel_stage_id, start_date, end_date,
      original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_traffic, v_fashion, v_ar,
      v_broad, v_prospecting,
      (current_date - ((i * 5) || ' days')::interval)::date,
      (current_date - ((i * 5 - 4) || ' days')::interval)::date,
      'ARS', 'valid'
    ) returning id into v_dataset;

    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values
      (v_dataset, v_cpm, 3.0 + i * 0.2);
  end loop;

  -- -----------------------------------------------------------------
  -- SCENARIO F: explicit relaxation suggestion — same as Scenario A's
  -- combination but with Funnel Stage = Remarketing set on top,
  -- reducing the exact cohort to n=3 (insufficient), while removing
  -- ONLY funnel_stage (keeping vertical/audience) yields the n=15 from
  -- Scenario A plus these 3 = 18 (sufficient).
  -- -----------------------------------------------------------------
  for i in 1..3 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, funnel_stage_id, start_date, end_date,
      original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_traffic, v_beauty, v_ar,
      v_broad, v_funnel_remarketing,
      (current_date - ((i * 3) || ' days')::interval)::date,
      (current_date - ((i * 3 - 2) || ' days')::interval)::date,
      'ARS', 'valid'
    ) returning id into v_dataset;

    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values
      (v_dataset, v_cpm, 4.0 + i * 0.1);
  end loop;

  -- -----------------------------------------------------------------
  -- SCENARIO G: time-window boundary — a valid dataset from 2 years
  -- ago that must NEVER be included in a "last 12 months" query no
  -- matter how small the recent sample is.
  -- -----------------------------------------------------------------
  insert into performance_datasets (
    owner_user_id, platform_id, objective_id, vertical_id, country_id,
    audience_strategy_id, funnel_stage_id, start_date, end_date,
    original_currency, validation_status
  ) values (
    'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_traffic, v_beauty, v_ar,
    v_broad, v_prospecting,
    (current_date - interval '2 years')::date,
    (current_date - interval '2 years' + interval '30 days')::date,
    'ARS', 'valid'
  ) returning id into v_dataset;
  insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values (v_dataset, v_cpm, 999.0);

  -- -----------------------------------------------------------------
  -- SCENARIO H: metric variant incompatibility — TikTok Video Views,
  -- 6 datasets tagged "2_second_view" and 6 tagged "completed_view" for
  -- the SAME cohort. Neither group alone reaches n=10 if pooled
  -- incorrectly they would (12), but they must never be pooled.
  -- -----------------------------------------------------------------
  for i in 1..6 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, start_date, end_date, original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_tiktok, v_awareness, v_beauty, v_ar,
      v_broad, (current_date - ((i * 4) || ' days')::interval)::date,
      (current_date - ((i * 4 - 3) || ' days')::interval)::date, 'ARS', 'valid'
    ) returning id into v_dataset;
    insert into dataset_metric_values (dataset_id, metric_id, metric_definition_variant_id, raw_numeric_value)
      values (v_dataset, v_video_views, v_variant_2s, 50000 + i * 1000);
  end loop;
  for i in 1..6 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, start_date, end_date, original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_tiktok, v_awareness, v_beauty, v_ar,
      v_broad, (current_date - ((i * 4) || ' days')::interval)::date,
      (current_date - ((i * 4 - 3) || ' days')::interval)::date, 'ARS', 'valid'
    ) returning id into v_dataset;
    insert into dataset_metric_values (dataset_id, metric_id, metric_definition_variant_id, raw_numeric_value)
      values (v_dataset, v_video_views, v_variant_completed, 8000 + i * 500);
  end loop;

  -- -----------------------------------------------------------------
  -- SCENARIO I: Reach cohort — 12 datasets with Reach values, all
  -- sharing the same conceptual spend/duration band (the engine's
  -- mandatory-band requirement is tested at the query-parameter level,
  -- not by varying real spend bands here — see engine test script).
  -- -----------------------------------------------------------------
  for i in 1..12 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, start_date, end_date, original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_awareness, v_beauty, v_ar,
      v_broad, (current_date - ((i * 6) || ' days')::interval)::date,
      (current_date - ((i * 6 - 5) || ' days')::interval)::date, 'ARS', 'valid'
    ) returning id into v_dataset;
    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value)
      values (v_dataset, v_reach, 200000 + i * 15000), (v_dataset, v_frequency, 2.0 + i * 0.1);
  end loop;

  -- -----------------------------------------------------------------
  -- SCENARIO L: invalid-status exclusion — 10 datasets identical to
  -- Scenario A's cohort but validation_status IN ('pending','flagged',
  -- 'excluded','deleted'). These must NEVER appear in any benchmark.
  -- -----------------------------------------------------------------
  insert into performance_datasets (
    owner_user_id, platform_id, objective_id, vertical_id, country_id,
    audience_strategy_id, funnel_stage_id, start_date, end_date,
    original_currency, validation_status
  )
  select 'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_traffic, v_beauty, v_ar,
    v_broad, v_prospecting, current_date - 10, current_date - 5, 'ARS', s.status::validation_status
  from (values ('pending'), ('flagged'), ('excluded'), ('deleted')) as s(status);

  -- -----------------------------------------------------------------
  -- SCENARIO N: Mercado Libre compatibility — a valid dataset with
  -- CPC/CTR but the engine must never be asked for reach/frequency/cpv
  -- here since platform_metrics has no such rows for this platform
  -- (verified structurally, not by fixture data).
  -- -----------------------------------------------------------------
  insert into performance_datasets (
    owner_user_id, platform_id, objective_id, vertical_id, country_id,
    start_date, end_date, original_currency, validation_status
  ) values (
    'aaaaaaaa-0000-0000-0000-000000000001', v_mercadolibre, v_traffic, v_beauty, v_ar,
    current_date - 10, current_date - 5, 'ARS', 'valid'
  ) returning id into v_dataset;
  insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values (v_dataset, v_cpc, 0.15);

  -- -----------------------------------------------------------------
  -- SCENARIO O: Business Model filtering — same cohort as Scenario A
  -- but tagged with a specific business model, 12 datasets, so a
  -- business-model-filtered query returns fewer than the unfiltered 15.
  -- -----------------------------------------------------------------
  for i in 1..12 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, funnel_stage_id, business_model_id, start_date, end_date,
      original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_traffic, v_beauty, v_mx,
      v_broad, v_prospecting, (select id from business_models where internal_key = 'ecommerce'),
      (current_date - ((i * 3) || ' days')::interval)::date,
      (current_date - ((i * 3 - 2) || ' days')::interval)::date,
      'MXN', 'valid'
    ) returning id into v_dataset;
    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values (v_dataset, v_cpm, 5.0 + i * 0.1);
  end loop;

  -- -----------------------------------------------------------------
  -- PHASE 4.1 SCENARIOS D/E/G/J: Spend Range + Duration Band real
  -- filtering. Meta + Awareness + Beauty + AR + Broad cohort (reusing
  -- Scenario I's dimensions), split across distinct spend/duration
  -- bands so filtering by one band excludes the other.
  --
  -- Group "low spend, short duration": ~15 days, ~1500 total spend =>
  -- normalized monthly spend = 1500/15*30 = 3000 => band 2000_10000.
  -- Duration 15 days => band 15_30.
  -- -----------------------------------------------------------------
  for i in 1..11 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, start_date, end_date, original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_awareness, v_beauty, v_ar,
      v_broad,
      (current_date - interval '20 days')::date,
      (current_date - interval '5 days')::date, -- 15 days duration inclusive-ish, see engine's duration_days generated column
      'USD', 'valid'
    ) returning id into v_dataset;
    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values (v_dataset, v_cpm, 1400 + i * 10);
    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value)
      select v_dataset, id, 1500 from metrics where internal_key = 'ad_spend';
  end loop;

  -- Group "high spend, long duration": ~90 days, ~180000 total spend
  -- => normalized monthly spend = 180000/90*30 = 60000 => band
  -- 50000_100000. Duration 90 days => band 61_90.
  for i in 1..11 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, start_date, end_date, original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_awareness, v_beauty, v_ar,
      v_broad,
      (current_date - interval '100 days')::date,
      (current_date - interval '10 days')::date, -- ~90 days duration
      'USD', 'valid'
    ) returning id into v_dataset;
    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values (v_dataset, v_cpm, 2000 + i * 10);
    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value)
      select v_dataset, id, 180000 from metrics where internal_key = 'ad_spend';
  end loop;

  -- -----------------------------------------------------------------
  -- PHASE 4.1 SCENARIO J: currency safety. Same numeric normalized
  -- spend (3000/month) and same duration band (15_30) as the "low
  -- spend" group above, but denominated in ARS. Must NEVER be pooled
  -- into a USD "2000_10000" spend-band query.
  -- -----------------------------------------------------------------
  for i in 1..11 loop
    insert into performance_datasets (
      owner_user_id, platform_id, objective_id, vertical_id, country_id,
      audience_strategy_id, start_date, end_date, original_currency, validation_status
    ) values (
      'aaaaaaaa-0000-0000-0000-000000000001', v_meta, v_awareness, v_beauty, v_ar,
      v_broad,
      (current_date - interval '20 days')::date,
      (current_date - interval '5 days')::date,
      'ARS', 'valid'
    ) returning id into v_dataset;
    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values (v_dataset, v_cpm, 1400 + i * 10);
    insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value)
      select v_dataset, id, 1500 from metrics where internal_key = 'ad_spend';
  end loop;

  -- -----------------------------------------------------------------
  -- PHASE 8 SCENARIO: CPA + ROAS coverage on the Scenario A cohort
  -- (Meta + Traffic + Beauty + AR + Broad + Prospecting, the same 15
  -- datasets already used for CPM/CTR/CPC). Needed so R3
  -- (CPC + CPA) and R4 (CPA + ROAS) can be tested against real
  -- percentile ranges instead of fabricated numbers -- this data
  -- genuinely did not exist before Phase 8 needed it; it is not
  -- chosen to force a particular classification outcome.
  -- -----------------------------------------------------------------
  for i in 1..15 loop
    select id into v_dataset from performance_datasets
      where platform_id = v_meta and objective_id = v_traffic and vertical_id = v_beauty
        and country_id = v_ar and audience_strategy_id = v_broad and funnel_stage_id = v_prospecting
        and validation_status = 'valid'
      order by start_date desc offset (i - 1) limit 1;
    if v_dataset is not null then
      insert into dataset_metric_values (dataset_id, metric_id, raw_numeric_value) values
        (v_dataset, (select id from metrics where internal_key = 'cpa'), 8.0 + i * 0.3),
        (v_dataset, (select id from metrics where internal_key = 'roas'), 5.5 - i * 0.08);
    end if;
  end loop;

end $$;
