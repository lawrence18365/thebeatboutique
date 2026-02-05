---
name: ui-change-safely
description: Safely edit HTML, CSS, or JS in The Beat Boutique static site. Use when asked to change layout, styling, or page content while preserving structure, SEO tags, and the generated-content workflow.
---

# UI Change Safely

## Overview
Make minimal, safe UI edits in a static site that mixes hand-edited pages with generated pages.

## Workflow
1. Identify the target page and whether it is generated.
2. If generated, edit the source data or script template instead of the output HTML.
3. For static pages, keep structure, class names, and semantic tags intact.
4. Preserve SEO essentials: title, meta description, canonical URL, and structured data.
5. If a shared footer or nav needs updates, prefer `node scripts/update-footers.js`.
6. Run relevant generator scripts when data or templates change.
7. Spot-check at least one affected page.

## Source Of Truth Rules
- `data/` drives pages in `locations/` and `venues/`.
- `locations/` and `venues/` are generated; avoid manual edits.
- `sitemap*.xml` files are generated; avoid manual edits.

## Notes
- Use directory URLs without `.html`.
- Preserve 4-space indentation and existing formatting style.
