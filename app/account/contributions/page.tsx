import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ContributionsList } from "./ContributionsList";

// Server Component: the query below runs with the user's own session
// (via the cookie-aware server client), so RLS policy "owners read own
// datasets" (owner_user_id = auth.uid()) is the real reason this only
// ever returns the signed-in user's rows — not application-level
// filtering that could be bypassed.
export default async function ContributionsPage() {
  const supabase = createServerSupabaseClient();

  // PHASE 26 (§10): source and import date were already stored
  // (data_source/created_at) but never selected here; dataset_metric_values
  // is now joined in the SAME query (never a follow-up query per row —
  // §18) so ContributionsList can show real benchmark-ready metrics
  // instead of just the taxonomy context.
  // PHASE 25 (§4/§7/§14): campaign_name and import_batch_id are new,
  // additive columns (migration 0018) — selected alongside everything
  // Phase 26 already fetched, still one query, still RLS-scoped.
  const { data } = await supabase
    .from("performance_datasets")
    .select(
      `id, start_date, end_date, validation_status, created_at, data_source, campaign_name,
       platforms(internal_key, display_label),
       objectives(display_label, internal_key),
       verticals(display_label, internal_key),
       countries(display_label, iso_code),
       campaign_types(display_label),
       dataset_metric_values(raw_numeric_value, metrics(internal_key))`
    )
    .order("created_at", { ascending: false });

  // PHASE 25 (§7): a SECOND, small query for the owner's real
  // import_batches rows (never a per-campaign follow-up query) — the
  // compact "what did I import" history the spec asks for under
  // Account/Contributions, now backed by a real batch identity instead
  // of Phase 26's same-day/same-platform heuristic (lib/contribute/
  // coverage.ts's groupRecentImports, left untouched — it still backs
  // the homepage workspace's own "recent imports" section per "do not
  // re-audit previous phases").
  const { data: batches } = await supabase
    .from("import_batches")
    .select("id, data_source, source_filename, export_profile, row_count, success_count, skipped_count, review_count, created_at, platforms(display_label)")
    .order("created_at", { ascending: false })
    .limit(10);

  // The hand-written Database type (lib/supabase/database.types.ts) does
  // not model joined-select shapes, so this cast bridges Supabase's
  // loosely-typed join result to the display-only shape ContributionsList
  // expects. Safe because the select() string above is the single
  // source of truth for what's actually returned.
  return <ContributionsList datasets={(data as never[]) ?? []} batches={(batches as never[]) ?? []} />;
}
