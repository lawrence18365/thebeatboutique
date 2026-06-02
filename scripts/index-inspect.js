#!/usr/bin/env node
/**
 * Phase 1 — Detector.
 *
 * Builds a master URL list from:
 *   1. CSV exports placed in data/audit/gsc-exports/  (one file per Page Indexing
 *      reason — see that folder's README.md for naming).
 *   2. The site's own sitemap-*.xml files.
 *   3. URLs already present in a previous index-status.json (so we keep watching them).
 *
 * Then runs the Search Console URL Inspection API over the URLs (rate-limited),
 * and writes the merged result to data/audit/index-status.json.
 *
 * The script is non-destructive: it merges into the existing index-status.json,
 * preserves firstSeen timestamps, and by default skips URLs inspected recently
 * (so repeated runs don't burn the 2,000/day quota).
 *
 * Flags:
 *   --max=N          Max URLs to inspect this run (default 200, API daily cap 2000).
 *   --stale-days=N   Re-inspect a URL only if last inspection is older than N days (default 7).
 *   --no-inspect     Skip the API entirely; just (re)build the master list + seed. Useful offline.
 *   --all            Inspect every URL regardless of staleness (still capped by --max).
 *
 * Usage: node scripts/index-inspect.js [flags]
 */

const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

// ── Config ──────────────────────────────────────────────────────────────────
// OAuth credentials are read from the environment so no secret lives in this
// (publicly-deployed, public-repo) file. Set them before a live inspection run:
//   export GSC_CLIENT_ID='<your-id>.apps.googleusercontent.com'
//   export GSC_CLIENT_SECRET='<your-oauth-client-secret>'
// They are only needed for live inspection / token refresh — `--no-inspect` runs
// work without them. The refresh token itself lives in the gitignored .gsc-token.json.
const SITE_URL = 'sc-domain:thebeatboutique.ie';
const ORIGIN = 'https://thebeatboutique.ie';
const CLIENT_ID = process.env.GSC_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GSC_CLIENT_SECRET || '';
const REDIRECT_URI = 'http://localhost:3847';
const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];

const ROOT_DIR = path.join(__dirname, '..');
const TOKEN_PATH = path.join(ROOT_DIR, '.gsc-token.json');
const AUDIT_DIR = path.join(ROOT_DIR, 'data', 'audit');
const EXPORTS_DIR = path.join(AUDIT_DIR, 'gsc-exports');
const STATUS_PATH = path.join(AUDIT_DIR, 'index-status.json');

// Inspection pacing: API allows 600/min. We stay well under at ~1.5/sec.
const DELAY_MS = 700;

// ── Flags ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getFlag = (name, def) => {
    const hit = args.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : def;
};
const MAX = parseInt(getFlag('max', '200'), 10);
const STALE_DAYS = parseInt(getFlag('stale-days', '7'), 10);
const NO_INSPECT = args.includes('--no-inspect');
const INSPECT_ALL = args.includes('--all');

// ── Bucket naming: filename → canonical bucket key ──────────────────────────
function bucketFromFilename(filename) {
    const n = filename.toLowerCase().replace(/\.[^.]+$/, '');
    if (/(404|not.?found)/.test(n)) return 'not_found_404';
    if (/noindex/.test(n)) return 'excluded_noindex';
    if (/(alternate|canonical)/.test(n)) return 'alternate_canonical';
    if (/redirect/.test(n)) return 'page_with_redirect';
    if (/crawled/.test(n)) return 'crawled_not_indexed';
    if (/discovered/.test(n)) return 'discovered_not_indexed';
    if (/(blocked|robots)/.test(n)) return 'blocked_robots';
    if (/(soft.?404)/.test(n)) return 'soft_404';
    return `other:${n}`;
}

