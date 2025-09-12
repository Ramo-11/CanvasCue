// Dashboard JavaScript
document.addEventListener('DOMContentLoaded', function () {
    // Initialize dashboard
    initDashboard();

    // Auto-refresh stats
    setInterval(refreshStats, 60000); // Refresh every minute
});

/**
 * Initialize dashboard
 */
function initDashboard() {
    // Get data from DOM
    const root = document.getElementById('dashboardRoot');
    if (!root) return;

    const hasActiveSubscription = root.dataset.hasSubscription === 'true';
    const subscription = JSON.parse(root.dataset.subscription || 'null');
    const stats = JSON.parse(root.dataset.stats || '{}');

    // Store in window for other functions
    window.dashboardData = {
        hasActiveSubscription,
        subscription,
        stats,
    };

    // Animate stats on load
    animateStats();

    // Setup usage bar animation
    animateUsageBar();

    // Check subscription warnings
    checkSubscriptionStatus();

    // Setup request filters if needed
    setupRequestFilters();
}

/**
 * Animate statistics counters
 */
function animateStats() {
    const statValues = document.querySelectorAll('.stat-value');

    statValues.forEach((stat) => {
        const finalValue = parseInt(stat.textContent);
        if (isNaN(finalValue)) return;

        let currentValue = 0;
        const increment = Math.ceil(finalValue / 20);
        const timer = setInterval(() => {
            currentValue += increment;
            if (currentValue >= finalValue) {
                currentValue = finalValue;
                clearInterval(timer);
            }
            stat.textContent = currentValue;
        }, 50);
    });
}

/**
 * Animate usage bar
 */
function animateUsageBar() {
    const usageFill = document.querySelector('.usage-fill');
    if (!usageFill) return;

    // Calculate width from data attributes
    const usage = parseInt(usageFill.dataset.usage || '0');
    const limit = parseInt(usageFill.dataset.limit || '1');
    const percentage = (usage / limit) * 100;

    // Set width after a short delay for animation
    setTimeout(() => {
        usageFill.style.width = `${percentage}%`;
        usageFill.style.transition = 'width 1s ease-out';
    }, 100);
}

/**
 * Check subscription status and show warnings
 */
function checkSubscriptionStatus() {
    const data = window.dashboardData || {};

    if (!data.hasActiveSubscription) return;

    const subscription = data.subscription;
    if (!subscription) return;

    // Check if approaching design limit
    const usage = subscription.usage;
    const limit = subscription.tier.features.designsPerMonth;
    const percentUsed = (usage.designsUsedThisMonth / limit) * 100;

    if (percentUsed >= 90) {
        showWarning('You are approaching your monthly design limit');
    }

    // Check if billing date is soon
    const daysUntilBilling = getDaysUntil(subscription.nextBillingDate);
    if (daysUntilBilling <= 3 && daysUntilBilling >= 0) {
        showInfo(`Your subscription renews in ${daysUntilBilling} days`);
    }
}

/**
 * Setup request filters
 */
function setupRequestFilters() {
    // Add click handlers for status filters if implemented
    document.querySelectorAll('.status-filter').forEach((filter) => {
        filter.addEventListener('click', function () {
            const status = this.dataset.status;
            filterRequests(status);
        });
    });
}

/**
 * Filter requests by status
 */
function filterRequests(status) {
    const requests = document.querySelectorAll('.request-item');

    requests.forEach((request) => {
        const badge = request.querySelector('.status-badge');
        if (!badge) return;

        const requestStatus = badge.className.match(/status-([^\s]+)/)?.[1];

        if (status === 'all' || requestStatus === status) {
            request.style.display = 'flex';
        } else {
            request.style.display = 'none';
        }
    });
}

/**
 * Refresh dashboard stats
 */
async function refreshStats() {
    try {
        const response = await fetch('/api/dashboard/stats');
        const result = await response.json();

        if (result.success) {
            updateStats(result.data);
        }
    } catch (error) {
        console.error('Failed to refresh stats:', error);
    }
}

/**
 * Update stats display
 */
function updateStats(stats) {
    Object.keys(stats).forEach((key) => {
        const element = document.querySelector(`[data-stat="${key}"]`);
        if (element) {
            element.textContent = stats[key];
        }
    });
}

/**
 * Show warning notification
 */
function showWarning(message) {
    if (window.Notifications) {
        window.Notifications.warning(message);
    }
}

/**
 * Show info notification
 */
function showInfo(message) {
    if (window.Notifications) {
        window.Notifications.info(message);
    }
}

/**
 * Calculate days until date
 */
function getDaysUntil(dateString) {
    const now = new Date();
    const target = new Date(dateString);
    const diff = target - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Format date
 */
function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

/**
 * Navigate to request
 */
function viewRequest(requestId) {
    window.location.href = `/requests/${requestId}`;
}

/**
 * Create new request
 */
function createNewRequest() {
    const data = window.dashboardData || {};

    if (!data.hasActiveSubscription) {
        showWarning('Please subscribe to a plan to create design requests');
        window.location.href = '/subscription';
        return;
    }

    window.location.href = '/requests/new';
}
