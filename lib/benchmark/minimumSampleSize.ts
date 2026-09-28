import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_MINIMUM_SAMPLE_SIZE } from "./cohortRules";

// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1.
//
// Pure, behavior-preserving extraction from lib/benchmark/engine.ts.
// getMinimumSampleSize used to be a private, unexported function in
// that file — reproduced here VERBATIM (same table, same setting key,
// same fallback to DEFAULT_MINIMUM_SAMPLE_SIZE), with zero logic
// change, so lib/benchmark/coverage.ts reads the SAME live, curator-
// configurable minimum-sample threshold the engine itself uses, rather
// than duplicating this lookup or hardcoding DEFAULT_MINIMUM_SAMPLE_SIZE
// as if it were the only source of truth.
//
// engine.ts now imports this module instead of defining this itself;
// its own regression suite (unchanged, still passing) is the proof this
// extraction changed no statistical behavior.
export async function getMinimumSampleSize(): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("benchmark_settings")
    .select("setting_value")
    .eq("setting_key", "minimum_sample_size")
    .eq("active", true)
    .maybeSingle();
  const value = data?.setting_value as { default?: number } | null;
  return value?.default ?? DEFAULT_MINIMUM_SAMPLE_SIZE;
}
