# Scripts Folder Instructions

## Purpose
- Scripts generate or update HTML and XML outputs across the repo.
- They are the only approved way to update generated pages or sitemaps.

## Usage
- Run scripts from repo root with Node 18+.
- Keep scripts deterministic and idempotent.

## Editing Rules
- Preserve existing output structure, class names, and data attributes.
- If you change HTML templates, also update any related structured data blocks.
- If you add a new page type, ensure sitemap generation accounts for it.
- Avoid hardcoding new paths without updating `generate-sitemaps.js`.

## Output Targets
- `generate_pages.js` writes to `locations/`.
- `generate-venues.js` writes to `venues/`.
- `generate-sitemaps.js` writes `sitemap*.xml`.
- `update-footers.js` updates shared footer HTML across pages.
