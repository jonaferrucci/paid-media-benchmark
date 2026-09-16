-- 0014_curator_governance.sql
-- Purpose: Phase 19B item 3 — the smallest secure curator/admin
-- governance model needed to review pending contributor submissions.
--
-- Inspected first (per Phase 19B instruction): no admin/role concept
-- exists anywhere in the schema before this migration. profiles (0004)
-- has no role field at all. organization_role (0004) is a PER-
-- ORGANIZATION membership enum (owner/admin/analyst/contributor/
-- viewer) for the future multi-tenant organizations feature — it has
-- no bearing on site-wide content moderation and is left completely
-- untouched. There is therefore no existing role to reuse; this
-- migration adds one narrow, additive, site-wide flag rather than
-- inventing a broader authorization system.
--
-- Every change below is additive: no existing column, row, policy, or
-- grant is altered in a way that changes current behavior for anyone
-- who isn't a curator. Never applied to hosted Supabase automatically
-- (production safety rule #14.2) — local/tested only, same as every
-- prior migration.

-- ---------------------------------------------------------------------
-- profiles.is_curator: a site-wide curator flag. Defaults to false for
-- every existing and every future profile. There is intentionally NO
-- self-service UI, action, or policy anywhere in this codebase that
-- lets a user set this on their own or another profile row — the only
-- way to grant it is direct, manual, audited database access (e.g. a
-- service-role SQL statement run by a human). "Never invent
-- authorization" means this migration does not attempt to decide WHO
-- should be a curator; that remains an explicit, out-of-band decision.
-- ---------------------------------------------------------------------
alter table profiles add column is_curator boolean not null default false;

comment on column profiles.is_curator is
  'Site-wide content-governance role: may review pending media_rate_cards,
   public_media_metric_snapshots, and pending platforms (Phase 19B).
   Distinct from organization_role (0004, per-organization membership).
   Grant ONLY via direct, manual, audited database/service-role access —
   never expose a UI or RPC that lets a user set this for themselves or
   anyone else.';

-- Users may already read their own profile row (0007 "users read own
-- profile"); is_curator rides along on that existing SELECT policy
-- with no new policy needed. There is deliberately no UPDATE grant
-- that includes this column for the `authenticated` role at all (the
-- existing "users update own profile" policy still applies at the row
-- level, but column-level privilege denies writing is_curator through
-- it) — this is the first line of defense against a user ever
-- flipping their own flag, on top of there being no client code path
-- that would even try.
revoke update (is_curator) on profiles from authenticated;

-- ---------------------------------------------------------------------
-- Server-side-only authorization check. SECURITY DEFINER so it can
-- read profiles.is_curator regardless of the calling role's own RLS
-- visibility, while only ever accepting auth.uid() — a value Postgres
-- derives from the verified JWT, never a client-supplied argument —
-- as input. Every curator-scoped policy below calls this function;
-- there is exactly one place curator status is decided.
-- ---------------------------------------------------------------------
create or replace function fn_is_curator(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_curator from profiles where id = uid), false);
$$;

comment on function fn_is_curator is
  'Server-side authorization check for curator status (Phase 19B).
   Never trust a client-side role check alone — this function, called
   from RLS policies with auth.uid(), is the single source of truth.';

-- ---------------------------------------------------------------------
-- Public metric snapshots gain the SAME governance shape rate cards
-- already had (status). Existing rows are backfilled to 'active' —
-- their current, already-public behavior is preserved EXACTLY, no
-- previously-visible snapshot disappears. The column default then
-- switches to 'pending' so every NEW submission goes through the same
-- review gate rate cards already use (0012's "no bulk/manual
-- submission bypasses governance" principle, now applied consistently
-- to both contributed-data tables).
-- ---------------------------------------------------------------------
alter table public_media_metric_snapshots add column status text not null default 'active';
update public_media_metric_snapshots set status = 'active';
alter table public_media_metric_snapshots alter column status set default 'pending';
alter table public_media_metric_snapshots add constraint chk_public_media_metric_snapshots_status
  check (status in ('pending', 'active', 'rejected'));

alter table public_media_metric_snapshots add column reviewed_by uuid references auth.users(id);
alter table public_media_metric_snapshots add column reviewed_at timestamptz;

alter table media_rate_cards add column reviewed_by uuid references auth.users(id);
alter table media_rate_cards add column reviewed_at timestamptz;

-- media_rate_cards.status already supports active/superseded/pending
-- (0012). Adds 'rejected' as a fourth allowed value so a curator can
-- explicitly reject a submission — distinct from a price simply being
-- superseded by a newer, accepted one.
alter table media_rate_cards drop constraint media_rate_cards_status_check;
alter table media_rate_cards add constraint media_rate_cards_status_check
  check (status in ('active', 'superseded', 'pending', 'rejected'));

-- ---------------------------------------------------------------------
-- SELECT policy is intentionally left exactly as 0012 defined it for
-- BOTH tables ("public read ... using (true)") — a pending/rejected
-- row stays as publicly READABLE as it always was (0012's own comment:
-- "public to read, it's about the media outlet, not a private
-- campaign"); the governance gate has always been about the
-- APPLICATION never presenting a non-active row as canonical/current
-- (see lib/media/rateCardHistory.ts's groupRateCardsByIdentity and
-- lib/media/catalog.ts's getMediaProfile, both status-aware), not
-- about hiding the row's existence at the database layer. This keeps
-- one consistent governance shape across both entities rather than
-- inventing a second, stricter one just for snapshots.
--
-- What curators need beyond that pre-existing read access is WRITE:
-- no UPDATE policy existed on either table before this migration
-- (0012 granted only select+insert) — these are the first write
-- policies, scoped to curators only via fn_is_curator, and RLS fails
-- closed for everyone else exactly as 0007 established.
-- ---------------------------------------------------------------------
create policy "curators update metric snapshot status" on public_media_metric_snapshots
  for update using (fn_is_curator(auth.uid()));

create policy "curators update rate card status" on media_rate_cards
  for update using (fn_is_curator(auth.uid()));

-- Curators may transition a pending platform's status (pending ->
-- active/inactive). No UPDATE policy existed on platforms before this
-- migration (0007 granted only public SELECT of active=true rows).
create policy "curators update platform governance status" on platforms
  for update using (fn_is_curator(auth.uid()));

-- Base command grants (RLS policies are evaluated only once the
-- underlying command is granted at all) — matching 0010's explicit-
-- grant pattern. Column-level grants restrict curators to the
-- governance fields only, never price/value/taxonomy content, as a
-- second layer of defense beyond the application code that only ever
-- sends these columns.
grant update (status, reviewed_by, reviewed_at) on public_media_metric_snapshots to authenticated;
grant update (status, reviewed_by, reviewed_at) on media_rate_cards to authenticated;
grant update (status) on platforms to authenticated;
