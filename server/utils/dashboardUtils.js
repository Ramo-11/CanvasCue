const DesignRequest = require('../../models/DesignRequest');

/**
 * Get request statistics for dashboards
 */
const getRequestStatistics = async (userId, userType = 'client') => {
    const filter =
        userType === 'client'
            ? { client: userId }
            : userType === 'designer'
            ? { designer: userId }
            : {};

    const stats = await DesignRequest.getStatistics(filter);

    return {
        total: stats.total || 0,
        completed: stats.completed || 0,
        inProgress: stats.inProgress || 0,
        avgRevisions: Math.round(stats.avgRevisions || 0),
        avgTurnaround: formatTurnaround(stats.avgTurnaround),
    };
};

/**
 * Format subscription data for view
 */
const formatSubscriptionData = (subscription) => {
    if (!subscription) return null;

    const data = subscription.toJSON ? subscription.toJSON() : subscription;

    // Add calculated fields
    data.usagePercentage = Math.round(
        (data.usage.designsUsedThisMonth / data.tier.features.designsPerMonth) * 100
    );

    data.daysUntilRenewal = Math.ceil(
        (new Date(data.nextBillingDate) - new Date()) / (1000 * 60 * 60 * 24)
    );

    return data;
};

/**
 * Format turnaround time
 */
const formatTurnaround = (milliseconds) => {
    if (!milliseconds) return 'N/A';

    const hours = Math.round(milliseconds / (1000 * 60 * 60));

    if (hours < 24) {
        return `${hours} hours`;
    } else {
        const days = Math.round(hours / 24);
        return `${days} ${days === 1 ? 'day' : 'days'}`;
    }
};

/**
 * Calculate priority score for request sorting
 */
const calculatePriorityScore = (request) => {
    let score = 0;

    // Priority levels
    if (request.priority === 'urgent') score += 100;
    if (request.priority === 'high') score += 50;
    if (request.priority === 'normal') score += 25;

    // Age of request (older = higher priority)
    const ageInHours = (Date.now() - new Date(request.createdAt)) / (1000 * 60 * 60);
    score += Math.min(ageInHours, 48); // Cap at 48 hours

    // Rush orders
    if (request.isRushOrder) score += 75;

    return score;
};

/**
 * Get available requests for designers
 */
const getAvailableRequests = async (limit = 10) => {
    const requests = await DesignRequest.find({
        status: 'submitted',
        designer: null,
    })
        .populate('client', 'fullName companyName email')
        .lean();

    // Sort by priority score
    requests.sort((a, b) => {
        return calculatePriorityScore(b) - calculatePriorityScore(a);
    });

    return requests.slice(0, limit);
};

module.exports = {
    getRequestStatistics,
    formatSubscriptionData,
    formatTurnaround,
    calculatePriorityScore,
    getAvailableRequests,
};
