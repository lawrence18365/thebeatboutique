const { google } = require('googleapis');
const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'data', 'audit');
const DEFAULT_SITE_URL = 'sc-domain:thebeatboutique.ie';
const DEFAULT_PAGE_ORIGIN = 'https://thebeatboutique.ie';
const DEFAULT_REDIRECT_URI = 'http://localhost:3847';

const GSC_SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';
const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';

const args = parseArgs(process.argv.slice(2));

const config = {
    siteUrl: process.env.GSC_SITE_URL || args.gscSiteUrl || DEFAULT_SITE_URL,
    pageOrigin: process.env.SITE_ORIGIN || args.siteOrigin || DEFAULT_PAGE_ORIGIN,
    ga4PropertyId: process.env.GA4_PROPERTY_ID || args.ga4PropertyId || '',
    tokenPath: process.env.GOOGLE_ACQUISITION_TOKEN_PATH ||
        args.tokenPath ||
        path.join(ROOT_DIR, '.google-acquisition-token.json'),
    redirectUri: process.env.GOOGLE_REDIRECT_URI || args.redirectUri || DEFAULT_REDIRECT_URI,
    skipGsc: Boolean(args.skipGsc),
    skipIndexing: Boolean(args.skipIndexing),
    skipGa4: Boolean(args.skipGa4),
    listGa4Properties: Boolean(args.listGa4Properties),
    indexingLimit: args.indexingLimit ? Number(args.indexingLimit) : null,
    indexingOffset: args.indexingOffset ? Number(args.indexingOffset) : 0,
};

function parseArgs(argv) {
    const out = {};
    for (const arg of argv) {
        if (!arg.startsWith('--')) {
            continue;
        }
        const [rawKey, rawValue] = arg.slice(2).split('=');
        const key = rawKey.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        out[key] = rawValue === undefined ? true : rawValue;
    }
    return out;
}

function dateStr(date) {
    return date.toISOString().split('T')[0];
}

function daysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
}

function todayStamp() {
    return dateStr(new Date());
}

function ensureOutputDir() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

function loadOAuthConfig() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (clientId && clientSecret) {
        return { clientId, clientSecret, source: 'environment' };
    }

    const existingScript = path.join(__dirname, 'audit-search-console.js');
    if (fs.existsSync(existingScript)) {
        const source = fs.readFileSync(existingScript, 'utf8');
        const idMatch = source.match(/CLIENT_ID\s*=\s*['"]([^'"]+)['"]/);
        const secretMatch = source.match(/CLIENT_SECRET\s*=\s*['"]([^'"]+)['"]/);
        if (idMatch && secretMatch) {
            return {
                clientId: idMatch[1],
                clientSecret: secretMatch[1],
                source: 'scripts/audit-search-console.js',
            };
        }
    }

    throw new Error(
        'Missing Google OAuth client credentials. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.'
    );
}

function scopesNeeded() {
    const scopes = new Set();
    if (!config.skipGsc || !config.skipIndexing) {
        scopes.add(GSC_SCOPE);
    }
    if ((!config.skipGa4 && config.ga4PropertyId) || config.listGa4Properties) {
        scopes.add(GA4_SCOPE);
    }
    return Array.from(scopes);
}

async function authenticate() {
    const scopes = scopesNeeded();
    if (scopes.length === 0) {
        return null;
    }

    const oauthConfig = loadOAuthConfig();
    const oauth2Client = new google.auth.OAuth2(
        oauthConfig.clientId,
        oauthConfig.clientSecret,
        config.redirectUri
    );

    const preferredTokenPath = config.tokenPath;
    const gscTokenPath = path.join(ROOT_DIR, '.gsc-token.json');
    const fallbackTokenPath = fs.existsSync(preferredTokenPath) ? preferredTokenPath : gscTokenPath;

    if (fs.existsSync(fallbackTokenPath)) {
        const token = JSON.parse(fs.readFileSync(fallbackTokenPath, 'utf8'));
        oauth2Client.setCredentials(token);

        try {
            await oauth2Client.getAccessToken();
            const hasEnoughScope = tokenHasScopes(token, scopes);
            if (hasEnoughScope || fallbackTokenPath === preferredTokenPath) {
                oauth2Client.on('tokens', (newTokens) => {
                    const updated = { ...token, ...newTokens };
                    fs.writeFileSync(fallbackTokenPath, JSON.stringify(updated, null, 2));
                });
                console.log(`Using cached Google token: ${path.basename(fallbackTokenPath)}`);
                return oauth2Client;
            }
        } catch (error) {
            console.log(`Cached token could not be used: ${error.message}`);
        }
    }

    return browserAuth(oauth2Client, scopes, preferredTokenPath);
}

