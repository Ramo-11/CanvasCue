const User = require('../../models/User');
const Onboarding = require('../../models/Onboarding');
const DesignRequest = require('../../models/DesignRequest');
const Subscription = require('../../models/Subscription');
const SubscriptionTier = require('../../models/SubscriptionTier');

const {
    logger,
    emailService,
    storage,
    stripeService,
    validation,
    notifications,
} = require('../utils/services');

/**
 * Show main dashboard
 */
const showDashboard = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);

        // Check onboarding status
        if (!user.onboardingCompleted) {
            return res.redirect('/onboarding');
        }

        // Get user's subscription
        const subscription = await Subscription.findActiveByUser(userId);

        // Get recent design requests
        const recentRequests = await DesignRequest.findByClient(userId, {
            limit: 5,
            sort: '-createdAt',
        });

        // Get statistics
        const stats = await DesignRequest.getStatistics({ client: userId });

        res.render('dashboard/index', {
            title: 'Dashboard - CanvasCue',
            layout: 'layout',
            additionalCSS: ['dashboard.css'],
            additionalJS: ['dashboard.js'],
            user: user.toJSON(),
            subscription,
            recentRequests,
            stats,
            hasActiveSubscription: !!subscription && subscription.isActive,
        });
    } catch (error) {
        logger.error('Show dashboard error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load dashboard',
            layout: 'layout',
        });
    }
};

/**
 * Show all design requests
 */
const showRequests = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { status, sort = '-createdAt' } = req.query;

        // Build query
        const query = { client: userId };
        if (status) {
            query.status = status;
        }

        // Get requests
        const requests = await DesignRequest.find(query)
            .sort(sort)
            .populate('designer', 'fullName email');

        // Get subscription for limits
        const subscription = await Subscription.findActiveByUser(userId);

        res.render('dashboard/requests', {
            title: 'Design Requests - CanvasCue',
            layout: 'layout',
            additionalCSS: ['requests.css'],
            additionalJS: ['requests.js'],
            requests,
            currentStatus: status,
            subscription,
            canCreateNew: subscription?.canAddActiveDesign || false,
        });
    } catch (error) {
        logger.error('Show requests error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load requests',
            layout: 'layout',
        });
    }
};

/**
 * Show new request form
 */
const showNewRequest = async (req, res) => {
    try {
        const userId = req.session.userId;

        // Check subscription
        const subscription = await Subscription.findActiveByUser(userId);
        if (!subscription) {
            return res.redirect('/subscription');
        }

        // Check if can add new request
        if (!subscription.canAddActiveDesign) {
            return res.render('dashboard/request-limit', {
                title: 'Request Limit Reached - CanvasCue',
                layout: 'layout',
                subscription,
                message: 'You have reached your simultaneous design request limit.',
            });
        }

        // Check monthly limit
        if (subscription.hasReachedDesignLimit) {
            return res.render('dashboard/request-limit', {
                title: 'Monthly Limit Reached - CanvasCue',
                layout: 'layout',
                subscription,
                message: 'You have reached your monthly design limit.',
            });
        }

        // Get user's brand guidelines for pre-filling
        const onboarding = await Onboarding.findByUserId(userId);

        res.render('dashboard/new-request', {
            title: 'New Design Request - CanvasCue',
            layout: 'layout',
            additionalCSS: ['request-form.css'],
            additionalJS: ['request-form.js'],
            brandGuidelines: onboarding?.brandGuidelines || {},
            platforms: onboarding?.selectedPlatforms || [],
        });
    } catch (error) {
        logger.error('Show new request error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load request form',
            layout: 'layout',
        });
    }
};

/**
 * Create new design request
 */