// ── URL helpers ─────────────────────────────────────────────────────────────
function toAbsolute(u) {
    if (!u) return null;
    u = u.trim().replace(/^"|"$/g, '');
    if (!u) return null;
    if (u.startsWith('//')) u = 'https:' + u;
    else if (u.startsWith('/')) u = ORIGIN + u;
    else if (!/^https?:\/\//i.test(u)) {
        // Bare domain or path without scheme
        if (u.startsWith(ORIGIN.replace(/^https?:\/\//, ''))) u = 'https://' + u;
        else return null;
    }
    // Force https + canonical host
    try {
        const parsed = new URL(u);
        if (parsed.hostname.replace(/^www\./, '') !== 'thebeatboutique.ie') return null;
        parsed.protocol = 'https:';
        parsed.hostname = 'thebeatboutique.ie';
        parsed.hash = '';
        return parsed.toString();
    } catch (e) {
        return null;
    }
}

// Key used for de-duplication (ignores trailing-slash differences).
function dedupKey(absUrl) {
    return absUrl.replace(/\/+$/, '').toLowerCase();
}

// ── Minimal CSV parser (handles quoted fields with commas) ──────────────────
function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (c === '"') inQuotes = false;
            else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n' || c === '\r') {
            if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
            if (c === '\r' && text[i + 1] === '\n') i++;
        } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows;
}

// Extract absolute URLs from a parsed CSV (find the column that looks like URLs).
function urlsFromCsv(text) {
    const rows = parseCsv(text).filter(r => r.some(c => c && c.trim()));
    if (!rows.length) return [];
    const found = [];
    // Skip header row if it has no URL-looking cell.
    const startIdx = rows[0].some(c => /^https?:\/\//i.test(c.trim()) || c.trim().startsWith('/')) ? 0 : 1;
    for (let i = startIdx; i < rows.length; i++) {
        for (const cell of rows[i]) {
            const abs = toAbsolute(cell);
            if (abs) { found.push(abs); break; }
        }
    }
    return found;
}

function readCsvExports() {
    const map = {}; // absUrl -> Set of buckets
    if (!fs.existsSync(EXPORTS_DIR)) return { map, files: [] };
    const files = fs.readdirSync(EXPORTS_DIR).filter(f => f.toLowerCase().endsWith('.csv'));
    for (const file of files) {
        const bucket = bucketFromFilename(file);
        const urls = urlsFromCsv(fs.readFileSync(path.join(EXPORTS_DIR, file), 'utf8'));
        for (const u of urls) {
            (map[u] = map[u] || new Set()).add(bucket);
        }
    }
    return { map, files };
}

// ── Sitemap URLs (local files) ──────────────────────────────────────────────
function readSitemapUrls() {
    const urls = new Set();
    const files = fs.readdirSync(ROOT_DIR).filter(f => /^sitemap.*\.xml$/i.test(f));
    for (const file of files) {
        const text = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
        const matches = text.match(/<loc>\s*([^<\s]+)\s*<\/loc>/gi) || [];
        for (const m of matches) {
            const loc = m.replace(/<\/?loc>/gi, '').trim();
            if (/\.xml$/i.test(loc)) continue; // sitemap index entries
            const abs = toAbsolute(loc);
            if (abs) urls.add(abs);
        }
    }
    return urls;
}

// ── Seed from a previous full inspection dump (gsc-indexing-*.json) ──────────
function readSeed() {
    const seed = {};
    if (!fs.existsSync(AUDIT_DIR)) return seed;
    const dumps = fs.readdirSync(AUDIT_DIR)
        .filter(f => /^gsc-indexing-.*\.json$/i.test(f) && !/batch/i.test(f))
        .sort();
    for (const file of dumps) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(AUDIT_DIR, file), 'utf8'));
            const results = data.results || [];
            for (const r of results) {
                const abs = toAbsolute(r.url);
                if (!abs) continue;
                seed[dedupKey(abs)] = {
                    url: abs,
                    verdict: r.verdict || null,
                    coverageState: r.coverageState || null,
                    robotsTxtState: r.robotsTxtState || null,
                    indexingState: r.indexingState || null,
                    pageFetchState: r.pageFetchState || null,
                    googleCanonical: r.googleCanonical || null,
                    userCanonical: r.userCanonical || null,
                    lastCrawlTime: r.lastCrawlTime || null,
                    inSitemap: Array.isArray(r.sitemap) && r.sitemap.length > 0,
                    inspectedAt: data.generatedAt || null,
                    source: 'seed:' + file,
                };
            }
        } catch (e) { /* ignore malformed seed */ }
    }
    return seed;
}

// ── Auth (token-first, browser fallback like audit-search-console.js) ───────
function buildOauth() {
    return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
}

async function authenticate(oauth2Client) {
    if (!CLIENT_ID || !CLIENT_SECRET) {
        console.warn('GSC_CLIENT_ID / GSC_CLIENT_SECRET not set — skipping live inspection.');
        console.warn('  export them, then re-run, or use --no-inspect to build from CSV/sitemap only.');
        return false;
    }
    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oauth2Client.setCredentials(token);
        oauth2Client.on('tokens', (t) => {
            fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...token, ...t }, null, 2));
        });
        try {
            await oauth2Client.getAccessToken();
            console.log('Using cached GSC token.');
            return true;
        } catch (e) {
            console.warn('Cached token invalid/expired.');
        }
    }
    // Only attempt interactive auth on a TTY; otherwise degrade gracefully.
    if (!process.stdout.isTTY) {
        console.warn('No valid token and not a TTY — skipping live inspection.');
        return false;
    }
    return browserAuth(oauth2Client);
}

