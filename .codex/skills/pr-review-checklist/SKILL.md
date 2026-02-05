---
name: pr-review-checklist
description: Review PRs for The Beat Boutique static site. Use when asked to review changes, check generator steps, SEO metadata, and regressions.
---

# PR Review Checklist

## Overview
Provide a structured PR review that focuses on generated content workflows and SEO-sensitive markup.

## Review Steps
1. Identify whether changes touch generated pages or their sources.
2. Confirm data edits are in `data/` and outputs in `locations/` or `venues/` were regenerated.
3. Verify sitemaps updated when URLs, canonicals, or page sets change.
4. Check SEO fields: title, meta description, canonical, and structured data.
5. Ensure nav/footer changes are applied consistently across pages.
6. Look for accidental manual edits to generated content.

## Output Format
- Summary
- Findings (numbered, actionable)
- Missing Steps
- Notes
