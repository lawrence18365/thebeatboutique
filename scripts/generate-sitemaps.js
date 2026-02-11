const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITE_URL = 'https://thebeatboutique.ie';
const ROOT_DIR = path.join(__dirname, '..');

function normalizeRoutePath(routePath) {
    if (!routePath || routePath === '/') return '/';
    return routePath.endsWith('/') ? routePath : `${routePath}/`;
}

// Get the last git commit date for a file (ISO 8601 format)
function getGitLastModified(filePath) {
    try {
        const relativePath = path.relative(ROOT_DIR, filePath);
        const date = execSync(`git log -1 --format=%cI -- "${relativePath}"`, {
            cwd: ROOT_DIR,
            encoding: 'utf8'
        }).trim();

        if (date) {
            // Return just the date portion (YYYY-MM-DD)
            return date.split('T')[0];
        }
    } catch (e) {
        // File not in git or other error
    }

    // Fallback to file modification time
    try {
        const stats = fs.statSync(filePath);
        return stats.mtime.toISOString().split('T')[0];
    } catch (e) {
        return new Date().toISOString().split('T')[0];
    }
}

// Check if a page has noindex meta tag
function hasNoIndex(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.includes('name="robots" content="noindex') ||
               content.includes("name='robots' content='noindex");
    } catch (e) {
        return false;
    }
}

// Get canonical URL from page (to ensure we use the right URL)
function getCanonicalUrl(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const match = content.match(/rel="canonical"\s+href="([^"]+)"/);
        if (match) {
            return match[1];
        }
    } catch (e) {}
    return null;
}

// Generate XML for a single URL entry
function urlEntry(loc, lastmod, priority = '0.7') {
    return `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${priority}</priority>
  </url>`;
}

// Generate a sitemap XML file
function generateSitemap(urls) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;
}

