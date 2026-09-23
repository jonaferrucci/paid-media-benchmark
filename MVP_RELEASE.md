# Cucurucho — MVP Release Notes

**Current phase:** Phase 38 — Release Candidate Cleanup
**Status:** feature-complete for MVP scope; release-candidate cleanup pass complete; not yet deployed.

## What is functional

- **Benchmark comparison** (single-metric + campaign mode): cohort-based percentile benchmark, classification (short labels now describe real quartile position — "por debajo/encima de la mediana" — never "mejor/peor"), deterministic insight copy, diagnostics (rule-based, evidence-linked), no-data/insufficient-sample states with a contextual next action. Metric coverage: CPM/CTR/CPC/Reach/Frequency plus CPA/ROAS/CPE/ACOS/TACOS (Phase 34); CPL remains deferred (no reliable way to isolate a leads count from a generic conversions field).
- **Campaign import**: manual entry, and bulk CSV/XLSX import with automatic column mapping, review, and confirm. Meta Ads and Google Ads (Search/Performance Max/Video/Display) exports are recognized automatically (Phase 24); other platforms use an honest generic fallback pending real sample fixtures. Import batches carry campaign identity/context (Phase 25) and are viewable at `/account/contributions` ("Mis campañas", Phase 35) and per-batch at `/account/contributions/imports/[id]`.
- **Contribution validation & curation**: `validation_status` governance (pending/active/rejected) on every submitted campaign, rate card, and public metric snapshot (migration 0019, Phase 19B/curator queue). Only active/canonical data is ever used in benchmarks, catalog display, or planner math.
- **Campaign → Benchmark activation** (Phase 32): from a campaign's own detail page, compare any of its derivable metrics that both the campaign's raw data and the real market cohort actually support — never a fabricated or unsupported metric.
- **Digital media catalog** (`/platforms`) and **LATAM digital discovery**: browsable, filterable catalog of platforms/media with category, country, and honest data-availability states (rate card / public data / nothing yet, never mixed).
- **Media profile** (`/media/[slug]`): public metrics with source/freshness, commercial (rate card) data with history and comparable-change sentences, real-only format list, qualitative data-completeness read, ad-platform-appropriate copy (Meta/Google/TikTok/etc. — YouTube stays presented under Google Ads), and contextual next actions (Phase 37).
- **Media planner**: three-stage progressive-disclosure workflow — "Qué querés pautar" → "Elegí medios" (max 4) → "Compará y armá tu plan" (pairwise comparability, per-currency subtotals, budget scenario, plan summary, grouped warnings) — simplified in Phase 36 with zero changes to the underlying selection/comparability/budget logic. Arrives pre-scoped from a media profile or benchmark result via safe, validated query params. Saved plans always re-fetch and recalculate on reopen, never trusting a stored value.
- **Saved comparisons and saved plans**: save, rename, duplicate, delete, reopen — reopening always re-runs the live engine/query, never a stored result.
- **Cross-product navigation**: benchmark ↔ media catalog ↔ planner ↔ contribution, connected via real, validated identifiers only (never fabricated).
- **Accounts**: sign-in/sign-up/forgot-reset password, OAuth callback, sign-out, saved comparisons/plans continuity on the homepage, "Mis campañas" list.

## What changed in this release-candidate pass (Phase 38)

- Removed a stale "Datos de prueba" (mock data) badge that was still rendering in the live app header on every page — a genuine Phase 1 prototype leftover, not gated by environment.
- Deleted 9 fully orphaned Phase-1-prototype components (`GlobalInsights`, `MiniTrend`, `FeaturedModules`, `ExploreMarket`, and the chart components only they used) — confirmed unreachable from any production import graph. `lib/mock/benchmarks.ts`/`lib/mock/random.ts` are kept (an existing Phase 30 regression test asserts they remain on disk to verify unreachability), documented as to why.
- Removed orphaned `stubPages.*` i18n keys left over from before `/platforms`, `/comparisons`, and `/contribute` had real implementations — this also retired the last "dataset" wording from owner-facing copy.
- Benchmark classification short labels ("Muy competitivo"/"Requiere atención") replaced with direction-aware, purely descriptive labels ("Por debajo/encima de la mediana", "Muy por debajo/encima de la mediana") — zero change to `classifyPerformance`'s thresholds or math.
- Added `app/not-found.tsx` and `app/error.tsx` (neither existed before) — on-brand, no stack traces, real retry/home actions.
- Root metadata description updated to describe the actual product (benchmarking + planning), not a placeholder.
- README.md and this file rewritten to describe the current product instead of the Phase 1 prototype.

## What has been verified

- `npx tsc --noEmit`: clean.
- Full historical focused-test suite (Phases 17/20–24/28/30–37/38, media/planner/mobile regressions): all passing.
- `git diff --check`: clean (no whitespace errors).
- Protected logic files (`lib/benchmark/engine.ts`, `lib/planning/budget.ts`, `lib/planning/comparability.ts`, `lib/supabase/admin.ts`, `supabase/migrations/*`) verified unchanged via `git diff --stat`.
- RLS/auth architecture, benchmark methodology, comparability engine, and budget math: unchanged and re-verified only by inspection, never re-derived.

## Known environment limitations

- `npm run build` fails in this sandbox because `next/font` cannot reach `fonts.googleapis.com` (no outbound access to that host here). This is an environment/network limitation, not a code defect — identical failures occurred in every phase from 21B onward. A real deployment environment with normal internet access is expected to build cleanly.
- Hosted Supabase currently has migrations 0001–0019 applied; Phase 38 introduced no new migration.

## Known product limitations (by design, not oversights)

- No FX conversion anywhere — currency mismatches are always `not_comparable`, never estimated.
- No automatic budget optimization or media ranking — Cucurucho informs, it never decides for the user.
- Reopening a saved comparison or plan never trusts a stored price/result; it always re-fetches and recalculates.
- "Efficiency estimate" (delivery estimate compatible with budget) is not implemented for any opportunity — every opportunity shows "no compatible delivery estimate," which is accurate, not a bug.
- Rate-card `package`/`custom` pricing units never get automatic unit-quantity math — flagged "requires commercial review."
- CPL is deferred (see above).
- TikTok Ads, Pinterest Ads, and Mercado Libre Ads use the generic import fallback pending real export sample fixtures for each.

## Production checklist

- [x] Signed-out exploration (benchmark, catalog, media profiles)
- [x] Sign up / sign in / forgot-reset password / sign out
- [x] Run a benchmark comparison (single-metric and campaign mode)
- [x] Save a comparison (requires sign-in)
- [x] Import a campaign (manual, Meta CSV/XLSX, Google CSV/XLSX)
- [x] Compare an imported campaign against benchmark
- [x] Explore digital media catalog and a media profile
- [x] Use the media planner (discover → select → compare → budget)
- [x] Save a plan (requires sign-in)
- [x] Curator review of pending submissions
- [ ] Production build verified outside this sandbox (blocked here only by Google Fonts network access — see environment limitations above)
- [ ] Hosted Supabase migration parity check before go-live (0001–0019 confirmed applied here; no new migration introduced by Phase 38)

See `RELEASE_CANDIDATE.md` for the full manual smoke-test checklist.
