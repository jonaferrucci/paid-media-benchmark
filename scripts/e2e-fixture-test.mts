// FIXTURE E2E TEST -- imports the REAL lib/benchmark/engine.ts (unmodified,
// same code the Next.js app calls) and executes it against the real
// local PostgreSQL + PostgREST stack loaded with supabase/test-fixtures.sql.
// This is NOT a live Supabase project -- labeled "Fixture E2E" per
// Phase 5.1 item 12's explicit instruction never to conflate the two.
import { getMetricBenchmark } from "../lib/benchmark/engine";
import type { BenchmarkQuery } from "../lib/benchmark/types";

async function main() {
  console.log("=== FIXTURE E2E TEST 1: Non-Reach (CPM) ===");
  const cpmQuery: BenchmarkQuery = {
    platform: "meta_ads",
    objective: "traffic",
    vertical: "beauty_personal_care",
    country: "AR",
    audienceStrategy: "broad",
    funnelStage: "prospecting",
    timeWindow: { kind: "last_12_months" },
  };
  const cpmResult = await getMetricBenchmark(cpmQuery, "cpm");
  console.log(JSON.stringify(cpmResult, null, 2));

  console.log("\n=== FIXTURE E2E TEST 2: Reach, valid scale context ===");
  const reachQueryValid: BenchmarkQuery = {
    platform: "meta_ads",
    objective: "awareness",
    vertical: "beauty_personal_care",
    country: "AR",
    audienceStrategy: "broad",
    timeWindow: { kind: "last_12_months" },
    spendBand: "2000_10000",
    durationBand: "15_30",
  };
  const reachResultValid = await getMetricBenchmark(reachQueryValid, "reach");
  console.log(JSON.stringify(reachResultValid, null, 2));

  console.log("\n=== FIXTURE E2E TEST 3: Reach, MISSING scale context (must refuse) ===");
  const reachQueryInvalid: BenchmarkQuery = {
    platform: "meta_ads",
    objective: "awareness",
    vertical: "beauty_personal_care",
    country: "AR",
    audienceStrategy: "broad",
    timeWindow: { kind: "last_12_months" },
  };
  const reachResultInvalid = await getMetricBenchmark(reachQueryInvalid, "reach");
  console.log(JSON.stringify(reachResultInvalid, null, 2));

  console.log("\n=== FIXTURE E2E TEST 4: Reach, scale context RELAXED (must still refuse) ===");
  const reachQueryRelaxed: BenchmarkQuery = {
    ...reachQueryValid,
    relaxedDimensions: ["spend_range"],
  };
  const reachResultRelaxed = await getMetricBenchmark(reachQueryRelaxed, "reach");
  console.log(JSON.stringify(reachResultRelaxed, null, 2));

  console.log("\n=== FIXTURE E2E TEST 5: Currency safety check (CPM under a USD spend band cohort) ===");
  const arsSpendQuery: BenchmarkQuery = {
    platform: "meta_ads",
    objective: "awareness",
    vertical: "beauty_personal_care",
    country: "AR",
    audienceStrategy: "broad",
    timeWindow: { kind: "last_12_months" },
    spendBand: "2000_10000",
    durationBand: "15_30",
  };
  const arsSpendResult = await getMetricBenchmark(arsSpendQuery, "cpm");
  console.log(JSON.stringify(arsSpendResult, null, 2));
  console.log("\n=== FIXTURE E2E TEST 6: genuine no_data (nonexistent cohort combination) ===");
  const noDataQuery: BenchmarkQuery = {
    platform: "pinterest_ads",
    objective: "leads",
    vertical: "automotive",
    country: "MX",
    timeWindow: { kind: "last_12_months" },
  };
  const noDataResult = await getMetricBenchmark(noDataQuery, "cpc");
  console.log(JSON.stringify(noDataResult, null, 2));
  console.log("\n=== FIXTURE E2E TEST 7: genuine insufficient_sample (Fashion cohort, n=4) ===");
  const insufficientQuery: BenchmarkQuery = {
    platform: "meta_ads",
    objective: "traffic",
    vertical: "fashion_apparel",
    country: "AR",
    timeWindow: { kind: "last_12_months" },
  };
  const insufficientResult = await getMetricBenchmark(insufficientQuery, "cpm");
  console.log(JSON.stringify(insufficientResult, null, 2));
}

main().then(() => process.exit(0)).catch((e) => { console.error("FIXTURE E2E FAILED:", e); process.exit(1); });
