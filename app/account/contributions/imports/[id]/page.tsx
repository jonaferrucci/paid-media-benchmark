import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { EXPORT_PROFILE_LABEL_KEYS, type ExportProfileId } from "@/lib/import/platformExports";
import { ImportBatchDetail } from "./ImportBatchDetail";

// PHASE 25 — §17: a small, owner-only import-batch detail view.
// Deliberately NOT a complex administration screen — two RLS-scoped
// reads (the batch itself, then the campaigns it produced), the same
// session-aware client every other owner-scoped page in this app uses.
// No admin/service-role client, exactly like app/account/
// contributions/[id]/page.tsx (the per-campaign detail) already does.

interface BatchDetailRow {
  id: string;
  data_source: string;
  source_filename: string | null;
  export_profile: string | null;
  row_count: number;
  success_count: number;
  skipped_count: number;
  review_count: number;
  created_at: string;
  platforms: { display_label: string } | null;
}

interface BatchCampaignRow {
  id: string;
  campaign_name: string | null;
  start_date: string;
  end_date: string;
  objectives: { display_label: string } | null;
}

export default async function ImportBatchDetailPage({ params }: { params: { id: string } }) {
  const supabase = createServerSupabaseClient();

  const [{ data: batch, error: batchError }, { data: campaigns }] = await Promise.all([
    supabase
      .from("import_batches")
      .select("id, data_source, source_filename, export_profile, row_count, success_count, skipped_count, review_count, created_at, platforms(display_label)")
      .eq("id", params.id)
      .maybeSingle(),
    // §17: "campaigns included" — the campaigns this exact batch
    // produced, via the same import_batch_id FK every insert already
    // sets (app/contribute/bulk-actions.ts). RLS ("owners read own
    // datasets") means another owner's batch id simply returns nothing
    // here, same as the per-campaign detail page's own pattern.
    supabase
      .from("performance_datasets")
      .select("id, campaign_name, start_date, end_date, objectives(display_label)")
      .eq("import_batch_id", params.id)
      .order("created_at", { ascending: true }),
  ]);

  if (batchError || !batch) notFound();
  const row = batch as unknown as BatchDetailRow;
  const campaignRows = (campaigns as unknown as BatchCampaignRow[] | null) ?? [];

  const exportProfileLabelKey = row.export_profile
    ? EXPORT_PROFILE_LABEL_KEYS[row.export_profile as ExportProfileId] ?? null
    : null;

  return (
    <ImportBatchDetail
      batch={{
        id: row.id,
        platformLabel: row.platforms?.display_label ?? null,
        dataSource: row.data_source,
        sourceFilename: row.source_filename,
        exportProfileLabelKey,
        rowCount: row.row_count,
        successCount: row.success_count,
        skippedCount: row.skipped_count,
        reviewCount: row.review_count,
        createdAt: row.created_at,
      }}
      campaigns={campaignRows.map((c) => ({
        id: c.id,
        campaignName: c.campaign_name,
        startDate: c.start_date,
        endDate: c.end_date,
        objectiveLabel: c.objectives?.display_label ?? "—",
      }))}
    />
  );
}