// Generate sitemap index XML
function generateSitemapIndex(sitemaps) {
    const entries = sitemaps.map(sm => `  <sitemap>
    <loc>${SITE_URL}/${sm.file}</loc>
    <lastmod>${sm.lastmod}</lastmod>
  </sitemap>`);

    return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</sitemapindex>`;
}

// Pages to exclude from sitemaps (non-indexable)
const EXCLUDED_PAGES = [
    'thank-you',
    'showcase-confirmed',
    '404'
];

// Main pages configuration
const MAIN_PAGES = [
    { path: 'index.html', url: '/', priority: '1.0' },
    { path: 'wedding-band-ireland/index.html', url: '/wedding-band-ireland/', priority: '0.9' },
    { path: 'showcase/index.html', url: '/showcase/', priority: '0.9' },
    { path: 'about/index.html', url: '/about/', priority: '0.8' },
    { path: 'why-us/index.html', url: '/why-us/', priority: '0.8' },
    { path: 'pricing-guide/index.html', url: '/pricing-guide/', priority: '0.8' },
    { path: 'song-list/index.html', url: '/song-list/', priority: '0.8' },
    { path: 'corporate-events/index.html', url: '/corporate-events/', priority: '0.7' },
    { path: 'party-band/index.html', url: '/party-band/', priority: '0.7' },
    { path: 'christmas-parties/index.html', url: '/christmas-parties/', priority: '0.7' },
    { path: 'privacy/index.html', url: '/privacy/', priority: '0.3' },
    { path: 'terms/index.html', url: '/terms/', priority: '0.3' }
];

// Collect all location pages
function getLocationPages() {
    const locationsDir = path.join(ROOT_DIR, 'locations');
    const pages = [];

    if (fs.existsSync(locationsDir)) {
        const dirs = fs.readdirSync(locationsDir, { withFileTypes: true });
        for (const dir of dirs) {
            if (dir.isDirectory() && dir.name.startsWith('wedding-band-')) {
                const indexPath = path.join(locationsDir, dir.name, 'index.html');
                if (fs.existsSync(indexPath) && !hasNoIndex(indexPath)) {
                    pages.push({
                        path: `locations/${dir.name}/index.html`,
                        url: `/locations/${dir.name}/`,
                        priority: '0.7'
                    });
                }
            }
        }
    }

    return pages;
}

// Collect all venue pages
function getVenuePages() {
    const venuesDir = path.join(ROOT_DIR, 'venues');
    const pages = [];

    // Main venues index
    const venuesIndex = path.join(venuesDir, 'index.html');
    if (fs.existsSync(venuesIndex) && !hasNoIndex(venuesIndex)) {
        pages.push({
            path: 'venues/index.html',
            url: '/venues/',
            priority: '0.8'
        });
    }

    // Individual venue pages
    if (fs.existsSync(venuesDir)) {
        const dirs = fs.readdirSync(venuesDir, { withFileTypes: true });
        for (const dir of dirs) {
            if (dir.isDirectory()) {
                const indexPath = path.join(venuesDir, dir.name, 'index.html');
                if (fs.existsSync(indexPath) && !hasNoIndex(indexPath)) {
                    pages.push({
                        path: `venues/${dir.name}/index.html`,
                        url: `/venues/${dir.name}/`,
                        priority: '0.7'
                    });
                }
            }
        }
    }

    return pages;
}

// Collect all guide pages
function getGuidePages() {
    const guidesDir = path.join(ROOT_DIR, 'guides');
    const pages = [];

    if (fs.existsSync(guidesDir)) {
        const dirs = fs.readdirSync(guidesDir, { withFileTypes: true });
        for (const dir of dirs) {
            if (dir.isDirectory()) {
                const indexPath = path.join(guidesDir, dir.name, 'index.html');
                if (fs.existsSync(indexPath) && !hasNoIndex(indexPath)) {
                    pages.push({
                        path: `guides/${dir.name}/index.html`,
                        url: `/guides/${dir.name}/`,
                        priority: '0.8'
                    });
                }
            }
        }
    }

    return pages;
}

// Generate URL entries for a list of pages
function generateUrlEntries(pages) {
    return pages.map(page => {
        const filePath = path.join(ROOT_DIR, page.path);
        const lastmod = getGitLastModified(filePath);
        return urlEntry(SITE_URL + normalizeRoutePath(page.url), lastmod, page.priority);
    });
}

// Main execution
console.log('Generating sitemaps with real git dates...\n');

// Filter main pages (exclude non-indexable)
const mainPages = MAIN_PAGES.filter(page => {
    const filePath = path.join(ROOT_DIR, page.path);
    return fs.existsSync(filePath) && !hasNoIndex(filePath);
});

const locationPages = getLocationPages();
const venuePages = getVenuePages();
const guidePages = getGuidePages();

// Generate individual sitemaps
const sitemapPages = generateSitemap(generateUrlEntries(mainPages));
const sitemapLocations = generateSitemap(generateUrlEntries(locationPages));
const sitemapVenues = generateSitemap(generateUrlEntries(venuePages));
const sitemapGuides = generateSitemap(generateUrlEntries(guidePages));

// Write sitemap files
fs.writeFileSync(path.join(ROOT_DIR, 'sitemap-pages.xml'), sitemapPages);
console.log(`Generated sitemap-pages.xml (${mainPages.length} URLs)`);

fs.writeFileSync(path.join(ROOT_DIR, 'sitemap-locations.xml'), sitemapLocations);
console.log(`Generated sitemap-locations.xml (${locationPages.length} URLs)`);

fs.writeFileSync(path.join(ROOT_DIR, 'sitemap-venues.xml'), sitemapVenues);
console.log(`Generated sitemap-venues.xml (${venuePages.length} URLs)`);

fs.writeFileSync(path.join(ROOT_DIR, 'sitemap-guides.xml'), sitemapGuides);
console.log(`Generated sitemap-guides.xml (${guidePages.length} URLs)`);

// Generate sitemap index
const today = new Date().toISOString().split('T')[0];
const sitemapIndex = generateSitemapIndex([
    { file: 'sitemap-pages.xml', lastmod: today },
    { file: 'sitemap-locations.xml', lastmod: today },
    { file: 'sitemap-venues.xml', lastmod: today },
    { file: 'sitemap-guides.xml', lastmod: today }
]);

fs.writeFileSync(path.join(ROOT_DIR, 'sitemap-index.xml'), sitemapIndex);
console.log(`\nGenerated sitemap-index.xml (master index)`);

// Summary
const totalUrls = mainPages.length + locationPages.length + venuePages.length + guidePages.length;
console.log(`\n✓ Total: ${totalUrls} URLs across 4 sitemaps`);
console.log('\nSitemap structure:');
console.log('  sitemap-index.xml (submit this to Search Console)');
console.log('    ├── sitemap-pages.xml');
console.log('    ├── sitemap-locations.xml');
console.log('    ├── sitemap-venues.xml');
console.log('    └── sitemap-guides.xml');
