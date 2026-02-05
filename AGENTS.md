# Codex Instructions (The Beat Boutique)

## Setup
- This is a static HTML/CSS/JS site with no build step.
- Node.js is only required for generator scripts. Use Node 18+.
- No tests, lint, or formatter are configured.

## MCP Sources
- Use the `openaiDeveloperDocs` MCP server for OpenAI and Codex product questions.

## Agents SDK Scaffold
- Multi-agent orchestration entrypoint: `tools/agents/orchestrate.py`.
- Install dependency: `python3 -m pip install openai-agents`.

## Sources Of Truth
- `data/` is the source of truth for generated pages.
- Do not hand-edit generated pages in `locations/` or `venues/`.
- Regenerate pages after data changes using the scripts below.

## Generator Commands (run from repo root)
- `node scripts/generate_pages.js` (locations)
- `node scripts/generate-venues.js` (venues)
- `node scripts/update-footers.js` (sitewide footer updates)
- `node scripts/generate-sitemaps.js` (sitemaps)

## Recommended Regen Order
- `node scripts/generate_pages.js`
- `node scripts/generate-venues.js`
- `node scripts/update-footers.js`
- `node scripts/generate-sitemaps.js`

## Editing Rules
- Preserve existing HTML structure and indentation (4 spaces).
- Use directory URLs without `.html` (pages live at `*/index.html`).
- Keep canonical URLs, meta tags, and structured data aligned with page content.
- Avoid editing generated `sitemap*.xml` directly; regenerate instead.

## Do Not Touch (unless explicitly asked)
- `assets/images/` originals
- `sitemap*.xml` (generated)
- `locations/` and `venues/` (generated)

## PR Rules
- Explain which generator scripts were run and why.
- If data-driven pages changed, include the data file diff and regenerated HTML diff.
- Keep diffs minimal and scoped to the requested change.
- For GitHub reviews, use the Codex integration and comment `@codex review` (no workflow required).

## Review Guidelines
- Treat missing generator runs for data changes as P1.
- Treat manual edits in `locations/` or `venues/` as P1.
- Treat broken canonical URLs, meta descriptions, or structured data as P1.
- Treat customer-facing typos as P1.

## Definition Of Done
- Content changes are made in the correct source files.
- Relevant generator scripts have been run (or explicitly called out as not run).
- Sitemaps updated when URLs or canonical targets changed.
- Quick manual spot-check of at least one affected page.
