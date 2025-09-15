const mongoose = require('mongoose');
const DesignRequest = require('../../models/DesignRequest');

/**
 * Get request statistics for dashboard
 */
const getRequestStatistics = async (userId, role = 'client') => {
    const filter =
        role === 'client'
            ? { client: new mongoose.Types.ObjectId(userId) }
            : role === 'designer'
            ? { designer: new mongoose.Types.ObjectId(userId) }
            : {};

    const stats = await DesignRequest.aggregate([
        { $match: filter },
        {
            $facet: {
                statusCounts: [
                    {
                        $group: {
                            _id: '$status',
                            count: { $sum: 1 },
                        },
                    },
                ],
                priorityCounts: [
                    {
                        $group: {
                            _id: '$priority',
                            count: { $sum: 1 },
                        },
                    },
                ],
                totals: [
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            completed: {
                                $sum: {
                                    $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
                                },
                            },
                            inProgress: {
                                $sum: {
                                    $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0],
                                },
                            },
                            pending: {
                                $sum: {
                                    $cond: [{ $eq: ['$status', 'pending-approval'] }, 1, 0],
                                },
                            },
                            draft: {
                                $sum: {
                                    $cond: [{ $eq: ['$status', 'draft'] }, 1, 0],
                                },
                            },
                        },
                    },
                ],
                avgMetrics: [
                    {
                        $group: {
                            _id: null,
                            avgTurnaround: {
                                $avg: {
                                    $subtract: ['$timeline.completedAt', '$timeline.submittedAt'],
                                },
                            },
                            avgRevisions: { $avg: '$revisionCount' },
                            avgRating: { $avg: '$rating.score' },
                        },
                    },
                ],
                recentActivity: [
                    { $sort: { updatedAt: -1 } },
                    { $limit: 5 },
                    {
                        $project: {
                            _id: 1,
                            title: 1,
                            status: 1,
                            updatedAt: 1,
                        },
                    },
                ],
            },
        },
    ]);

    const result = stats[0];

    // Format the response
    const formattedStats = {
        total: result.totals[0]?.total || 0,
        completed: result.totals[0]?.completed || 0,
        inProgress: result.totals[0]?.inProgress || 0,
        pending: result.totals[0]?.pending || 0,
        draft: result.totals[0]?.draft || 0,
        avgTurnaround: formatTurnaround(result.avgMetrics[0]?.avgTurnaround),
        avgRevisions: Math.round(result.avgMetrics[0]?.avgRevisions || 0),
        avgRating: parseFloat((result.avgMetrics[0]?.avgRating || 0).toFixed(1)),
        statusBreakdown: formatBreakdown(result.statusCounts),
        priorityBreakdown: formatBreakdown(result.priorityCounts),
        recentActivity: result.recentActivity,
    };

    return formattedStats;
};

/**
 * Format subscription data for display
 */
const formatSubscriptionData = (subscription) => {
    if (!subscription) return null;

    return {
        _id: subscription._id,
        tier: subscription.tier,
        billingPeriod: subscription.billingPeriod,
        amount: subscription.amount,
        currency: subscription.currency,
        status: subscription.status,
        usage: {
            designsUsedThisMonth: subscription.usage.designsUsedThisMonth,
            activeDesignRequests: subscription.usage.activeDesignRequests,
            lastResetDate: subscription.usage.lastResetDate,
        },
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        nextBillingDate: subscription.nextBillingDate,
        isActive: subscription.isActive,
        daysUntilNextBilling: subscription.daysUntilNextBilling,
        hasReachedDesignLimit: subscription.hasReachedDesignLimit,
        canAddActiveDesign: subscription.canAddActiveDesign,
    };
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
        return `${days} day${days !== 1 ? 's' : ''}`;
    }
};

/**
 * Format breakdown data
 */
const formatBreakdown = (data) => {
    const breakdown = {};
    data.forEach((item) => {
        breakdown[item._id] = item.count;
    });
    return breakdown;
};

/**
 * Calculate dashboard metrics
 */
const calculateDashboardMetrics = async (userId, period = 30) => {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - period);

    const metrics = await DesignRequest.aggregate([
        {
            $match: {
                client: new mongoose.Types.ObjectId(userId),
                createdAt: { $gte: startDate },
            },
        },
        {
            $group: {
                _id: {
                    $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
                count: { $sum: 1 },
                completed: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'completed'] }, 1, 0],
                    },
                },
            },
        },
        { $sort: { _id: 1 } },
    ]);

    return metrics;
};

/**
 * Get upcoming deadlines
 */
const getUpcomingDeadlines = async (userId, role = 'client', limit = 5) => {
    const filter = {
        deadline: { $gte: new Date() },
        status: { $nin: ['completed', 'canceled'] },
    };

    if (role === 'client') {
        filter.client = new mongoose.Types.ObjectId(userId);
    } else if (role === 'designer') {
        filter.designer = new mongoose.Types.ObjectId(userId);
    }

    const deadlines = await DesignRequest.find(filter)
        .select('title deadline priority status requestNumber')
        .sort('deadline')
        .limit(limit)
        .lean();

    return deadlines;
};

/**
 * Get activity feed
 */
const getActivityFeed = async (userId, role = 'client', limit = 10) => {
    const Message = require('../../models/Message');

    // Get recent messages
    const messageFilter =
        role === 'client'
            ? { $or: [{ sender: userId }, { recipient: userId }] }
            : { $or: [{ sender: userId }, { recipient: userId }] };

    const messages = await Message.find(messageFilter)
        .populate('designRequest', 'title requestNumber')
        .populate('sender', 'fullName role')
        .sort('-createdAt')
        .limit(limit / 2)
        .lean();

    // Get recent status changes
    const requestFilter = role === 'client' ? { client: userId } : { designer: userId };

    const statusChanges = await DesignRequest.find(requestFilter)
        .select('title requestNumber status updatedAt')
        .sort('-updatedAt')
        .limit(limit / 2)
        .lean();

    // Combine and sort activities
    const activities = [
        ...messages.map((m) => ({
            type: 'message',
            title: `New message on ${m.designRequest?.title || 'request'}`,
            timestamp: m.createdAt,
            data: m,
        })),
        ...statusChanges.map((s) => ({
            type: 'status_change',
            title: `${s.title} status changed to ${s.status}`,
            timestamp: s.updatedAt,
            data: s,
        })),
    ];

    // Sort by timestamp and limit
    activities.sort((a, b) => b.timestamp - a.timestamp);
    return activities.slice(0, limit);
};

module.exports = {
    getRequestStatistics,
    formatSubscriptionData,
    calculateDashboardMetrics,
    getUpcomingDeadlines,
    getActivityFeed,
};