function tokenHasScopes(token, requiredScopes) {
    if (!requiredScopes.length) {
        return true;
    }
    if (!token.scope) {
        return false;
    }
    const tokenScopes = new Set(String(token.scope).split(/\s+/).filter(Boolean));
    return requiredScopes.every((scope) => tokenScopes.has(scope));
}

function browserAuth(oauth2Client, scopes, tokenPath) {
    return new Promise((resolve, reject) => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: scopes,
            prompt: 'consent',
        });

        const server = http.createServer(async (req, res) => {
            const query = url.parse(req.url, true).query;
            if (!query.code) {
                res.writeHead(400, { 'Content-Type': 'text/html' });
                res.end('<h2>Missing authorization code.</h2>');
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h2>Authenticated. You can close this tab.</h2>');
            server.close();

            try {
                const { tokens } = await oauth2Client.getToken(query.code);
                oauth2Client.setCredentials(tokens);
                fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
                console.log(`Authenticated and cached token: ${path.basename(tokenPath)}`);
                resolve(oauth2Client);
            } catch (error) {
                reject(error);
            }
        });

        server.listen(new URL(config.redirectUri).port || 80, () => {
            console.log('\nOpening browser for Google authentication...');
            console.log(`Scopes: ${scopes.join(', ')}\n`);
            exec(`open "${authUrl}"`);
        });
    });
}

async function querySearchConsole(searchconsole, startDate, endDate, dimensions, rowLimit) {
    const response = await searchconsole.searchanalytics.query({
        siteUrl: config.siteUrl,
        requestBody: {
            startDate: dateStr(startDate),
            endDate: dateStr(endDate),
            dimensions,
            rowLimit,
        },
    }, { timeout: 45000 });
    return response.data.rows || [];
}

async function pullSearchConsole(auth) {
    if (config.skipGsc) {
        return { skipped: true };
    }

    const searchconsole = google.searchconsole({ version: 'v1', auth });
    const end30 = daysAgo(3);
    const start30 = daysAgo(33);
    const endPrev30 = daysAgo(33);
    const startPrev30 = daysAgo(63);
    const end90 = daysAgo(3);
    const start90 = daysAgo(93);

    console.log('Pulling Search Console performance...');
    const [
        queries30,
        queriesPrev30,
        pages30,
        pagesPrev30,
        queryPage30,
        queries90,
        pages90,
        dates90,
    ] = await Promise.all([
        querySearchConsole(searchconsole, start30, end30, ['query'], 1000),
        querySearchConsole(searchconsole, startPrev30, endPrev30, ['query'], 1000),
        querySearchConsole(searchconsole, start30, end30, ['page'], 1000),
        querySearchConsole(searchconsole, startPrev30, endPrev30, ['page'], 1000),
        querySearchConsole(searchconsole, start30, end30, ['query', 'page'], 2500),
        querySearchConsole(searchconsole, start90, end90, ['query'], 2500),
        querySearchConsole(searchconsole, start90, end90, ['page'], 1000),
        querySearchConsole(searchconsole, start90, end90, ['date'], 1000),
    ]);

    return {
        dateRanges: {
            last30: { start: dateStr(start30), end: dateStr(end30) },
            prev30: { start: dateStr(startPrev30), end: dateStr(endPrev30) },
            last90: { start: dateStr(start90), end: dateStr(end90) },
        },
        queries30,
        queriesPrev30,
        pages30,
        pagesPrev30,
        queryPage30,
        queries90,
        pages90,
        dates90,
    };
}

