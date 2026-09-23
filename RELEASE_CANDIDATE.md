# Cucurucho — Release Candidate

Phase 38. Short, current-state reference for release readiness — see
`README.md` for the product overview and `MVP_RELEASE.md` for the full
feature/verification history.

## Scope

Digital-first paid-media benchmarking and planning for LATAM: Meta Ads,
Google Ads (YouTube under Google Ads), TikTok Ads, Mercado Libre Ads,
Pinterest Ads, programmatic/DSP, and digital media outlets. Non-digital
media (TV, radio, OOH, print) is not in scope.

## Supported workflows

- Sign up / sign in / forgot-reset password / OAuth callback / sign out
- Run a benchmark comparison (single-metric or full campaign mode), signed-out or signed-in
- Save, rename, duplicate, delete, and reopen a benchmark comparison
- Submit a campaign manually, or via bulk CSV/XLSX import
- Compare an imported campaign directly against its market benchmark
- Browse the media catalog and a media profile; jump into the planner from there
- Build a media plan (discover → select up to 4 → compare → budget) and save/reopen it
- Curator review of pending contributions (rate cards, public metrics, campaigns)

## Verified imports

- **Meta Ads**: campaign report CSV/XLSX, recognized automatically.
- **Google Ads**: campaign report CSV/XLSX, including Search, Performance Max, Video, and Display sub-formats — recognized automatically.
- **Generic fallback**: any other platform's export maps through an honest, unbranded generic-campaign-report path (no platform-specific column guessing).

## Deferred imports

- TikTok Ads, Pinterest Ads, and Mercado Libre Ads — no real export fixture verified yet; these currently use the generic fallback above, not a dedicated recognizer.
- PDF media-kit extraction for rate cards (CSV/XLSX/manual only today).

## Benchmark metrics

Supported: CPM, CTR, CPC, Reach, Frequency, CPA, ROAS, CPE, ACOS, TACOS.

**CPL is deferred** — the raw "conversions" field a campaign submits has
no reliable way to distinguish a leads count from a sales/purchase
count, so CPL is intentionally not offered rather than guessed.

## Media / planner capabilities

- Media catalog and profiles: real-only formats, rate cards (currency/unit/vigency, never normalized or FX-converted), public signals (source + freshness), qualitative completeness read (never a numeric score).
- Planner: opportunity selection (real cap of 4), pairwise price comparability (comparable / partially_comparable / not_comparable / insufficient_data — never guessed), per-currency budget subtotals (currencies never combined or converted), plan summary and warnings — never an efficiency score, ranking, or "best media" recommendation.
- No FX conversion anywhere in the product.

## Known environment limitation

`npm run build` fails in this sandbox with a `next/font` error because
outbound access to `fonts.googleapis.com` is not available here. This
is a sandbox network restriction, not a code defect — it has occurred
identically since Phase 21B. Do not retry it repeatedly and do not
change the font setup to work around it; a normal deployment
environment (Vercel) has outbound internet access and builds cleanly.

## Production checklist

- [x] `npx tsc --noEmit` clean
- [x] Full focused-test suite passing (see `MVP_RELEASE.md`)
- [x] `git diff --check` clean
- [x] Protected logic (benchmark engine, budget/comparability math, admin client, migrations) unchanged, verified via `git diff`
- [ ] `npm run build` verified in an environment with normal internet access (blocked here only by the Google Fonts limitation above)
- [ ] Hosted Supabase migration parity confirmed (0001–0019 expected applied)
- [ ] Environment variables confirmed set in the hosting environment (Supabase URL/anon key, service-role key restricted to server-only use) — no values are recorded in this document
- [ ] Manual smoke test (below) run against a real deployed preview, not just the sandbox

## Manual smoke test checklist

Run against a real deployed environment with a live Supabase project
(this sandbox has no production credentials, so these steps are not
executed here):

1. **Signed-out home** — homepage loads, discovery flow and quick actions are visible, no console errors.
2. **Login** — sign in with a real test account; redirected back to the intended page.
3. **Benchmark search** — run a benchmark from the homepage discovery flow and from `/benchmark` directly; verify classification, insight text, and no-data state (for an unlikely cohort) all render sensibly.
4. **Campaign import — Meta** — upload a real Meta Ads export; confirm auto-recognition, mapping/review, and successful import.
5. **Campaign import — Google** — same, with a real Google Ads export (try at least one non-Search sub-format if available).
6. **Contribution pending** — submit a rate card or public metric as a non-curator account; confirm it shows as pending, not active.
7. **Curator approval** — as a curator account, approve/reject the pending item from step 6; confirm it now appears (or doesn't) in the catalog/benchmark accordingly.
8. **Campaign → Benchmark** — from an imported campaign's detail page, use "Comparar con benchmark" on a supported metric.
9. **Save comparison** — save a benchmark result, navigate away, reopen it from the homepage/`/comparisons`.
10. **Media profile → Planner** — from a media profile, use "Planificar con este medio" and confirm the planner arrives pre-scoped.
11. **Save plan** — select opportunities, set a budget, save the plan, reopen it and confirm it recalculates rather than showing stale numbers.
12. **Mobile navigation** — at a phone width, confirm the nav sheet opens/closes, no horizontal scroll, and primary CTAs are reachable on Home/Benchmark/Planner/Contribute/Media.
13. **ES/EN** — toggle language in the header/nav sheet; confirm primary flows (benchmark, planner, media profile) have no untranslated raw keys visible.
14. **Logout** — sign out; confirm protected pages (`/account`, `/comparisons`, `/curation`) redirect or gate appropriately for a signed-out visitor.

No secrets, credentials, or environment values are included in this
document.
