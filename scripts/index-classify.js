#!/usr/bin/env node
/**
 * Phase 2 — Classifier.
 *
 * Reads data/audit/index-status.json and classifies every known URL into an
 * actionable category, then writes:
 *   - data/audit/index-fix-plan.json  (machine-readable, consumed by Phase 3/4)
 *   - data/audit/index-fix-plan.md    (human-readable, per-URL recommended actions)
 *
 * Classification is conservative: it never invents fixes for non-errors
 * (redirect / alternate-canonical are reported as informational only).
 *
 * Usage: node scripts/index-classify.js
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const ORIGIN = 'https://thebeatboutique.ie';
const AUDIT_DIR = path.join(ROOT_DIR, 'data', 'audit');
const STATUS_PATH = path.join(AUDIT_DIR, 'index-status.json');
const PLAN_JSON = path.join(AUDIT_DIR, 'index-fix-plan.json');
const PLAN_MD = path.join(AUDIT_DIR, 'index-fix-plan.md');

// Pages intentionally kept out of the index (conversion / thank-you / utility).
// Used to tell an intentional noindex from a suspicious one.
const INTENTIONAL_NOINDEX_SLUGS = ['thank-you', 'showcase-confirmed', '404', 'guestlist'];

// Known legacy → canonical redirect targets (mirrors data/legacy-redirects.json intent).
// Used to suggest a redirect target for legacy 404s.
function suggestRedirectTarget(pathname) {
    const p = pathname.replace(/\/+$/, '');
    const rules = [
        [/^\/(book|book-us|contact|contact-us|video|videos|showreel)$/, '/showcase/'],
        [/^\/(playlist|songlist|songs|song-list)$/, '/song-list/'],
        [/^\/(prices|pricing|wedding-band-prices)$/, '/pricing-guide/'],
        [/^\/(our-fans|testimonials)$/, '/reviews/'],
        [/^\/why-us$/, '/about/'],
        [/^\/wedding-band-([a-z-]+)$/, (m) => `/locations/wedding-band-${m[1]}/`],
    ];
    for (const [re, target] of rules) {
        const m = p.match(re);
        if (m) return typeof target === 'function' ? target(m) : target;
    }
    // /venues/<slug> or /locations/<slug> that 404 → likely a slug change; needs review.
    return null;
}

const fileExistsForUrl = (pathname) => {
    const rel = pathname.replace(/^\/|\/$/g, '');
    const candidates = [
        path.join(ROOT_DIR, rel, 'index.html'),
        path.join(ROOT_DIR, rel + '.html'),
    ];
    return candidates.some(f => fs.existsSync(f));
};

function pathnameOf(u) {
    try { return new URL(u).pathname; } catch (e) { return u; }
}

function hasBucket(rec, b) { return (rec.buckets || []).includes(b); }

// ── Classification ──────────────────────────────────────────────────────────
function classify(rec) {
    const cov = (rec.coverageState || '').toLowerCase();
    const robots = (rec.robotsTxtState || '').toLowerCase();
    const fetchState = (rec.pageFetchState || '').toLowerCase();
    const verdict = (rec.verdict || '').toUpperCase();
    const pathname = pathnameOf(rec.url);
    const buckets = rec.buckets || [];

    const isIntentionalNoindex = INTENTIONAL_NOINDEX_SLUGS.some(s =>
        pathname === `/${s}/` || pathname === `/${s}` || pathname.includes(`/${s}/`));

    // --- 404 / not found ---
    if (hasBucket(rec, 'not_found_404') || fetchState.includes('not_found') || cov.includes('not found')) {
        const target = suggestRedirectTarget(pathname);
        if (fileExistsForUrl(pathname)) {
            return { category: 'noindexed_present_recheck',
                action: 'File exists locally but Google reports 404 — likely stale; re-inspect after next deploy. No code change.' };
        }
        if (target) {
            return { category: 'fix_404_redirect',
                action: `Add 301: ${pathname} → ${target}`, redirect: { from: pathname, to: target } };
        }
        return { category: 'fix_404_review',
            action: 'No obvious redirect target. Decide: restore page, 301 to closest relevant page, or return 410 (gone).' };
    }

    // --- noindex ---
    if (hasBucket(rec, 'excluded_noindex') || cov.includes('noindex')) {
        if (isIntentionalNoindex) {
            return { category: 'intentional_noindex',
                action: 'Intentional noindex (utility/conversion/legacy). No change. Confirm in noindex audit.' };
        }
        // Legacy duplicate route that should 301 instead of noindex?
        const target = suggestRedirectTarget(pathname);
        if (target) {
            return { category: 'noindex_should_redirect',
                action: `Legacy duplicate noindexed at 200. Prefer 301 → ${target} (remove duplicate HTML so _redirects fires). Needs manual confirm.`,
                redirect: { from: pathname, to: target } };
        }
        return { category: 'suspicious_noindex',
            action: 'Noindex on a page with no redirect target — verify this page SHOULD be excluded. If not, remove the noindex meta tag.' };
    }

    // --- blocked by robots ---
    if (hasBucket(rec, 'blocked_robots') || robots.includes('disallowed')) {
        return { category: 'blocked_robots',
            action: 'Blocked by robots.txt — verify intentional; if the page should rank, allow it in robots.txt.' };
    }

    // --- redirect / alternate-canonical: informational, only flag sitemap pollution ---
    if (hasBucket(rec, 'page_with_redirect') || cov.includes('page with redirect')) {
        if (rec.inSitemapLocal) {
            return { category: 'sitemap_pollution',
                action: 'Redirecting URL is listed in a sitemap — remove from sitemap (sitemaps should list only 200 canonical URLs).' };
        }
        return { category: 'informational_redirect', action: 'Page redirects (expected). No action.' };
    }
    if (hasBucket(rec, 'alternate_canonical') || cov.includes('alternate page')) {
        if (rec.inSitemapLocal) {
            return { category: 'sitemap_pollution',
                action: 'Non-canonical alternate is in a sitemap — remove from sitemap.' };
        }
        return { category: 'informational_canonical', action: 'Google consolidated to canonical (expected). No action.' };
    }

    // --- discovered not indexed: crawl budget / weak internal linking ---
    if (hasBucket(rec, 'discovered_not_indexed') || cov.includes('discovered')) {
        return { category: 'discovered_not_indexed',
            action: 'Discovered but not crawled — add internal links from strong pages; ensure it is in the sitemap.' };
    }

    // --- crawled not indexed: thin/duplicate content ---
    if (hasBucket(rec, 'crawled_not_indexed') || cov.includes('crawled - currently not indexed')) {
        return { category: 'crawled_not_indexed',
            action: 'Crawled but not indexed — likely thin/duplicate. See Phase 4 (index:cni) for content/linking/prune plan.' };
    }

    // --- indexed / pass ---
    if (verdict === 'PASS' || cov.includes('submitted and indexed') || cov.includes('indexed, not submitted')) {
        return { category: 'indexed', action: 'Indexed. No action.' };
    }

    // --- unknown (no inspection data yet) ---
    if (!rec.coverageState) {
        return { category: 'uninspected',
            action: 'Not yet inspected — run index:inspect (needs CSV exports and/or auth).' };
    }
    return { category: 'other', action: `Coverage: ${rec.coverageState}. Manual review.` };
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
    if (!fs.existsSync(STATUS_PATH)) {
        console.error(`Missing ${path.relative(ROOT_DIR, STATUS_PATH)}. Run: npm run index:inspect`);
        process.exit(1);
    }
    const status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8'));
    const records = Object.values(status.urls || {});

    const classified = records.map(rec => {
        const c = classify(rec);
        return {
            url: rec.url,
            ...c,
            coverageState: rec.coverageState || null,
            robotsTxtState: rec.robotsTxtState || null,
            verdict: rec.verdict || null,
            buckets: rec.buckets || [],
            inSitemap: !!rec.inSitemapLocal,
            inspectedAt: rec.inspectedAt || null,
        };
    });

    // Group by category.
    const groups = {};
    for (const c of classified) (groups[c.category] = groups[c.category] || []).push(c);

    const ACTIONABLE = new Set([
        'fix_404_redirect', 'fix_404_review', 'noindex_should_redirect', 'suspicious_noindex',
        'blocked_robots', 'sitemap_pollution', 'crawled_not_indexed', 'discovered_not_indexed',
        'noindexed_present_recheck',
    ]);

    const plan = {
        generatedAt: new Date().toISOString(),
        sourceStatusAt: status.generatedAt || null,
        totals: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
        autoRedirects: classified.filter(c => c.category === 'fix_404_redirect' && c.redirect).map(c => c.redirect),
        items: classified,
    };
    fs.writeFileSync(PLAN_JSON, JSON.stringify(plan, null, 2));

    // ── Markdown report ──
    const order = [
        ['fix_404_redirect', '🔴 404 → add 301 redirect (safe auto-fix)'],
        ['fix_404_review', '🔴 404 → needs decision (restore / 301 / 410)'],
        ['noindexed_present_recheck', '🟡 Reported 404 but file exists — re-inspect after deploy'],
        ['suspicious_noindex', '🔴 Suspicious noindex — verify it should be excluded'],
        ['noindex_should_redirect', '🟡 Legacy noindex → prefer 301 (manual confirm)'],
        ['crawled_not_indexed', '🟠 Crawled, not indexed — thin/duplicate (Phase 4)'],
        ['discovered_not_indexed', '🟠 Discovered, not indexed — internal linking'],
        ['sitemap_pollution', '🟡 Sitemap pollution — remove from sitemap'],
        ['blocked_robots', '🟡 Blocked by robots.txt'],
        ['intentional_noindex', '✅ Intentional noindex (no action)'],
        ['informational_redirect', '✅ Page with redirect (no action)'],
        ['informational_canonical', '✅ Alternate/canonical (no action)'],
        ['indexed', '✅ Indexed (no action)'],
        ['uninspected', '⏳ Not yet inspected'],
        ['other', '❔ Other / manual review'],
    ];

    const L = [];
    L.push('# Index Fix Plan — thebeatboutique.ie');
    L.push('');
    L.push(`_Generated ${plan.generatedAt} from index-status.json (${records.length} URLs)._`);
    L.push('');
    L.push('## Summary');
    L.push('');
    L.push('| Category | Count | Actionable |');
    L.push('|---|---:|:--:|');
    for (const [key, label] of order) {
        if (!groups[key]) continue;
        L.push(`| ${label} | ${groups[key].length} | ${ACTIONABLE.has(key) ? '✔' : ''} |`);
    }
    L.push('');
    const autoCount = (groups['fix_404_redirect'] || []).length;
    L.push(`**${autoCount}** redirect(s) can be applied automatically by \`npm run index:fix-safe\`.`);
    L.push('');

    for (const [key, label] of order) {
        const items = groups[key];
        if (!items || !items.length) continue;
        L.push(`## ${label} — ${items.length}`);
        L.push('');
        for (const c of items) {
            const p = pathnameOf(c.url);
            L.push(`- \`${p}\``);
            L.push(`  - **Action:** ${c.action}`);
            if (c.coverageState) L.push(`  - Coverage: ${c.coverageState}${c.verdict ? ` · verdict ${c.verdict}` : ''}`);
            if (c.buckets.length) L.push(`  - Source: ${c.buckets.join(', ')}`);
        }
        L.push('');
    }

    fs.writeFileSync(PLAN_MD, L.join('\n'));

    console.log('Classification summary:');
    for (const [key, label] of order) {
        if (groups[key]) console.log(`  ${String(groups[key].length).padStart(4)}  ${label}`);
    }
    console.log(`\n✓ Wrote ${path.relative(ROOT_DIR, PLAN_MD)}`);
    console.log(`✓ Wrote ${path.relative(ROOT_DIR, PLAN_JSON)}`);
    console.log(`\n${autoCount} redirect(s) ready for: npm run index:fix-safe`);
}

main();
