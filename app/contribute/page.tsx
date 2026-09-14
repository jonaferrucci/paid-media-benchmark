import { getContributionTaxonomies } from "@/lib/contribute/taxonomies";
import { ContributeWizard } from "./ContributeWizard";

export default async function ContributePage() {
  const taxonomies = await getContributionTaxonomies();
  return <ContributeWizard taxonomies={taxonomies} />;
}
