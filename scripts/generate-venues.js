const fs = require('fs');
const path = require('path');

// Read venue data
const venues = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/venues.json'), 'utf8'));
const counties = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/counties.json'), 'utf8'));
const validCountySlugs = new Set(counties.map((county) => county.slug));
const countySlugByName = new Map(counties.map((county) => [county.name.toLowerCase(), county.slug]));
const VENUE_INDEX_PATH = path.join(__dirname, '../venues/index.html');
const VENUE_DIRECTORY_START = '<!-- Auto-generated venue directory start -->';
const VENUE_DIRECTORY_END = '<!-- Auto-generated venue directory end -->';
const FEATURED_VENUE_SLUGS = [
    'kilshane-house',
    'mount-druid',
    'ballybeg-house',
    'cliff-at-lyons',
    'poulaphouca-house-and-falls',
    'powerscourt-hotel',
    'tankardstown-house',
    'ashford-castle',
];

const normalizeSitePath = (urlPath) => {
    if (!urlPath || urlPath === '/') return '/';
    if (urlPath.endsWith('/')) return urlPath;
    return `${urlPath}/`;
};

const toCanonicalUrl = (urlPath) => `https://thebeatboutique.ie${normalizeSitePath(urlPath)}`;
const sortVenuesByName = (venueList) => [...venueList].sort((a, b) => a.name.localeCompare(b.name));

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function indentBlock(content, spaces = 4) {
    const pad = ' '.repeat(spaces);
    return content
        .split('\n')
        .map((line) => `${pad}${line}`)
        .join('\n');
}

function isPlaceholder(value) {
    if (!value) return true;
    const v = String(value).toLowerCase();
    return v.includes('placeholder') || v.includes('needs real');
}

function formatNaturalList(items) {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function getRelatedVenues(currentVenue) {
    const sameCountyVenues = sortVenuesByName(
        venues.filter((candidate) => candidate.slug !== currentVenue.slug && candidate.county === currentVenue.county)
    ).slice(0, 3);

    const sortedVenueList = sortVenuesByName(venues);
    const currentVenueIndex = sortedVenueList.findIndex((candidate) => candidate.slug === currentVenue.slug);
    const nearbyVenueOffsets = [1, -1, 2, -2, 3, -3];
    const nearbyVenues = nearbyVenueOffsets
        .map((offset) => sortedVenueList[currentVenueIndex + offset])
        .filter(Boolean)
        .filter((candidate) => candidate.slug !== currentVenue.slug)
        .filter((candidate) => !sameCountyVenues.some((sameCountyVenue) => sameCountyVenue.slug === candidate.slug))
        .slice(0, 3);

    const fallbackVenues = FEATURED_VENUE_SLUGS
        .map((slug) => venues.find((candidate) => candidate.slug === slug))
        .filter(Boolean)
        .filter((candidate) => candidate.slug !== currentVenue.slug)
        .filter((candidate) => !sameCountyVenues.some((sameCountyVenue) => sameCountyVenue.slug === candidate.slug))
        .filter((candidate) => !nearbyVenues.some((nearbyVenue) => nearbyVenue.slug === candidate.slug))
        .slice(0, 2);

    return [...sameCountyVenues, ...nearbyVenues, ...fallbackVenues].slice(0, 5);
}

function renderRelatedVenueLinks(currentVenue) {
    return getRelatedVenues(currentVenue)
        .map((relatedVenue) => {
            const description = relatedVenue.county === currentVenue.county
                ? `Another ${currentVenue.county} venue guide`
                : `${relatedVenue.county} wedding venue guide`;
            return `                <li><a href="venues/${relatedVenue.slug}/">${escapeHtml(relatedVenue.name)}</a> — ${escapeHtml(description)}</li>`;
        })
        .join('\n');
}

function buildVenueDirectorySection(venueList) {
    const sortedVenues = sortVenuesByName(venueList);
    const venueLinks = sortedVenues
        .map((venue) => `                <li><a href="venues/${venue.slug}/">${escapeHtml(venue.name)}</a> <span style="opacity: 0.7;">(${escapeHtml(venue.county)})</span></li>`)
        .join('\n');

    return `    ${VENUE_DIRECTORY_START}
    <section class="container">
        <div style="padding: 20px 0 60px;">
            <h2 class="section-title">All Venue Guides</h2>
            <p style="max-width: 720px; margin: 0 auto 20px; text-align: center; opacity: 0.8;">Browse every venue guide to compare spaces, setup tips, and local expertise.</p>
            <ul style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px 20px; max-width: 1100px; margin: 0 auto; padding: 0; list-style: none;">
${venueLinks}
            </ul>
        </div>
    </section>
    ${VENUE_DIRECTORY_END}`;
}

function updateVenueIndexStructuredData(content, venueList) {
    const structuredDataRegex = /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/;
    const match = content.match(structuredDataRegex);

    if (!match) {
        console.warn('Skipped structured data update for venues/index.html (JSON-LD block not found).');
        return content;
    }

    let parsedStructuredData;
    try {
        parsedStructuredData = JSON.parse(match[1]);
    } catch (error) {
        console.warn(`Skipped structured data update for venues/index.html (invalid JSON-LD): ${error.message}`);
        return content;
    }

    if (!Array.isArray(parsedStructuredData['@graph'])) {
        console.warn('Skipped structured data update for venues/index.html (@graph missing).');
        return content;
    }

    const itemList = parsedStructuredData['@graph'].find((item) => item['@type'] === 'ItemList');
    if (!itemList) {
        console.warn('Skipped structured data update for venues/index.html (ItemList missing).');
        return content;
    }

    const sortedVenues = sortVenuesByName(venueList);
    itemList.itemListElement = sortedVenues.map((venue, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        item: {
            '@type': 'Place',
            name: venue.name,
            url: toCanonicalUrl(`/venues/${venue.slug}`),
        },
    }));

    const updatedJsonLd = JSON.stringify(parsedStructuredData, null, 2);
    const replacement = `<script type="application/ld+json">\n${indentBlock(updatedJsonLd, 4)}\n    </script>`;
    return content.replace(structuredDataRegex, replacement);
}

