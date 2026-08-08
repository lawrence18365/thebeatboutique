const fs = require('fs');
const path = require('path');

const VENUES_FILE = path.join(__dirname, '../data/venues.json');
const SCRAPE_DIR = path.join(__dirname, '../data/scraped_venues');
const JINA_API_KEY = process.env.JINA_API_KEY;

if (!JINA_API_KEY) {
    console.error("Error: JINA_API_KEY environment variable is missing.");
    process.exit(1);
}

if (!fs.existsSync(SCRAPE_DIR)) {
    fs.mkdirSync(SCRAPE_DIR, { recursive: true });
}

async function scrapeVenue(venueName, location, slug) {
    const outputFile = path.join(SCRAPE_DIR, `${slug}.md`);
    if (fs.existsSync(outputFile)) {
        console.log(`  ✓ Already scraped: ${slug}.md`);
        return true;
    }

    const searchQuery = encodeURIComponent(`${venueName} ${location} wedding venue`);
    const jinaUrl = `https://s.jina.ai/${searchQuery}`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout

        const response = await fetch(jinaUrl, {
            signal: controller.signal,
            headers: {
                'Authorization': `Bearer ${JINA_API_KEY}`,
                'X-Retain-Images': 'none',
            }
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            console.error(`  ✗ Failed (${response.status}): ${venueName}`);
            return false;
        }

        const markdown = await response.text();
        if (markdown.length < 100) {
            console.error(`  ✗ Empty result for: ${venueName}`);
            return false;
        }

        fs.writeFileSync(outputFile, markdown);
        console.log(`  ✓ Saved ${slug}.md (${(markdown.length / 1024).toFixed(1)}KB)`);
        return true;
    } catch (e) {
        if (e.name === 'AbortError') {
            console.error(`  ✗ Timeout (60s) for: ${venueName}`);
        } else {
            console.error(`  ✗ Error for ${venueName}: ${e.message}`);
        }
        return false;
    }
}

async function main() {
    const venues = JSON.parse(fs.readFileSync(VENUES_FILE, 'utf8'));
    const toScrape = venues.filter(v => v.acoustics && v.acoustics.includes('PLACEHOLDER'));

    console.log(`Found ${toScrape.length} venues with placeholder data.\n`);

    let success = 0;
    let failed = 0;

    for (let i = 0; i < toScrape.length; i++) {
        const venue = toScrape[i];
        console.log(`[${i + 1}/${toScrape.length}] ${venue.name}...`);

        const ok = await scrapeVenue(venue.name, venue.location, venue.slug);
        if (ok) success++;
        else failed++;

        // Rate limit: wait 2s between requests
        if (i < toScrape.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    console.log(`\nDone! Success: ${success}, Failed: ${failed}`);
    console.log(`Scraped files saved to: data/scraped_venues/`);
}

main();
