import { createServerSupabaseClient } from "@/lib/supabase/server";
import { PublicMetricImportFlow } from "./PublicMetricImportFlow";

export default async function PublicMetricsImportPage() {
  const supabase = createServerSupabaseClient();
  const [platforms, metricDefinitions] = await Promise.all([
    supabase.from("platforms").select("internal_key, display_label").eq("active", true),
    supabase.from("public_media_metric_definitions").select("internal_key, display_label").eq("active", true),
  ]);
  return (
    <PublicMetricImportFlow
      knownPlatforms={platforms.data ?? []}
      knownMetrics={metricDefinitions.data ?? []}
    />
  );
}
