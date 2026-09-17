import { getCurrentProfileIsCurator } from "@/lib/media/governanceQueries";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CatalogImportFlow } from "./CatalogImportFlow";
import { CurationGate } from "../CurationGate";

// Phase 21 item 16 — server-side gate first, exactly like /curation
// itself (app/curation/page.tsx): a non-curator (or signed-out visitor)
// never even receives the taxonomy lookups this flow needs, regardless
// of what a client component might render. Never trust a client-side
// check alone.
export default async function CatalogImportPage() {
  const { userId, isCurator } = await getCurrentProfileIsCurator();
  if (!userId || !isCurator) {
    return <CurationGate signedIn={!!userId} />;
  }

  const supabase = createServerSupabaseClient();
  const [categories, countries, platforms] = await Promise.all([
    supabase.from("media_categories").select("internal_key, display_label").eq("active", true),
    supabase.from("countries").select("iso_code, display_label").eq("active", true),
    supabase.from("platforms").select("internal_key, display_label"),
  ]);

  return (
    <CatalogImportFlow
      knownCategories={categories.data ?? []}
      knownCountries={countries.data ?? []}
      knownPlatforms={platforms.data ?? []}
    />
  );
}
