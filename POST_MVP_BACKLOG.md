# Cucurucho — Post-MVP Backlog

Known, already-identified, deliberately deferred items — not a feature wishlist. Each line traces back to a real limitation called out in a prior phase's "genuine unresolved issues."

## Import integrations

- API-based platform imports (Meta/Google/TikTok/Pinterest Marketing APIs) instead of manual CSV/XLSX export — would remove the "download, then upload" step entirely.
- Real TikTok Ads, Pinterest Ads, and Mercado Libre Ads export fixtures, if still missing — Phase 24 left all three on the honest generic-import fallback pending a real sample file for each.
- PDF media-kit extraction for rate cards (currently CSV/XLSX/manual only).
- Persisted campaign name/identity (would need a schema migration — `performance_datasets` has no campaign-name column today, so it stays review/context-only).

## Media intelligence

- Automated data-completeness refresh cadence for media profiles (currently computed at read time from whatever curators have submitted).
- Non-digital media (out of scope by product decision, not a technical gap).

## Planner

- Efficiency estimate (delivery compatible with a given budget) — every opportunity currently reports "no compatible delivery estimate."
- Automatic budget optimization or media ranking — the planner is deliberately informational, never prescriptive.
- Per-opportunity rate-card staleness detection on reopen — would require storing a price snapshot at save time, which conflicts with "never trust a stored derived value."

## Data quality

- FX conversion / currency normalization methodology — currency mismatches are always `not_comparable`, never estimated.
- User-facing surfacing of the internal data-quality diagnostic (`lib/contribute/dataQuality.ts`) beyond the current "revisar" duplicate note — e.g. a dedicated "needs attention" filter on `/account/contributions`.
- A real import-batch/provenance table — "recent imports" today is a same-day/same-platform/same-source approximation over individual campaign rows, not a true batch identity.

## UX

- Campaign editing after import (fix a typo'd metric without re-uploading the whole file) — no complex editing UI exists yet by design.
- A real search backend spanning benchmark/media/planner/contributions content — today's "search" is the existing filter overlay plus sidebar/quick-action navigation.

## Analytics (documentation only — no SDK wired up yet)

Phase 26 was asked to plan, not implement, product analytics. No third-party tracking script or event-sending code exists anywhere in this codebase today. When analytics is actually approved, these are the recommended first events:

- `report_uploaded` — a file was dropped/selected on `/contribute`, before mapping or validation.
- `import_completed` — `bulkSubmitContributionsAction` returned at least one successfully imported row.
- `benchmark_viewed` — a benchmark result rendered (either from the homepage discovery flow or `/benchmark`).
- `comparison_saved` — `saveComparisonAction` succeeded.
- `planner_created` — `saveScenarioAction` succeeded.
- `media_viewed` — a media profile page (`/media/[slug]`) rendered.

## Infrastructure

- Subscriptions/billing/paywalls — explicitly out of scope for the current product.
- Organization/team accounts beyond the existing (unused) `organizations`/`organization_members` schema scaffolding.
