# GSC Page Indexing CSV exports

The Search Console API **cannot** list the URLs behind each Page Indexing reason.
So this is the one manual step: export each reason's URL list from the GSC UI and
drop the CSVs here. After that, the `index:*` scripts run autonomously.

## How to export (≈2 minutes)

1. Search Console → **Indexing → Pages**.
2. Under *"Why pages aren't indexed"*, click a reason row (e.g. **Not found (404)**).
3. Top-right **Export → Download CSV** (or Google Sheets → download as CSV).
4. Save the file here using one of the names below (the detector maps filename → bucket).

## Filename → bucket mapping

| Save the CSV as            | Maps to bucket            |
|----------------------------|---------------------------|
| `not-found-404.csv`        | `not_found_404`           |
| `noindex.csv`              | `excluded_noindex`        |
| `page-with-redirect.csv`   | `page_with_redirect`      |
| `alternate-canonical.csv`  | `alternate_canonical`     |
| `crawled-not-indexed.csv`  | `crawled_not_indexed`     |
| `discovered-not-indexed.csv` | `discovered_not_indexed` |
| `blocked-by-robots.csv`    | `blocked_robots`          |
| `soft-404.csv`             | `soft_404`                |

Matching is keyword-based and case-insensitive, so `Not Found (404).csv` also works.
Any URL column is auto-detected; the exact CSV layout from GSC doesn't matter.

## Priority for thebeatboutique.ie

Only these two truly need exporting (they're the real problems):
- **`not-found-404.csv`** — 18 URLs → 301 / restore / 410 decisions.
- **`crawled-not-indexed.csv`** — 53 URLs → thin/duplicate content + internal linking.

`noindex.csv` is useful for the noindex audit. The redirect / alternate-canonical
buckets are informational only and can be skipped unless you want sitemap-pollution checks.

Files in this folder are git-ignored (raw GSC data); the derived `index-status.json`
and fix plans in `data/audit/` are what the scripts consume.
