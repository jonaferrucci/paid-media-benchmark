# Paid Media Benchmark — Phase 1 Frontend Prototype

This is the Phase 1 deliverable: a Next.js + TypeScript + Tailwind frontend
prototype validating dashboard information architecture using **mock data
only**. No Supabase, authentication, or benchmark engine is connected.

## Running locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Structure

```
app/                    Next.js App Router pages
  page.tsx              Overview / Benchmarks dashboard (main screen)
  platforms/ etc.        Placeholder routes for later phases

components/dashboard/    All dashboard UI components

lib/
  types.ts               Shared domain types (Platform, CohortFilters, KPIResult, ...)
  format.ts               Number/unit formatting helpers
  mock/
    random.ts             Deterministic seeded RNG (stable mock values per filter state)
    taxonomies.ts         Mock controlled vocabularies (verticals, audiences, objectives...)
    benchmarks.ts         Mock benchmark generator — the ONLY place that fabricates numbers
  config/
    objectiveKpis.ts      Objective → primary/secondary KPI mapping
    metrics.ts            Metric unit + benchmark direction registry
```

## Replacing mock data later

Every component reads data exclusively through the functions in
`lib/mock/benchmarks.ts` (`getKpiResults`, `getReachBenchmark`, `getTrend`,
`getVerticalComparison`, `getAudienceComparison`, `getVerticalAudienceMatrix`,
`getCohortSteps`). To connect the real benchmark engine in a later phase,
replace this file with equivalent functions backed by Supabase queries —
component code should not need to change.

## Known Phase 1 simplifications

- Only Meta Ads is fully prototyped; other platforms appear disabled in the
  filter bar per the approved architecture (platform switching UI exists,
  data does not).
- Only 3 of 6 objectives (Traffic, Awareness, Video Views) have been
  manually verified end-to-end; Engagement/Sales/Leads use the same KPI
  config mechanism but have not been visually reviewed.
- No authentication — the sidebar "Registered User" label is static.
- Gender, Performance Scope, and Campaign Type advanced filters render but
  do not yet affect mock output (no corresponding dimension in the mock
  generator seed). Age, Funnel Stage, Audience Strategy, Spend Range and
  Duration Band are fully wired.
