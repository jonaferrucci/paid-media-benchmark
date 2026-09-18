// Phase 23 §19: after a successful contribution/import, the user
// should see "Qué se cargó, Qué pasa ahora, Dónde continuar" instead of
// a bare "Listo." — but which "continue" links make sense depends on
// WHAT was just contributed. This resolver only picks from the fixed,
// already-existing set of destinations the app has (benchmark, media
// catalog, contributions list, home) — it never invents a new route.

export type ContributionKind = "campaign_results" | "public_metrics" | "rate_card" | "bulk_import";

export type ContributionFollowUpAction = "view_benchmarks" | "explore_media" | "view_contributions" | "home";

// At most 2 relevant actions per kind (§19 "Only relevant options"),
// never all four at once.
export function resolveContributionSuccessActions(kind: ContributionKind): ContributionFollowUpAction[] {
  switch (kind) {
    case "campaign_results":
      // Campaign performance is what feeds benchmarks directly.
      return ["view_benchmarks", "view_contributions"];
    case "public_metrics":
    case "rate_card":
    case "bulk_import":
      // Commercial/public media data feeds the catalog & planner, not
      // the campaign benchmark engine.
      return ["explore_media", "view_contributions"];
    default:
      return ["home"];
  }
}