function updateVenueIndexPage(venueList) {
    if (!fs.existsSync(VENUE_INDEX_PATH)) {
        console.warn('Skipped venues/index.html update (file not found).');
        return false;
    }

    const originalContent = fs.readFileSync(VENUE_INDEX_PATH, 'utf8');
    let updatedContent = updateVenueIndexStructuredData(originalContent, venueList);
    const directorySection = buildVenueDirectorySection(venueList);

    const existingStart = updatedContent.indexOf(VENUE_DIRECTORY_START);
    const existingEnd = updatedContent.indexOf(VENUE_DIRECTORY_END);

    if (existingStart !== -1 && existingEnd !== -1 && existingEnd > existingStart) {
        const blockStart = updatedContent.lastIndexOf('\n', existingStart);
        const startIndex = blockStart === -1 ? existingStart : blockStart + 1;
        const replaceEnd = existingEnd + VENUE_DIRECTORY_END.length;
        const blockEnd = updatedContent.indexOf('\n', replaceEnd);
        const endIndex = blockEnd === -1 ? replaceEnd : blockEnd;
        updatedContent = `${updatedContent.slice(0, startIndex)}${directorySection}${updatedContent.slice(endIndex)}`;
    } else {
        const insertionAnchor = '    <section class="internal-links">';
        const anchorIndex = updatedContent.indexOf(insertionAnchor);

        if (anchorIndex === -1) {
            console.warn('Skipped venues/index.html venue directory insertion (anchor section not found).');
            return false;
        }

        updatedContent = `${updatedContent.slice(0, anchorIndex)}${directorySection}\n\n${updatedContent.slice(anchorIndex)}`;
    }

    if (updatedContent === originalContent) {
        return false;
    }

    fs.writeFileSync(VENUE_INDEX_PATH, updatedContent);
    return true;
}