function browserAuth(oauth2Client) {
    return new Promise((resolve) => {
        const authUrl = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: SCOPES, prompt: 'consent' });
        const server = http.createServer(async (req, res) => {
            const qs = url.parse(req.url, true).query;
            if (qs.code) {
                res.end('<h2>Authenticated. You can close this tab.</h2>');
                server.close();
                try {
                    const { tokens } = await oauth2Client.getToken(qs.code);
                    oauth2Client.setCredentials(tokens);
                    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
                    console.log('Authenticated and token cached.');
                    resolve(true);
                } catch (err) { console.error(err); resolve(false); }
            }
        });
        server.listen(3847, () => { console.log('\nOpening browser for Google auth...\n'); exec(`open "${authUrl}"`); });
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function inspectUrl(searchconsole, absUrl) {
    const res = await searchconsole.urlInspection.index.inspect({
        requestBody: { inspectionUrl: absUrl, siteUrl: SITE_URL, languageCode: 'en-US' },
    });
    const r = (res.data.inspectionResult && res.data.inspectionResult.indexStatusResult) || {};
    return {
        verdict: r.verdict || null,
        coverageState: r.coverageState || null,
        robotsTxtState: r.robotsTxtState || null,
        indexingState: r.indexingState || null,
        pageFetchState: r.pageFetchState || null,
        googleCanonical: r.googleCanonical || null,
        userCanonical: r.userCanonical || null,
        lastCrawlTime: r.lastCrawlTime || null,
        inSitemap: Array.isArray(r.sitemap) && r.sitemap.length > 0,
    };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
    if (!fs.existsSync(AUDIT_DIR)) fs.mkdirSync(AUDIT_DIR, { recursive: true });

    // 1. Load existing status (merge base).
    let status = { generatedAt: null, urls: {} };
    if (fs.existsSync(STATUS_PATH)) {
        try { status = JSON.parse(fs.readFileSync(STATUS_PATH, 'utf8')); } catch (e) {}
    }
    status.urls = status.urls || {};

    // 2. Seed from prior full dumps if we have no record for those URLs yet.
    const seed = readSeed();
    for (const [key, rec] of Object.entries(seed)) {
        if (!status.urls[key]) {
            status.urls[key] = { ...rec, buckets: [], firstSeen: rec.inspectedAt };
        }
    }

    // 3. CSV exports → buckets.
    const { map: csvMap, files: csvFiles } = readCsvExports();
    for (const [absUrl, buckets] of Object.entries(csvMap)) {
        const key = dedupKey(absUrl);
        const rec = status.urls[key] || (status.urls[key] = { url: absUrl, buckets: [] });
        rec.url = rec.url || absUrl;
        rec.buckets = Array.from(new Set([...(rec.buckets || []), ...buckets]));
        rec.firstSeen = rec.firstSeen || new Date().toISOString();
    }

    // 4. Sitemap URLs.
    const sitemapUrls = readSitemapUrls();
    for (const absUrl of sitemapUrls) {
        const key = dedupKey(absUrl);
        const rec = status.urls[key] || (status.urls[key] = { url: absUrl, buckets: [] });
        rec.inSitemapLocal = true;
        rec.firstSeen = rec.firstSeen || new Date().toISOString();
        if (!(rec.buckets || []).length && !rec.coverageState) rec.buckets = ['sitemap'];
    }

    const totalUrls = Object.keys(status.urls).length;
    console.log(`Master URL list: ${totalUrls} URLs`);
    console.log(`  CSV exports:    ${csvFiles.length} file(s) — ${Object.keys(csvMap).length} URLs`);
    console.log(`  Sitemap URLs:   ${sitemapUrls.size}`);
    console.log(`  Seeded records: ${Object.keys(seed).length}`);

    if (csvFiles.length === 0) {
        console.warn(`\n  ⚠  No CSVs in ${path.relative(ROOT_DIR, EXPORTS_DIR)}/ — see its README.md.`);
        console.warn(`     Running on sitemap + seed only (404/noindex URLs need the CSV exports).`);
    }

    // 5. Inspect.
    if (!NO_INSPECT) {
        const oauth2Client = buildOauth();
        const authed = await authenticate(oauth2Client);
        if (authed) {
            const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2Client });
            const now = Date.now();
            const staleMs = STALE_DAYS * 86400000;
            const candidates = Object.values(status.urls).filter(rec => {
                if (INSPECT_ALL) return true;
                if (!rec.inspectedAt) return true;
                return (now - Date.parse(rec.inspectedAt)) > staleMs;
            }).slice(0, MAX);

            console.log(`\nInspecting ${candidates.length} URL(s) (max=${MAX}, stale-days=${STALE_DAYS})...`);
            let done = 0, errors = 0;
            for (const rec of candidates) {
                try {
                    const result = await inspectUrl(searchconsole, rec.url);
                    Object.assign(rec, result, { inspectedAt: new Date().toISOString() });
                    done++;
                    if (done % 10 === 0) console.log(`  ...${done}/${candidates.length}`);
                } catch (e) {
                    errors++;
                    const code = e.code || e.response?.status;
                    if (code === 429) { console.warn('  Rate/quota limit hit — stopping inspection early.'); break; }
                    console.warn(`  inspect failed for ${rec.url}: ${e.message || code}`);
                }
                await sleep(DELAY_MS);
            }
            console.log(`Inspected ${done}, errors ${errors}.`);
        } else {
            console.warn('Skipped live inspection (no auth). Re-run on a terminal to authorise.');
        }
    } else {
        console.log('\n--no-inspect: skipped API calls.');
    }

    // 6. Write merged status.
    status.generatedAt = new Date().toISOString();
    status.siteUrl = SITE_URL;
    fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
    console.log(`\n✓ Wrote ${path.relative(ROOT_DIR, STATUS_PATH)} (${Object.keys(status.urls).length} URLs)`);
}

main().catch(e => { console.error('Fatal:', e.message || e); process.exit(1); });
