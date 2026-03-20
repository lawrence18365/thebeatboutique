(function () {
    const metaMeasurementId = document.querySelector('meta[name="ga-measurement-id"]');
    const metaIdValue = metaMeasurementId ? metaMeasurementId.content.trim() : '';
    const windowIdValue = typeof window.GA_MEASUREMENT_ID === 'string' ? window.GA_MEASUREMENT_ID.trim() : '';
    const GA_MEASUREMENT_ID = metaIdValue || windowIdValue;
    const hasValidGaId = Boolean(GA_MEASUREMENT_ID);
    const posthogApiKey = typeof window.POSTHOG_API_KEY === 'string' ? window.POSTHOG_API_KEY.trim() : '';
    const posthogApiHost = typeof window.POSTHOG_API_HOST === 'string' && window.POSTHOG_API_HOST.trim()
        ? window.POSTHOG_API_HOST.trim()
        : 'https://us.i.posthog.com';
    const posthogDefaults = typeof window.POSTHOG_DEFAULTS === 'string' && window.POSTHOG_DEFAULTS.trim()
        ? window.POSTHOG_DEFAULTS.trim()
        : '2026-01-30';
    const hasValidPosthogConfig = Boolean(posthogApiKey);
    const hasAnyAnalyticsProvider = hasValidGaId || hasValidPosthogConfig;
    const consentKey = 'cookieConsent';
    const queuedEvents = [];

    function sendQueuedEvent(name, params) {
        let sent = false;

        if (typeof window.gtag === 'function') {
            window.gtag('event', name, params || {});
            sent = true;
        }

        if (window.posthog && typeof window.posthog.capture === 'function') {
            window.posthog.capture(name, params || {});
            sent = true;
        }

        return sent;
    }

    window.trackEvent = function (name, params) {
        if (!hasAnyAnalyticsProvider) {
            return;
        }

        if (sendQueuedEvent(name, params)) {
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

    function flushQueuedEvents() {
        const pendingEvents = queuedEvents.splice(0);

        pendingEvents.forEach(([name, params]) => {
            if (!sendQueuedEvent(name, params)) {
                queuedEvents.push([name, params]);
            }
        });
    }

    function loadGaAnalytics() {
        if (!hasValidGaId || window.__gaLoaded) {
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
    }

    function loadPosthogAnalytics() {
        if (!hasValidPosthogConfig || window.__posthogLoaded) {
            return;
        }
        window.__posthogLoaded = true;

        (function (documentRef, posthogRef) {
            let scriptEl;
            let firstScript;
            let methodIndex;
            let apiMethods;
            let targetRef;

            if (posthogRef.__SV) {
                return;
            }

            window.posthog = posthogRef;
            posthogRef._i = posthogRef._i || [];
            posthogRef.init = function (token, config, name) {
                function createStub(obj, methodName) {
                    const splitName = methodName.split('.');
                    if (splitName.length === 2) {
                        obj = obj[splitName[0]];
                        methodName = splitName[1];
                    }
                    obj[methodName] = function () {
                        obj.push([methodName].concat(Array.prototype.slice.call(arguments, 0)));
                    };
                }

                scriptEl = documentRef.createElement('script');
                scriptEl.type = 'text/javascript';
                scriptEl.crossOrigin = 'anonymous';
                scriptEl.async = true;
                scriptEl.src = config.api_host.replace('.i.posthog.com', '-assets.i.posthog.com') + '/static/array.js';
                firstScript = documentRef.getElementsByTagName('script')[0];
                firstScript.parentNode.insertBefore(scriptEl, firstScript);

                targetRef = posthogRef;
                if (typeof name !== 'undefined') {
                    targetRef = posthogRef[name] = [];
                } else {
                    name = 'posthog';
                }

                targetRef.people = targetRef.people || [];
                targetRef.toString = function (includeStub) {
                    let str = 'posthog';
                    if (name !== 'posthog') {
                        str += '.' + name;
                    }
                    if (!includeStub) {
                        str += ' (stub)';
                    }
                    return str;
                };
                targetRef.people.toString = function () {
                    return targetRef.toString(1) + '.people (stub)';
                };

                apiMethods = 'init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug'.split(' ');

                for (methodIndex = 0; methodIndex < apiMethods.length; methodIndex += 1) {
                    createStub(targetRef, apiMethods[methodIndex]);
                }

                posthogRef._i.push([token, config, name]);
            };
            posthogRef.__SV = 1;
        }(document, window.posthog || []));

        window.posthog.init(posthogApiKey, {
            api_host: posthogApiHost,
            defaults: posthogDefaults,
        });
    }

    function loadAnalytics() {
        if (!hasAnyAnalyticsProvider) {
            return;
        }

        loadGaAnalytics();
        loadPosthogAnalytics();
        flushQueuedEvents();
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
