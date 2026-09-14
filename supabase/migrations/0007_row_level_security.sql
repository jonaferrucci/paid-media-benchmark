-- 0007_row_level_security.sql
-- Purpose: RLS-aware architecture per 08-AUTHENTICATION-SECURITY-AND-
-- PRIVACY.md and Phase 2 item 17/18. Authentication itself is NOT
-- implemented yet (Phase 3) — these policies are written now so that:
--   (a) enabling RLS never has to be revisited as an afterthought, and
--   (b) the moment real sign-in exists, ownership-based access already
--       works with zero further policy changes.
-- Until Phase 3, auth.uid() is always null for every request (no
-- session exists), so every owner-scoped policy below evaluates false
-- and the tables are correctly inaccessible to anon/authenticated
-- clients — RLS fails closed, not open.

-- ---------------------------------------------------------------------
-- Reference / taxonomy tables: public read of ACTIVE rows only (the
-- public dashboard needs these to render filter options), no public
-- write. Only the Postgres owner / service role (which bypasses RLS)
-- may modify them until an admin role check is introduced.
-- ---------------------------------------------------------------------
alter table platforms enable row level security;
alter table campaign_types enable row level security;
alter table objectives enable row level security;
alter table verticals enable row level security;
alter table audience_strategies enable row level security;
alter table funnel_stages enable row level security;
alter table countries enable row level security;
alter table metrics enable row level security;
alter table metric_definition_variants enable row level security;
alter table platform_metrics enable row level security;
alter table platform_metric_compatible_variants enable row level security;
alter table benchmark_settings enable row level security;

create policy "public read active platforms" on platforms
  for select using (active = true);
create policy "public read active campaign_types" on campaign_types
  for select using (active = true);
create policy "public read active objectives" on objectives
  for select using (active = true);
create policy "public read active verticals" on verticals
  for select using (active = true);
create policy "public read active audience_strategies" on audience_strategies
  for select using (active = true);
create policy "public read active funnel_stages" on funnel_stages
  for select using (active = true);
create policy "public read active countries" on countries
  for select using (active = true);
create policy "public read active metrics" on metrics
  for select using (active = true);
create policy "public read active metric_definition_variants" on metric_definition_variants
  for select using (active = true);
create policy "public read active platform_metrics" on platform_metrics
  for select using (active = true);
create policy "public read platform_metric_compatible_variants" on platform_metric_compatible_variants
  for select using (true);
create policy "public read active benchmark_settings" on benchmark_settings
  for select using (active = true);

-- ---------------------------------------------------------------------
-- profiles: a user may read/update only their own profile row.
-- Row creation is expected to happen via a security-definer trigger on
-- auth.users in Phase 3, not via an INSERT policy here.
-- ---------------------------------------------------------------------
alter table profiles enable row level security;

create policy "users read own profile" on profiles
  for select using (auth.uid() = id);
create policy "users update own profile" on profiles
  for update using (auth.uid() = id);

-- ---------------------------------------------------------------------
-- organizations / organization_members: minimal, future-ready.
-- Members can see orgs they belong to; nothing is public.
-- ---------------------------------------------------------------------
alter table organizations enable row level security;
alter table organization_members enable row level security;

create policy "members read own organizations" on organizations
  for select using (
    exists (
      select 1 from organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
    )
  );

create policy "members read own membership rows" on organization_members
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- performance_datasets: NEVER publicly readable. A user may manage only
-- their own submissions. There is intentionally no public SELECT
-- policy — per 08-AUTHENTICATION-SECURITY-AND-PRIVACY.md "Public Data",
-- public consumption must go through server-side aggregation (a later
-- phase's benchmark engine / RPCs), never direct table reads.
-- ---------------------------------------------------------------------
alter table performance_datasets enable row level security;

create policy "owners read own datasets" on performance_datasets
  for select using (owner_user_id = auth.uid());
create policy "owners insert own datasets" on performance_datasets
  for insert with check (owner_user_id = auth.uid());
create policy "owners update own datasets" on performance_datasets
  for update using (owner_user_id = auth.uid());
create policy "owners delete own datasets" on performance_datasets
  for delete using (owner_user_id = auth.uid());

-- ---------------------------------------------------------------------
-- dataset_metric_values / normalized_metric_values: access follows the
-- parent dataset's ownership. No independent public policy.
-- ---------------------------------------------------------------------
alter table dataset_metric_values enable row level security;
alter table normalized_metric_values enable row level security;

create policy "owners access own metric values" on dataset_metric_values
  for all using (
    exists (
      select 1 from performance_datasets d
      where d.id = dataset_metric_values.dataset_id
        and d.owner_user_id = auth.uid()
    )
  );

create policy "owners access own normalized values" on normalized_metric_values
  for all using (
    exists (
      select 1 from dataset_metric_values v
      join performance_datasets d on d.id = v.dataset_id
      where v.id = normalized_metric_values.dataset_metric_value_id
        and d.owner_user_id = auth.uid()
    )
  );
