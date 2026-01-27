const fs = require('fs');
const path = require('path');

// Read the data
const counties = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/counties.json'), 'utf8'));

// Map of county slugs to names for nearby counties links
const countyNames = {
    dublin: 'Dublin', wicklow: 'Wicklow', meath: 'Meath', kildare: 'Kildare',
    louth: 'Louth', westmeath: 'Westmeath', wexford: 'Wexford', kilkenny: 'Kilkenny',
    waterford: 'Waterford', cork: 'Cork', kerry: 'Kerry', limerick: 'Limerick',
    tipperary: 'Tipperary', clare: 'Clare', galway: 'Galway', mayo: 'Mayo',
    donegal: 'Donegal', sligo: 'Sligo', roscommon: 'Roscommon', monaghan: 'Monaghan',
    armagh: 'Armagh', carlow: 'Carlow', leitrim: 'Leitrim', derry: 'Derry'
};

// Generate venue pills - now with optional links
const generateVenuePills = (venues) => {
    return venues.map(venue => {
        if (venue.slug) {
            return `<a href="../venues/${venue.slug}.html" class="venue-pill venue-pill-link">${venue.name}</a>`;
        }
        return `<div class="venue-pill">${venue.name}</div>`;
    }).join('');
};

// Generate venue descriptions section
const generateVenueDescriptions = (venues) => {
    return venues.map(venue => {
        const link = venue.slug 
            ? `<a href="../venues/${venue.slug}.html" style="color: var(--accent-gold);">Read our ${venue.name} guide →</a>`
            : '';
        return `
            <div style="margin-bottom: 1.5rem;">
                <h4 style="margin: 0 0 0.5rem; color: var(--primary-navy);">${venue.name}</h4>
                <p style="margin: 0; opacity: 0.8; font-size: 0.95rem;">${venue.description} ${link}</p>
            </div>`;
    }).join('');
};

// Generate testimonials section with schema
const generateTestimonials = (testimonials, countyName) => {
    return testimonials.map(testimonial => `
        <div class="review-card">
            <div style="color: var(--accent-gold); margin-bottom: 8px;">★★★★★</div>
            <p style="font-family: var(--font-serif); font-size: 1.1rem; font-style: italic; margin-bottom: 12px;">"${testimonial.text}"</p>
            <p style="opacity: 0.7; margin: 0;">— ${testimonial.author}</p>
        </div>`).join('');
};

// Generate nearby counties links
const generateNearbyCounties = (nearbyCounties) => {
    // Filter to only counties we have pages for
    const validSlugs = counties.map(c => c.slug);
    return nearbyCounties
        .filter(slug => validSlugs.includes(slug))
        .map(slug => `<a href="wedding-band-${slug}.html" class="nearby-county-link">${countyNames[slug] || slug}</a>`)
        .join('');
};

// Generate FAQs section
const generateFAQs = (faqs) => {
    return faqs.map(faq => `
        <div class="faq-item">
            <h4 style="margin: 0 0 0.5rem; color: var(--primary-navy);">${faq.question}</h4>
            <p style="margin: 0; opacity: 0.8;">${faq.answer}</p>
        </div>`).join('');
};

// Generate FAQ Schema
const generateFAQSchema = (faqs) => {
    const faqItems = faqs.map(faq => `{
              "@type": "Question",
              "name": "${faq.question.replace(/"/g, '\\"')}",
              "acceptedAnswer": {
                "@type": "Answer",
                "text": "${faq.answer.replace(/"/g, '\\"')}"
              }
            }`).join(',\n            ');
    return faqItems;
};

// Generate Review Schema
const generateReviewSchema = (testimonials) => {
    return testimonials.map(t => `{
              "@type": "Review",
              "reviewRating": { "@type": "Rating", "ratingValue": "5" },
              "author": { "@type": "Person", "name": "${t.author.split(',')[0].replace(/"/g, '\\"')}" },
              "reviewBody": "${t.text.replace(/"/g, '\\"')}"
            }`).join(',\n            ');
};

