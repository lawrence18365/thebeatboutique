const { google } = require('googleapis');
const fs = require('fs');
const http = require('http');
const path = require('path');
const url = require('url');
const { exec } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'data', 'audit');
const SITE_CONFIG_PATH = path.join(ROOT_DIR, 'js', 'site-config.js');
const TOKEN_PATH = path.join(ROOT_DIR, '.ga4-admin-token.json');
const DEFAULT_REDIRECT_URI = 'http://localhost:3848';
const DEFAULT_SITE_URL = 'https://thebeatboutique.ie';
const DEFAULT_PROPERTY_NAME = 'The Beat Boutique';
const DEFAULT_STREAM_NAME = 'The Beat Boutique Website';

const SCOPES = [
    'https://www.googleapis.com/auth/analytics.edit',
    'https://www.googleapis.com/auth/analytics.readonly',
];

const args = parseArgs(process.argv.slice(2));

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

function loadOAuthConfig() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (clientId && clientSecret) {
        return { clientId, clientSecret };
    }

    const existingScript = path.join(__dirname, 'audit-search-console.js');
    if (fs.existsSync(existingScript)) {
        const source = fs.readFileSync(existingScript, 'utf8');
        const idMatch = source.match(/CLIENT_ID\s*=\s*['"]([^'"]+)['"]/);
        const secretMatch = source.match(/CLIENT_SECRET\s*=\s*['"]([^'"]+)['"]/);
        if (idMatch && secretMatch) {
            return { clientId: idMatch[1], clientSecret: secretMatch[1] };
        }
    }

    throw new Error('Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
}

async function authenticate() {
    const { clientId, clientSecret } = loadOAuthConfig();
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || args.redirectUri || DEFAULT_REDIRECT_URI;
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oauth2Client.setCredentials(token);
        try {
            await oauth2Client.getAccessToken();
            if (tokenHasScopes(token, SCOPES)) {
                console.log(`Using cached GA4 admin token: ${path.basename(TOKEN_PATH)}`);
                oauth2Client.on('tokens', (newTokens) => {
                    fs.writeFileSync(TOKEN_PATH, JSON.stringify({ ...token, ...newTokens }, null, 2));
                });
                return oauth2Client;
            }
            console.log('Cached GA4 token is missing required Analytics Admin scopes.');
        } catch (error) {
            console.log(`Cached GA4 token failed: ${error.message}`);
        }
    }

    return browserAuth(oauth2Client, redirectUri);
}

function tokenHasScopes(token, requiredScopes) {
    if (!token.scope) {
        return false;
    }
    const tokenScopes = new Set(String(token.scope).split(/\s+/).filter(Boolean));
    return requiredScopes.every((scope) => tokenScopes.has(scope));
}

function browserAuth(oauth2Client, redirectUri) {
    return new Promise((resolve, reject) => {
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
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
            res.end('<h2>GA4 authentication complete. You can close this tab.</h2>');
            server.close();

            try {
                const { tokens } = await oauth2Client.getToken(query.code);
                oauth2Client.setCredentials(tokens);
                fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
                console.log(`Authenticated and cached GA4 admin token: ${path.basename(TOKEN_PATH)}`);
                resolve(oauth2Client);
            } catch (error) {
                reject(error);
            }
        });

        server.listen(new URL(redirectUri).port || 80, () => {
            console.log('\nOpening browser for GA4 authentication...');
            console.log(`Scopes: ${SCOPES.join(', ')}\n`);
            exec(`open "${authUrl}"`);
        });
    });
}

