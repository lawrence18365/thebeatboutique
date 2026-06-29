// Capture a dated SEO baseline from data/audit/gsc-data.json so the venue-rework
// hypothesis (band-intent pages lift venue-page CTR; better county positions) can
// be measured against a fixed reference ~4 weeks later.
//
// Usage:
//   node scripts/seo-baseline.js              # writes data/audit/seo-baseline-<pull-end-date>.{json,md}
//   const { extract } = require('./seo-baseline')   # reused by seo-compare.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const counties = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/counties.json'), 'utf8'));
const countyNames = counties.map((c) => c.name.toLowerCase());

const round = (n, d = 1) => Number(n.toFixed(d));
const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
const wpos = (a) => { const i = sum(a, 'impressions'); return i ? a.reduce((s, x) => s + x.position * x.impressions, 0) / i : 0; };
const stripHost = (u) => u.replace('https://thebeatboutique.ie', '').replace('https://www.thebeatboutique.ie', '[www]');

const countyRe = new RegExp(`wedding bands?\\b.*\\b(${countyNames.join('|')})\\b|\\b(${countyNames.join('|')})\\b.*wedding band`, 'i');
const pricingRe = /(cost|price|pricing|how much).*(band|dj)|wedding band.*(cost|price|pricing)/i;

const mapRow = (x, key) => ({ [key]: key === 'page' ? stripHost(x.page) : x.query, clicks: x.clicks, impressions: x.impressions, ctr: round(x.ctr, 4), position: round(x.position) });

// Pull the metrics the hypothesis cares about out of a raw gsc-data.json object.
function extract(gsc) {
  const q = gsc.queries || [];
  const pages = gsc.pages || [];
  const venuePages = pages.filter((p) => /\/venues\//.test(p.page)).map((p) => mapRow(p, 'page')).sort((a, b) => b.impressions - a.impressions);
  const countyTerms = q.filter((x) => countyRe.test(x.query)).map((x) => mapRow(x, 'query')).sort((a, b) => b.impressions - a.impressions);
  const pricingTerms = q.filter((x) => pricingRe.test(x.query)).map((x) => mapRow(x, 'query')).sort((a, b) => b.impressions - a.impressions);
  return {
    dateRange: gsc.dateRange,
    totals: { clicks: sum(q, 'clicks'), impressions: sum(q, 'impressions'), ctr: round(sum(q, 'clicks') / sum(q, 'impressions'), 4), avgPosition: round(wpos(q)) },
    venueAggregate: {
      pages: venuePages.length,
      clicks: sum(venuePages, 'clicks'),
      impressions: sum(venuePages, 'impressions'),
      ctr: round(sum(venuePages, 'clicks') / Math.max(1, sum(venuePages, 'impressions')), 4),
      avgPosition: round(wpos(venuePages)),
    },
    venuePages,
    countyTerms,
    pricingTerms,
  };
}

function toMarkdown(b) {
  const tbl = (rows, key) => ['| ' + key + ' | clicks | impr | ctr | pos |', '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r[key]} | ${r.clicks} | ${r.impressions} | ${(r.ctr * 100).toFixed(1)}% | ${r.position} |`)].join('\n');
  return `# SEO Baseline — ${b.dateRange.start} to ${b.dateRange.end}

Captured to measure the venue-rework hypothesis (band-intent venue pages lift CTR;
county commercial terms improve position).

## Site totals
clicks ${b.totals.clicks} · impressions ${b.totals.impressions} · CTR ${(b.totals.ctr * 100).toFixed(2)}% · avg pos ${b.totals.avgPosition}

## Venue pages (aggregate) — the primary KPI
pages ${b.venueAggregate.pages} · clicks ${b.venueAggregate.clicks} · impressions ${b.venueAggregate.impressions} · **CTR ${(b.venueAggregate.ctr * 100).toFixed(2)}%** · avg pos ${b.venueAggregate.avgPosition}

## Venue pages (per page)
${tbl(b.venuePages, 'page')}

## County commercial terms
${tbl(b.countyTerms, 'query')}

## Pricing cluster
${tbl(b.pricingTerms, 'query')}
`;
}

module.exports = { extract, toMarkdown };

if (require.main === module) {
  const gscPath = path.join(ROOT, 'data/audit/gsc-data.json');
  const gsc = JSON.parse(fs.readFileSync(gscPath, 'utf8'));
  const b = extract(gsc);
  const stamp = b.dateRange.end; // tie the baseline name to the data window, not wall-clock
  const base = path.join(ROOT, 'data/audit', `seo-baseline-${stamp}`);
  fs.writeFileSync(`${base}.json`, JSON.stringify(b, null, 2) + '\n');
  fs.writeFileSync(`${base}.md`, toMarkdown(b));
  console.log(`Baseline written: data/audit/seo-baseline-${stamp}.json + .md`);
  console.log(`Window ${b.dateRange.start}..${b.dateRange.end} | venue pages: ${b.venueAggregate.pages} (CTR ${(b.venueAggregate.ctr * 100).toFixed(2)}%) | county terms: ${b.countyTerms.length} | pricing terms: ${b.pricingTerms.length}`);
}