// The HTML Template Function
const generateTemplate = (county) => {
    const nearbyCountiesHtml = generateNearbyCounties(county.nearby_counties || []);
    const hasNearbyCounties = county.nearby_counties && county.nearby_counties.length > 0;
    const hasFAQs = county.faqs && county.faqs.length > 0;
    const hasMultipleTestimonials = county.testimonials && county.testimonials.length > 1;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Wedding Band ${county.name} | The Beat Boutique</title>
    <meta name="description" content="${county.meta_description}">
    <link rel="canonical" href="https://thebeatboutique.ie/locations/wedding-band-${county.slug}.html">
    
    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://thebeatboutique.ie/locations/wedding-band-${county.slug}.html">
    <meta property="og:title" content="Wedding Band ${county.name} | The Beat Boutique">
    <meta property="og:description" content="${county.meta_description}">
    <meta property="og:image" content="${county.hero_image.startsWith('http') ? county.hero_image : 'https://thebeatboutique.ie/assets/images/the_beat_boutique_wedding_band_dublin_ireland.webp'}">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="https://thebeatboutique.ie/locations/wedding-band-${county.slug}.html">
    <meta property="twitter:title" content="Wedding Band ${county.name} | The Beat Boutique">
    <meta property="twitter:description" content="${county.meta_description}">
    <meta property="twitter:image" content="${county.hero_image.startsWith('http') ? county.hero_image : 'https://thebeatboutique.ie/assets/images/the_beat_boutique_wedding_band_dublin_ireland.webp'}">
    <link rel="icon" type="image/png" sizes="32x32" href="../assets/images/favicon.png">
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="../css/style.css">

    <!-- Structured Data (Schema.org) -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Service",
          "name": "Wedding Band ${county.name}",
          "serviceType": "Wedding Entertainment",
          "description": "${county.meta_description.replace(/"/g, '\\"')}",
          "provider": {
            "@type": "MusicGroup",
            "name": "The Beat Boutique",
            "url": "https://thebeatboutique.ie"
          },
          "areaServed": {
            "@type": "AdministrativeArea",
            "name": "${county.name}",
            "containedInPlace": {
              "@type": "Country",
              "name": "Ireland"
            }
          },
          "review": [
            ${generateReviewSchema(county.testimonials || [county.review])}
          ]
        },
        {
          "@type": "BreadcrumbList",
          "itemListElement": [
            {
              "@type": "ListItem",
              "position": 1,
              "name": "Home",
              "item": "https://thebeatboutique.ie"
            },
            {
              "@type": "ListItem",
              "position": 2,
              "name": "Wedding Band Ireland",
              "item": "https://thebeatboutique.ie/wedding-band-ireland.html"
            },
            {
              "@type": "ListItem",
              "position": 3,
              "name": "Wedding Band ${county.name}",
              "item": "https://thebeatboutique.ie/locations/wedding-band-${county.slug}.html"
            }
          ]
        }${hasFAQs ? `,
        {
          "@type": "FAQPage",
          "mainEntity": [
            ${generateFAQSchema(county.faqs)}
          ]
        }` : ''}
      ]
    }
    </script>
    
    <style>
        .county-hero {
            background: linear-gradient(rgba(10,25,47,0.7), rgba(10,25,47,0.8)), url('${county.hero_image}');
            background-size: cover;
            background-position: center;
            padding: 180px 0 100px;
            text-align: center;
            color: var(--text-cream);
        }
        
        .venue-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
            margin-top: 30px;
        }

        .venue-pill {
            background: white;
            padding: 18px;
            text-align: center;
            border-bottom: 3px solid var(--accent-gold);
            color: var(--primary-navy);
            font-weight: 600;
            box-shadow: 0 5px 15px rgba(0,0,0,0.05);
        }

        .venue-pill-link {
            text-decoration: none;
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .venue-pill-link:hover {
            transform: translateY(-3px);
            box-shadow: 0 8px 20px rgba(0,0,0,0.1);
        }

        .review-cards {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-top: 30px;
        }

        .review-card {
            background: var(--primary-teal);
            padding: 30px;
            color: white;
            border-radius: 4px;
        }

        .nearby-counties {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            justify-content: center;
            margin-top: 20px;
        }

        .nearby-county-link {
            background: white;
            padding: 12px 24px;
            color: var(--primary-navy);
            text-decoration: none;
            font-weight: 500;
            border-radius: 4px;
            box-shadow: 0 3px 10px rgba(0,0,0,0.05);
            transition: transform 0.2s, box-shadow 0.2s;
        }

        .nearby-county-link:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.1);
        }

        .faq-section {
            background: #f9f9f9;
            padding: 60px 0;
        }

        .faq-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 25px;
            margin-top: 30px;
        }

        .faq-item {
            background: white;
            padding: 25px;
            border-radius: 4px;
            box-shadow: 0 3px 10px rgba(0,0,0,0.05);
        }
    </style>
