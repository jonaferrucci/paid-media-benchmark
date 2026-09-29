import type { CohortQueryStatus } from "@/lib/benchmark/resultStatus";

// CUCURUCHO INTELLIGENCE 4.1 — COVERAGE MAP UX POLISH.
//
// Pure presentation constant, extracted from CoverageGrid.tsx (Coverage
// Map V1) so the SAME chip colors are reused by the matrix, the new
// compact status legend, and the new contextual cell panel — never
// three independently-maintained copies of the same color mapping. No
// status semantics changed: still the exact four canonical
// CohortQueryStatus values, same colors as V1 shipped with.
export const COVERAGE_STATUS_STYLE: Record<CohortQueryStatus, string> = {
  success: "bg-pistachio-soft text-pistachio",
  insufficient_sample: "bg-vanilla-soft text-vanilla",
  no_data: "border border-dashed border-line bg-surface text-ink-400",
  methodology_block: "bg-caution-soft text-caution",
};