const generateVenuePage = (venue) => {
    const countySlug = countySlugByName.get(venue.county.toLowerCase()) || venue.county.toLowerCase();
    const countyGuideItem = validCountySlugs.has(countySlug)
        ? `<li><a href="locations/wedding-band-${countySlug}/">Wedding Band ${venue.county}</a> — More ${venue.county} weddings</li>`
        : `<li>Wedding Band ${venue.county} — More ${venue.county} weddings</li>`;
    const hasAcoustics = !isPlaceholder(venue.acoustics);
    const hasSetup = !isPlaceholder(venue.setup_notes);
    const hasTip = !isPlaceholder(venue.insider_tip);
    const hasBestFor = !isPlaceholder(venue.best_for);
    const hasTestimonial = !isPlaceholder(venue.testimonial) && !isPlaceholder(venue.testimonial_author);
    const metaSignals = [];
    if (hasAcoustics) metaSignals.push('acoustics tips');
    if (hasSetup) metaSignals.push('setup advice');
    if (hasTestimonial) metaSignals.push('real couple feedback');

    const defaultMetaDescription = metaSignals.length > 0
        ? `${venue.name} wedding band guide — ${formatNaturalList(metaSignals)} from ${venue.weddings_played} weddings we've played there.`
        : `${venue.name} wedding band guide — venue notes, setup guidance, and practical planning tips from ${venue.weddings_played} weddings we've played there.`;
    const venueMetaDescription = venue.meta_description || defaultMetaDescription;
    const metaTitle = venue.title || `${venue.name} Wedding Band | The Beat Boutique`;
    const socialDescription = venue.og_description || venueMetaDescription;
    const articleHeadline = venue.article_headline || `${venue.name} Wedding Band Guide`;
    const relatedVenueLinks = renderRelatedVenueLinks(venue);
    const hasSameCountyVenueLinks = venues.some((candidate) => candidate.slug !== venue.slug && candidate.county === venue.county);
    const moreVenueGuidesHeading = hasSameCountyVenueLinks ? `More ${venue.county} Venue Guides` : 'More Venue Guides';
    const moreVenueGuidesIntro = hasSameCountyVenueLinks
        ? `Compare more venues we play regularly in ${venue.county}, plus a few of our busiest wedding venues around Ireland:`
        : 'Explore more venue guides for tips and insider knowledge:';

    const aboutText = hasBestFor
        ? `${venue.setting}. With capacity for ${venue.capacity} guests, ${venue.name} is ${venue.best_for.toLowerCase()}`
        : `${venue.setting}. With capacity for ${venue.capacity} guests, ${venue.name} is a stunning setting for your wedding day.`;

    const acousticsSection = hasAcoustics ? `
        <div class="venue-section">
            <h2>Acoustics &amp; Sound</h2>
            <p>${venue.acoustics}</p>
        </div>` : '';

    const setupSection = hasSetup ? `
        <div class="venue-section">
            <h2>Band Setup</h2>
            <p>${venue.setup_notes}</p>
        </div>` : '';

    const tipSection = hasTip ? `
        <div class="insider-tip">
            <h4>Insider Tip</h4>
            <p>${venue.insider_tip}</p>
        </div>` : '';

    const reviewSection = hasTestimonial ? `
        <div class="venue-review">
            <div style="color: var(--accent-gold); margin-bottom: 15px;">★★★★★</div>
            <blockquote>"${venue.testimonial}"</blockquote>
            <p style="opacity: 0.8;">— ${venue.testimonial_author}</p>
        </div>` : '';

    const reviewSchema = hasTestimonial ? `,
        {
          "@type": "Review",
          "reviewRating": { "@type": "Rating", "ratingValue": "5" },
          "author": { "@type": "Person", "name": "${venue.testimonial_author}" },
          "reviewBody": "${venue.testimonial}"
        }` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <base href="/">
    <script>
        (function() {
            var base = '/';
            if (location.protocol === 'file:') {
                var path = location.pathname;
                var marker = '/thebeatboutique/';
                var idx = path.lastIndexOf(marker);
                base = idx !== -1 ? path.slice(0, idx + marker.length) : path.replace(/\\/[\\/]*[^\\/]*$/, '/');
            } else if (location.hostname.endsWith('github.io')) {
                base = '/thebeatboutique/';
            }
            var baseEl = document.querySelector('base');
            if (baseEl) {
                baseEl.setAttribute('href', base);
            }
        })();
    </script>

    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${metaTitle}</title>
    <meta name="description" content="${venueMetaDescription}">
    <link rel="canonical" href="${toCanonicalUrl(`/venues/${venue.slug}`)}">

    <!-- Open Graph -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="${toCanonicalUrl(`/venues/${venue.slug}`)}">
    <meta property="og:title" content="${metaTitle}">
    <meta property="og:description" content="${socialDescription}">
    <meta property="og:image" content="https://thebeatboutique.ie/assets/images/the_beat_boutique_wedding_band_dublin_ireland.webp">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="${toCanonicalUrl(`/venues/${venue.slug}`)}">
    <meta property="twitter:title" content="${metaTitle}">
    <meta property="twitter:description" content="${socialDescription}">
    <meta property="twitter:image" content="https://thebeatboutique.ie/assets/images/the_beat_boutique_wedding_band_dublin_ireland.webp">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="${toCanonicalUrl(`/venues/${venue.slug}`)}">
    <meta name="twitter:title" content="${metaTitle}">
    <meta name="twitter:description" content="${socialDescription}">
    <meta name="twitter:image" content="https://thebeatboutique.ie/assets/images/the_beat_boutique_wedding_band_dublin_ireland.webp">

    <link rel="icon" type="image/webp" sizes="32x32" href="assets/images/the_beat_boutique_logo.webp">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" media="print" onload="this.media='all'">
    <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap"></noscript>
    <link rel="stylesheet" href="css/style.css">

    <!-- Structured Data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": ["Organization", "MusicGroup", "LocalBusiness"],
          "@id": "https://thebeatboutique.ie/#organization",
          "name": "The Beat Boutique",
          "url": "https://thebeatboutique.ie/",
          "image": "https://thebeatboutique.ie/assets/images/the_beat_boutique_wedding_band_dublin_ireland.webp",
          "sameAs": [
            "https://www.facebook.com/thebeatboutiqueband",
            "https://www.instagram.com/thebeatboutiqueweddingband/"
          ],
          "telephone": "+353872310001",
          "email": "justask@thebeatboutique.ie",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "503 Griffith Ave, Glasnevin",
            "addressLocality": "Dublin",
            "postalCode": "D11 Y977",
            "addressRegion": "County Dublin",
            "addressCountry": "IE"
          },
          "aggregateRating": {
            "@type": "AggregateRating",
            "ratingValue": "5",
            "bestRating": "5",
            "worstRating": "1",
            "reviewCount": "180"
          }
        },
        {
          "@type": "Article",
          "headline": "${articleHeadline}",
          "description": "${venueMetaDescription}",
          "author": { "@id": "https://thebeatboutique.ie/#organization" },
          "publisher": {
            "@id": "https://thebeatboutique.ie/#organization"
          },
          "datePublished": "2025-01-01",
          "dateModified": "2026-02-01"
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://thebeatboutique.ie/" },
            { "@type": "ListItem", "position": 2, "name": "Venues", "item": "https://thebeatboutique.ie/venues/" },
            { "@type": "ListItem", "position": 3, "name": "${venue.name}", "item": "${toCanonicalUrl(`/venues/${venue.slug}`)}" }
          ]
        }${reviewSchema}
      ]
    }
    </script>

    <style>
        .venue-hero {
            background: linear-gradient(rgba(10,25,47,0.7), rgba(10,25,47,0.85)),
                        url('assets/images/the_beat_boutique_wedding_band_dublin_ireland.webp');
            background-size: cover;
            background-position: center;
            padding: 180px 0 100px;
            text-align: center;
        }

        .venue-content { max-width: 900px; margin: 0 auto; padding: 60px 20px; }

        .venue-meta {
            display: flex;
            flex-wrap: wrap;
            gap: 30px;
            justify-content: center;
            margin: 30px 0;
            padding: 30px;
            background: rgba(255,255,255,0.05);
            border-radius: 4px;
        }

        .venue-meta-item {
            text-align: center;
        }

        .venue-meta-label {
            font-size: 0.8rem;
            text-transform: uppercase;
            letter-spacing: 1px;
            opacity: 0.7;
            display: block;
            margin-bottom: 5px;
        }

        .venue-meta-value {
            font-size: 1.1rem;
            color: var(--accent-gold);
        }

        .venue-section {
            margin: 50px 0;
        }

        .venue-section h2 {
            color: var(--primary-navy);
            margin-bottom: 20px;
            font-family: var(--font-serif);
        }

        .venue-section p {
            line-height: 1.8;
            color: #333;
        }

        .insider-tip {
            background: linear-gradient(135deg, #f8f4e8, #fff);
            border-left: 4px solid var(--accent-gold);
            padding: 25px;
            margin: 30px 0;
        }

        .insider-tip h4 {
            color: var(--primary-navy);
            margin: 0 0 10px;
        }

        .venue-review {
            background: var(--primary-teal);
            color: white;
            padding: 40px;
            text-align: center;
            margin: 50px 0;
            border-radius: 4px;
        }

        .venue-review blockquote {
            font-family: var(--font-serif);
            font-size: 1.3rem;
            font-style: italic;
            margin: 0 0 20px;
            line-height: 1.6;
        }

        .breadcrumb {
            padding: 20px;
            font-size: 0.9rem;
            max-width: 900px;
            margin: 0 auto;
        }

        .breadcrumb a { color: var(--primary-teal); }

        @media (max-width: 600px) {
            .venue-meta { flex-direction: column; gap: 20px; }
        }
    </style>
</head>
<body>

    <nav class="navbar">
        <div class="container nav-container">
            <a href="./" class="logo">
                <img src="assets/images/the_beat_boutique_logo.webp" alt="The Beat Boutique" class="logo-img">
            </a>
            <ul class="nav-menu">
                <li><a href="about/" class="nav-link">About</a></li>
                <li><a href="why-us/" class="nav-link">Why Us</a></li>
                <li><a href="showcase/" class="nav-link">Showcase</a></li>
                <li><a href="pricing-guide/" class="nav-link">Pricing</a></li>
                <li><a href="venues/" class="nav-link">Venues</a></li>
                <li><a href="wedding-band-ireland/" class="nav-cta btn-primary">Ireland</a></li>
            </ul>
        </div>
    </nav>

    <header class="venue-hero">
        <div class="container">
            <p style="color: var(--accent-gold); text-transform: uppercase; letter-spacing: 2px; margin-bottom: 15px;">Venue Guide</p>
            <h1 class="hero-title">${venue.name}</h1>
            <p class="hero-subtitle">${venue.location}</p>

            <div class="venue-meta">
                <div class="venue-meta-item">
                    <span class="venue-meta-label">Capacity</span>
                    <span class="venue-meta-value">${venue.capacity} guests</span>
                </div>
                <div class="venue-meta-item">
                    <span class="venue-meta-label">Main Room</span>
                    <span class="venue-meta-value">${venue.ballroom}</span>
                </div>
                <div class="venue-meta-item">
                    <span class="venue-meta-label">Weddings Played</span>
                    <span class="venue-meta-value">${venue.weddings_played}</span>
                </div>
            </div>
        </div>
    </header>

    <div class="breadcrumb">
        <a href="./">Home</a> / <a href="venues/">Venues</a> / ${venue.name}
    </div>

    <article class="venue-content">

        <div class="venue-section">
            <h2>About ${venue.name}</h2>
            <p>${aboutText}</p>
        </div>
${acousticsSection}
${setupSection}
${tipSection}
${reviewSection}

        <div class="venue-section">
            <h2>Planning Your ${venue.name} Wedding?</h2>
            <p>We've played ${venue.weddings_played} weddings at ${venue.name} and know the venue inside out. From setup logistics to the perfect setlist for the space, we handle everything so you can enjoy your day.</p>
            <p>Check our availability for your date, read what couples say on our <a href="reviews/">reviews page</a>, or come see us live at our Dublin showcase first.</p>
        </div>

        <div style="display: flex; gap: 15px; justify-content: center; flex-wrap: wrap; margin: 40px 0;">
            <a href="./#contact" class="btn btn-primary">Check Availability</a>
            <a href="showcase/" class="btn btn-secondary" style="border-color: var(--primary-navy); color: var(--primary-navy);">See Us Live</a>
        </div>

        <div class="venue-section">
            <h2>Related Guides</h2>
            <ul style="line-height: 2;">
                <li><a href="reviews/">Wedding Band Reviews</a> — Real feedback from Irish couples</li>
                <li><a href="wedding-band-ireland/">Wedding Band Ireland</a> — County guides and nationwide coverage</li>
                <li><a href="guides/first-dance-songs/">First Dance Songs Ireland</a> — Top 50 wedding songs</li>
                <li><a href="guides/how-to-choose-wedding-band/">How to Choose a Wedding Band</a> — Complete guide</li>
                <li><a href="guides/questions-to-ask-wedding-band/">Questions to Ask</a> — 20 essential questions</li>
                <li><a href="song-list/">Our Song List</a> — 200+ songs we perform</li>
                ${countyGuideItem}
            </ul>
        </div>

        <div class="venue-section">
            <h2>${moreVenueGuidesHeading}</h2>
            <p>${moreVenueGuidesIntro}</p>
            <ul style="line-height: 2;">
${relatedVenueLinks}
                <li><a href="venues/">View All ${venues.length}+ Venues →</a></li>
            </ul>
        </div>

    </article>

        <footer class="footer">
        <div class="container">
            <div class="footer-grid">
                <div class="footer-col footer-brand">
                    <a href="./" class="footer-logo-link">
                        <img src="assets/images/the_beat_boutique_logo.webp" alt="The Beat Boutique" class="footer-logo-lg">
                    </a>
                    <p class="footer-tagline">Ireland's premier wedding band.</p>
                </div>
                <div class="footer-col">
                    <h4 class="footer-heading">Explore</h4>
                    <ul class="footer-nav">
                        <li><a href="showcase/">Live Showcase</a></li>
                        <li><a href="reviews/">Reviews</a></li>
                        <li><a href="song-list/">Song List</a></li>
                        <li><a href="venues/">Venues</a></li>
                        <li><a href="pricing-guide/">Pricing</a></li>
                    </ul>
                </div>
                <div class="footer-col">
                    <h4 class="footer-heading">Guides</h4>
                    <ul class="footer-nav">
                        <li><a href="guides/how-to-choose-wedding-band/">How to Choose a Band</a></li>
                        <li><a href="guides/first-dance-songs/">First Dance Songs</a></li>
                        <li><a href="guides/wedding-band-vs-dj/">Band vs DJ</a></li>
                        <li><a href="wedding-band-ireland/">Wedding Band Ireland</a></li>
                    </ul>
                </div>
                <div class="footer-col">
                    <h4 class="footer-heading">Contact</h4>
                    <ul class="footer-contact">
                        <li><a href="mailto:justask@thebeatboutique.ie">justask@thebeatboutique.ie</a></li>
                        <li><a href="tel:+353872310001">+353 87 231 0001</a></li>
                        <li><address style="font-style: normal; opacity: 0.8;">503 Griffith Ave, Glasnevin<br>Dublin 11, D11 Y977</address></li>
                    </ul>
                </div>
            </div>
            <div class="footer-bottom">
                <p>&copy; 2018-2026 The Beat Boutique. All rights reserved.</p>
                <div class="footer-legal">
                    <a href="privacy/">Privacy</a>
                    <a href="terms/">Terms</a>
                </div>
            </div>
        </div>
    </footer>

    <script src="js/main.js"></script>
</body>
</html>`;
};

// Generate venue pages
venues.forEach(venue => {
    const html = generateVenuePage(venue);
    const outputDir = path.join(__dirname, '../venues', venue.slug);
    const filePath = path.join(outputDir, 'index.html');

    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(filePath, html);
    console.log(`Generated: venues/${venue.slug}/index.html`);
});

const updatedVenueIndex = updateVenueIndexPage(venues);
if (updatedVenueIndex) {
    console.log('Updated: venues/index.html');
} else {
    console.log('Unchanged: venues/index.html');
}

console.log(`\nSuccessfully generated ${venues.length} venue pages!`);
