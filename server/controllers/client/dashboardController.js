const User = require('../../../models/User');
const DesignRequest = require('../../../models/DesignRequest');
const Subscription = require('../../../models/Subscription');
const { createAppLogger } = require('@sahab/core');
const { getRequestStatistics, formatSubscriptionData } = require('../../utils/dashboardUtils');

const logger = createAppLogger();

/**
 * Show client dashboard
 */
const showDashboard = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);

        // Check onboarding
        if (!user.onboardingCompleted) {
            return res.redirect('/onboarding');
        }

        // Get subscription
        const subscription = await Subscription.findActiveByUser(userId);

        // Get recent requests
        const recentRequests = await DesignRequest.findByClient(userId, {
            limit: 5,
            sort: '-createdAt',
        });

        // Get statistics
        const stats = await getRequestStatistics(userId, 'client');

        res.render('client/dashboard', {
            title: 'Dashboard - CanvasCue',
            layout: 'layout',
            additionalCSS: ['dashboard-shared.css', 'client/dashboard.css'],
            additionalJS: ['client/dashboard.js'],
            user: user.toJSON(),
            subscription: formatSubscriptionData(subscription),
            recentRequests,
            stats,
            hasActiveSubscription: !!subscription?.isActive,
        });
    } catch (error) {
        logger.error('Client dashboard error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load dashboard',
            layout: 'layout',
        });
    }
};

/**
 * Get dashboard stats (API)
 */
const getStats = async (req, res) => {
    try {
        const userId = req.session.userId;
        const stats = await getRequestStatistics(userId, 'client');

        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        logger.error('Get client stats error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch statistics',
        });
    }
};

/**
 * Get subscription usage (API)
 */
const getUsage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const subscription = await Subscription.findActiveByUser(userId);

        if (!subscription) {
            return res.json({
                success: true,
                data: { hasSubscription: false },
            });
        }

        res.json({
            success: true,
            data: {
                hasSubscription: true,
                usage: subscription.usage,
                limits: {
                    designs: subscription.tier.features.designsPerMonth,
                    simultaneous: subscription.tier.features.simultaneousDesigns,
                },
            },
        });
    } catch (error) {
        logger.error('Get usage error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch usage data',
        });
    }
};

module.exports = {
    showDashboard,
    getStats,
    getUsage,
};