async function listAccountsAndProperties(admin) {
    const summaries = [];
    let pageToken;
    do {
        const response = await admin.accountSummaries.list({
            pageSize: 200,
            pageToken,
        }, { timeout: 45000 });
        summaries.push(...(response.data.accountSummaries || []));
        pageToken = response.data.nextPageToken;
    } while (pageToken);

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

async function findWebStreams(admin, propertyName) {
    const streams = [];
    let pageToken;
    do {
        const response = await admin.properties.dataStreams.list({
            parent: propertyName,
            pageSize: 200,
            pageToken,
        }, { timeout: 45000 });
        streams.push(...(response.data.dataStreams || []));
        pageToken = response.data.nextPageToken;
    } while (pageToken);
    return streams.filter((stream) => stream.type === 'WEB_DATA_STREAM');
}

async function findExistingBeatBoutiqueMeasurementId(admin, accounts) {
    const siteUrl = args.siteUrl || DEFAULT_SITE_URL;
    for (const account of accounts) {
        for (const property of account.properties) {
            const propertyName = property.property;
            const label = `${property.displayName || ''} ${account.displayName || ''}`.toLowerCase();
            if (!label.includes('beat boutique')) {
                continue;
            }
            const streams = await findWebStreams(admin, propertyName);
            const matchingStream = streams.find((stream) => {
                const defaultUri = stream.webStreamData?.defaultUri || '';
                return defaultUri.replace(/\/$/, '') === siteUrl.replace(/\/$/, '') ||
                    String(stream.displayName || '').toLowerCase().includes('beat boutique');
            }) || streams[0];

            if (matchingStream?.webStreamData?.measurementId) {
                return {
                    account: account.account,
                    property: propertyName,
                    propertyId: property.propertyId,
                    stream: matchingStream.name,
                    measurementId: matchingStream.webStreamData.measurementId,
                };
            }
        }
    }
    return null;
}

async function createPropertyAndStream(admin, accountName) {
    const normalizedAccount = accountName.startsWith('accounts/')
        ? accountName
        : `accounts/${accountName}`;
    const propertyDisplayName = args.propertyName || DEFAULT_PROPERTY_NAME;
    const streamDisplayName = args.streamName || DEFAULT_STREAM_NAME;
    const siteUrl = args.siteUrl || DEFAULT_SITE_URL;

    console.log(`Creating GA4 property under ${normalizedAccount}...`);
    const propertyResponse = await admin.properties.create({
        requestBody: {
            parent: normalizedAccount,
            displayName: propertyDisplayName,
            timeZone: 'Europe/Dublin',
            currencyCode: 'EUR',
        },
    }, { timeout: 45000 });
    const property = propertyResponse.data;

    console.log(`Creating web data stream for ${siteUrl}...`);
    const streamResponse = await admin.properties.dataStreams.create({
        parent: property.name,
        requestBody: {
            type: 'WEB_DATA_STREAM',
            displayName: streamDisplayName,
            webStreamData: {
                defaultUri: siteUrl,
            },
        },
    }, { timeout: 45000 });

    const stream = streamResponse.data;
    return {
        account: normalizedAccount,
        property: property.name,
        propertyId: property.name ? property.name.replace('properties/', '') : '',
        stream: stream.name,
        measurementId: stream.webStreamData?.measurementId || '',
    };
}

async function listKeyEvents(admin, propertyName) {
    const response = await admin.properties.keyEvents.list({
        parent: propertyName,
        pageSize: 200,
    }, { timeout: 45000 });
    return response.data.keyEvents || [];
}

async function ensureKeyEvents(admin, propertyName) {
    const existing = await listKeyEvents(admin, propertyName);
    const existingNames = new Set(existing.map((event) => event.eventName));
    const desired = ['form_submit', 'contact_click'];
    const created = [];

    for (const eventName of desired) {
        if (existingNames.has(eventName)) {
            continue;
        }
        const response = await admin.properties.keyEvents.create({
            parent: propertyName,
            requestBody: {
                eventName,
                countingMethod: 'ONCE_PER_EVENT',
            },
        }, { timeout: 45000 });
        created.push(response.data);
    }

    return {
        existing: existing.map((event) => ({
            name: event.name,
            eventName: event.eventName,
            countingMethod: event.countingMethod,
        })),
        created: created.map((event) => ({
            name: event.name,
            eventName: event.eventName,
            countingMethod: event.countingMethod,
        })),
    };
}

async function listCustomDimensions(admin, propertyName) {
    const response = await admin.properties.customDimensions.list({
        parent: propertyName,
        pageSize: 200,
    }, { timeout: 45000 });
    return response.data.customDimensions || [];
}

async function ensureCustomDimensions(admin, propertyName) {
    const existing = await listCustomDimensions(admin, propertyName);
    const existingParams = new Set(existing.map((dimension) => dimension.parameterName));
    const desired = [
        {
            displayName: 'Form ID',
            parameterName: 'form_id',
            description: 'Submitted form identifier.',
        },
        {
            displayName: 'Form Name',
            parameterName: 'form_name',
            description: 'Submitted form name.',
        },
        {
            displayName: 'Form Action',
            parameterName: 'form_action',
            description: 'Submitted form action path.',
        },
        {
            displayName: 'Contact Type',
            parameterName: 'contact_type',
            description: 'Contact click type, such as phone or email.',
        },
    ];
    const created = [];

    for (const dimension of desired) {
        if (existingParams.has(dimension.parameterName)) {
            continue;
        }
        const response = await admin.properties.customDimensions.create({
            parent: propertyName,
            requestBody: {
                ...dimension,
                scope: 'EVENT',
            },
        }, { timeout: 45000 });
        created.push(response.data);
    }

    return {
        existing: existing.map((dimension) => ({
            name: dimension.name,
            displayName: dimension.displayName,
            parameterName: dimension.parameterName,
            scope: dimension.scope,
        })),
        created: created.map((dimension) => ({
            name: dimension.name,
            displayName: dimension.displayName,
            parameterName: dimension.parameterName,
            scope: dimension.scope,
        })),
    };
}

async function ensureTrackingDefinitions(admin, propertyName) {
    const [keyEvents, customDimensions] = await Promise.all([
        ensureKeyEvents(admin, propertyName),
        ensureCustomDimensions(admin, propertyName),
    ]);

    return { keyEvents, customDimensions };
}

function applyMeasurementId(measurementId) {
    if (!/^G-[A-Z0-9]+$/.test(measurementId)) {
        throw new Error(`Invalid GA4 measurement ID: ${measurementId}`);
    }

    const source = fs.readFileSync(SITE_CONFIG_PATH, 'utf8');
    const assignmentPattern = /window\.GA_MEASUREMENT_ID\s*=\s*window\.GA_MEASUREMENT_ID\s*\|\|\s*['"]([^'"]*)['"];/;
    const current = source.match(assignmentPattern)?.[1] || '';
    if (current === measurementId) {
        console.log(`GA4 measurement ID already applied in js/site-config.js: ${measurementId}`);
        return;
    }
    const updated = source.replace(
        assignmentPattern,
        `window.GA_MEASUREMENT_ID = window.GA_MEASUREMENT_ID || '${measurementId}';`
    );

    if (updated === source) {
        throw new Error(`Could not find GA_MEASUREMENT_ID assignment in ${SITE_CONFIG_PATH}`);
    }

    fs.writeFileSync(SITE_CONFIG_PATH, updated);
    console.log(`Applied GA4 measurement ID to js/site-config.js: ${measurementId}`);
}

function writeSetupResult(result, accounts) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    const stamp = new Date().toISOString().split('T')[0];
    const payload = {
        generatedAt: new Date().toISOString(),
        result,
        accounts,
    };
    const outputPath = path.join(OUTPUT_DIR, `ga4-setup-${stamp}.json`);
    const latestPath = path.join(OUTPUT_DIR, 'ga4-setup-latest.json');
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2));
    console.log(`Wrote ${path.relative(ROOT_DIR, outputPath)}`);
    console.log(`Wrote ${path.relative(ROOT_DIR, latestPath)}`);
}

