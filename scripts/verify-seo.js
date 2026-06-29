// SEO consistency checks. Run: node scripts/verify-seo.js
// Verifies canonical host/slash policy, sitemap<->canonical agreement,
// no stock (unsplash) imagery, no malformed og:image, and that venue
// internal links to county pages resolve to real directories.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HOST = 'https://thebeatboutique.ie';
let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

const read = (p) => fs.readFileSync(p, 'utf8');
const exists = (p) => fs.existsSync(p);

function listPageDirs(base) {
  const dir = path.join(ROOT, base);
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && exists(path.join(dir, d.name, 'index.html')))
    .map((d) => ({ slug: d.name, file: path.join(dir, d.name, 'index.html'), url: `${HOST}/${base}/${d.name}/` }));
}

// 1. Canonical host + trailing-slash policy
console.log('\n[1] Canonical host + trailing-slash policy');
const allPages = [...listPageDirs('venues'), ...listPageDirs('locations')];
for (const p of allPages) {
  const html = read(p.file);
  const m = html.match(/<link rel="canonical" href="([^"]+)"/);
  if (!m) { fail(`${p.slug}: no canonical tag`); continue; }
  const c = m[1];
  if (c.startsWith('https://www.')) fail(`${p.slug}: canonical uses www (${c})`);
  if (!c.startsWith(HOST + '/')) fail(`${p.slug}: canonical wrong host (${c})`);
  if (!c.endsWith('/')) fail(`${p.slug}: canonical missing trailing slash (${c})`);
}
if (failures === 0) ok(`${allPages.length} venue/location canonicals: non-www + trailing slash`);

// 2. og:image well-formed (guards the resolveOgImage missing-slash bug)
console.log('\n[2] og:image well-formed');
let ogBad = 0;
for (const p of allPages) {
  const html = read(p.file);
  const m = html.match(/<meta property="og:image" content="([^"]+)"/);
  if (!m) { fail(`${p.slug}: no og:image`); ogBad++; continue; }
  if (!/^https:\/\/thebeatboutique\.ie\/[a-z]/.test(m[1])) { fail(`${p.slug}: malformed og:image (${m[1]})`); ogBad++; }
}
if (ogBad === 0) ok(`${allPages.length} og:image URLs well-formed`);

// 3. Sitemap <-> canonical agreement
console.log('\n[3] Sitemap <-> canonical agreement');
const venueSitemap = read(path.join(ROOT, 'sitemap-venues.xml'));
const locSitemap = read(path.join(ROOT, 'sitemap-locations.xml'));
const locsInSitemap = new Set([...locSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
const venuesInSitemap = new Set([...venueSitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
let smMiss = 0;
for (const p of listPageDirs('venues')) if (!venuesInSitemap.has(p.url)) { fail(`venue not in sitemap: ${p.url}`); smMiss++; }
for (const p of listPageDirs('locations')) if (!locsInSitemap.has(p.url)) { fail(`location not in sitemap: ${p.url}`); smMiss++; }
if (smMiss === 0) ok('every venue + location page present in its sitemap');

// 4. No stock (unsplash) imagery in generated pages or data
console.log('\n[4] No unsplash stock imagery');
let uns = 0;
for (const p of allPages) if (read(p.file).includes('images.unsplash.com')) { fail(`unsplash in ${p.slug}`); uns++; }
for (const dataFile of ['data/counties.json', 'data/venues.json']) {
  if (read(path.join(ROOT, dataFile)).includes('images.unsplash.com')) { fail(`unsplash in ${dataFile}`); uns++; }
}
if (uns === 0) ok('no unsplash references in venue/location pages or data');

// 5. Venue -> county internal links resolve to real directories
console.log('\n[5] Venue -> county internal links resolve');
let brokenLinks = 0;
for (const p of listPageDirs('venues')) {
  const html = read(p.file);
  for (const m of html.matchAll(/href="locations\/(wedding-band-[a-z]+)\//g)) {
    if (!exists(path.join(ROOT, 'locations', m[1], 'index.html'))) { fail(`${p.slug}: dead county link locations/${m[1]}/`); brokenLinks++; }
  }
}
if (brokenLinks === 0) ok('all venue->county links resolve');

// 6. Venue titles use booking intent (no "Guide" framing)
console.log('\n[6] Venue titles use booking intent');
let titleBad = 0;
for (const p of listPageDirs('venues')) {
  const m = read(p.file).match(/<title>([^<]*)<\/title>/);
  if (!m) { fail(`${p.slug}: no <title>`); titleBad++; continue; }
  if (/\bGuide\b/.test(m[1])) { fail(`${p.slug}: title still says "Guide" (${m[1]})`); titleBad++; }
  if (!/^Wedding Band for /.test(m[1])) { fail(`${p.slug}: title not booking-intent (${m[1]})`); titleBad++; }
}
if (titleBad === 0) ok('all venue titles are "Wedding Band for [Venue] | Beat Boutique"');

// 7. Venue "About" copy is grammatically safe (no "[Venue] is couples ..." etc.)
console.log('\n[7] Venue About copy grammar');
const BAD_GRAMMAR = [
  /\bis couples\b/i,
  /\bis couples who\b/i,
  /\bis couples looking\b/i,
  /\bis couples wanting\b/i,
  /\bis (?:[a-z-]+\s+){0,2}weddings\b/i, // "is larger weddings", "is fairytale weddings"
];
let grammarBad = 0;
for (const p of listPageDirs('venues')) {
  const m = read(p.file).match(/<h2>About[^<]*<\/h2>\s*<p>([\s\S]*?)<\/p>/);
  if (!m) continue;
  const text = m[1].replace(/<[^>]*>/g, '');
  for (const rx of BAD_GRAMMAR) {
    if (rx.test(text)) { fail(`${p.slug}: awkward About copy matched ${rx} — "${text.slice(0, 90)}..."`); grammarBad++; break; }
  }
}
if (grammarBad === 0) ok('all venue About copy is grammatically safe');

// 8. Money page (/pricing-guide/) carries price + FAQ structured data
console.log('\n[8] /pricing-guide/ has price + FAQ schema');
const pgPath = path.join(ROOT, 'pricing-guide', 'index.html');
if (!exists(pgPath)) {
  fail('/pricing-guide/ missing');
} else {
  const m = read(pgPath).match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  let graph = [];
  try { graph = (JSON.parse(m[1])['@graph']) || []; } catch (e) { fail(`/pricing-guide/ JSON-LD does not parse: ${e.message}`); }
  const offer = graph.find((n) => n['@type'] === 'Service' && n.offers && /Offer/.test(n.offers['@type']));
  const faq = graph.some((n) => n['@type'] === 'FAQPage');
  if (!offer) fail('/pricing-guide/ missing Service/AggregateOffer price schema');
  else if (!(offer.offers.lowPrice && offer.offers.priceCurrency)) fail('/pricing-guide/ offer missing lowPrice/priceCurrency');
  if (!faq) fail('/pricing-guide/ missing FAQPage schema');
  if (offer && faq) ok('/pricing-guide/ has AggregateOffer (price) + FAQPage');
}

console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${failures} problem(s)\n`);
process.exit(failures === 0 ? 0 : 1);
