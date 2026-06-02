# GSC Indexing Repair — Final Summary

**Site:** thebeatboutique.ie · **Date:** 2026-06-02 · **Property:** `sc-domain:thebeatboutique.ie`

This documents the Google Search Console "Page indexing" repair work: what was fixed,
what was diagnosed as benign, and what (little) is left as optional follow-up.

---

## 1. Not found (404) — FIXED & LIVE

**Problem:** 18 URLs reported as "Not found (404)" — almost all legacy URLs from the old
`www.` Joomla site (e.g. `/home`, `/about1`, `/our-privacy-policy`, `/whats-on-offer`),
plus `/why-us/` which had a redirect rule that wasn't taking effect in production.

**Fixed:** added 10 HIGH/MEDIUM-confidence 301 redirects to `data/legacy-redirects.json`
(source of truth) and regenerated `_redirects` + redirect stub pages via the existing
`scripts/generate-legacy-redirects.js`. The 4 old blog/article URLs
(`/thinking-vintage`, `/the-urban-i-do`, `/hogan-was-here`, `/big-ideas`) were intentionally
**left as 404** — redirecting them to unrelated pages would create soft-404s. (410 Gone is not
expressible in Cloudflare Pages `_redirects`; revisit only if they have backlink value.)

**Redirects applied:**

| From | To | Confidence |
|---|---|---|
| `/why-us/` | `/about/` | HIGH |
| `/about1` | `/about/` | HIGH |
| `/our-privacy-policy` | `/privacy/` | HIGH |
| `/home` | `/` | HIGH |
| `/get-in-touch` | `/showcase/` | MEDIUM |
| `/watch-us-play` | `/showcase/` | MEDIUM |
| `/evening-band` | `/party-band/` | MEDIUM |
| `/whats-on-offer` | `/pricing-guide/` | MEDIUM |
| `/the-seal-of-approval` | `/reviews/` | MEDIUM |
| `/ceremony-music` | `/song-list/` | MEDIUM |

