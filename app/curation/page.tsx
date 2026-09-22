import { getCurrentProfileIsCurator, getGovernanceQueue } from "@/lib/media/governanceQueries";
import { getPendingContributionsQueue } from "@/lib/contribute/reviewQueries";
import { CurationView } from "./CurationView";
import { CurationGate } from "./CurationGate";

// Phase 19B item 3 — the smallest safe curator/admin page. Server-side
// gate first (never trust a client-side check alone): a non-curator
// (or signed-out visitor) never even receives the pending queue data,
// regardless of what a client component might render.
//
// PHASE 28: extends this SAME page/gate with the contribution
// benchmark-eligibility queue (lib/contribute/reviewQueries.ts) —
// reusing the existing curator authorization/UI shell rather than a
// second admin surface. Both queue fetches are independent and run in
// parallel, same "no N+1, no sequential reads" discipline as every
// other multi-query page in this codebase.
export default async function CurationPage() {
  const { userId, isCurator } = await getCurrentProfileIsCurator();

  if (!userId || !isCurator) {
    return <CurationGate signedIn={!!userId} />;
  }

  const [queue, contributions] = await Promise.all([getGovernanceQueue(), getPendingContributionsQueue()]);
  return <CurationView queue={queue} contributions={contributions} />;
}
