// Common.js - Main entry point that loads all utilities
// Keep this file small - just initialization

// DOM Ready Helper
function ready(fn) {
    if (document.readyState !== "loading") {
        fn();
    } else {
        document.addEventListener("DOMContentLoaded", fn);
    }
}

// Initialize all modules when DOM is ready
ready(() => {
    // Initialize core modules if they exist
    if (window.ModalManager) ModalManager.init();
    if (window.NotificationManager) NotificationManager.init();
    if (window.FormUtils) FormUtils.init();

    // Auto-format inputs
    document.querySelectorAll("[data-format]").forEach((input) => {
        const format = input.dataset.format;
        if (FormUtils && FormUtils.formatters[format]) {
            input.addEventListener("input", () =>
                FormUtils.formatters[format](input)
            );
        }
    });
});

// Create global namespace for your app
window.App = {
    ready,
    // Other modules will be added here by their respective files
};
