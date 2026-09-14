import { getContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { BenchmarkExplorer } from "./BenchmarkExplorer";

export default async function BenchmarkPage() {
  const taxonomies = await getContributionTaxonomies();
  return <BenchmarkExplorer taxonomies={taxonomies} />;
}
