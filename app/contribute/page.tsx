import { getContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { ContributeLanding } from "./ContributeLanding";

export default async function ContributePage() {
  const taxonomies = await getContributionTaxonomies();
  return <ContributeLanding taxonomies={taxonomies} />;
}
