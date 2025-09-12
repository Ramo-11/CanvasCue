// Navigation JavaScript
(function () {
    'use strict';

    // DOM Elements
    const navbar = document.getElementById('navbar');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    const navOverlay = document.getElementById('navOverlay');
    const navLinks = document.querySelectorAll('.nav-link');
    const dropdowns = document.querySelectorAll('.dropdown');

    // Initialize
    init();

    function init() {
        setupMobileMenu();
        setupDropdowns();
        setupActiveLink();
        setupScrollBehavior();
    }

    // Mobile Menu Toggle
    function setupMobileMenu() {
        if (!navToggle || !navMenu) return;

        navToggle.addEventListener('click', toggleMobileMenu);
        navOverlay.addEventListener('click', closeMobileMenu);

        // Close menu on link click (mobile) - but not for dropdown toggles
        document.querySelectorAll('.nav-link').forEach((link) => {
            if (!link.classList.contains('dropdown-toggle')) {
                link.addEventListener('click', () => {
                    if (window.innerWidth <= 768) {
                        closeMobileMenu();
                    }
                });
            }
        });

        // Close menu on dropdown link click
        document.querySelectorAll('.dropdown-link').forEach((link) => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    closeMobileMenu();
                }
            });
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navMenu.classList.contains('active')) {
                closeMobileMenu();
            }
        });
    }

    function toggleMobileMenu() {
        const isActive = navMenu.classList.contains('active');

        if (isActive) {
            closeMobileMenu();
        } else {
            openMobileMenu();
        }
    }

    function openMobileMenu() {
        navMenu.classList.add('active');
        navToggle.classList.add('active');
        navOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileMenu() {
        navMenu.classList.remove('active');
        navToggle.classList.remove('active');
        navOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    // Dropdown Functionality
    function setupDropdowns() {
        dropdowns.forEach((dropdown) => {
            const toggle = dropdown.querySelector('.dropdown-toggle');
            const icon = dropdown.querySelector('.dropdown-icon');

            if (!toggle) return;

            // Mobile: Click on icon only (not the text)
            if (icon) {
                icon.addEventListener('click', (e) => {
                    if (window.innerWidth <= 768) {
                        e.preventDefault();
                        e.stopPropagation();

                        // Toggle this dropdown
                        dropdown.classList.toggle('active');

                        // Close other dropdowns
                        dropdowns.forEach((otherDropdown) => {
                            if (otherDropdown !== dropdown) {
                                otherDropdown.classList.remove('active');
                            }
                        });
                    }
                });
            }

            // Prevent the dropdown toggle text from being clickable on mobile
            toggle.addEventListener('click', (e) => {
                if (window.innerWidth <= 768) {
                    e.preventDefault();
                    e.stopPropagation();
                    dropdown.classList.toggle('active');

                    // Close others
                    dropdowns.forEach((other) => {
                        if (other !== dropdown) other.classList.remove('active');
                    });
                }
            });

            // Desktop: Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (window.innerWidth > 768) {
                    if (!dropdown.contains(e.target)) {
                        dropdown.classList.remove('active');
                    }
                }
            });
        });
    }

    // Active Link Highlighting
    function setupActiveLink() {
        const currentPath = window.location.pathname;

        // Clear all active states
        document.querySelectorAll('.nav-link, .dropdown-link').forEach((link) => {
            link.classList.remove('active');
        });

        // Check dropdown links first
        document.querySelectorAll('.dropdown-link').forEach((link) => {
            const linkPath = link.getAttribute('href');

            if (currentPath === linkPath) {
                link.classList.add('active');
                // Also mark parent dropdown as active
                const parentDropdown = link.closest('.dropdown');
                if (parentDropdown) {
                    const parentLink = parentDropdown.querySelector('.dropdown-toggle');
                    if (parentLink) {
                        parentLink.classList.add('active');
                    }
                }
            }
        });

        // Then check main nav links
        navLinks.forEach((link) => {
            if (link.classList.contains('dropdown-toggle')) return; // Skip dropdown toggles

            const linkPath = link.getAttribute('href');

            if (currentPath === linkPath || (currentPath === '/' && linkPath === '/')) {
                link.classList.add('active');
            }
        });
    }

    // Scroll Behavior
    function setupScrollBehavior() {
        let lastScroll = 0;

        window.addEventListener('scroll', () => {
            const currentScroll = window.pageYOffset;

            // Add scrolled class for shadow
            if (currentScroll > 10) {
                navbar.classList.add('scrolled');
            } else {
                navbar.classList.remove('scrolled');
            }

            // Close dropdowns on scroll (desktop)
            if (window.innerWidth > 768) {
                dropdowns.forEach((dropdown) => {
                    dropdown.classList.remove('active');
                });
            }

            lastScroll = currentScroll;
        });
    }

    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth > 768) {
                closeMobileMenu();
                // Reset mobile dropdown states
                dropdowns.forEach((dropdown) => {
                    dropdown.classList.remove('active');
                });
            }
        }, 250);
    });
})();
