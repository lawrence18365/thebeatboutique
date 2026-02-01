(function () {
    const GA_MEASUREMENT_ID = 'G-XXXXXXXXXX';
    const hasValidId = GA_MEASUREMENT_ID && GA_MEASUREMENT_ID !== 'G-XXXXXXXXXX';
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

        const existingChoice = localStorage.getItem(consentKey);
        if (!existingChoice) {
            setTimeout(() => {
                banner.classList.add('visible');
            }, 2000);
        }

        if (existingChoice === 'accepted') {
            loadAnalytics();
        }

        acceptBtn.addEventListener('click', () => {
            localStorage.setItem(consentKey, 'accepted');
            banner.classList.remove('visible');
            loadAnalytics();
        });

        declineBtn.addEventListener('click', () => {
            localStorage.setItem(consentKey, 'declined');
            banner.classList.remove('visible');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initConsent);
    } else {
        initConsent();
    }
})();