**Commits (pushed to `main`, deployed via GitHub Actions → Cloudflare Pages):**
- `152781e` — *Fix legacy 404 redirects from GSC export* (`_redirects`, `data/legacy-redirects.json`, 9 stub dirs)
- `ee8d6b3` — *Add why-us redirect stub so /why-us/ resolves to /about/* (`why-us/index.html`)

**Live verification (cache-busted), all passing:**

| URL | Result |
|---|---|
| `/why-us/` | 200 stub → `/about/` |
| `/home` | 301 → resolves to `/` |
| `www/home` | 301 → apex → `/` |
| `/our-privacy-policy` | 301 → `/privacy/` |
| `/whats-on-offer?option=com_content&view=category` | 301 (query preserved) → `/pricing-guide/` |

---

## 2. Crawled - currently not indexed — DIAGNOSED BENIGN, NO ACTION

**Export verified:** `Metadata.csv → Issue: Crawled - currently not indexed` (53 URLs).

**Final diagnosis:** this is **URL duplication + legacy junk, NOT a thin-content problem.**
Every real page in the list is a **no-slash variant that 301-redirects to a trailing-slash
canonical that is already "Submitted and indexed."** Verified live (the no-slash URLs 301 to
their `/…/` canonical) and against inspection data (canonicals are indexed and carry correct
self-referencing canonical tags). Current internal links all use trailing slashes
(2,209 with-slash vs 0 without), so nothing is regenerating these — they are old crawls
(Feb–Mar 2026) that will clear as Google re-crawls.

### Breakdown of the 53 URLs

**A. No-slash duplicates of already-indexed canonical pages — 35 → leave; self-resolving**
- Locations (17): `/locations/wedding-band-{limerick, mayo, wicklow, dublin, wexford, meath, donegal, kerry, cork, louth, clare, kilkenny, westmeath, kildare, waterford, galway, tipperary}`
- Venues (5): `/venues/{ashford-castle, adare-manor, bellingham-castle, dromoland-castle, luttrellstown-castle}`
- Venues index (1): `/venues`
- Guides (3): `/guides/{questions-to-ask-wedding-band, first-dance-songs, how-to-choose-wedding-band}`
- Core pages (9): `/song-list`, `/terms`, `/showcase`, `/about`, `/christmas-parties`, `/corporate-events`, `/privacy`, `/party-band`, `/pricing-guide`

**B. Legacy / junk / spam / query / hashbang URLs — 16 → leave; ages out**
- Old Joomla query strings (`?option=com_content&Itemid=50…`), Wix `#!about1/c12qo` hashbangs,
  spam `fbclid` backlinks, `http://`/`www.` homepage variants, and `/video?…`, `/playlist?…`,
  `/our-privacy-policy?…` query forms. Not real pages; Google correctly skipped them.

**C. Redirect stubs (noindex) — 2 → leave; correct**
- `/contact/`, `/why-us`

### Confirmations
- ✅ **No venue page rewrites are needed.** The venue pages appearing here are no-slash
  duplicates; their canonicals are already indexed. (They are thin — ~340 words, ~50% unique —
  but that is a separate, optional, proactive concern, **not** the cause of these 53.)
- ✅ **No consolidation, noindex, or delete action is needed** for any of the 53. The 35 dupes
  are already consolidated via 301 + canonical; the 16 junk URLs age out; the 2 stubs are correct.
- ℹ️ **One minor improvement:** `/christmas-parties/` has **0 internal in-links** (orphan). Its
  canonical is indexed, so this is low priority — a cheap win, not a fix for the 53.

> ⚠️ Auto-report caveat: `index-cni-plan.md`'s top-10 lists `/contact/`, `/video`,
> `/our-privacy-policy`, `/playlist` as "PRUNE/CONSOLIDATE" — a **false positive** (it measured
> 6-word redirect-stub text). Those are correct redirect stubs; do **not** prune them.

---

## 3. `_redirects` caveat (production behavior)

On this Cloudflare Pages deployment, the `_redirects` **301 rules do not appear to fire at the
edge**. Redirects work only via the generated **stub HTML pages** (Cloudflare auto-slashes
`/x` → `/x/`, serves the stub, which client-side meta-refreshes to the target). Evidence:
`/why-us` 404'd in production despite a valid `_redirects` rule until its stub was committed.

**Implication:** any future legacy redirect needs a committed stub page, not just a `_redirects`
line; and these are soft/client redirects rather than true server 301s. Functional and
consistent with the rest of the site, but worth fixing properly if clean 301s are desired.

---

## 4. Recommended next actions

1. **Validate the 404 fixes in GSC** — open the "Not found (404)" report and click *Validate Fix*
   so Google re-crawls the 18 URLs.
2. **Leave "Crawled - currently not indexed" alone / monitor** — re-run `npm run index:inspect`
   (in a terminal, approve OAuth) in ~1–2 weeks to confirm the buckets shrink as Google re-crawls.
3. **Optional later:** fix true server-side `_redirects` behavior on Cloudflare Pages so legacy
   routes return real 301s instead of relying on stub pages.
4. **Optional later:** add an internal link to `/christmas-parties/` from a strong related page.
5. **Do NOT rewrite venue pages** based on this CNI report — the 53 are benign duplication/junk.

---

## Tooling produced (for reference)
- `scripts/index-inspect.js` (`npm run index:inspect`) — detector
- `scripts/index-classify.js` (`npm run index:plan`) — classifier
- `scripts/index-fix-safe.js` (`npm run index:fix-safe`) — safe auto-fixes
- `scripts/index-cni-analyze.js` (`npm run index:cni`) — crawled-not-indexed analyzer
- `npm run index:report` — offline rebuild of all plans
- CSV exports live in `data/audit/gsc-exports/` (git-ignored); derived plans live in `data/audit/`.
