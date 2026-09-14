import { createServerSupabaseClient } from "@/lib/supabase/server";
import { ContributionsList } from "./ContributionsList";

// Server Component: the query below runs with the user's own session
// (via the cookie-aware server client), so RLS policy "owners read own
// datasets" (owner_user_id = auth.uid()) is the real reason this only
// ever returns the signed-in user's rows — not application-level
// filtering that could be bypassed.
export default async function ContributionsPage() {
  const supabase = createServerSupabaseClient();

  const { data } = await supabase
    .from("performance_datasets")
    .select(
      `id, start_date, end_date, validation_status, created_at,
       platforms(display_label),
       objectives(display_label),
       verticals(display_label),
       countries(display_label)`
    )
    .order("created_at", { ascending: false });

  // The hand-written Database type (lib/supabase/database.types.ts) does
  // not model joined-select shapes, so this cast bridges Supabase's
  // loosely-typed join result to the display-only shape ContributionsList
  // expects. Safe because the select() string above is the single
  // source of truth for what's actually returned.
  return <ContributionsList datasets={(data as never[]) ?? []} />;
}
