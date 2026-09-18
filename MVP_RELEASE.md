# Cucurucho — MVP Release Notes

**Current phase:** Phase 23 — Intelligence Layer & MVP Release
**Status:** feature-complete for MVP scope; not yet deployed.

## What is functional

- **Benchmark comparison** (single-metric + campaign mode): cohort-based percentile benchmark, classification, deterministic insight copy, diagnostics (rule-based, evidence-linked), no-data/insufficient-sample states with a contextual next action.
- **Saved comparisons**: save, rename, duplicate, delete, reopen (reopen always re-runs the live engine, never trusts a stored result).
- **Digital media catalog** (`/platforms`) and **LATAM digital discovery**: browsable, filterable catalog of platforms/media with category, country, and data-availability badges.
- **Media profile** (`/media/[slug]`): public metrics, commercial (rate card) data, qualitative data-completeness read, contextual next actions (plan / contribute rate card / contribute public data).
- **Rate cards & commercial intelligence**: current/previous/history per compatible identity (outlet+format+currency+pricing-unit), never fabricates a comparison across incompatible identities.
- **Media planner**: guided discovery → selection tray (max 4) → pairwise comparability → budget scenario → plan summary → grouped warnings → save/reopen scenarios. Arrives pre-scoped from a media profile or benchmark result via safe, validated query params.
- **Contribution workflows**: campaign results wizard, single public-metric/rate-card forms, and bulk CSV/XLSX import (rate cards + public metrics) with template download, column mapping, review, and confirm steps. Success states explain what was loaded and where to continue.
- **Curator governance**: pending/active/rejected status on submitted data; only active/canonical data is used in benchmarks, catalog display, and planner math.
- **Cross-product navigation**: benchmark ↔ media catalog ↔ planner ↔ contribution, connected via real, validated identifiers only (never fabricated).
- **Accounts**: sign-in/sign-out, saved comparisons/plans continuity on the homepage, contributions list.

## What has been verified

- `npx tsc --noEmit`: clean.
- Phase 20 (planner/budget), Phase 22 (cross-product workflow), and Phase 23 (intelligence layer) focused test suites: all passing (114 assertions across the three, plus the full historical suite from earlier phases, not re-run here per scope).
- `git diff --check`: clean (no whitespace errors).
- Manual review of sidebar alignment, planner discovery/comparison/budget flow, contribution success states, and media profile completeness/next-action logic against this phase's spec.
- RLS/auth architecture, benchmark methodology, comparability engine, and budget math: unchanged and re-verified only by inspection, never re-derived.

## Known environment limitations

- `npm run build` fails in this sandbox because `next/font` cannot reach `fonts.googleapis.com` (no outbound access to that host here). This is an environment/network limitation, not a code defect — the same failure occurred identically in Phase 21B and Phase 22. A real deployment environment with normal internet access is expected to build cleanly.
- Hosted Supabase currently has migrations 0001–0017 applied; Phase 22/23 required no new migration.

## Known product limitations (by design, not oversights)

- No FX conversion anywhere — currency mismatches are always `not_comparable`, never estimated.
- No automatic budget optimization or media ranking — Cucurucho informs, it never decides for the user.
- Reopening a saved plan never trusts a stored price; it always re-fetches and recalculates, so a plan can show honestly different numbers than when it was saved.
- "Efficiency estimate" (delivery estimate compatible with budget) is not implemented for any opportunity yet — every opportunity currently shows "no compatible delivery estimate," which is accurate, not a bug.
- Rate-card `package`/`custom` pricing units never get automatic unit-quantity math — they are flagged "requires commercial review."
- Recent-contributions continuity on the homepage was not added in Phase 23 (only saved comparisons and saved plans) — no existing lightweight read action covered it without adding a new query, which was out of scope for a single intelligence-layer pass.

## Deferred / post-MVP ideas (not built, not requested this phase)

- Analytics/telemetry (no GA/Segment — none present, none added).
- Subscriptions, pricing tiers, billing, paywalls.
- A full onboarding/tutorial system (a lightweight first-use guide was evaluated; existing homepage QuickActions + product story were judged sufficient without adding new UI surface).
- Per-row prefill inside the bulk CSV/XLSX importers (only a context banner is safely supportable without redesigning the importer).
- A recent-contributions read action for homepage continuity (see above).

## Production checklist

- [x] Signed-out exploration (benchmark, catalog, media profiles)
- [x] Sign in / sign out
- [x] Run a benchmark comparison
- [x] Save a comparison (requires sign-in)
- [x] Explore digital media catalog
- [x] View a media profile
- [x] Use the media planner (discover → select → compare → budget)
- [x] Save a plan (requires sign-in)
- [x] Submit a contribution (campaign results, public metric, rate card, bulk import)
- [x] Curator review of pending submissions
- [ ] Production build verified outside this sandbox (blocked here only by Google Fonts network access — see environment limitations above)
- [ ] Hosted Supabase migration parity check before go-live (0001–0017 confirmed applied; no new migration introduced by Phase 22/23)