const createRequest = async (req, res) => {
    try {
        const userId = req.session.userId;
        const {
            title,
            description,
            category,
            platform,
            specifications,
            priority,
            deadline,
            clientNotes,
        } = req.body;

        // Validate subscription
        const subscription = await Subscription.findActiveByUser(userId);
        if (!subscription) {
            return res.status(403).json({
                success: false,
                message: 'Active subscription required',
            });
        }

        // Check limits
        if (subscription.hasReachedDesignLimit) {
            return res.status(403).json({
                success: false,
                message: 'Monthly design limit reached',
            });
        }

        if (!subscription.canAddActiveDesign) {
            return res.status(403).json({
                success: false,
                message: 'Simultaneous design request limit reached',
            });
        }

        // Create request
        const request = new DesignRequest({
            client: userId,
            subscription: subscription._id,
            title: title.trim(),
            description: description.trim(),
            category,
            platform,
            specifications,
            priority: priority || 'normal',
            deadline: deadline ? new Date(deadline) : null,
            clientNotes: clientNotes?.trim(),
            status: 'submitted',
            timeline: {
                submittedAt: new Date(),
            },
        });

        await request.save();

        // Update subscription usage
        await subscription.incrementDesignUsage();
        const activeCount = await DesignRequest.countDocuments({
            client: userId,
            status: { $in: ['submitted', 'in-review', 'in-progress', 'revision-requested'] },
        });
        await subscription.updateActiveDesigns(activeCount);

        // Send notification
        await notifications().create(
            userId,
            'request_created',
            'Design Request Created',
            `Your design request "${title}" has been submitted successfully.`,
            {
                relatedModel: 'DesignRequest',
                relatedId: request._id,
            }
        );

        // Send email
        const user = await User.findById(userId);
        await emailService.send(
            user.email,
            'Design Request Received - CanvasCue',
            `
            <h2>Design Request Received</h2>
            <p>Hi ${user.displayName},</p>
            <p>We've received your design request: <strong>${title}</strong></p>
            <p>Request Number: ${request.requestNumber}</p>
            <p>Our design team will review your request and begin working on it shortly.</p>
            <p>You can track the progress in your dashboard.</p>
            <br>
            <p>Best regards,<br>The CanvasCue Team</p>
            `
        );

        logger.info(`Design request created: ${request.requestNumber} by user ${userId}`);

        res.json({
            success: true,
            message: 'Design request created successfully',
            requestId: request._id,
            requestNumber: request.requestNumber,
        });
    } catch (error) {
        logger.error('Create request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create request',
        });
    }
};

/**
 * Show single design request
 */
const showRequest = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;

        const request = await DesignRequest.findOne({
            _id: id,
            client: userId,
        }).populate('designer', 'fullName email');

        if (!request) {
            return res.status(404).render('error', {
                title: 'Request Not Found',
                message: 'The requested design could not be found.',
                layout: 'layout',
            });
        }

        res.render('dashboard/request-detail', {
            title: `${request.title} - CanvasCue`,
            layout: 'layout',
            additionalCSS: ['request-detail.css'],
            additionalJS: ['request-detail.js'],
            request: request.toJSON(),
        });
    } catch (error) {
        logger.error('Show request error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load request',
            layout: 'layout',
        });
    }
};

/**
 * Show subscription management page
 */
const showSubscription = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);

        // Get current subscription
        const subscription = await Subscription.findActiveByUser(userId);

        // Get all tiers
        const tiers = await SubscriptionTier.getActiveTiers();

        res.render('dashboard/subscription', {
            title: 'Subscription - CanvasCue',
            layout: 'layout',
            additionalCSS: ['subscription.css'],
            additionalJS: ['subscription.js'],
            subscription,
            tiers,
            user: user.toJSON(),
        });
    } catch (error) {
        logger.error('Show subscription error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load subscription',
            layout: 'layout',
        });
    }
};

/**
 * Show upgrade page
 */
const showUpgrade = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { tier } = req.query;

        // Get current subscription
        const currentSubscription = await Subscription.findActiveByUser(userId);

        // Get all tiers
        const tiers = await SubscriptionTier.getActiveTiers();

        // Find selected tier
        const selectedTier = tier ? await SubscriptionTier.findById(tier) : tiers[0];

        res.render('dashboard/upgrade', {
            title: 'Upgrade Subscription - CanvasCue',
            layout: 'layout',
            additionalCSS: ['upgrade.css'],
            additionalJS: ['upgrade.js', 'stripe.js'],
            currentSubscription,
            tiers,
            selectedTier,
            stripePublicKey:
                process.env.NODE_ENV === 'production'
                    ? process.env.STRIPE_PUBLIC_KEY_PROD
                    : process.env.STRIPE_PUBLIC_KEY_TEST,
        });
    } catch (error) {
        logger.error('Show upgrade error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load upgrade options',
            layout: 'layout',
        });
    }
};

/**
 * Process subscription upgrade
 */
