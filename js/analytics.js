(function () {
    const metaMeasurementId = document.querySelector('meta[name="ga-measurement-id"]');
    const metaIdValue = metaMeasurementId ? metaMeasurementId.content.trim() : '';
    const windowIdValue = typeof window.GA_MEASUREMENT_ID === 'string' ? window.GA_MEASUREMENT_ID.trim() : '';
    const GA_MEASUREMENT_ID = metaIdValue || windowIdValue;
    const hasValidId = Boolean(GA_MEASUREMENT_ID);
    const consentKey = 'cookieConsent';
    const queuedEvents = [];

    window.trackEvent = function (name, params) {
        if (!hasValidId) {
            return;
        }
        if (typeof window.gtag === 'function') {
            window.gtag('event', name, params || {});
            return;
        }
        queuedEvents.push([name, params]);
    };

    function normalizeUrlPath(href) {
        if (!href) {
            return '';
        }

        try {
            const parsed = new URL(href, window.location.href);
            return parsed.pathname + parsed.search;
        } catch (error) {
            return href;
        }
    }

    function initEventTracking() {
        document.addEventListener('submit', (event) => {
            const form = event.target instanceof HTMLFormElement ? event.target : null;
            if (!form) {
                return;
            }

            window.trackEvent('form_submit', {
                form_id: form.id || '(none)',
                form_name: form.getAttribute('name') || '(none)',
                form_action: normalizeUrlPath(form.getAttribute('action') || ''),
            });
        });

        document.addEventListener('click', (event) => {
            const link = event.target instanceof Element ? event.target.closest('a') : null;
            if (!link) {
                return;
            }

            const href = link.getAttribute('href') || '';

            if (href.startsWith('mailto:')) {
                window.trackEvent('contact_click', {
                    contact_type: 'email',
                    target: href.replace(/^mailto:/, ''),
                });
                return;
            }

            if (href.startsWith('tel:')) {
                window.trackEvent('contact_click', {
                    contact_type: 'phone',
                    target: href.replace(/^tel:/, ''),
                });
            }
        });
    }

    function loadAnalytics() {
        if (!hasValidId || window.__gaLoaded) {
            return;
        }
        window.__gaLoaded = true;

        window.dataLayer = window.dataLayer || [];
        function gtag() {
            window.dataLayer.push(arguments);
        }
        window.gtag = gtag;

        gtag('js', new Date());
        gtag('config', GA_MEASUREMENT_ID);

        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        document.head.appendChild(script);

        queuedEvents.splice(0).forEach(([name, params]) => {
            gtag('event', name, params || {});
        });
    }

    function ensureCookieBanner() {
        if (document.getElementById('cookie-banner')) {
            return;
        }

        const banner = document.createElement('div');
        banner.id = 'cookie-banner';
        banner.className = 'cookie-banner';
        banner.innerHTML =
            '<div class="cookie-content">' +
            '<p>We use cookies to enhance your experience and play our videos. By continuing to visit this site you agree to our use of cookies.</p>' +
            '<div class="cookie-buttons">' +
            '<button id="accept-cookies" class="btn-cookie-accept">Accept</button>' +
            '<button id="decline-cookies" class="btn-cookie-decline">Decline</button>' +
            '</div>' +
            '</div>';

        document.body.appendChild(banner);
    }

    function initConsent() {
        ensureCookieBanner();

        const banner = document.getElementById('cookie-banner');
        const acceptBtn = document.getElementById('accept-cookies');
        const declineBtn = document.getElementById('decline-cookies');

        if (!banner || !acceptBtn || !declineBtn) {
            return;
        }

        const setBannerVisibility = (isVisible) => {
            banner.classList.toggle('visible', isVisible);
            document.body.classList.toggle('cookie-banner-open', isVisible);
            window.dispatchEvent(new CustomEvent('cookie-banner-visibility', {
                detail: { visible: isVisible }
            }));
        };

        const existingChoice = localStorage.getItem(consentKey);
        setBannerVisibility(false);

        if (!existingChoice) {
            let shown = false;
            const showBanner = () => {
                if (shown) {
                    return;
                }
                shown = true;
                setBannerVisibility(true);
                window.removeEventListener('scroll', showOnFirstInteraction, { passive: true });
                window.removeEventListener('pointerdown', showOnFirstInteraction);
                window.removeEventListener('keydown', showOnFirstInteraction);
            };
            const showOnFirstInteraction = () => {
                window.requestAnimationFrame(showBanner);
            };

            // Show on first interaction, with a delayed fallback for passive visitors.
            window.addEventListener('scroll', showOnFirstInteraction, { passive: true, once: true });
            window.addEventListener('pointerdown', showOnFirstInteraction, { once: true });
            window.addEventListener('keydown', showOnFirstInteraction, { once: true });
            setTimeout(showBanner, 12000);
        }

        if (existingChoice === 'accepted') {
            loadAnalytics();
        }

        acceptBtn.addEventListener('click', () => {
            localStorage.setItem(consentKey, 'accepted');
            setBannerVisibility(false);
            loadAnalytics();
        });

        declineBtn.addEventListener('click', () => {
            localStorage.setItem(consentKey, 'declined');
            setBannerVisibility(false);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            initConsent();
            initEventTracking();
        });
    } else {
        initConsent();
        initEventTracking();
    }
})();
