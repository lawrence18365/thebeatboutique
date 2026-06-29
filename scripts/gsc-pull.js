// GSC pull with modern loopback OAuth (OOB flow was shut down by Google in 2023).
// Usage: node scripts/gsc-pull.js
// Opens a browser for consent the first time, captures the code on localhost,
// saves the token to .gsc-token.json, then pulls 12 months of Search Console data.

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');

const SITE_URL = 'sc-domain:thebeatboutique.ie';
const TOKEN_PATH = path.join(__dirname, '..', '.gsc-token.json');
const OUT_DIR = path.join(__dirname, '..', 'data', 'audit');

// OAuth client creds come from a gitignored file (or env), never hardcoded.
// Create .gsc-oauth.json at repo root: { "client_id": "...", "client_secret": "..." }
function loadOauthCreds() {
  if (process.env.GSC_CLIENT_ID && process.env.GSC_CLIENT_SECRET) {
    return { client_id: process.env.GSC_CLIENT_ID, client_secret: process.env.GSC_CLIENT_SECRET };
  }
  const cfgPath = path.join(__dirname, '..', '.gsc-oauth.json');
  if (fs.existsSync(cfgPath)) return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  console.error('Missing OAuth creds. Set GSC_CLIENT_ID/GSC_CLIENT_SECRET or create .gsc-oauth.json');
  process.exit(1);
}
const { client_id: CLIENT_ID, client_secret: CLIENT_SECRET } = loadOauthCreds();
const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const PORT = 4096;
const REDIRECT_URI = `http://localhost:${PORT}`;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
const searchconsole = google.webmasters({ version: 'v3', auth: oauth2Client });

function saveToken(token) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

function loopbackAuth() {
  return new Promise((resolve, reject) => {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URI);
        const code = url.searchParams.get('code');
        const err = url.searchParams.get('error');
        if (err) {
          res.end(`Authorization failed: ${err}. You can close this tab.`);
          server.close();
          return reject(new Error(err));
        }
        if (!code) { res.end('Waiting for authorization code...'); return; }
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        saveToken(tokens);
        res.end('Authorized. You can close this tab and return to the terminal.');
        server.close();
        resolve();
      } catch (e) {
        res.end('Error exchanging code. Check the terminal.');
        server.close();
        reject(e);
      }
    });

    server.listen(PORT, () => {
      console.log('\n======================================================');
      console.log('Opening your browser to authorize Search Console access.');
      console.log('If it does not open, paste this URL manually:\n');
      console.log(authUrl);
      console.log('======================================================\n');
      const opener = process.platform === 'darwin' ? 'open'
        : process.platform === 'win32' ? 'start' : 'xdg-open';
      exec(`${opener} "${authUrl}"`);
    });
  });
}

async function authenticate() {
  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oauth2Client.setCredentials(token);
    oauth2Client.on('tokens', (t) => saveToken({ ...token, ...t }));
    try {
      await oauth2Client.getAccessToken();
      console.log('Using saved token.');
      return;
    } catch (e) {
      console.log('Saved token expired/revoked. Re-authenticating in browser...');
    }
  }
  await loopbackAuth();
}

async function queryGSC(dimensions, startDate, endDate, rowLimit = 25000) {
  const rows = [];
  let startRow = 0;
  // Paginate so we capture the full long tail, not just the first page.
  while (true) {
    const res = await searchconsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody: { startDate, endDate, dimensions, rowLimit, startRow },
    });
    const batch = res.data.rows || [];
    rows.push(...batch);
    if (batch.length < rowLimit) break;
    startRow += rowLimit;
  }
  return rows;
}

function fmt(d) { return d.toISOString().split('T')[0]; }

async function main() {
  await authenticate();
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  const end = new Date();
  end.setDate(end.getDate() - 3); // GSC data lags ~2-3 days
  const start = new Date();
  start.setDate(start.getDate() - 365 - 3);
  const startDate = fmt(start), endDate = fmt(end);

  console.log(`\nPulling ${SITE_URL} from ${startDate} to ${endDate}...`);

  const queries = await queryGSC(['query'], startDate, endDate);
  console.log(`queries: ${queries.length}`);
  const pages = await queryGSC(['page'], startDate, endDate);
  console.log(`pages: ${pages.length}`);
  const queryPages = await queryGSC(['query', 'page'], startDate, endDate);
  console.log(`query+page combos: ${queryPages.length}`);

  const map = (r) => ({ keys: r.keys, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
  const data = {
    site: SITE_URL,
    dateRange: { start: startDate, end: endDate },
    pulledAt: new Date().toISOString(),
    queries: queries.map(r => ({ query: r.keys[0], ...map(r), keys: undefined })),
    pages: pages.map(r => ({ page: r.keys[0], ...map(r), keys: undefined })),
    queryPages: queryPages.map(r => ({ query: r.keys[0], page: r.keys[1], ...map(r), keys: undefined })),
  };

  const outPath = path.join(OUT_DIR, 'gsc-data.json');
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

main().catch(err => { console.error('FAILED:', err.response?.data || err.message || err); process.exit(1); });
