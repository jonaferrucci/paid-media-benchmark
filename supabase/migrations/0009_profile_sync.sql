-- 0009_profile_sync.sql
-- Purpose: guarantee every authenticated user has a corresponding
-- profiles row, via a security-definer trigger on auth.users — not a
-- client-side insert after signup (Phase 3 item 6). Idempotent: an
-- ON CONFLICT DO NOTHING guard means this is safe to fire even if a
-- profile row somehow already exists (e.g. re-running in a dev
-- environment, or a future admin-created placeholder profile).

create function fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    -- Pre-fill from signup metadata when the client provided a display
    -- name (see app/auth/actions.ts signUpWithEmailAction); otherwise
    -- left null and editable later from /account.
    new.raw_user_meta_data ->> 'display_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

comment on function fn_handle_new_user is
  'Creates a profiles row for every new auth.users row. security definer '
  'so it can write to public.profiles regardless of the RLS policies '
  'that apply to the requesting session — this is the one sanctioned '
  'path that bypasses those policies, and only ever inserts a row '
  'scoped to NEW.id, never reads or writes any other row.';

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function fn_handle_new_user();
