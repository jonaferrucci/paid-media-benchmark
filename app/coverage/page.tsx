import { getCoverageTaxonomies } from "@/lib/benchmark/coverage";
import { CoverageExplorer } from "./CoverageExplorer";
import { CoverageTaxonomyLoadError } from "./CoverageTaxonomyLoadError";

// CUCURUCHO INTELLIGENCE 4 — COVERAGE MAP V1.
//
// Thin Server Component, same split app/benchmark/page.tsx already
// established: fetch taxonomies server-side (public-safe, RLS-scoped —
// see lib/benchmark/coverage.ts's own getCoverageTaxonomies), show an
// honest failure state if that fails, otherwise hand off to the
// interactive Client Component. No coverage GRID is fetched here — that
// only happens once the user has picked Platform+Objective+Country (see
// CoverageExplorer.tsx), via the app/coverage/actions.ts server action.
export default async function CoveragePage() {
  const taxonomies = await getCoverageTaxonomies();

  if (taxonomies.hasError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <CoverageTaxonomyLoadError />
      </div>
    );
  }

  return <CoverageExplorer taxonomies={taxonomies} />;
}
