import { getContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { BenchmarkExplorer } from "./BenchmarkExplorer";
import { TaxonomyLoadError } from "./TaxonomyLoadError";

export default async function BenchmarkPage() {
  const taxonomies = await getContributionTaxonomies();

  // Phase 9 production-blocker fix: previously, a failed taxonomy load
  // silently produced empty arrays that were passed straight into
  // BenchmarkExplorer, rendering a form with no selectable options and
  // no indication anything had gone wrong. Now a real failure shows an
  // honest, friendly state with a retry action instead.
  if (taxonomies.hasError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-4">
        <TaxonomyLoadError />
      </div>
    );
  }

  return <BenchmarkExplorer taxonomies={taxonomies} />;
}
