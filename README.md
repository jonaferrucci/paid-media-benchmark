# Cucurucho

Cucurucho is a Next.js + TypeScript + Supabase product for benchmarking
and planning digital paid-media investment in LATAM. It answers two
questions for a media buyer or planner: **"how does my campaign
compare to the market?"** (benchmark) and **"what should I consider
pauting, and what would it cost?"** (planner) — using real, curated
data, never fabricated numbers, scores, or rankings.

Scope is deliberately digital-first: Meta Ads, Google Ads (including
YouTube, presented under Google Ads), TikTok Ads, Mercado Libre Ads,
Pinterest Ads, programmatic/DSP, and digital media outlets (streaming,
publishers, etc.). Non-digital media (TV, radio, OOH, print) exists in
the schema for later but is intentionally out of scope today.

## What it does

- **Benchmark engine** (`/benchmark`): compares a campaign's own
  results against a real, sample-size-safe cohort (platform × objective
  × vertical × country, plus optional audience/funnel/spend/duration
  dimensions), with a percentile-based classification and deterministic,
  evidence-linked insight copy — never a fabricated score or "best
  media" ranking.
- **Campaign import**: manual entry, or bulk CSV/XLSX import with
  automatic column mapping, a review step, and confirm. Meta Ads and
  Google Ads (Search/Performance Max/Video/Display) exports are
  recognized automatically; other platforms use a generic, honest
  fallback mapping.
- **Contribution validation & curation**: every submitted campaign,
  rate card, and public metric goes through `validation_status`
  governance (pending → active/rejected). Only active, curator-approved
  data is used in benchmarks, the media catalog, and the planner — a
  pending submission is never presented as verified fact.
- **Media catalog** (`/platforms`, `/media/[slug]`): browsable digital
  platforms and media, filterable by category/country/search, with
  honest data-availability states (rate card / public data / nothing
  yet), rate-card history, and public signals with source and
  freshness — never mixed, never estimated.
- **Media planner** (`/planner`): discovery → select up to 4
  opportunities → pairwise comparability → budget scenario → plan
  summary, with saved plans that always re-fetch and recalculate on
  reopen rather than trusting a stored value. No FX conversion, no
  automatic budget optimization, no media ranking.
- **Saved comparisons and saved plans**: sign in to save, rename,
  duplicate, delete, and reopen both benchmark comparisons and planner
  scenarios.

## Stack

- Next.js 14 (App Router) + TypeScript + Tailwind CSS
- Supabase (Postgres + RLS + Auth) — no separate backend service
- Deployed on Vercel

## Development

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # production build
npm run lint
npx tsc --noEmit # type-check
```

`npm run build` requires outbound access to `fonts.googleapis.com`
(next/font); it fails in network-restricted sandboxes for that reason
only — see `RELEASE_CANDIDATE.md`.

## Database

Schema lives in `supabase/migrations/` (0001 → latest, applied in
order against the linked Supabase project — see `supabase/`'s own
tooling for how migrations are run). Row-Level Security is the only
authorization boundary for user-facing reads/writes; a service-role
client is used in exactly one place (`lib/supabase/admin.ts`, for the
benchmark engine's cross-owner cohort aggregation) and is never
imported from client code.

## Testing

Focused, phase-scoped test scripts live in `scripts/test-*.mts` — real
imports of the shipped modules (pure functions executed directly,
plus source-text checks for anything not independently unit-testable
outside a DOM). Run any of them directly:

```bash
npx tsx scripts/test-phase37-media-intelligence-polish.mts
```

`scripts/e2e-fixture-test.mts` runs the real benchmark engine against a
local Postgres/PostgREST fixture stack (`supabase/test-fixtures.sql`) —
not a live Supabase project.

## More

- `RELEASE_CANDIDATE.md` — current release scope, known limitations,
  production checklist, and a manual smoke-test list.
- `MVP_RELEASE.md` — MVP feature/verification history.
- `POST_MVP_BACKLOG.md` — deliberately deferred items, each tracing to
  a real limitation called out in a prior phase.
