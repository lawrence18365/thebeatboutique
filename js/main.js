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

    // Contact Form Handling
    const contactForm = document.querySelector('.contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const btn = contactForm.querySelector('button');
            const originalText = btn.innerText;
            
            btn.innerText = 'Sending...';
            btn.disabled = true;

            // Simulate network request
            setTimeout(() => {
                alert('Thank you! Your inquiry has been received. We will be in touch shortly.');
                contactForm.reset();
                btn.innerText = 'Sent!';
                setTimeout(() => {
                    btn.innerText = originalText;
                    btn.disabled = false;
                }, 2000);
            }, 1500);
        });
    }
});
