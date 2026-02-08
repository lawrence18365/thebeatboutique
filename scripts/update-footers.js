const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..');

// Standard footer HTML (comprehensive internal linking)
const STANDARD_FOOTER = `    <footer class="footer">
        <div class="container">
            <div class="footer-grid">
                <!-- Column 1: Brand -->
                <div class="footer-col footer-brand">
                    <a href="./" class="footer-logo-link">
                        <img src="assets/images/the_beat_boutique_logo.webp" alt="The Beat Boutique" class="footer-logo-lg">
                    </a>
                    <p class="footer-tagline">Ireland's premier wedding band.</p>
                    <div class="social-links">
                        <a href="https://www.instagram.com/thebeatboutique_/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" class="social-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                            </svg>
                        </a>
                        <a href="https://www.facebook.com/thebeatboutiqueband" target="_blank" rel="noopener noreferrer" aria-label="Facebook" class="social-icon">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z"/>
                            </svg>
                        </a>
                    </div>
                </div>

                <!-- Column 2: Explore -->
                <div class="footer-col">
                    <h4 class="footer-heading">Explore</h4>
                    <ul class="footer-nav">
                        <li><a href="showcase">Live Showcase</a></li>
                        <li><a href="song-list">Song List</a></li>
                        <li><a href="venues">Venues We Play</a></li>
                        <li><a href="pricing-guide">Pricing Guide</a></li>
                        <li><a href="about">About the Band</a></li>
                        <li><a href="why-us">Why Choose Us</a></li>
                    </ul>
                </div>

                <!-- Column 3: Guides -->
                <div class="footer-col">
                    <h4 class="footer-heading">Wedding Guides</h4>
                    <ul class="footer-nav">
                        <li><a href="guides/how-to-choose-wedding-band">How to Choose a Band</a></li>
                        <li><a href="guides/first-dance-songs">First Dance Songs</a></li>
                        <li><a href="guides/wedding-band-vs-dj">Band vs DJ</a></li>
                        <li><a href="guides/questions-to-ask-wedding-band">Questions to Ask</a></li>
                        <li><a href="wedding-band-ireland">Locations</a></li>
                    </ul>
                </div>

                <!-- Column 4: Contact -->
                <div class="footer-col">
                    <h4 class="footer-heading">Get in Touch</h4>
                    <ul class="footer-contact">
                        <li>
                            <span class="contact-label">Email</span>
                            <a href="mailto:justask@thebeatboutique.ie">justask@thebeatboutique.ie</a>
                        </li>
                        <li>
                            <span class="contact-label">Phone</span>
                            <a href="tel:+353872310001">+353 87 231 0001</a>
                        </li>
                        <li>
                            <span class="contact-label">Address</span>
                            <address style="font-style: normal; opacity: 0.8;">503 Griffith Ave, Glasnevin<br>Dublin 11, D11 Y977</address>
                        </li>
                    </ul>
                </div>
            </div>

            <div class="footer-bottom">
                <p>&copy; 2018-2026 The Beat Boutique. All rights reserved.</p>
                <div class="footer-legal">
                    <a href="privacy">Privacy Policy</a>
                    <a href="terms">Terms of Service</a>
                </div>
            </div>
        </div>
    </footer>`;

// Simpler footer for generated pages (venues, locations)
const SIMPLE_FOOTER = `    <footer class="footer">
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
                        <li><a href="showcase">Live Showcase</a></li>
                        <li><a href="song-list">Song List</a></li>
                        <li><a href="venues">Venues</a></li>
                        <li><a href="pricing-guide">Pricing</a></li>
                    </ul>
                </div>
                <div class="footer-col">
                    <h4 class="footer-heading">Guides</h4>
                    <ul class="footer-nav">
                        <li><a href="guides/how-to-choose-wedding-band">How to Choose a Band</a></li>
                        <li><a href="guides/first-dance-songs">First Dance Songs</a></li>
                        <li><a href="guides/wedding-band-vs-dj">Band vs DJ</a></li>
                        <li><a href="guides/questions-to-ask-wedding-band">Questions to Ask</a></li>
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
                    <a href="privacy">Privacy</a>
                    <a href="terms">Terms</a>
                </div>
            </div>
        </div>
    </footer>`;

// Find all HTML files
const htmlFiles = execSync('find . -name "*.html" -type f', { cwd: ROOT_DIR, encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(f => f && !f.includes('node_modules'));

let updated = 0;
let skipped = 0;

htmlFiles.forEach(file => {
    const filePath = path.join(ROOT_DIR, file);
    let content = fs.readFileSync(filePath, 'utf8');

    // Skip index.html (already updated manually)
    if (file === './index.html') {
        console.log(`Skipped: ${file} (already updated)`);
        skipped++;
        return;
    }

    // Check if file has a footer
    const footerMatch = content.match(/<footer[\s\S]*?<\/footer>/);
    if (!footerMatch) {
        console.log(`Skipped: ${file} (no footer found)`);
        skipped++;
        return;
    }

    // Determine which footer to use based on file location
    const useSimpleFooter = file.includes('/locations/') || file.includes('/venues/');
    const newFooter = useSimpleFooter ? SIMPLE_FOOTER : STANDARD_FOOTER;

    // Replace footer
    const newContent = content.replace(/<footer[\s\S]*?<\/footer>/, newFooter);

    if (newContent !== content) {
        fs.writeFileSync(filePath, newContent);
        console.log(`Updated: ${file}`);
        updated++;
    } else {
        console.log(`Unchanged: ${file}`);
        skipped++;
    }
});

console.log(`\n✓ Updated ${updated} files, skipped ${skipped} files`);
