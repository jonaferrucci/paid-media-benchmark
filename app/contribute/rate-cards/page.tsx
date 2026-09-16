import { createServerSupabaseClient } from "@/lib/supabase/server";
import { RateCardImportFlow } from "./RateCardImportFlow";

export default async function RateCardsImportPage() {
  const supabase = createServerSupabaseClient();
  const [platforms, formats] = await Promise.all([
    supabase.from("platforms").select("internal_key, display_label").eq("active", true),
    supabase.from("media_formats").select("internal_key, display_label").eq("active", true),
  ]);
  return (
    <RateCardImportFlow
      knownPlatforms={platforms.data ?? []}
      knownFormats={formats.data ?? []}
    />
  );
}