const upgradeSubscription = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { tierId, billingPeriod } = req.body;

        // Validate tier
        const tier = await SubscriptionTier.findById(tierId);
        if (!tier || !tier.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription tier',
            });
        }

        // Get/create Stripe customer
        const user = await User.findById(userId);
        const customerId = await stripeService.ensureCustomer(user);

        // Calculate amount
        const amount = tier.calculatePrice(billingPeriod);

        // Create payment intent
        const paymentIntent = await stripeService.createPaymentIntent(amount, customerId, {
            userId: userId.toString(),
            tierId: tierId,
            billingPeriod,
        });

        res.json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            amount,
            tier: tier.displayName,
        });
    } catch (error) {
        logger.error('Upgrade subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process upgrade',
        });
    }
};

/**
 * Show settings page
 */
const showSettings = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);
        const onboarding = await Onboarding.findByUserId(userId);

        res.render('dashboard/settings', {
            title: 'Settings - CanvasCue',
            layout: 'layout',
            additionalCSS: ['settings.css'],
            additionalJS: ['settings.js'],
            user: user.toJSON(),
            onboarding: onboarding?.toJSON() || {},
        });
    } catch (error) {
        logger.error('Show settings error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load settings',
            layout: 'layout',
        });
    }
};

/**
 * Update profile settings
 */
const updateProfile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { fullName, companyName, email } = req.body;

        const user = await User.findById(userId);

        // Update fields
        if (user.accountType === 'individual' && fullName) {
            user.fullName = fullName.trim();
        }
        if (user.accountType === 'company' && companyName) {
            user.companyName = companyName.trim();
        }

        // Check if email is changing
        if (email && email !== user.email) {
            // Validate email
            if (!validation.validators.email(email)) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid email format',
                });
            }

            // Check if email exists
            const existingUser = await User.findByEmail(email);
            if (existingUser) {
                return res.status(409).json({
                    success: false,
                    message: 'Email already in use',
                });
            }

            user.email = email.toLowerCase().trim();
        }

        await user.save();

        logger.info(`Profile updated for user ${userId}`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
        });
    } catch (error) {
        logger.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
        });
    }
};

/**
 * Update password
 */
const updatePassword = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validate input
        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required',
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'New passwords do not match',
            });
        }

        if (!validation.validators.strongPassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message:
                    'Password must be at least 8 characters with uppercase, lowercase, and numbers',
            });
        }

        const user = await User.findById(userId);

        // Verify current password
        const isValid = await user.comparePassword(currentPassword);
        if (!isValid) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect',
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        logger.info(`Password updated for user ${userId}`);

        res.json({
            success: true,
            message: 'Password updated successfully',
        });
    } catch (error) {
        logger.error('Update password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update password',
        });
    }
};

/**
 * Update brand settings
 */
const updateBrand = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { brandColors, preferredFonts, platforms } = req.body;

        const onboarding = await Onboarding.findByUserId(userId);

        if (brandColors) {
            onboarding.brandGuidelines.brandColors = brandColors;
        }

        if (preferredFonts) {
            onboarding.brandGuidelines.preferredFonts = preferredFonts;
        }

        if (platforms) {
            onboarding.updatePlatforms(platforms);
        }

        await onboarding.save();

        logger.info(`Brand settings updated for user ${userId}`);

        res.json({
            success: true,
            message: 'Brand settings updated successfully',
        });
    } catch (error) {
        logger.error('Update brand error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update brand settings',
        });
    }
};

/**
 * API: Get design requests
 */
const getRequests = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { status, limit = 20, offset = 0 } = req.query;

        const query = { client: userId };
        if (status) {
            query.status = status;
        }

        const requests = await DesignRequest.find(query)
            .sort('-createdAt')
            .limit(parseInt(limit))
            .skip(parseInt(offset))
            .populate('designer', 'fullName email');

        const total = await DesignRequest.countDocuments(query);

        res.json({
            success: true,
            data: {
                requests,
                total,
                limit: parseInt(limit),
                offset: parseInt(offset),
            },
        });
    } catch (error) {
        logger.error('Get requests API error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch requests',
        });
    }
};

/**
 * API: Create design request
 */
const createRequestAPI = async (req, res) => {
    // Reuse the createRequest function
    return createRequest(req, res);
};

/**
 * API: Update design request
 */
