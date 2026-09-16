import { getCurrentProfileIsCurator, getGovernanceQueue } from "@/lib/media/governanceQueries";
import { CurationView } from "./CurationView";
import { CurationGate } from "./CurationGate";

// Phase 19B item 3 — the smallest safe curator/admin page. Server-side
// gate first (never trust a client-side check alone): a non-curator
// (or signed-out visitor) never even receives the pending queue data,
// regardless of what a client component might render.
export default async function CurationPage() {
  const { userId, isCurator } = await getCurrentProfileIsCurator();

  if (!userId || !isCurator) {
    return <CurationGate signedIn={!!userId} />;
  }

  const queue = await getGovernanceQueue();
  return <CurationView queue={queue} />;
}
