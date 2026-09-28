// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1.
//
// Pure, behavior-preserving extraction from lib/benchmark/engine.ts.
// MetricValueGroup and resolveVariantGroup used to be private,
// unexported members of that file — the exact same shape and the exact
// same rule (never pool incompatible metric-definition variants
// together; always pick the single largest group) are reproduced here
// VERBATIM, with zero logic change, so lib/benchmark/coverage.ts can
// import and reuse the identical rule instead of duplicating or
// re-implementing a second, independently-maintained copy of it.
//
// engine.ts now imports this module instead of defining these itself;
// its own regression suite (unchanged, still passing) is the proof this
// extraction changed no statistical behavior.
export interface MetricValueGroup {
  variantId: string | null;
  values: number[];
}

export function resolveVariantGroup(groups: MetricValueGroup[]): MetricValueGroup | null {
  if (groups.length === 0) return null;
  return groups.reduce((largest, g) => (g.values.length > largest.values.length ? g : largest));
}
