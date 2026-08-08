const fs = require('fs');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');

const VENUES_FILE = path.join(__dirname, '../data/venues.json');
const SCRAPE_DIR = path.join(__dirname, '../data/scraped_venues');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("Error: GEMINI_API_KEY environment variable is missing.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function callGeminiWithRetry(prompt, maxRetries = 6) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.0-flash',
                contents: prompt,
                config: { temperature: 0.6 }
            });
            let text = response.text;
            text = text.replace(/```json/gi, '').replace(/```/g, '').trim();
            return JSON.parse(text);
        } catch (e) {
            const msg = e.message || '';
            if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
                // Parse the retry delay from the error
                const retryMatch = msg.match(/retryDelay":"(\d+)/);
                const waitSec = retryMatch ? parseInt(retryMatch[1]) + 5 : 65;
                console.log(`    ⏳ Rate limited. Waiting ${waitSec}s (attempt ${attempt}/${maxRetries})...`);
                await sleep(waitSec * 1000);
            } else {
                console.error(`    ✗ Error: ${msg.substring(0, 150)}`);
                if (attempt === maxRetries) return null;
                await sleep(5000);
            }
        }
    }
    return null;
}

function buildPrompt(venue, markdown) {
    const truncated = markdown.substring(0, 8000);
    return `You are an expert wedding band musician in Ireland who has played at ${venue.name} in ${venue.location} many times.

Read the venue info below. Generate realistic, musician-specific advice. Write from "we" perspective. Every sentence must have a specific detail about THIS venue. No filler.

Return ONLY this JSON (no markdown, no explanation):
{
  "acoustics": "2 sentences. How does ${venue.ballroom} sound for a live band? Walls, ceiling, floor, echo.",
  "setup_notes": "2 sentences. Load-in logistics at ${venue.name}: entrance, vehicle access, stage area.",
  "best_for": "1 sentence. Ideal couple/wedding size for ${venue.name}.",
  "insider_tip": "1 sentence. Specific music/atmosphere tip only a band who played here would know."
}

Name: ${venue.name} | Location: ${venue.location} | Capacity: ${venue.capacity}
Setting: ${venue.setting} | Room: ${venue.ballroom}

${truncated}`;
}

async function main() {
    const venues = JSON.parse(fs.readFileSync(VENUES_FILE, 'utf8'));
    const toEnrich = venues.filter(v => v.acoustics && v.acoustics.includes('PLACEHOLDER'));

    console.log(`Found ${toEnrich.length} venues still needing enrichment.\n`);
    if (toEnrich.length === 0) { console.log('All done!'); return; }

    let success = 0, failed = 0;

    for (let i = 0; i < toEnrich.length; i++) {
        const venue = toEnrich[i];
        const scrapeFile = path.join(SCRAPE_DIR, `${venue.slug}.md`);
        console.log(`[${i + 1}/${toEnrich.length}] ${venue.name}...`);

        if (!fs.existsSync(scrapeFile)) {
            console.log(`  ✗ No scraped data`); failed++; continue;
        }

        const markdown = fs.readFileSync(scrapeFile, 'utf8');
        const insights = await callGeminiWithRetry(buildPrompt(venue, markdown));

        if (insights) {
            const idx = venues.findIndex(v => v.slug === venue.slug);
            venues[idx].acoustics = insights.acoustics;
            venues[idx].setup_notes = insights.setup_notes;
            venues[idx].best_for = insights.best_for;
            venues[idx].insider_tip = insights.insider_tip;
            success++;
            console.log(`  ✓ ${venue.name}`);
            fs.writeFileSync(VENUES_FILE, JSON.stringify(venues, null, 2) + '\n');
        } else {
            failed++;
            console.log(`  ✗ Failed: ${venue.name}`);
        }

        // Free tier = 2 RPM, so wait 35s between calls to be safe
        if (i < toEnrich.length - 1) {
            console.log(`    ⏳ Cooldown 35s...`);
            await sleep(35000);
        }
    }

    console.log(`\n✅ Done! Success: ${success}, Failed: ${failed}`);
}

main();
