import { getMediaCatalog } from "@/lib/media/catalog";
import { listScenariosAction } from "./actions";
import { PlannerView } from "./PlannerView";

// Phase 20: initial data for the planner's discovery filters reuses
// getMediaCatalog() unmodified (Phase 17) — categories/platforms/
// platformCountries/countries/formats are exactly what the "¿Qué
// querés comparar?" start state needs, so this page never duplicates
// that query. Live opportunities (rate cards + public signals) are
// fetched on demand via fetchPlanningOpportunitiesAction, since those
// need to reflect the user's actual filter choices.
export default async function PlannerPage() {
  const [catalog, scenarios] = await Promise.all([getMediaCatalog(), listScenariosAction()]);
  return <PlannerView catalog={catalog} initialScenarios={scenarios} />;
}
