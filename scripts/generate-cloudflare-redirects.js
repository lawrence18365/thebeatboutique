// Generates an edge-level redirect set for Cloudflare, because this project's
// _redirects file is NOT honored by the Pages deployment (verified: a fileless
// probe path 404'd instead of redirecting). Cloudflare Bulk Redirects / Redirect
// Rules run at the edge BEFORE Pages serves anything, so they produce true 301s
// and make the meta-refresh stub pages redundant.
//
// Source of truth: data/legacy-redirects.json + the counties in data/counties.json
// (pattern /wedding-band-<slug>/ -> /locations/wedding-band-<slug>/).
//
// Output:
//   output/cloudflare-bulk-redirects.csv  -> upload as a Bulk Redirect List
//   (stdout) a dynamic Redirect Rule expression that covers the county family
//
// Run: node scripts/generate-cloudflare-redirects.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOST = 'https://thebeatboutique.ie';
const OUT_DIR = path.join(ROOT, 'output');
const OUT_CSV = path.join(OUT_DIR, 'cloudflare-bulk-redirects.csv');

const withSlash = (p) => {
  if (!p || p === '/') return '/';
  const lead = p.startsWith('/') ? p : `/${p}`;
  return lead.endsWith('/') ? lead : `${lead}/`;
};

// Build the from->to map (paths, slash-normalized).
const legacy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/legacy-redirects.json'), 'utf8'));
const counties = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/counties.json'), 'utf8'));

const map = new Map();
for (const e of legacy) {
  const from = withSlash(e.from);
  const to = withSlash(e.to);
  if (from !== to) map.set(from, to);
}
for (const c of counties) {
  const from = withSlash(`/wedding-band-${c.slug}`);
  const to = withSlash(`/locations/wedding-band-${c.slug}`);
  if (from !== to) map.set(from, to);
}

// Resolve transitive chains so every source points at its FINAL target.
const resolve = (target, seen = new Set()) => {
  let t = target;
  while (map.has(t) && !seen.has(t)) { seen.add(t); t = map.get(t); }
  return t;
};

// Emit both trailing-slash and no-slash source variants (avoids an auto-slash hop).
const rows = [];
const sourcesSeen = new Set();
for (const [from] of [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  const finalTo = resolve(from);
  const variants = from === '/' ? ['/'] : [from, from.slice(0, -1)];
  for (const v of variants) {
    if (sourcesSeen.has(v)) continue;
    sourcesSeen.add(v);
    rows.push({ source: `${HOST}${v}`, target: `${HOST}${finalTo}`, status: 301 });
  }
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const csv = ['source,target,status', ...rows.map((r) => `${r.source},${r.target},${r.status}`)].join('\n') + '\n';
fs.writeFileSync(OUT_CSV, csv);

console.log(`Wrote ${rows.length} redirect rows to ${path.relative(ROOT, OUT_CSV)}`);
console.log(`(${map.size} unique paths x slash/no-slash variants)\n`);

// PRIMARY recommendation: upload output/cloudflare-bulk-redirects.csv as a Bulk
// Redirect List. It is complete and correct (includes the /wedding-band-prices ->
// /pricing-guide/ exception) and needs no per-rule logic.
//
// OPTIONAL: the county family can instead be one dynamic Redirect Rule. NOTE the
// regex below intentionally lists real county slugs, because a broad
// "^/wedding-band-[a-z]+/?$" would also catch /wedding-band-prices (which must go
// to /pricing-guide/, NOT a nonexistent /locations/wedding-band-prices/), and
// Cloudflare's RE2 engine has no negative lookahead to exclude it.
const countyAlternation = counties.map((c) => c.slug).join('|');
console.log('--- Optional Cloudflare Redirect Rule for the county family ---');
console.log('If incoming requests match (Dashboard > Rules > Redirect Rules):');
console.log(`  (http.host eq "thebeatboutique.ie" and http.request.uri.path matches "^/wedding-band-(${countyAlternation})/?$")`);
console.log('Then > Dynamic redirect > 301 > expression:');
console.log('  concat("https://thebeatboutique.ie/locations", http.request.uri.path, "/")');
console.log('  (enable "preserve query string"; maps /wedding-band-cork -> /locations/wedding-band-cork/)');
console.log('Keep the /wedding-band-prices row from the CSV/List regardless — it is the exception.');
