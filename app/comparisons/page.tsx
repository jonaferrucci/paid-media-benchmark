import { listSavedComparisonsAction } from "./actions";
import { getContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { SavedComparisonsList } from "./SavedComparisonsList";

export default async function ComparisonsPage() {
  const [comparisons, taxonomies] = await Promise.all([
    listSavedComparisonsAction(),
    getContributionTaxonomies(),
  ]);
  return <SavedComparisonsList initialComparisons={comparisons} taxonomies={taxonomies} />;
}