function printAccountInstructions(accounts) {
    console.log('\nAvailable Google Analytics accounts/properties:\n');
    for (const account of accounts) {
        console.log(`- ${account.displayName} (${account.account})`);
        for (const property of account.properties) {
            console.log(`  - ${property.displayName} (${property.property})`);
        }
    }
    console.log('\nTo create the Beat Boutique GA4 property, rerun with:');
    console.log('  node scripts/setup-ga4.js --account=accounts/ACCOUNT_ID --create');
    console.log('\nIf you already create the web stream in GA4, apply the measurement ID with:');
    console.log('  node scripts/setup-ga4.js --measurement-id=G-XXXXXXXXXX');
}

async function main() {
    if (args.measurementId) {
        applyMeasurementId(args.measurementId);
        return;
    }

    const auth = await authenticate();
    const admin = google.analyticsadmin({ version: 'v1beta', auth });
    const accounts = await listAccountsAndProperties(admin);

    if (args.listAccounts) {
        writeSetupResult({ mode: 'list-accounts' }, accounts);
        printAccountInstructions(accounts);
        return;
    }

    const existing = await findExistingBeatBoutiqueMeasurementId(admin, accounts);
    if (existing && !args.create) {
        console.log(`Found existing Beat Boutique GA4 web stream: ${existing.measurementId}`);
        const definitions = await ensureTrackingDefinitions(admin, existing.property);
        applyMeasurementId(existing.measurementId);
        writeSetupResult({ mode: 'existing', ...existing, definitions }, accounts);
        return;
    }

    if (!args.account) {
        writeSetupResult({ mode: 'needs-account-selection' }, accounts);
        printAccountInstructions(accounts);
        return;
    }

    if (!args.create) {
        console.log('Refusing to create without --create.');
        console.log(`Use: node scripts/setup-ga4.js --account=${args.account} --create`);
        return;
    }

    const created = await createPropertyAndStream(admin, args.account);
    if (!created.measurementId) {
        throw new Error('GA4 property and stream were created, but no measurement ID was returned.');
    }
    const definitions = await ensureTrackingDefinitions(admin, created.property);
    applyMeasurementId(created.measurementId);
    writeSetupResult({ mode: 'created', ...created, definitions }, accounts);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('Error:', error.response?.data?.error || error.message || error);
        process.exit(1);
    });
