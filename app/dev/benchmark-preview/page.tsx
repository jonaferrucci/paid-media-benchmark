import { notFound } from "next/navigation";
import { getBenchmark } from "@/lib/benchmark/engine";
import type { BenchmarkQuery } from "@/lib/benchmark/types";

// Dev-only integration example (Phase 4 item 29): proves the real
// engine end-to-end without touching the Phase 1.5 mock-data UI. Not
// linked from any navigation. Gated behind an explicit env flag so it
// can never accidentally run in production if this route is left
// deployed — visiting it without the flag set shows a plain notice
// instead of querying the database.
//
// This does NOT replace lib/mock/benchmarks.ts as the frontend's data
// source. That remains the active provider for the public experience
// until a later phase deliberately switches specific components over.
export default async function BenchmarkPreviewPage() {
  // Phase 9 §13 — unconditional production guard, deliberately placed
  // before the ENABLE_BENCHMARK_ENGINE_PREVIEW check (not instead of
  // it — that flag still controls dev-time behavior below). This is
  // the ONE line responsible for the invariant "dev tooling must not
  // be reachable in production regardless of env-variable
  // misconfiguration": even if ENABLE_BENCHMARK_ENGINE_PREVIEW were
  // accidentally set to "true" in a production environment, this
  // check runs first and calls notFound() before that flag is ever
  // read, before the engine is imported-and-called, and before any
  // service-role query can execute.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  if (process.env.ENABLE_BENCHMARK_ENGINE_PREVIEW !== "true") {
    return (
      <div style={{ padding: 24, fontFamily: "monospace", fontSize: 13 }}>
        Dev-only route. Set ENABLE_BENCHMARK_ENGINE_PREVIEW=true to enable.
      </div>
    );
  }

  const query: BenchmarkQuery = {
    platform: "meta_ads",
    objective: "traffic",
    vertical: "beauty_personal_care",
    country: "AR",
    audienceStrategy: "broad",
    funnelStage: "prospecting",
    timeWindow: { kind: "last_12_months" },
  };

  const results = await getBenchmark(query, ["cpm", "ctr", "cpc"]);

  return (
    <div style={{ padding: 24, fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
      <p>Dev-only real benchmark engine output (Phase 4). Never used by the public UI.</p>
      <pre>{JSON.stringify(results, null, 2)}</pre>
    </div>
  );
}