</head>
<body>

    <nav class="navbar" style="background: var(--primary-navy); transform: translateY(0);">
        <div class="container nav-container">
            <a href="../index.html" class="logo">
                <img src="../assets/images/the_beat_boutique_logo.webp" alt="The Beat Boutique" class="logo-img">
            </a>
            <ul class="nav-menu">
                <li><a href="../index.html" class="nav-link">Home</a></li>
                <li><a href="../wedding-band-ireland.html" class="nav-link">Ireland</a></li>
                <li><a href="../venues/index.html" class="nav-link">Venues</a></li>
                <li><a href="../pricing-guide.html" class="nav-link">Pricing</a></li>
                <li><a href="../index.html#contact" class="nav-cta btn-primary">Enquire Now</a></li>
            </ul>
        </div>
    </nav>

    <header class="county-hero">
        <div class="container">
            <h1 class="hero-title">Wedding Band ${county.name}</h1>
            <p class="hero-subtitle" style="max-width: 700px; margin: 0 auto;">${county.intro_text}</p>
        </div>
    </header>

    <section style="padding: 80px 0;">
        <div class="container">
            <div style="max-width: 900px; margin: 0 auto;">
                
                <!-- Why Choose Us Section -->
                <h2 class="section-title text-center">Why Choose Us for Your ${county.name} Wedding</h2>
                <p class="text-center" style="opacity: 0.8; margin-bottom: 2rem;">
                    Planning a wedding in ${county.name}? We work here regularly. 
                    <strong>${county.travel_fee}</strong> applies for this area, and we handle all logistics so you can focus on your big day.
                </p>
                <ul style="max-width: 700px; margin: 0 auto 2rem; line-height: 2;">
                    <li><strong>Same Four Musicians:</strong> No agency, no substitutes - the band you see is the band you get</li>
                    <li><strong>Local Knowledge:</strong> We know ${county.name} venues, their requirements, and their staff</li>
                    <li><strong>Full Coordination:</strong> We liaise directly with venue coordinators and wedding planners</li>
                </ul>

                <!-- Wedding Culture Section -->
                ${county.wedding_culture ? `
                <div style="background: #f9f9f9; padding: 30px; border-radius: 4px; margin: 40px 0;">
                    <h3 style="margin: 0 0 1rem; color: var(--primary-navy);">Wedding Culture in ${county.name}</h3>
                    <p style="margin: 0; opacity: 0.8; line-height: 1.8;">${county.wedding_culture}</p>
                </div>
                ` : ''}

                <!-- Venues Section -->
                <h3 class="text-center" style="margin-top: 3rem;">Top Wedding Venues in ${county.name}</h3>
                <p class="text-center" style="opacity: 0.8;">Venues we know and love - click any with a guide available for detailed tips.</p>
                
                <div class="venue-list">
                    ${generateVenuePills(county.venues)}
                </div>

                ${county.venues.some(v => v.description) ? `
                <div style="margin-top: 40px;">
                    <h4 style="margin: 0 0 1.5rem; color: var(--primary-navy);">Venue Highlights</h4>
                    ${generateVenueDescriptions(county.venues)}
                </div>
                ` : ''}

            </div>
        </div>
    </section>

    <!-- Testimonials Section -->
    <section style="padding: 60px 0; background: var(--primary-navy);">
        <div class="container" style="max-width: 1000px;">
            <h2 class="section-title text-center" style="color: var(--text-cream);">${county.name} Wedding Reviews</h2>
            <p class="text-center" style="opacity: 0.8; color: var(--text-cream);">What couples from ${county.name} are saying about The Beat Boutique.</p>
            
            <div class="review-cards">
                ${generateTestimonials(county.testimonials || [county.review], county.name)}
            </div>
        </div>
    </section>

    ${hasNearbyCounties ? `
    <!-- Nearby Counties Section -->
    <section style="padding: 60px 0;">
        <div class="container" style="max-width: 900px;">
            <h2 class="section-title text-center">Explore Nearby Counties</h2>
            <p class="text-center" style="opacity: 0.8;">Planning a wedding in a neighboring county? Check out our other location guides.</p>
            <div class="nearby-counties">
                ${nearbyCountiesHtml}
            </div>
        </div>
    </section>
    ` : ''}

    ${hasFAQs ? `
    <!-- FAQ Section -->
    <section class="faq-section">
        <div class="container" style="max-width: 900px;">
            <h2 class="section-title text-center">${county.name} Wedding Band FAQ</h2>
            <div class="faq-grid">
                ${generateFAQs(county.faqs)}
            </div>
        </div>
    </section>
    ` : ''}

    <!-- CTA Section -->
    <section style="padding: 80px 0; background: var(--primary-teal);">
        <div class="container text-center">
            <h2 class="section-title" style="color: var(--text-cream);">Ready to Book for ${county.name}?</h2>
            <p style="color: var(--text-cream); opacity: 0.9; max-width: 600px; margin: 0 auto 30px;">Check our availability for your date and let's start planning your perfect wedding entertainment.</p>
            <a href="../index.html#contact" class="btn btn-primary" style="background: var(--accent-gold); color: var(--primary-navy); border-color: var(--accent-gold);">Check Availability for ${county.name}</a>
        </div>
    </section>

    <footer class="footer">
        <div class="container text-center">
            <p style="opacity: 0.5;">&copy; 2026 The Beat Boutique.</p>
        </div>
    </footer>

</body>
</html>`;
};

// Generate Pages
counties.forEach(county => {
    const html = generateTemplate(county);
    const fileName = `wedding-band-${county.slug}.html`;
    const filePath = path.join(__dirname, '../locations', fileName);
    
    fs.writeFileSync(filePath, html);
    console.log(`Generated: ${fileName}`);
});

console.log(`\\nSuccessfully generated ${counties.length} location pages!`);
