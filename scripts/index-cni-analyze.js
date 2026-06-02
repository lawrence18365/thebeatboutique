#!/usr/bin/env node
/**
 * Phase 4 — "Crawled - currently not indexed" strategy.
 *
 * For the crawled-not-indexed (and discovered-not-indexed) candidates, this
 * analyses the ACTUAL on-disk pages and existing site data to recommend:
 *   - which pages are too thin (low unique word count),
 *   - which are near-duplicate of the shared template (low uniqueness ratio),
 *   - which are orphaned / weakly internally linked,
 *   - which venue pages have empty data fields that should be filled (TODO),
 * then prints a prioritised top-10 to fix first.
 *
 * It invents NO facts: thinness/uniqueness come from the rendered text, and the
 * only content suggestions are "fill these EXISTING empty fields in venues.json"
 * — flagged as TODO for a human to complete with real venue knowledge.
 *
 * Input: data/audit/index-fix-plan.json (crawled_not_indexed / discovered_not_indexed).
 *        If absent or empty, falls back to analysing all venue + location pages
 *        as candidates (clearly labelled).
 * Output: data/audit/index-cni-plan.md
 *
 * Usage: node scripts/index-cni-analyze.js
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const ORIGIN = 'https://thebeatboutique.ie';
const AUDIT_DIR = path.join(ROOT_DIR, 'data', 'audit');
const PLAN_JSON = path.join(AUDIT_DIR, 'index-fix-plan.json');
const VENUES_JSON = path.join(ROOT_DIR, 'data', 'venues.json');
const OUT_MD = path.join(AUDIT_DIR, 'index-cni-plan.md');

const THIN_WORDS = 350;          // below this unique-ish word count = thin
const DUP_UNIQUE_RATIO = 0.18;   // below this share of non-boilerplate shingles = templated
const SHINGLE_N = 5;

// ── Text extraction ─────────────────────────────────────────────────────────
function visibleText(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<head[\s\S]*?<\/head>/gi, ' ')
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function words(text) { return text.toLowerCase().match(/[a-z0-9']+/g) || []; }
function shingles(wordArr, n = SHINGLE_N) {
    const s = new Set();
    for (let i = 0; i + n <= wordArr.length; i++) s.add(wordArr.slice(i, i + n).join(' '));
    return s;
}

// ── Page discovery ──────────────────────────────────────────────────────────
function routeToFile(routePath) {
    const rel = routePath.replace(/^\/|\/$/g, '');
    const c = [path.join(ROOT_DIR, rel, 'index.html'), path.join(ROOT_DIR, rel + '.html')];
    return c.find(f => fs.existsSync(f)) || null;
}
function pathnameOf(u) { try { return new URL(u).pathname; } catch (e) { return u; } }

function collectDir(sub) {
    const dir = path.join(ROOT_DIR, sub);
    const out = [];
    if (!fs.existsSync(dir)) return out;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const f = path.join(dir, e.name, 'index.html');
        if (fs.existsSync(f)) out.push({ route: `/${sub}/${e.name}/`, file: f });
    }
    return out;
}

// ── Build internal link graph (in-degree per route) ─────────────────────────
function buildLinkGraph() {
    const inDegree = {};
    const allHtml = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name.startsWith('.') || e.name === 'tmp' || e.name === 'output') continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) walk(full);
            else if (e.name.endsWith('.html')) allHtml.push(full);
        }
    })(ROOT_DIR);

    for (const file of allHtml) {
        const html = fs.readFileSync(file, 'utf8');
        const selfRoute = '/' + path.relative(ROOT_DIR, file).replace(/index\.html$/, '').replace(/\/$/, '') + '/';
        // Honour <base href="..."> — these pages use <base href="/">, so bare
        // hrefs like "venues/x/" are root-relative, not relative to the file.
        const baseMatch = html.match(/<base\s+href=["']([^"']+)["']/i);
        const basePath = baseMatch ? baseMatch[1] : path.dirname(selfRoute) + '/';
        const hrefs = html.match(/href=["']([^"'#?]+)["']/gi) || [];
        const seen = new Set();
        for (const h of hrefs) {
            let href = h.replace(/^href=["']/i, '').replace(/["']$/, '');
            if (/^(mailto:|tel:|javascript:|data:)/i.test(href)) continue;
            if (/^https?:\/\//i.test(href) && !href.startsWith(ORIGIN)) continue; // external
            let route;
            try {
                route = new URL(href, ORIGIN + (basePath.startsWith('/') ? basePath : '/' + basePath)).pathname;
            } catch (e) { continue; }
            // Ignore asset links (files with an extension other than .html).
            const last = route.split('/').pop();
            if (last && /\.[a-z0-9]+$/i.test(last) && !/\.html$/i.test(last)) continue;
            route = route.replace(/index\.html$/, '');
            if (!route.endsWith('/')) route += '/';
            route = route.replace(/\/+/g, '/');
            if (route === selfRoute) continue;
            seen.add(route);
        }
        for (const r of seen) inDegree[r] = (inDegree[r] || 0) + 1;
    }
    return inDegree;
}

// ── Venue data completeness (existing fields only) ──────────────────────────
function loadVenueData() {
    const map = {};
    try {
        const arr = JSON.parse(fs.readFileSync(VENUES_JSON, 'utf8'));
        const list = Array.isArray(arr) ? arr : Object.values(arr);
        for (const v of list) if (v && v.slug) map[v.slug] = v;
    } catch (e) {}
    return map;
}
const VENUE_RICH_FIELDS = ['capacity', 'setting', 'ballroom', 'acoustics', 'setup_notes', 'best_for', 'wedding_culture'];
function emptyVenueFields(v) {
    if (!v) return null;
    return VENUE_RICH_FIELDS.filter(f => !v[f] || String(v[f]).trim() === '');
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
    // 1. Candidate routes from the plan (crawled/discovered). When the precise
    //    crawled-not-indexed CSV list isn't present, also analyse the full
    //    venue+location template set so the report is useful immediately.
    let candidates = [];
    let fallback = false;
    let crawledCount = 0;
    if (fs.existsSync(PLAN_JSON)) {
        const plan = JSON.parse(fs.readFileSync(PLAN_JSON, 'utf8'));
        candidates = (plan.items || [])
            .filter(i => i.category === 'crawled_not_indexed' || i.category === 'discovered_not_indexed')
            .map(i => ({ route: pathnameOf(i.url), category: i.category }));
        crawledCount = candidates.filter(c => c.category === 'crawled_not_indexed').length;
    }
    if (crawledCount === 0) {
        // No real crawled-not-indexed list yet → analyse all template pages.
        fallback = true;
        const known = new Set(candidates.map(c => c.route.replace(/\/+/g, '/')));
        for (const p of [...collectDir('venues'), ...collectDir('locations')]) {
            const route = p.route.replace(/\/+/g, '/');
            if (!known.has(route)) candidates.push({ route, category: 'candidate(template-page)' });
        }
    }

    // 2. Resolve to files; note ones with no file (true 404s — out of scope here).
    candidates = candidates.map(c => ({ ...c, file: routeToFile(c.route) }));
    const missing = candidates.filter(c => !c.file);
    const pages = candidates.filter(c => c.file);

    // 3. Build comparison corpus = all venue + location pages (the templated set).
    const corpus = [...collectDir('venues'), ...collectDir('locations')];
    const corpusShingles = corpus.map(p => {
        const txt = visibleText(fs.readFileSync(p.file, 'utf8'));
        return { route: p.route, sh: shingles(words(txt)) };
    });
    // Document frequency of each shingle across the corpus (to find boilerplate).
    const df = new Map();
    for (const d of corpusShingles) for (const s of d.sh) df.set(s, (df.get(s) || 0) + 1);
    const corpusSize = corpusShingles.length || 1;

    const inDegree = buildLinkGraph();
    const venueData = loadVenueData();

    // 4. Analyse each candidate page.
    const analysed = pages.map(c => {
        const html = fs.readFileSync(c.file, 'utf8');
        const txt = visibleText(html);
        const w = words(txt);
        const sh = shingles(w);
        // Unique shingles = those appearing in < 50% of the corpus (i.e. not boilerplate).
        let unique = 0;
        for (const s of sh) if ((df.get(s) || 0) / corpusSize < 0.5) unique++;
        const uniqueRatio = sh.size ? unique / sh.size : 0;

        const route = c.route.replace(/\/+/g, '/');
        const indeg = inDegree[route] || 0;

        // Venue-specific empty fields (real data gaps, suggested as TODO).
        let venueGaps = null;
        const vm = route.match(/^\/venues\/([^/]+)\/$/);
        if (vm) venueGaps = emptyVenueFields(venueData[vm[1]]);

        const flags = [];
        if (w.length < THIN_WORDS) flags.push('thin');
        if (uniqueRatio < DUP_UNIQUE_RATIO) flags.push('near-duplicate');
        if (indeg <= 1) flags.push('orphan/weak-links');
        if (venueGaps && venueGaps.length) flags.push('empty-data-fields');

        // Recommendation.
        let rec;
        if (w.length < 200 && indeg <= 1) rec = 'PRUNE/CONSOLIDATE';
        else if (uniqueRatio < DUP_UNIQUE_RATIO || w.length < THIN_WORDS) rec = 'DIFFERENTIATE (add unique content)';
        else if (indeg <= 1) rec = 'INTERNAL-LINK (add links from strong pages)';
        else rec = 'MONITOR (re-request indexing after sitewide improvements)';

        // Priority score: lower = fix first. Reward real GSC signal + easy wins.
        const score =
            (c.category === 'crawled_not_indexed' ? 0 : 5) +
            (uniqueRatio) * 10 +
            (w.length / 1000) +
            (indeg * 0.5);

        return { route, category: c.category, words: w.length, uniqueRatio: +uniqueRatio.toFixed(3), inDegree: indeg, venueGaps, flags, rec, score };
    });

    analysed.sort((a, b) => a.score - b.score);
    const top10 = analysed.slice(0, 10);

    // 5. Write report.
    const L = [];
    L.push('# Crawled-Not-Indexed Strategy — thebeatboutique.ie');
    L.push('');
    L.push(`_Generated ${new Date().toISOString()} · ${analysed.length} page(s) analysed_`);
    if (fallback) L.push(`\n> ⚠ No crawled-not-indexed CSV data found — analysed all venue + location template pages as candidates. Export \`crawled-not-indexed.csv\` for the precise GSC list.`);
    if (missing.length) {
        L.push('');
        L.push(`> ${missing.length} candidate URL(s) have no local file (true 404s — handled by Phase 3, not here): ${missing.map(m => '`' + m.route + '`').join(', ')}`);
    }
    L.push('');
    L.push('## Method (no invented facts)');
    L.push('- **Thin** = fewer than ' + THIN_WORDS + ' visible words.');
    L.push('- **Near-duplicate** = under ' + (DUP_UNIQUE_RATIO * 100) + '% of 5-word shingles are non-boilerplate (i.e. most text is shared template).');
    L.push('- **Orphan/weak-links** = linked from ≤1 other page on the site.');
    L.push('- **Empty-data-fields** = existing venues.json fields that are blank (fill with REAL venue knowledge — marked TODO).');
    L.push('');
    L.push('## 🎯 Top 10 to fix first');
    L.push('');
    L.push('| # | Page | Action | Words | Unique | In-links | Flags |');
    L.push('|--:|---|---|--:|--:|--:|---|');
    top10.forEach((p, i) => {
        L.push(`| ${i + 1} | \`${p.route}\` | ${p.rec} | ${p.words} | ${(p.uniqueRatio * 100).toFixed(0)}% | ${p.inDegree} | ${p.flags.join(', ') || '—'} |`);
    });
    L.push('');

    // Per-page TODOs for venue data gaps among the top 10.
    const gapPages = top10.filter(p => p.venueGaps && p.venueGaps.length);
    if (gapPages.length) {
        L.push('### Venue data gaps to fill (existing empty fields — add real facts)');
        L.push('');
        for (const p of gapPages) {
            L.push(`- \`${p.route}\` → fill in venues.json: ${p.venueGaps.map(f => '`' + f + '`').join(', ')}  _(TODO: real venue knowledge)_`);
        }
        L.push('');
    }

    L.push('## Full analysis (all candidates, fix-first order)');
    L.push('');
    L.push('| Page | Category | Action | Words | Unique% | In-links | Flags |');
    L.push('|---|---|---|--:|--:|--:|---|');
    for (const p of analysed) {
        L.push(`| \`${p.route}\` | ${p.category} | ${p.rec} | ${p.words} | ${(p.uniqueRatio * 100).toFixed(0)} | ${p.inDegree} | ${p.flags.join(', ') || '—'} |`);
    }
    L.push('');
    L.push('## Recommended sequence');
    L.push('1. **Internal-link the orphans first** (cheapest win): add contextual links from `/venues/`, `/wedding-band-ireland/`, and relevant `/locations/*` pages.');
    L.push('2. **Differentiate near-duplicates**: expand the unique sections (acoustics, setup, best-for, real reviews) so each page is materially different from the template.');
    L.push('3. **Prune/consolidate** the truly thin pages with no unique angle: 301 them into a parent (e.g. the county `/locations/*` page) rather than leaving them crawled-not-indexed.');
    L.push('4. Re-run `index:inspect` weekly and watch coverage flip to "Submitted and indexed".');
    L.push('');

    fs.writeFileSync(OUT_MD, L.join('\n'));

    console.log(`Analysed ${analysed.length} candidate page(s)${fallback ? ' (fallback: all template pages)' : ''}.`);
    console.log('\nTop 10 to fix first:');
    top10.forEach((p, i) => console.log(`  ${i + 1}. ${p.route}  [${p.rec}]  ${p.words}w, ${(p.uniqueRatio * 100).toFixed(0)}% unique, ${p.inDegree} in-links`));
    console.log(`\n✓ Wrote ${path.relative(ROOT_DIR, OUT_MD)}`);
}

main();
