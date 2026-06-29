// Compare a fresh GSC pull against a saved baseline to measure the venue rework.
// Reuses the exact extraction logic from seo-baseline.js so metrics are apples-to-apples.
//
// Usage:
//   node scripts/seo-compare.js [baselineJson] [currentGscJson]
// Defaults: newest data/audit/seo-baseline-*.json  vs  data/audit/gsc-data.json
//
// NOTE on windows: gsc-pull.js pulls 12 months. The venue rework deployed
// 2026-06-27, so for a sensitive read, re-pull a SHORT window before comparing
// (the script prints both windows so you can interpret the delta correctly).

const fs = require('fs');
const path = require('path');
const { extract } = require('./seo-baseline');

const ROOT = path.join(__dirname, '..');
const pct = (n) => `${(n * 100).toFixed(2)}%`;
const signed = (n, d = 1) => `${n >= 0 ? '+' : ''}${n.toFixed(d)}`;
const signedPct = (n) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)}pp`;

function newestBaseline() {
  const dir = path.join(ROOT, 'data/audit');
  const files = fs.readdirSync(dir).filter((f) => /^seo-baseline-.*\.json$/.test(f)).sort();
  if (!files.length) throw new Error('No seo-baseline-*.json found. Run: node scripts/seo-baseline.js');
  return path.join(dir, files[files.length - 1]);
}

const baselinePath = process.argv[2] || newestBaseline();
const currentPath = process.argv[3] || path.join(ROOT, 'data/audit/gsc-data.json');

const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const cur = extract(JSON.parse(fs.readFileSync(currentPath, 'utf8')));

console.log(`\nBaseline window:  ${base.dateRange.start} .. ${base.dateRange.end}  (${path.basename(baselinePath)})`);
console.log(`Current window:   ${cur.dateRange.start} .. ${cur.dateRange.end}  (${path.basename(currentPath)})`);
if (base.dateRange.start !== cur.dateRange.start) {
  console.log('!! windows differ — read deltas as directional, not exact (see note in script header).');
}

console.log('\n=== PRIMARY KPI: venue pages aggregate ===');
const bA = base.venueAggregate, cA = cur.venueAggregate;
console.log(`CTR:       ${pct(bA.ctr)}  ->  ${pct(cA.ctr)}   (${signedPct(cA.ctr - bA.ctr)})`);
console.log(`avg pos:   ${bA.avgPosition}  ->  ${cA.avgPosition}   (${signed(bA.avgPosition - cA.avgPosition)} = lower is better)`);
console.log(`clicks:    ${bA.clicks}  ->  ${cA.clicks}     impressions: ${bA.impressions} -> ${cA.impressions}`);

const byKey = (arr, key) => new Map(arr.map((r) => [r[key], r]));

console.log('\n=== Venue pages: biggest CTR movers ===');
const bV = byKey(base.venuePages, 'page');
const moves = cur.venuePages
  .filter((c) => bV.has(c.page) && (c.impressions >= 50 || bV.get(c.page).impressions >= 50))
  .map((c) => ({ page: c.page, dCtr: c.ctr - bV.get(c.page).ctr, was: bV.get(c.page).ctr, now: c.ctr, dPos: bV.get(c.page).position - c.position }))
  .sort((a, b) => b.dCtr - a.dCtr);
for (const m of [...moves.slice(0, 8), ...moves.slice(-3)]) {
  console.log(`  ${signedPct(m.dCtr).padStart(8)} CTR (${pct(m.was)}->${pct(m.now)})  pos ${signed(m.dPos)}   ${m.page}`);
}

console.log('\n=== County commercial terms: position movers ===');
const bC = byKey(base.countyTerms, 'query');
const cMoves = cur.countyTerms
  .filter((c) => bC.has(c.query) && (c.impressions >= 20 || bC.get(c.query).impressions >= 20))
  .map((c) => ({ query: c.query, dPos: bC.get(c.query).position - c.position, was: bC.get(c.query).position, now: c.position }))
  .sort((a, b) => b.dPos - a.dPos);
for (const m of [...cMoves.slice(0, 8), ...cMoves.slice(-3)]) {
  console.log(`  pos ${signed(m.dPos).padStart(6)} (${m.was}->${m.now})   ${m.query}`);
}

console.log('\nVerdict cue: hypothesis holds if venue aggregate CTR rises meaningfully above ' + pct(bA.ctr) + ' and county positions trend down (improve).\n');
