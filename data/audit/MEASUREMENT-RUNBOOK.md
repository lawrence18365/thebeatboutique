# Measurement runbook — did the venue rework work?

## Hypothesis
The 49 venue pages were reworked (2026-06-27) from venue-research framing to
wedding-band-booking intent: titles "Wedding Band for [Venue] | Beat Boutique",
band-intent H1s, above-the-fold Check Your Date / See Pricing CTAs, and pricing +
county internal links. Prediction: **venue-page CTR rises** (those pages get
venue-research impressions at ~0% CTR today) and county commercial terms hold or
improve in position.

## Baseline (reference to beat)
`data/audit/seo-baseline-2026-06-24.json` (trailing 12 months). Primary KPI:
- **Venue pages aggregate CTR = 0.74%** across 12,312 impressions, avg pos 19.9.
- Per-page, county-term, and pricing-term tables are in the `.md` sibling file.

## When to measure
~**2026-07-27** (≈4 weeks after deploy) — enough time for Google to recrawl/reindex
49 pages. Earlier reads will be noisy.

## How to run it (≈5 min)
1. Refresh GSC data (interactive browser login — token is short-lived):
   ```
   ! node scripts/gsc-pull.js
   ```
   Approve in the browser; this overwrites `data/audit/gsc-data.json` with a fresh
   12-month pull.
2. Compare against the baseline:
   ```
   node scripts/seo-compare.js
   ```
   It prints the venue-aggregate CTR delta, per-page CTR/position movers, and county
   term position movers, and labels the windows.

### For a more sensitive read (recommended)
The default pull is 12 months, which dilutes a 4-week-old change. To isolate
post-change performance, temporarily run a short-window pull and compare:
- Edit `scripts/gsc-pull.js` `start.setDate(... - 365 - 3)` to `... - 28 - 3` for a
  28-day window (or copy it to a one-off), pull, then `node scripts/seo-compare.js`.
- A 28-day post-change venue CTR meaningfully above **0.74%** = hypothesis confirmed.

## Reading the result
- **Venue CTR up + county positions flat/down** → rework worked; double down (apply the
  same booking-intent pattern wider, then pursue links for county terms).
- **Venue CTR flat** → reframing wasn't enough; the venue-research intent may simply not
  convert to band bookings — consider de-emphasising venue pages vs. commercial pages.
- **Positions dropped** → check indexation/canonical regressions with `node scripts/verify-seo.js`.

## Why this isn't a scheduled cron
`gsc-pull.js` uses interactive (browser) OAuth and a short-lived refresh token, so a
headless scheduled job would fail at auth. This runbook is the reliable path. (A
calendar reminder for ~2026-07-27 is a good idea.)
