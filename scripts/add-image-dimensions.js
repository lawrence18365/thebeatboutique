#!/usr/bin/env node

/**
 * Script to add width and height attributes to all <img> tags
 * Improves Core Web Vitals by preventing layout shifts (CLS)
 */

const fs = require('fs');
const path = require('path');
const sizeOf = require('image-size').default;

// Configuration
const HTML_FILES = [
    'index.html',
    'about/index.html',
    'showcase/index.html',
    'pricing-guide/index.html',
    'song-list/index.html',
    'venues/index.html',
    'wedding-band-ireland/index.html',
    'party-band/index.html',
    'corporate-events/index.html',
    'christmas-parties/index.html',
    'thank-you/index.html',
];

const BASE_DIR = path.join(__dirname, '..');

// Image dimension cache (for common images used multiple times)
const dimensionCache = new Map();

async function getImageDimensions(imgSrc) {
    // Return cached if available
    if (dimensionCache.has(imgSrc)) {
        return dimensionCache.get(imgSrc);
    }

    // Skip external images
    if (imgSrc.startsWith('http://') || imgSrc.startsWith('https://')) {
        console.log(`⚠️  Skipping external image: ${imgSrc}`);
        return null;
    }

    // Resolve image path
    const imagePath = path.join(BASE_DIR, imgSrc);

    if (!fs.existsSync(imagePath)) {
        console.log(`⚠️  Image not found: ${imagePath}`);
        return null;
    }

    try {
        const buffer = fs.readFileSync(imagePath);
        const dimensions = sizeOf(buffer);
        const result = { width: dimensions.width, height: dimensions.height };
        dimensionCache.set(imgSrc, result);
        return result;
    } catch (error) {
        console.error(`❌ Error reading image ${imgSrc}:`, error.message);
        return null;
    }
}

function findImagesWithoutDimensions(html) {
    // Regex to find <img> tags without both width AND height attributes
    const imgRegex = /<img\s+([^>]*?)>/gi;
    const matches = [];
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
        const fullTag = match[0];
        const attributes = match[1];

        const hasWidth = /\bwidth=/i.test(attributes);
        const hasHeight = /\bheight=/i.test(attributes);

        // Only process if missing either width or height
        if (!hasWidth || !hasHeight) {
            // Extract src attribute
            const srcMatch = attributes.match(/\bsrc=["']([^"']+)["']/i);
            if (srcMatch) {
                matches.push({
                    fullTag,
                    src: srcMatch[1],
                    index: match.index,
                    hasWidth,
                    hasHeight
                });
            }
        }
    }

    return matches;
}

function addDimensionsToTag(tag, dimensions) {
    // Remove closing /> if present
    let newTag = tag.replace(/\s*\/?>$/, '');

    // Add width and height attributes
    newTag += ` width="${dimensions.width}" height="${dimensions.height}">`;

    return newTag;
}

async function processHtmlFile(filePath) {
    const fullPath = path.join(BASE_DIR, filePath);

    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️  File not found: ${filePath}`);
        return { processed: 0, skipped: 0 };
    }

    console.log(`\n📄 Processing: ${filePath}`);

    let html = fs.readFileSync(fullPath, 'utf8');
    const images = findImagesWithoutDimensions(html);

    if (images.length === 0) {
        console.log(`  ✅ All images already have dimensions`);
        return { processed: 0, skipped: 0 };
    }

    console.log(`  Found ${images.length} images without proper dimensions`);

    let processedCount = 0;
    let skippedCount = 0;

    // Process images in reverse order to maintain correct indices
    for (let i = images.length - 1; i >= 0; i--) {
        const img = images[i];
        console.log(`  🔍 ${img.src}`);

        const dimensions = await getImageDimensions(img.src);

        if (!dimensions) {
            skippedCount++;
            continue;
        }

        const newTag = addDimensionsToTag(img.fullTag, dimensions);
        html = html.slice(0, img.index) + newTag + html.slice(img.index + img.fullTag.length);

        console.log(`     ✅ Added ${dimensions.width}x${dimensions.height}`);
        processedCount++;
    }

    // Write updated HTML
    if (processedCount > 0) {
        fs.writeFileSync(fullPath, html, 'utf8');
        console.log(`  💾 Updated ${processedCount} images`);
    }

    if (skippedCount > 0) {
        console.log(`  ⏭️  Skipped ${skippedCount} images`);
    }

    return { processed: processedCount, skipped: skippedCount };
}

async function main() {
    console.log('🚀 Adding width/height attributes to images...\n');

    let totalProcessed = 0;
    let totalSkipped = 0;

    for (const htmlFile of HTML_FILES) {
        const result = await processHtmlFile(htmlFile);
        totalProcessed += result.processed;
        totalSkipped += result.skipped;
    }

    console.log('\n' + '='.repeat(50));
    console.log(`✅ Complete!`);
    console.log(`   Processed: ${totalProcessed} images`);
    console.log(`   Skipped: ${totalSkipped} images`);
    console.log('='.repeat(50));

    if (totalProcessed > 0) {
        console.log('\n💡 Next steps:');
        console.log('   1. Review the changes: git diff');
        console.log('   2. Test locally');
        console.log('   3. Commit: git add -A && git commit -m "Add width/height to images"');
    }
}

main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
});
