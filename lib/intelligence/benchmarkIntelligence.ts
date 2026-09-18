import type { MetricCategory } from "../diagnostics/types";

// Phase 23 §2/§6/§7/§8: the "intelligence layer" is deliberately just
// more of the SAME pattern lib/planning/explain.ts already established
// (Phase 20) — small, pure, deterministic functions that turn an
// already-computed product state into a restrained set of next-step
// ids or a fixed interpretation string. No LLM, no new methodology, no
// ranking. These functions never decide FOR the user; they only narrow
// down which of a fixed set of already-existing actions is contextually
// relevant right now (§6: "show only contextually relevant actions").

export type BenchmarkResultStatus = "success" | "no_data" | "insufficient_sample" | "methodology_block" | "error";

export type BenchmarkNextActionId = "explore_media" | "build_plan" | "contribute_data";

// §6: after a real result, offer navigation only — never a ranking, and
// never all four possible verbs at once. A blocked/errored calculation
// has nothing to navigate from yet, so it offers nothing here (the
// error/methodology copy itself is the only thing shown in that case).
export function resolveBenchmarkNextActions(status: BenchmarkResultStatus): BenchmarkNextActionId[] {
  if (status === "success") return ["explore_media", "build_plan"];
  if (status === "no_data" || status === "insufficient_sample") return ["contribute_data"];
  return [];
}

export type NoDataActionId = "expand_filters" | "contribute_data";

// §7: a no-data / insufficient-sample state always gets exactly ONE
// useful action — "ampliar filtros" when a real relaxation suggestion
// exists (the cohort really can be widened), otherwise "aportar datos"
// (there's nothing left to relax, so the honest next step is
// contributing the missing campaigns).
export function resolveNoDataAction(hasRelaxationSuggestion: boolean): NoDataActionId {
  return hasRelaxationSuggestion ? "expand_filters" : "contribute_data";
}

// §8: diagnostics remain evidence-based and un-invented — the only new
// thing here is mapping an ALREADY-COMPUTED rule category to a single,
// generic, category-level follow-up prompt (never a new causal claim
// about the specific numbers). Returns an i18n key suffix, not a
// hardcoded sentence, so ES/EN stay in lib/i18n/translations.ts like
// every other diagnostics string.
export function resolveDiagnosticActionKey(category: MetricCategory): string {
  const KEY_BY_CATEGORY: Record<MetricCategory, string> = {
    entrega: "actionEntrega",
    interaccion: "actionInteraccion",
    conversion: "actionConversion",
    rentabilidad: "actionRentabilidad",
  };
  return KEY_BY_CATEGORY[category];
}
