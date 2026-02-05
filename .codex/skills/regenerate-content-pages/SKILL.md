---
name: regenerate-content-pages
description: Regenerate The Beat Boutique data-driven pages and sitemaps. Use when `data/` changes, when templates change in `scripts/`, or when new locations/venues are added.
---

# Regenerate Content Pages

## Overview
Rebuild generated location, venue, footer, and sitemap outputs after data or template changes.

## Commands (run from repo root)
1. `node scripts/generate_pages.js`
2. `node scripts/generate-venues.js`
3. `node scripts/update-footers.js`
4. `node scripts/generate-sitemaps.js`

## When To Run
- After edits to `data/counties.json` or `data/venues.json`.
- After template changes inside `scripts/`.
- After adding or removing location or venue pages.

## Output Targets
- `generate_pages.js` writes to `locations/`.
- `generate-venues.js` writes to `venues/`.
- `update-footers.js` updates shared footer HTML across pages.
- `generate-sitemaps.js` writes `sitemap*.xml`.

## Rules
- Do not hand-edit generated output.
- Keep scripts deterministic and idempotent.