function collectSitemapUrls() {
    const urls = new Set();
    const files = fs.readdirSync(ROOT_DIR)
        .filter((name) => /^sitemap-.*\.xml$/.test(name))
        .filter((name) => name !== 'sitemap-index.xml');

    for (const file of files) {
        const xml = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
        const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
        for (const match of matches) {
            const loc = match[1].trim();
            if (loc.startsWith(config.pageOrigin) && !loc.includes('/sitemap')) {
                urls.add(loc);
            }
        }
    }

    return Array.from(urls).sort();
}

async function inspectUrl(searchconsole, inspectionUrl) {
    const response = await searchconsole.urlInspection.index.inspect({
        requestBody: {
            inspectionUrl,
            siteUrl: config.siteUrl,
        },
    }, { timeout: 30000 });
    return response.data.inspectionResult || {};
}

async function pullIndexing(auth) {
    if (config.skipIndexing) {
        return { skipped: true };
    }

    const searchconsole = google.searchconsole({ version: 'v1', auth });
    const allUrls = collectSitemapUrls();
    const offset = Math.max(0, config.indexingOffset || 0);
    const limit = config.indexingLimit && config.indexingLimit > 0
        ? config.indexingLimit
        : allUrls.length;
    const urls = allUrls.slice(offset, offset + limit);

    console.log(`Inspecting ${urls.length} URLs with URL Inspection API...`);

    const rows = [];
    for (let index = 0; index < urls.length; index += 1) {
        const inspectedUrl = urls[index];
        if (index === 0 || (index + 1) % 10 === 0 || index === urls.length - 1) {
            console.log(`  URL Inspection progress: ${index + 1}/${urls.length}`);
        }
        try {
            const result = await inspectUrl(searchconsole, inspectedUrl);
            const indexStatus = result.indexStatusResult || {};
            rows.push({
                url: inspectedUrl,
                verdict: indexStatus.verdict || '',
                coverageState: indexStatus.coverageState || '',
                robotsTxtState: indexStatus.robotsTxtState || '',
                indexingState: indexStatus.indexingState || '',
                pageFetchState: indexStatus.pageFetchState || '',
                googleCanonical: indexStatus.googleCanonical || '',
                userCanonical: indexStatus.userCanonical || '',
                lastCrawlTime: indexStatus.lastCrawlTime || '',
                referringUrls: indexStatus.referringUrls || [],
            });
        } catch (error) {
            rows.push({
                url: inspectedUrl,
                error: error.response?.data?.error?.message || error.message,
            });
        }

        if (index < urls.length - 1) {
            await sleep(250);
        }
    }

    return {
        totalSitemapUrls: allUrls.length,
        inspected: rows.length,
        offset,
        limit,
        rows,
    };
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function listGa4Properties(auth) {
    const admin = google.analyticsadmin({ version: 'v1beta', auth });
    const response = await admin.accountSummaries.list({ pageSize: 200 }, { timeout: 45000 });
    const summaries = response.data.accountSummaries || [];
    return summaries.map((account) => ({
        account: account.account,
        displayName: account.displayName,
        properties: (account.propertySummaries || []).map((property) => ({
            property: property.property,
            propertyId: property.property ? property.property.replace('properties/', '') : '',
            displayName: property.displayName,
        })),
    }));
}

async function getGa4Metadata(analyticsData, propertyName) {
    const response = await analyticsData.properties.getMetadata({
        name: `${propertyName}/metadata`,
    }, { timeout: 45000 });
    const metrics = new Set((response.data.metrics || []).map((metric) => metric.apiName));
    const dimensions = new Set((response.data.dimensions || []).map((dimension) => dimension.apiName));
    return { metrics, dimensions };
}

function pickAvailable(preferred, availableSet) {
    return preferred.filter((item) => availableSet.has(item));
}

async function runGa4Report(analyticsData, propertyName, metadata, request) {
    const metrics = pickAvailable(request.metrics, metadata.metrics).map((name) => ({ name }));
    const dimensions = pickAvailable(request.dimensions || [], metadata.dimensions).map((name) => ({ name }));

    if (!metrics.length) {
        return { unavailable: true, reason: 'No requested metrics are available.' };
    }

    const body = {
        dateRanges: request.dateRanges,
        metrics,
        dimensions,
        limit: request.limit || 100,
        orderBys: request.orderByMetric && metrics.some((metric) => metric.name === request.orderByMetric)
            ? [{ metric: { metricName: request.orderByMetric }, desc: true }]
            : undefined,
        dimensionFilter: request.dimensionFilter,
    };

    const response = await analyticsData.properties.runReport({
        property: propertyName,
        requestBody: body,
    }, { timeout: 45000 });

    return {
        metricHeaders: response.data.metricHeaders || [],
        dimensionHeaders: response.data.dimensionHeaders || [],
        rows: response.data.rows || [],
        totals: response.data.totals || [],
    };
}

async function pullGa4(auth) {
    if (config.skipGa4) {
        return { skipped: true };
    }

    if (config.listGa4Properties && !config.ga4PropertyId) {
        console.log('Listing GA4 properties available to this Google account...');
        return {
            needsPropertyId: true,
            availableProperties: await listGa4Properties(auth),
        };
    }

    if (!config.ga4PropertyId) {
        return {
            skipped: true,
            reason: 'GA4_PROPERTY_ID is not set. Run with --list-ga4-properties or set GA4_PROPERTY_ID.',
        };
    }

    const propertyName = `properties/${String(config.ga4PropertyId).replace(/^properties\//, '')}`;
    const analyticsData = google.analyticsdata({ version: 'v1beta', auth });
    const metadata = await getGa4Metadata(analyticsData, propertyName);
    const end30 = daysAgo(3);
    const start30 = daysAgo(33);
    const endPrev30 = daysAgo(33);
    const startPrev30 = daysAgo(63);
    const end90 = daysAgo(3);
    const start90 = daysAgo(93);

    const dateRanges = {
        last30: { startDate: dateStr(start30), endDate: dateStr(end30), name: 'last30' },
        prev30: { startDate: dateStr(startPrev30), endDate: dateStr(endPrev30), name: 'prev30' },
        last90: { startDate: dateStr(start90), endDate: dateStr(end90), name: 'last90' },
    };

    console.log(`Pulling GA4 Data API for ${propertyName}...`);

    const keyEventMetric = metadata.metrics.has('keyEvents') ? 'keyEvents' :
        metadata.metrics.has('conversions') ? 'conversions' :
            null;
    const baseMetrics = [
        'sessions',
        'activeUsers',
        'newUsers',
        'screenPageViews',
        'eventCount',
        'engagedSessions',
        'engagementRate',
        'averageSessionDuration',
    ];
    if (keyEventMetric) {
        baseMetrics.push(keyEventMetric);
    }

    const landingDimension = metadata.dimensions.has('landingPagePlusQueryString')
        ? 'landingPagePlusQueryString'
        : 'landingPage';

    const reports = {};
    reports.overview = await runGa4Report(analyticsData, propertyName, metadata, {
        dateRanges: [dateRanges.last30, dateRanges.prev30],
        metrics: baseMetrics,
        limit: 10,
    });
    reports.landingPages = await runGa4Report(analyticsData, propertyName, metadata, {
        dateRanges: [dateRanges.last30],
        dimensions: [landingDimension],
        metrics: baseMetrics,
        orderByMetric: keyEventMetric || 'sessions',
        limit: 50,
    });
    reports.pages = await runGa4Report(analyticsData, propertyName, metadata, {
        dateRanges: [dateRanges.last30],
        dimensions: ['pagePath'],
        metrics: baseMetrics,
        orderByMetric: 'screenPageViews',
        limit: 50,
    });
    reports.sourceMedium = await runGa4Report(analyticsData, propertyName, metadata, {
        dateRanges: [dateRanges.last30],
        dimensions: ['sessionSourceMedium'],
        metrics: baseMetrics,
        orderByMetric: keyEventMetric || 'sessions',
        limit: 50,
    });
    reports.events = await runGa4Report(analyticsData, propertyName, metadata, {
        dateRanges: [dateRanges.last30],
        dimensions: ['eventName'],
        metrics: ['eventCount', 'activeUsers'].concat(keyEventMetric ? [keyEventMetric] : []),
        orderByMetric: 'eventCount',
        limit: 100,
    });
    reports.formAndContactPages = await runGa4Report(analyticsData, propertyName, metadata, {
        dateRanges: [dateRanges.last30],
        dimensions: ['eventName', 'pagePath'],
        metrics: ['eventCount', 'activeUsers'].concat(keyEventMetric ? [keyEventMetric] : []),
        orderByMetric: 'eventCount',
        limit: 100,
        dimensionFilter: {
            filter: {
                fieldName: 'eventName',
                inListFilter: {
                    values: ['form_submit', 'contact_click'],
                },
            },
        },
    });

    return {
        propertyName,
        keyEventMetric,
        dateRanges,
        reports,
    };
}

function sumRows(rows, field) {
    return rows.reduce((total, row) => total + Number(row[field] || 0), 0);
}

function simplifyGscRows(rows) {
    return (rows || []).map((row) => ({
        keys: row.keys || [],
        clicks: Number(row.clicks || 0),
        impressions: Number(row.impressions || 0),
        ctr: Number(row.ctr || 0),
        position: Number(row.position || 0),
    }));
}

function ga4Rows(report) {
    if (!report || report.unavailable || !report.rows) {
        return [];
    }

    const dimensions = (report.dimensionHeaders || []).map((header) => header.name);
    const metrics = (report.metricHeaders || []).map((header) => header.name);
    return report.rows.map((row) => {
        const out = {};
        dimensions.forEach((dimension, index) => {
            out[dimension] = row.dimensionValues?.[index]?.value || '';
        });
        metrics.forEach((metric, index) => {
            out[metric] = Number(row.metricValues?.[index]?.value || 0);
        });
        return out;
    });
}

function formatPercent(value) {
    return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function mdTable(headers, rows) {
    const lines = [];
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
    for (const row of rows) {
        lines.push(`| ${row.map((cell) => String(cell).replace(/\|/g, '\\|')).join(' | ')} |`);
    }
    return lines.join('\n');
}

function pagePath(pageUrl) {
    return String(pageUrl || '').replace(config.pageOrigin, '') || '/';
}

function buildMarkdownReport(raw) {
    const lines = [];
    const stamp = todayStamp();
    lines.push(`# Acquisition API Audit - ${stamp}`);
    lines.push('');
    lines.push(`Site: ${config.siteUrl}`);
    lines.push(`Origin: ${config.pageOrigin}`);
    lines.push('');

    if (raw.gsc && !raw.gsc.skipped) {
        const queries30 = simplifyGscRows(raw.gsc.queries30);
        const queriesPrev30 = simplifyGscRows(raw.gsc.queriesPrev30);
        const pages30 = simplifyGscRows(raw.gsc.pages30);
        const clicks = sumRows(queries30, 'clicks');
        const impressions = sumRows(queries30, 'impressions');
        const prevClicks = sumRows(queriesPrev30, 'clicks');
        const prevImpressions = sumRows(queriesPrev30, 'impressions');
        const weightedPosition = impressions
            ? queries30.reduce((total, row) => total + row.position * row.impressions, 0) / impressions
            : 0;

        lines.push('## Search Console Performance');
        lines.push('');
        lines.push(mdTable(
            ['Metric', 'Last 30 Days', 'Previous 30 Days'],
            [
                ['Clicks', clicks, prevClicks],
                ['Impressions', impressions, prevImpressions],
                ['CTR', impressions ? `${((clicks / impressions) * 100).toFixed(2)}%` : '0%', prevImpressions ? `${((prevClicks / prevImpressions) * 100).toFixed(2)}%` : '0%'],
                ['Average position', weightedPosition.toFixed(1), '-'],
            ]
        ));
        lines.push('');
        lines.push('### Top Pages By Clicks');
        lines.push('');
        lines.push(mdTable(
            ['Page', 'Clicks', 'Impressions', 'CTR', 'Position'],
            pages30
                .sort((a, b) => b.clicks - a.clicks)
                .slice(0, 12)
                .map((row) => [
                    pagePath(row.keys[0]),
                    row.clicks,
                    row.impressions,
                    formatPercent(row.ctr),
                    row.position.toFixed(1),
                ])
        ));
        lines.push('');

        const lowCtrPages = pages30
            .filter((row) => row.impressions >= 50 && row.ctr < 0.02)
            .sort((a, b) => b.impressions - a.impressions)
            .slice(0, 12);
        lines.push('### Highest-Impression Low-CTR Pages');
        lines.push('');
        lines.push(mdTable(
            ['Page', 'Clicks', 'Impressions', 'CTR', 'Position'],
            lowCtrPages.map((row) => [
                pagePath(row.keys[0]),
                row.clicks,
                row.impressions,
                formatPercent(row.ctr),
                row.position.toFixed(1),
            ])
        ));
        lines.push('');
    }

    if (raw.indexing && !raw.indexing.skipped) {
        const rows = raw.indexing.rows || [];
        const indexed = rows.filter((row) => row.coverageState === 'Submitted and indexed').length;
        const issues = rows.filter((row) => row.error || row.coverageState !== 'Submitted and indexed');
        lines.push('## URL Inspection Indexing');
        lines.push('');
        lines.push(mdTable(
            ['Metric', 'Value'],
            [
                ['Sitemap URLs found', raw.indexing.totalSitemapUrls],
                ['URLs inspected in this run', raw.indexing.inspected],
                ['Submitted and indexed', indexed],
                ['Needs review', issues.length],
            ]
        ));
        lines.push('');
        if (issues.length) {
            lines.push('### Indexing Items To Review');
            lines.push('');
            lines.push(mdTable(
                ['URL', 'Coverage', 'Verdict/Error'],
                issues.slice(0, 20).map((row) => [
                    row.url,
                    row.coverageState || '-',
                    row.error || row.verdict || '-',
                ])
            ));
            lines.push('');
        }
    }

    if (raw.ga4 && !raw.ga4.skipped && !raw.ga4.needsPropertyId) {
        lines.push('## GA4');
        lines.push('');
        const landingPages = ga4Rows(raw.ga4.reports?.landingPages);
        const sourceMedium = ga4Rows(raw.ga4.reports?.sourceMedium);
        const events = ga4Rows(raw.ga4.reports?.events);
        const formAndContact = ga4Rows(raw.ga4.reports?.formAndContactPages);

        lines.push(`Property: ${raw.ga4.propertyName}`);
        lines.push('');
        lines.push('### Top Landing Pages');
        lines.push('');
        lines.push(mdTable(
            ['Landing Page', 'Sessions', 'Active Users', 'Views', 'Events', raw.ga4.keyEventMetric || 'Key Events'],
            landingPages.slice(0, 12).map((row) => [
                row.landingPagePlusQueryString || row.landingPage || '-',
                row.sessions || 0,
                row.activeUsers || 0,
                row.screenPageViews || 0,
                row.eventCount || 0,
                raw.ga4.keyEventMetric ? (row[raw.ga4.keyEventMetric] || 0) : '-',
            ])
        ));
        lines.push('');
        lines.push('### Source / Medium');
        lines.push('');
        lines.push(mdTable(
            ['Source / Medium', 'Sessions', 'Active Users', 'Events', raw.ga4.keyEventMetric || 'Key Events'],
            sourceMedium.slice(0, 12).map((row) => [
                row.sessionSourceMedium || '-',
                row.sessions || 0,
                row.activeUsers || 0,
                row.eventCount || 0,
                raw.ga4.keyEventMetric ? (row[raw.ga4.keyEventMetric] || 0) : '-',
            ])
        ));
        lines.push('');
        lines.push('### Tracked Events');
        lines.push('');
        lines.push(mdTable(
            ['Event', 'Count', 'Active Users', raw.ga4.keyEventMetric || 'Key Events'],
            events.slice(0, 20).map((row) => [
                row.eventName || '-',
                row.eventCount || 0,
                row.activeUsers || 0,
                raw.ga4.keyEventMetric ? (row[raw.ga4.keyEventMetric] || 0) : '-',
            ])
        ));
        lines.push('');
        if (formAndContact.length) {
            lines.push('### Form And Contact Events By Page');
            lines.push('');
            lines.push(mdTable(
                ['Event', 'Page', 'Count', 'Active Users', raw.ga4.keyEventMetric || 'Key Events'],
                formAndContact.slice(0, 20).map((row) => [
                    row.eventName || '-',
                    row.pagePath || '-',
                    row.eventCount || 0,
                    row.activeUsers || 0,
                    raw.ga4.keyEventMetric ? (row[raw.ga4.keyEventMetric] || 0) : '-',
                ])
            ));
            lines.push('');
        }
    } else if (raw.ga4?.needsPropertyId) {
        lines.push('## GA4');
        lines.push('');
        lines.push('GA4 access is authorised, but a property ID still needs to be selected.');
        lines.push('');
        const propertyRows = [];
        for (const account of raw.ga4.availableProperties || []) {
            for (const property of account.properties || []) {
                propertyRows.push([account.displayName, property.displayName, property.propertyId]);
            }
        }
        if (propertyRows.length) {
            lines.push(mdTable(['Account', 'Property', 'Property ID'], propertyRows));
            lines.push('');
        }
    } else if (raw.ga4?.skipped) {
        lines.push('## GA4');
        lines.push('');
        lines.push(`GA4 was skipped: ${raw.ga4.reason || 'not requested in this run.'}`);
        lines.push('');
    }

    lines.push('## 1-2 Month Owner Focus');
    lines.push('');
    lines.push('Based on the API data available now, the owners should focus on:');
    lines.push('');
    lines.push('1. Lead-to-booking tracking: every enquiry needs source, landing page, venue, county, package, quote, status, and booked revenue.');
    lines.push('2. Pricing guide conversion: this page already has search visibility and enquiry evidence, so make the CTA, package proof, reviews, showcase link, and availability check stronger.');
    lines.push('3. Band plus DJ offer: Search Console shows package and after-band DJ intent; turn this into a clearer commercial offer with dedicated proof and CTAs.');
    lines.push('4. Priority venue pages: improve the highest-opportunity venue pages with real setup notes, venue-specific proof, reviews, video, and package guidance.');
    lines.push('5. Showcase and review follow-up: treat showcase RSVPs and fresh reviews as a sales system, not a passive marketing asset.');
    lines.push('');
    lines.push('Paid ads should wait until GA4/key event tracking and lead-to-booking attribution are working.');
    lines.push('');

    return `${lines.join('\n')}\n`;
}

async function main() {
    ensureOutputDir();
    const auth = await authenticate();
    const raw = {
        generatedAt: new Date().toISOString(),
        config: {
            siteUrl: config.siteUrl,
            pageOrigin: config.pageOrigin,
            ga4PropertyId: config.ga4PropertyId || null,
        },
    };

    if (config.listGa4Properties && !config.ga4PropertyId) {
        raw.gsc = { skipped: true };
        raw.indexing = { skipped: true };
        raw.ga4 = await pullGa4(auth);
    } else {
        raw.gsc = await pullSearchConsole(auth);
        raw.indexing = await pullIndexing(auth);
        raw.ga4 = await pullGa4(auth);
    }

    const stamp = todayStamp();
    const rawPath = path.join(OUTPUT_DIR, `acquisition-api-raw-${stamp}.json`);
    const latestRawPath = path.join(OUTPUT_DIR, 'acquisition-api-latest.json');
    const reportPath = path.join(OUTPUT_DIR, `acquisition-api-report-${stamp}.md`);
    const latestReportPath = path.join(OUTPUT_DIR, 'acquisition-api-latest.md');
    const markdown = buildMarkdownReport(raw);

    fs.writeFileSync(rawPath, JSON.stringify(raw, null, 2));
    fs.writeFileSync(latestRawPath, JSON.stringify(raw, null, 2));
    fs.writeFileSync(reportPath, markdown);
    fs.writeFileSync(latestReportPath, markdown);

    console.log(`\nWrote ${path.relative(ROOT_DIR, rawPath)}`);
    console.log(`Wrote ${path.relative(ROOT_DIR, reportPath)}`);
    console.log(`Wrote ${path.relative(ROOT_DIR, latestReportPath)}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('Error:', error.response?.data?.error || error.message || error);
        process.exit(1);
    });
