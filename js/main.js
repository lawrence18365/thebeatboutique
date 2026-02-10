document.addEventListener('DOMContentLoaded', () => {
    
    // Mobile Navigation Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu');
    const navMenu = document.querySelector('.nav-menu');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            navMenu.classList.toggle('active');
            mobileMenuBtn.classList.toggle('active');
        });
    }

    // Smooth Scrolling for Anchor Links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            navMenu.classList.remove('active'); // Close menu on click

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
    const navbar = document.querySelector('.navbar');
    let lastScrollY = window.scrollY;
    
    // Function to check scroll position
    const handleScroll = () => {
        const currentScrollY = window.scrollY;
        
        // Background Logic: Solid when scrolled, transparent at top
        if (currentScrollY > 50) {
            navbar.classList.add('navbar-scrolled');
        } else {
            navbar.classList.remove('navbar-scrolled');
        }

        // Hide/Show Logic
        if (currentScrollY > lastScrollY && currentScrollY > 100) {
            // Scrolling DOWN & past top
            navbar.classList.add('navbar-hidden');
        } else {
            // Scrolling UP or at top
            navbar.classList.remove('navbar-hidden');
        }

        lastScrollY = currentScrollY;
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

    window.addEventListener('scroll', requestScrollCheck, { passive: true });
    window.addEventListener('resize', requestScrollCheck);
    
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

        if (isMobileViewport) {
            const mobilePoster = heroVideo.dataset.posterMobile;
            const mobilePosterHd = heroVideo.dataset.posterMobileHd;
            const isHighDensity = typeof window.devicePixelRatio === 'number' && window.devicePixelRatio >= 1.5;
            const useHdPoster = isHighDensity && !hasDataSaver && !isSlowConnection;
            const selectedPoster = useHdPoster ? (mobilePosterHd || mobilePoster) : mobilePoster;

            if (selectedPoster) {
                heroVideo.setAttribute('poster', selectedPoster);

                const fallbackImage = heroVideo.querySelector('img');
                if (fallbackImage) {
                    fallbackImage.setAttribute('src', selectedPoster);
                    fallbackImage.setAttribute('width', useHdPoster ? '896' : '640');
                    fallbackImage.setAttribute('height', useHdPoster ? '1344' : '960');
                }
            }
        }

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

    // Contact Form Handling - Enhanced for Formspree
    const contactForms = document.querySelectorAll('.contact-form');
    contactForms.forEach(contactForm => {
        // Only add loading state, let Formspree handle submission
        contactForm.addEventListener('submit', (e) => {
            const btn = contactForm.querySelector('button[type="submit"]');
            if (btn) {
                btn.innerHTML = '<span>Sending...</span>';
                btn.disabled = true;
            }

            // Track form submission in analytics
            if (typeof window.trackEvent === 'function') {
                window.trackEvent('form_submit', {
                    'event_category': 'engagement',
                    'event_label': contactForm.id || 'contact_form'
                });
            }
        });
    });

    // Capture page URL for form attribution
    document.querySelectorAll('.page-url-field').forEach(field => {
        field.value = window.location.href;
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
    if (socialProofPopup) {
        // Only show once per session
        const hasShownPopup = sessionStorage.getItem('socialProofShown');
        if (hasShownPopup) {
            return;
        }

        const showSocialProof = () => {
            // Don't show if user is actively filling out form
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
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

    // Mobile Sticky CTA
    const mobileCTA = document.getElementById('mobile-sticky-cta');
    if (mobileCTA && window.innerWidth <= 768) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 600) {
                mobileCTA.style.display = 'block';
            } else {
                mobileCTA.style.display = 'none';
            }
        });
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