const updateRequest = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;
        const updates = req.body;

        const request = await DesignRequest.findOne({
            _id: id,
            client: userId,
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found',
            });
        }

        // Only allow certain updates based on status
        const allowedUpdates = ['title', 'description', 'priority', 'deadline', 'clientNotes'];

        if (request.status !== 'draft' && request.status !== 'submitted') {
            return res.status(403).json({
                success: false,
                message: 'Cannot update request in current status',
            });
        }

        allowedUpdates.forEach((field) => {
            if (updates[field] !== undefined) {
                request[field] = updates[field];
            }
        });

        await request.save();

        logger.info(`Request ${request.requestNumber} updated by user ${userId}`);

        res.json({
            success: true,
            message: 'Request updated successfully',
            data: request,
        });
    } catch (error) {
        logger.error('Update request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update request',
        });
    }
};

/**
 * API: Add message to request
 */
const addMessage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;
        const { message } = req.body;

        const request = await DesignRequest.findOne({
            _id: id,
            client: userId,
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found',
            });
        }

        // This would typically add to a messages collection
        // For now, update the client notes
        request.clientNotes = `${
            request.clientNotes || ''
        }\n\n[${new Date().toISOString()}]: ${message}`;
        request.lastMessageAt = new Date();
        await request.save();

        logger.info(`Message added to request ${request.requestNumber}`);

        res.json({
            success: true,
            message: 'Message added successfully',
        });
    } catch (error) {
        logger.error('Add message error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add message',
        });
    }
};

/**
 * API: Request revision
 */
const requestRevision = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { id } = req.params;
        const { description } = req.body;

        const request = await DesignRequest.findOne({
            _id: id,
            client: userId,
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found',
            });
        }

        if (request.status !== 'pending-approval') {
            return res.status(403).json({
                success: false,
                message: 'Can only request revision when design is pending approval',
            });
        }

        const revision = await request.addRevision(description, userId);

        logger.info(`Revision requested for ${request.requestNumber}`);

        res.json({
            success: true,
            message: 'Revision requested successfully',
            data: revision,
        });
    } catch (error) {
        logger.error('Request revision error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to request revision',
        });
    }
};

/**
 * API: Get subscription tiers
 */
const getSubscriptionTiers = async (req, res) => {
    try {
        const tiers = await SubscriptionTier.getActiveTiers();

        res.json({
            success: true,
            data: tiers,
        });
    } catch (error) {
        logger.error('Get subscription tiers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch subscription tiers',
        });
    }
};

/**
 * API: Create checkout session
 */
const createCheckoutSession = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { tierId, billingPeriod } = req.body;

        const tier = await SubscriptionTier.findById(tierId);
        if (!tier) {
            return res.status(404).json({
                success: false,
                message: 'Tier not found',
            });
        }

        const user = await User.findById(userId);
        const customerId = await stripeService.ensureCustomer(user);

        // Create checkout session
        const session = await stripeService.client.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            mode: 'subscription',
            line_items: [
                {
                    price:
                        billingPeriod === 'quarterly'
                            ? tier.stripePriceId.quarterly
                            : tier.stripePriceId.monthly,
                    quantity: 1,
                },
            ],
            success_url: `${process.env.PORTAL_URL}/subscription?success=true`,
            cancel_url: `${process.env.PORTAL_URL}/subscription?canceled=true`,
            metadata: {
                userId: userId.toString(),
                tierId: tierId,
                billingPeriod,
            },
        });

        res.json({
            success: true,
            sessionId: session.id,
            url: session.url,
        });
    } catch (error) {
        logger.error('Create checkout session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create checkout session',
        });
    }
};

/**
 * API: Cancel subscription
 */
const cancelSubscription = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { reason } = req.body;

        const subscription = await Subscription.findActiveByUser(userId);
        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'No active subscription found',
            });
        }

        // Cancel in Stripe
        if (subscription.stripeSubscriptionId) {
            await stripeService.client.subscriptions.update(subscription.stripeSubscriptionId, {
                cancel_at_period_end: true,
            });
        }

        // Update local subscription
        await subscription.cancel(reason);

        logger.info(`Subscription canceled for user ${userId}`);

        res.json({
            success: true,
            message: 'Subscription will be canceled at the end of the current billing period',
        });
    } catch (error) {
        logger.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel subscription',
        });
    }
};

module.exports = {
    showDashboard,
    showRequests,
    showNewRequest,
    createRequest,
    showRequest,
    showSubscription,
    showUpgrade,
    upgradeSubscription,
    showSettings,
    updateProfile,
    updatePassword,
    updateBrand,
    getRequests,
    createRequestAPI,
    updateRequest,
    addMessage,
    requestRevision,
    getSubscriptionTiers,
    createCheckoutSession,
    cancelSubscription,
};
