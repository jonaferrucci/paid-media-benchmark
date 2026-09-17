"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { authorizeGovernanceAction } from "./governanceRules";

// Phase 21 item 16 — catalog mutation is governance-sensitive, so this
// reuses the EXACT SAME three-layer shape lib/media/governanceActions.ts
// already established for curator review actions: (1) resolve the
// caller's real session + is_curator flag server-side (never a
// client-supplied flag), (2) run it through the pure authorization rule
// already used everywhere else in this codebase (never a second,
// parallel authorization concept), (3) only then touch the database —
// and even then, RLS (migration 0016's curator-scoped INSERT policies
// on platforms/platform_countries, mirroring 0014's pattern) is the
// real, un-bypassable boundary if any of the above were ever wrong.

export interface CatalogImportRow {
  slug: string;
  displayName: string;
  countryIso: string;
  mediaCategoryKey: string;
  status: "active" | "pending" | "inactive";
  websiteDomain: string | null;
}

export interface CatalogImportResult {
  ok: boolean;
  created: number;
  skippedExisting: number;
  failed: number;
  error?: "not_authenticated" | "not_authorized" | "no_valid_rows" | "lookup_failed";
}

async function resolveCaller() {
  const supabase = createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, isCurator: false };
  const { data: profile } = await supabase.from("profiles").select("is_curator").eq("id", user.id).maybeSingle();
  return { supabase, user, isCurator: profile?.is_curator === true };
}

// Item 19: create-new or skip-existing only — never a blind upsert. A
// row whose slug already exists as a real platforms.internal_key is
// counted in `skippedExisting`, not overwritten — the UI-side
// validateCatalogRow already flags these as "existing" before this
// action is ever called, but this server-side check is the actual,
// authoritative one (never trust client-computed state alone).
export async function bulkSubmitCatalogAction(rows: CatalogImportRow[]): Promise<CatalogImportResult> {
  const { supabase, user, isCurator } = await resolveCaller();
  const auth = authorizeGovernanceAction(!!user, isCurator);
  if (!auth.allowed) return { ok: false, created: 0, skippedExisting: 0, failed: 0, error: auth.error };

  if (rows.length === 0) return { ok: false, created: 0, skippedExisting: 0, failed: 0, error: "no_valid_rows" };

  const [categoriesRes, countriesRes, existingPlatformsRes] = await Promise.all([
    supabase.from("media_categories").select("id, internal_key"),
    supabase.from("countries").select("id, iso_code"),
    supabase.from("platforms").select("id, internal_key, display_label"),
  ]);
  if (categoriesRes.error || countriesRes.error || existingPlatformsRes.error) {
    console.error("[catalog-import] taxonomy lookup failed", categoriesRes.error, countriesRes.error, existingPlatformsRes.error);
    return { ok: false, created: 0, skippedExisting: 0, failed: 0, error: "lookup_failed" };
  }

  const categoryIdByKey = new Map((categoriesRes.data ?? []).map((c) => [c.internal_key, c.id]));
  const countryIdByIso = new Map((countriesRes.data ?? []).map((c) => [c.iso_code, c.id]));
  const existingSlugs = new Set((existingPlatformsRes.data ?? []).map((p) => p.internal_key));
  const existingNames = new Set((existingPlatformsRes.data ?? []).map((p) => p.display_label.toLowerCase()));

  let created = 0;
  let skippedExisting = 0;
  let failed = 0;

  for (const row of rows) {
    if (existingSlugs.has(row.slug) || existingNames.has(row.displayName.toLowerCase())) {
      skippedExisting++;
      continue;
    }
    const categoryId = categoryIdByKey.get(row.mediaCategoryKey);
    const countryId = countryIdByIso.get(row.countryIso);
    if (!categoryId || !countryId) {
      failed++;
      continue;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("platforms")
      .insert({
        internal_key: row.slug,
        display_label: row.displayName,
        media_category_id: categoryId,
        is_global: false,
        status: row.status,
        website_domain: row.websiteDomain,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      console.error("[catalog-import] platform insert failed:", insertError);
      failed++;
      continue;
    }

    const { error: countryError } = await supabase
      .from("platform_countries")
      .insert({ platform_id: inserted.id, country_id: countryId });
    if (countryError) {
      console.error("[catalog-import] platform_countries insert failed:", countryError);
      // The platform row itself was created successfully — this is a
      // partial success (outlet exists, country relation missing), not
      // a failed row; never silently drop the catalog row over it.
    }

    existingSlugs.add(row.slug);
    existingNames.add(row.displayName.toLowerCase());
    created++;
  }

  if (created > 0) {
    revalidatePath("/platforms");
    revalidatePath("/curation");
    revalidatePath("/planner");
  }

  return { ok: created > 0 || skippedExisting > 0, created, skippedExisting, failed };
}
