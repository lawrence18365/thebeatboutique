document.addEventListener('DOMContentLoaded', () => {
    
    // Mobile Navigation Toggle
    const navbar = document.querySelector('.navbar');
    const mobileMenuBtn = document.getElementById('mobile-menu');
    const navMenu = document.querySelector('.nav-menu');
    const setMobileMenuState = (isOpen) => {
        if (!mobileMenuBtn || !navMenu) return;
        navMenu.classList.toggle('active', isOpen);
        mobileMenuBtn.classList.toggle('active', isOpen);
        mobileMenuBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        mobileMenuBtn.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
        document.body.classList.toggle('menu-open', isOpen);

        if (navbar) {
            navbar.classList.toggle('navbar-menu-open', isOpen);
            if (isOpen) {
                navbar.classList.remove('navbar-hidden');
            }
        }
    };

    if (mobileMenuBtn && navMenu) {
        mobileMenuBtn.setAttribute('aria-expanded', 'false');
        mobileMenuBtn.setAttribute('aria-label', 'Open navigation menu');
        mobileMenuBtn.addEventListener('click', () => {
            setMobileMenuState(!navMenu.classList.contains('active'));
        });

        document.addEventListener('click', (event) => {
            if (!navMenu.classList.contains('active')) return;

            const clickedToggle = mobileMenuBtn.contains(event.target);
            const clickedMenu = navMenu.contains(event.target);
            if (!clickedToggle && !clickedMenu) {
                setMobileMenuState(false);
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                setMobileMenuState(false);
            }
        });
    }

    // Smooth Scrolling for Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            setMobileMenuState(false); // Close menu on click

            const targetId = this.getAttribute('href');
            if (targetId === '#') return;

            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Simple Navbar Background Change on Scroll and Visibility Toggle
    let lastScrollY = window.scrollY;
    
    // Function to check scroll position
    const handleScroll = () => {
        if (!navbar) return;

        const currentScrollY = window.scrollY;
        const scrollDelta = currentScrollY - lastScrollY;
        const deltaMagnitude = Math.abs(scrollDelta);
        const mobileMenuOpen = Boolean(navMenu && navMenu.classList.contains('active'));
        
        // Background Logic: Solid when scrolled, transparent at top
        if (currentScrollY > 30) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }

        if (mobileMenuOpen) {
            navbar.classList.remove('navbar-hidden');
        } else if (deltaMagnitude > 3) {
            // Hide once the user commits to scrolling down.
            if (scrollDelta > 0 && currentScrollY > 110) {
                navbar.classList.add('navbar-hidden');
            }

            // Show on upward movement or near the top.
            if (scrollDelta < 0 || currentScrollY <= 70) {
                navbar.classList.remove('navbar-hidden');
            }
        }

        lastScrollY = Math.max(currentScrollY, 0);
    };

    let scrollTicking = false;
    const requestScrollCheck = () => {
        if (scrollTicking) return;
        scrollTicking = true;
        window.requestAnimationFrame(() => {
            handleScroll();
            scrollTicking = false;
        });
    };

    if (navbar) {
        window.addEventListener('scroll', requestScrollCheck, { passive: true });
        window.addEventListener('resize', requestScrollCheck);
    }
    
    // Initial check
    handleScroll();

    // Delay hero video loading on mobile/slow connections to improve LCP.
    const heroVideo = document.querySelector('.hero-video');
    const heroVideoSource = heroVideo ? heroVideo.querySelector('source[data-src]') : null;
    if (heroVideo && heroVideoSource) {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;
        const hasDataSaver = Boolean(connection && connection.saveData);
        const effectiveType = connection && connection.effectiveType ? connection.effectiveType : '';
        const isSlowConnection = Boolean(
            connection && (
                (typeof connection.downlink === 'number' && connection.downlink < 3) ||
                /(slow-2g|2g|3g)/.test(effectiveType)
            )
        );

        if (!isMobileViewport && !hasDataSaver && !isSlowConnection) {
            const hydrateHeroVideo = () => {
                if (heroVideoSource.getAttribute('src')) return;

                heroVideoSource.setAttribute('src', heroVideoSource.dataset.src);
                heroVideo.load();

                const playPromise = heroVideo.play();
                if (playPromise && typeof playPromise.catch === 'function') {
                    playPromise.catch(() => {});
                }
            };

            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(hydrateHeroVideo, { timeout: 2000 });
            } else {
                window.setTimeout(hydrateHeroVideo, 1200);
            }
        }
    }

    // Reveal Elements on Scroll (Simple Intersection Observer)
    const observerOptions = {
        threshold: 0.1, // Trigger slightly earlier
        rootMargin: "0px 0px -50px 0px" // Offset slightly so it triggers before bottom
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Optional: Stop observing once revealed to prevent re-animating
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Review Carousel Logic
    const carousel = document.querySelector('.review-carousel');
    const prevBtn = document.querySelector('.review-nav-prev');
    const nextBtn = document.querySelector('.review-nav-next');

    if (carousel && prevBtn && nextBtn) {
        const scrollAmount = 380; // Card width + gap

        nextBtn.addEventListener('click', () => {
            carousel.scrollBy({
                left: scrollAmount,
                behavior: 'smooth'
            });
        });

        prevBtn.addEventListener('click', () => {
            carousel.scrollBy({
                left: -scrollAmount,
                behavior: 'smooth'
            });
        });

        // Simple drag to scroll
        let isDown = false;
        let startX;
        let scrollLeft;

        carousel.addEventListener('mousedown', (e) => {
            isDown = true;
            carousel.style.cursor = 'grabbing';
            startX = e.pageX - carousel.offsetLeft;
            scrollLeft = carousel.scrollLeft;
        });
        carousel.addEventListener('mouseleave', () => {
            isDown = false;
            carousel.style.cursor = 'grab';
        });
        carousel.addEventListener('mouseup', () => {
            isDown = false;
            carousel.style.cursor = 'grab';
        });
        carousel.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - carousel.offsetLeft;
            const walk = (x - startX) * 2;
            carousel.scrollLeft = scrollLeft - walk;
        });
    }

    // Target the new .fade-up class for animations
    const animateSelectors = ['.fade-up'];

    document.querySelectorAll(animateSelectors.join(',')).forEach(el => {
        // Observer is already set up to add 'visible' class
        observer.observe(el);
    });

    const parallaxBg = document.querySelector('.parallax-bg');
    if (parallaxBg) {
        const loadParallaxBg = () => {
            parallaxBg.classList.add('is-loaded');
        };

        if ('IntersectionObserver' in window) {
            const parallaxObserver = new IntersectionObserver((entries, obs) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        loadParallaxBg();
                        obs.unobserve(entry.target);
                    }
                });
            }, { rootMargin: '250px 0px' });

            parallaxObserver.observe(parallaxBg);
        } else {
            loadParallaxBg();
        }
    }

    const youtubeLiteButtons = document.querySelectorAll('.youtube-lite[data-youtube-id]');
    youtubeLiteButtons.forEach((button) => {
        button.addEventListener('click', () => {
            const videoId = button.dataset.youtubeId;
            if (!videoId) return;

            const startTime = parseInt(button.dataset.start || '0', 10);
            const startParam = Number.isFinite(startTime) && startTime > 0 ? `&start=${startTime}` : '';
            const iframe = document.createElement('iframe');
            iframe.width = '560';
            iframe.height = '315';
            iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=1${startParam}`;
            iframe.title = 'The Beat Boutique live performance video';
            iframe.frameBorder = '0';
            iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
            iframe.referrerPolicy = 'strict-origin-when-cross-origin';
            iframe.allowFullscreen = true;

            button.replaceWith(iframe);

            if (typeof window.trackEvent === 'function') {
                window.trackEvent('video_play', { 'video_type': 'youtube_embed' });
            }
        }, { once: true });
    });

    // Lead attribution for all website forms.
    const attributionParamNames = [
        'utm_source',
        'utm_medium',
        'utm_campaign',
        'utm_content',
        'utm_term',
        'gclid',
        'fbclid'
    ];
    const currentUrl = new URL(window.location.href);
    const attributionKey = 'tbbLeadAttribution';

    const cleanSubjectValue = (value, fallback) => {
        const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
        return (cleaned || fallback).slice(0, 80);
    };

    const setHiddenField = (form, name, value) => {
        let field = form.querySelector(`[name="${name}"]`);
        if (!field) {
            field = document.createElement('input');
            field.type = 'hidden';
            field.name = name;
            form.appendChild(field);
        }
        field.value = value || '';
    };

    const getFieldValue = (form, name) => {
        const field = form.querySelector(`[name="${name}"]`);
        return field ? field.value.trim() : '';
    };

    const getStoredAttribution = () => {
        const currentAttribution = {
            first_landing_page: window.location.href,
            first_referrer: document.referrer || '',
            first_seen_at: new Date().toISOString()
        };

        attributionParamNames.forEach(name => {
            currentAttribution[`first_${name}`] = currentUrl.searchParams.get(name) || '';
        });

        try {
            const stored = JSON.parse(localStorage.getItem(attributionKey) || 'null');
            if (stored && stored.first_landing_page) {
                return stored;
            }

            localStorage.setItem(attributionKey, JSON.stringify(currentAttribution));
        } catch (error) {
            return currentAttribution;
        }

        return currentAttribution;
    };

    const inferPageCategory = () => {
        const path = window.location.pathname;
        if (path === '/' || path === '/index.html') return 'homepage';
        if (path.startsWith('/pricing-guide/')) return 'pricing';
        if (path.startsWith('/showcase')) return 'showcase';
        if (path.startsWith('/venues/') && path !== '/venues/') return 'venue';
        if (path === '/venues/') return 'venues_index';
        if (path.startsWith('/locations/')) return 'location';
        if (path.startsWith('/guides/')) return 'guide';
        if (path.startsWith('/reviews/')) return 'reviews';
        if (path.startsWith('/song-list/')) return 'song_list';
        if (path.startsWith('/corporate-events/')) return 'corporate';
        if (path.startsWith('/christmas-parties/')) return 'christmas';
        if (path.startsWith('/guestlist/')) return 'guestlist';
        return 'site_page';
    };

    const inferPageFocus = () => {
        const parts = window.location.pathname.split('/').filter(Boolean);
        return parts.length ? parts[parts.length - 1] : 'home';
    };

    const inferLeadType = (form) => {
        const formSource = getFieldValue(form, 'form_source').toLowerCase();
        if (formSource.includes('showcase')) return 'showcase_rsvp';
        if (formSource.includes('guestlist')) return 'guestlist';
        if (form.classList.contains('quick-availability-form')) return 'availability_check';
        if (form.id === 'main-enquiry-form') return 'homepage_enquiry';
        return 'website_enquiry';
    };

    const updateLeadSubject = (form) => {
        const leadType = getFieldValue(form, 'lead_type') || inferLeadType(form);
        const formSource = cleanSubjectValue(getFieldValue(form, 'form_source'), 'Website Form');
        const weddingDate = cleanSubjectValue(getFieldValue(form, 'wedding_date'), 'date TBC');
        const venue = cleanSubjectValue(getFieldValue(form, 'venue') || getFieldValue(form, 'location'), 'venue TBC');

        if (leadType === 'showcase_rsvp') {
            setHiddenField(form, 'subject', `[TBB Showcase RSVP] ${weddingDate} - ${formSource}`);
            return;
        }

        if (leadType === 'guestlist') {
            setHiddenField(form, 'subject', `[TBB Guestlist] ${formSource}`);
            return;
        }

        setHiddenField(form, 'subject', `[TBB Lead] ${weddingDate} - ${venue} - ${formSource}`);
    };

    const prepareLeadForm = (form) => {
        const storedAttribution = getStoredAttribution();
        const pageCategory = inferPageCategory();
        const pageFocus = inferPageFocus();
        const leadType = inferLeadType(form);

        setHiddenField(form, 'form_id', form.id || '(none)');
        setHiddenField(form, 'lead_type', leadType);
        setHiddenField(form, 'page_url', window.location.href);
        setHiddenField(form, 'page_path', window.location.pathname);
        setHiddenField(form, 'page_category', pageCategory);
        setHiddenField(form, 'page_focus', pageFocus);
        setHiddenField(form, 'landing_page', storedAttribution.first_landing_page || window.location.href);
        setHiddenField(form, 'referrer', document.referrer || '');
        setHiddenField(form, 'first_referrer', storedAttribution.first_referrer || '');
        setHiddenField(form, 'first_seen_at', storedAttribution.first_seen_at || '');

        attributionParamNames.forEach(name => {
            setHiddenField(form, name, currentUrl.searchParams.get(name) || '');
            setHiddenField(form, `first_${name}`, storedAttribution[`first_${name}`] || '');
        });

        updateLeadSubject(form);

        form.addEventListener('submit', () => {
            setHiddenField(form, 'lead_created_at', new Date().toISOString());
            updateLeadSubject(form);
        });
    };

    document.querySelectorAll('form').forEach(prepareLeadForm);

    // Contact Form Handling
    const contactForms = document.querySelectorAll('.contact-form');
    contactForms.forEach(contactForm => {
        // Only add loading state, let the form provider handle submission.
        contactForm.addEventListener('submit', (e) => {
            const btn = contactForm.querySelector('button[type="submit"]');
            if (btn) {
                btn.innerHTML = '<span>Sending...</span>';
                btn.disabled = true;
            }
        });
    });

    // Showcase/Guestlist Form - Enhanced with local storage for abandoned form recovery
    const guestlistForms = document.querySelectorAll('form[data-form-type="guestlist"]');
    guestlistForms.forEach(form => {
        form.addEventListener('submit', (e) => {
            const btn = form.querySelector('button[type="submit"]');
            if (btn) {
                btn.innerHTML = 'Adding to Guestlist...';
                btn.disabled = true;
            }
        });
    });

    // Social Proof Notification System
    const socialProofData = [
        { names: "Sarah & Mark", location: "Dublin", initials: "SM", time: "2 hours ago" },
        { names: "Emma & James", location: "Meath", initials: "EJ", time: "5 hours ago" },
        { names: "Aoife & Conor", location: "Cork", initials: "AC", time: "Yesterday" },
        { names: "Laura & David", location: "Galway", initials: "LD", time: "Yesterday" },
        { names: "Ciara & Sean", location: "Kerry", initials: "CS", time: "2 days ago" },
        { names: "Niamh & Patrick", location: "Clare", initials: "NP", time: "3 days ago" },
        { names: "Rachel & Tom", location: "Kildare", initials: "RT", time: "4 days ago" },
        { names: "Jennifer & Michael", location: "Wicklow", initials: "JM", time: "This week" }
    ];

    const socialProofPopup = document.getElementById('social-proof-popup');
    if (socialProofPopup && window.innerWidth > 768) {
        // Only show once per session
        const hasShownPopup = sessionStorage.getItem('socialProofShown');
        if (!hasShownPopup) {
            const showSocialProof = () => {
                // Don't show if user is actively filling out form
                const activeElement = document.activeElement;
                if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
                    return;
                }

                // Mark as shown
                sessionStorage.setItem('socialProofShown', 'true');

                const proof = socialProofData[Math.floor(Math.random() * socialProofData.length)];
                document.getElementById('proof-initials').textContent = proof.initials;
                document.getElementById('proof-text').innerHTML = `<strong>${proof.names}</strong> just booked for their ${proof.location} wedding`;
                document.getElementById('proof-time').textContent = proof.time;

                socialProofPopup.style.display = 'block';
                socialProofPopup.style.animation = 'slideInLeft 0.4s ease-out';

                // Hide after 5 seconds
                setTimeout(() => {
                    socialProofPopup.style.animation = 'slideOutLeft 0.3s ease-in';
                    setTimeout(() => {
                        socialProofPopup.style.display = 'none';
                    }, 300);
                }, 5000);
            };

            // Show notification once after 8 seconds
            setTimeout(() => {
                showSocialProof();
            }, 8000);
        }
    }

    // Mobile Sticky CTA
    const mobileCTA = document.getElementById('mobile-sticky-cta');
    if (mobileCTA) {
        const mobileQuery = window.matchMedia('(max-width: 768px)');

        const updateMobileCTAVisibility = () => {
            if (!mobileQuery.matches) {
                mobileCTA.classList.remove('is-visible');
                mobileCTA.setAttribute('aria-hidden', 'true');
                return;
            }

            const cookieBanner = document.getElementById('cookie-banner');
            const isCookieVisible = Boolean(cookieBanner && cookieBanner.classList.contains('visible'));
            const scrolledEnough = window.scrollY > 720;
            const shouldShow = scrolledEnough && !isCookieVisible;

            mobileCTA.classList.toggle('is-visible', shouldShow);
            mobileCTA.setAttribute('aria-hidden', shouldShow ? 'false' : 'true');
        };

        window.addEventListener('scroll', updateMobileCTAVisibility, { passive: true });
        window.addEventListener('resize', updateMobileCTAVisibility);
        window.addEventListener('cookie-banner-visibility', updateMobileCTAVisibility);
        updateMobileCTAVisibility();
    }

    // Exit Intent Detection (Desktop)
    let exitIntentShown = false;
    document.addEventListener('mouseout', (e) => {
        if (!exitIntentShown && e.clientY < 10 && window.innerWidth > 768) {
            // User is moving mouse to close tab/navigate away
            // Could show exit popup here - for now just track
            if (typeof window.trackEvent === 'function') {
                window.trackEvent('exit_intent_detected');
            }
            exitIntentShown = true;
        }
    });
});
