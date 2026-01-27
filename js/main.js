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

    window.addEventListener('scroll', handleScroll);
    window.addEventListener('resize', handleScroll);
    
    // Initial check
    handleScroll();

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

    // Add Video Play Functionality (Placeholder)
    const playBtn = document.querySelector('.play-button');
    if (playBtn) {
        playBtn.addEventListener('click', () => {
            alert('This would trigger the video modal or play the embedded video.');
        });
    }

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
            if (typeof gtag !== 'undefined') {
                gtag('event', 'form_submit', {
                    'event_category': 'engagement',
                    'event_label': contactForm.id || 'contact_form'
                });
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

    // Cookie Banner Logic
    const cookieBanner = document.getElementById('cookie-banner');
    const acceptCookiesBtn = document.getElementById('accept-cookies');
    const declineCookiesBtn = document.getElementById('decline-cookies');

    if (cookieBanner && acceptCookiesBtn && declineCookiesBtn) {
        // Check if user has already made a choice
        const cookieChoice = localStorage.getItem('cookieConsent');

        if (!cookieChoice) {
            // Show banner after a short delay
            setTimeout(() => {
                cookieBanner.classList.add('visible');
            }, 2000);
        }

        acceptCookiesBtn.addEventListener('click', () => {
            localStorage.setItem('cookieConsent', 'accepted');
            cookieBanner.classList.remove('visible');
            // Here you would trigger analytics scripts if you had them
        });

        declineCookiesBtn.addEventListener('click', () => {
            localStorage.setItem('cookieConsent', 'declined');
            cookieBanner.classList.remove('visible');
        });
    }

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
        let proofIndex = 0;
        let hasShownFirst = false;

        const showSocialProof = () => {
            // Don't show if user is actively filling out form
            const activeElement = document.activeElement;
            if (activeElement && activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') {
                return;
            }

            const proof = socialProofData[proofIndex];
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

            proofIndex = (proofIndex + 1) % socialProofData.length;
        };

        // Show first notification after 8 seconds
        setTimeout(() => {
            showSocialProof();
            hasShownFirst = true;
        }, 8000);

        // Show subsequent notifications every 45 seconds
        setInterval(() => {
            if (hasShownFirst) {
                showSocialProof();
            }
        }, 45000);
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
            if (typeof gtag !== 'undefined') {
                gtag('event', 'exit_intent_detected');
            }
            exitIntentShown = true;
        }
    });
});
