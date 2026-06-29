// Deep-dive GSC opportunity analysis: intent split, CTR-gap commercial targets,
// cannibalization, and per-money-page query breakdown.
// Run: node scripts/seo-keyword-analysis.js  -> writes data/audit/keyword-opportunity-<end>.md
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/audit/gsc-data.json'), 'utf8'));
const q = d.queries, qp = d.queryPages;
const brand = /beat ?boutique|the beat|tbb|botique|boutiqu/i;
const sum = (a, k) => a.reduce((s, x) => s + (x[k] || 0), 0);
const wpos = (a) => { const i = sum(a, 'impressions'); return i ? a.reduce((s, x) => s + x.position * x.impressions, 0) / i : 0; };
const EXP = {1:.28,2:.15,3:.11,4:.08,5:.06,6:.05,7:.042,8:.035,9:.03,10:.025,11:.02,12:.018,13:.015,14:.013,15:.012};
const exp = (p) => EXP[Math.max(1, Math.min(15, Math.round(p)))] || .01;
const out = [];
const p = (s) => { out.push(s); console.log(s); };

p('# Keyword opportunity — ' + d.dateRange.start + ' to ' + d.dateRange.end + '\n');
const commercial = /wedding bands?|hire|cost|price|package|how much|booking|book a/i;
const info = /first dance|songs?|playlist|lyrics|timeline|vs dj|how to|when to|questions/i;
const C = q.filter((x) => !brand.test(x.query) && commercial.test(x.query) && !info.test(x.query));
const I = q.filter((x) => !brand.test(x.query) && info.test(x.query));
p('## Intent split (non-branded)');
p('- COMMERCIAL: ' + sum(C, 'impressions') + ' impr, ' + sum(C, 'clicks') + ' clicks, wpos ' + wpos(C).toFixed(1));
p('- INFORMATIONAL: ' + sum(I, 'impressions') + ' impr, ' + sum(I, 'clicks') + ' clicks, wpos ' + wpos(I).toFixed(1) + '\n');

p('## CTR-gap commercial targets (non-branded, pos<=15, impr>=60) — score = impr*(exp-act)');
q.filter((x) => !brand.test(x.query) && commercial.test(x.query) && !info.test(x.query) && x.position <= 15 && x.impressions >= 60)
  .map((x) => ({ q: x.query, impr: x.impressions, pos: +x.position.toFixed(1), ctr: x.ctr, score: Math.round(x.impressions * Math.max(0, exp(x.position) - x.ctr)) }))
  .sort((a, b) => b.score - a.score)
  .forEach((x) => p('- [' + x.score + '] "' + x.q + '"  impr ' + x.impr + ' pos ' + x.pos + ' ctr ' + (x.ctr * 100).toFixed(1) + '% (exp ' + (exp(x.pos) * 100).toFixed(0) + '%)'));

p('\n## Cannibalization (query impr>=60, 2+ pages each with >=5 impr)');
const byQ = {};
qp.forEach((x) => { (byQ[x.query] = byQ[x.query] || []).push(x); });
Object.entries(byQ).filter(([k, v]) => !brand.test(k) && v.reduce((s, x) => s + x.impressions, 0) >= 60 && v.filter((x) => x.impressions >= 5).length >= 2)
  .sort((a, b) => b[1].reduce((s, x) => s + x.impressions, 0) - a[1].reduce((s, x) => s + x.impressions, 0)).slice(0, 8)
  .forEach(([k, v]) => { p('- "' + k + '":'); v.sort((a, b) => b.impressions - a.impressions).slice(0, 4).forEach((x) => p('    ' + x.impressions + ' impr pos ' + x.position.toFixed(1) + ' clk ' + x.clicks + '  ' + x.page.replace('https://thebeatboutique.ie', '').replace('https://www.thebeatboutique.ie', '[www]'))); });

p('\n## /pricing-guide/ query breakdown');
qp.filter((x) => /\/pricing-guide/.test(x.page)).sort((a, b) => b.impressions - a.impressions).slice(0, 12)
  .forEach((x) => p('- ' + x.impressions + ' impr pos ' + x.position.toFixed(1) + ' ctr ' + (x.ctr * 100).toFixed(1) + '% clk ' + x.clicks + '  "' + x.query + '"'));

fs.writeFileSync(path.join(ROOT, 'data/audit', 'keyword-opportunity-' + d.dateRange.end + '.md'), out.join('\n') + '\n');
console.log('\n[saved data/audit/keyword-opportunity-' + d.dateRange.end + '.md]');
