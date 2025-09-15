const mongoose = require('mongoose');
const Subscription = require('../../../models/Subscription');
const SubscriptionTier = require('../../../models/SubscriptionTier');
const User = require('../../../models/User');
const Invoice = require('../../../models/Invoice');
const { createAppLogger, createStripeService, createNotificationService } = require('@sahab/core');

const logger = createAppLogger();
const stripe = createStripeService();
const notifications = createNotificationService(mongoose, {
    types: [
        'subscription_created',
        'subscription_upgraded',
        'subscription_canceled',
        'payment_failed',
    ],
    relatedModels: ['Subscription', 'User'],
});

/**
 * Show subscription page
 */
const showSubscription = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);

        // Get current subscription
        const subscription = await Subscription.findActiveByUser(userId);

        // Get all available tiers
        const tiers = await SubscriptionTier.getActiveTiers();

        // Get recent invoices
        const invoices = subscription
            ? await Invoice.find({ user: userId }).sort('-createdAt').limit(5).lean()
            : [];

        res.render('client/subscription/index', {
            title: 'Subscription - CanvasCue',
            layout: 'layout',
            additionalCSS: ['dashboard-shared.css', 'subscription.css'],
            additionalJS: ['subscription.js'],
            user: user.toJSON(),
            subscription: subscription ? subscription.toJSON() : null,
            tiers,
            invoices,
            hasActiveSubscription: !!subscription?.isActive,
        });
    } catch (error) {
        logger.error('Show subscription error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load subscription page',
            layout: 'layout',
        });
    }
};

/**
 * Show upgrade/downgrade page
 */
const showUpgrade = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { tierLevel } = req.query;

        // Get current subscription
        const subscription = await Subscription.findActiveByUser(userId);

        // Get all tiers
        const tiers = await SubscriptionTier.getActiveTiers();

        // Get selected tier
        const selectedTier = tierLevel ? await SubscriptionTier.getByLevel(tierLevel) : null;

        res.render('client/subscription/upgrade', {
            title: 'Change Subscription - CanvasCue',
            layout: 'layout',
            additionalCSS: ['dashboard-shared.css', 'subscription.css'],
            additionalJS: ['subscription.js', 'payment.js'],
            currentSubscription: subscription ? subscription.toJSON() : null,
            tiers,
            selectedTier,
        });
    } catch (error) {
        logger.error('Show upgrade error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load upgrade page',
            layout: 'layout',
        });
    }
};

/**
 * Process subscription upgrade/downgrade
 */
const upgradeSubscription = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { tierId, billingPeriod } = req.body;

        const user = await User.findById(userId);
        const tier = await SubscriptionTier.findById(tierId);

        if (!tier || !tier.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription tier',
            });
        }

        // Get current subscription
        const currentSubscription = await Subscription.findActiveByUser(userId);

        if (currentSubscription) {
            // Update existing subscription
            const proration = await calculateProration(currentSubscription, tier, billingPeriod);

            // Update through Stripe
            const stripeUpdate = await stripe.client.subscriptions.update(
                currentSubscription.stripeSubscriptionId,
                {
                    items: [
                        {
                            id: currentSubscription.stripeSubscriptionItemId,
                            price: tier.stripePriceId[billingPeriod],
                        },
                    ],
                    proration_behavior: 'create_prorations',
                }
            );

            // Update local subscription
            currentSubscription.tier = tier._id;
            currentSubscription.billingPeriod = billingPeriod;
            currentSubscription.amount = tier.calculatePrice(billingPeriod);
            await currentSubscription.save();

            // Create notification
            await notifications.create(
                userId,
                'subscription_upgraded',
                'Subscription Updated',
                `Your subscription has been changed to ${tier.displayName}`,
                {
                    relatedModel: 'Subscription',
                    relatedId: currentSubscription._id,
                }
            );

            logger.info(`Subscription upgraded for user ${userId} to ${tier.name}`);

            res.json({
                success: true,
                message: 'Subscription updated successfully',
                data: {
                    subscription: currentSubscription,
                    proration,
                },
            });
        } else {
            // Create new subscription
            return createCheckoutSession(req, res);
        }
    } catch (error) {
        logger.error('Upgrade subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update subscription',
        });
    }
};

/**
 * Get subscription tiers (API)
 */
const getSubscriptionTiers = async (req, res) => {
    try {
        const tiers = await SubscriptionTier.getActiveTiers();

        res.json({
            success: true,
            data: tiers,
        });
    } catch (error) {
        logger.error('Get tiers error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch subscription tiers',
        });
    }
};

/**
 * Create checkout session for new subscription
 */
const createCheckoutSession = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { tierId, billingPeriod } = req.body;

        const user = await User.findById(userId);
        const tier = await SubscriptionTier.findById(tierId);

        if (!tier || !tier.isActive) {
            return res.status(400).json({
                success: false,
                message: 'Invalid subscription tier',
            });
        }

        // Check if custom tier
        if (tier.isCustom) {
            return res.json({
                success: true,
                customTier: true,
                message: tier.customMessage || 'Please contact sales for custom pricing',
            });
        }

        // Ensure Stripe customer exists
        const stripeCustomerId = await stripe.ensureCustomer(user);

        // Create checkout session
        const session = await stripe.client.checkout.sessions.create({
            customer: stripeCustomerId,
            line_items: [
                {
                    price: tier.stripePriceId[billingPeriod],
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.APP_URL}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL}/subscription`,
            metadata: {
                userId: user._id.toString(),
                tierId: tier._id.toString(),
                billingPeriod,
            },
        });

        logger.info(`Checkout session created for user ${userId}`);

        res.json({
            success: true,
            data: {
                sessionId: session.id,
                checkoutUrl: session.url,
            },
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
 * Cancel subscription
 */
const cancelSubscription = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { reason, immediate = false } = req.body;

        const subscription = await Subscription.findActiveByUser(userId);

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'No active subscription found',
            });
        }

        if (immediate) {
            // Cancel immediately
            await stripe.client.subscriptions.cancel(subscription.stripeSubscriptionId);
            await subscription.cancel(reason);
        } else {
            // Cancel at period end
            await stripe.client.subscriptions.update(subscription.stripeSubscriptionId, {
                cancel_at_period_end: true,
            });
            subscription.status = 'canceled';
            subscription.canceledAt = new Date();
            subscription.cancelationReason = reason;
            await subscription.save();
        }

        // Update active design requests
        const DesignRequest = require('../../../models/DesignRequest');
        await DesignRequest.updateMany(
            {
                client: userId,
                status: { $in: ['draft', 'submitted'] },
            },
            { status: 'canceled' }
        );

        // Create notification
        await notifications.create(
            userId,
            'subscription_canceled',
            'Subscription Canceled',
            immediate
                ? 'Your subscription has been canceled immediately'
                : `Your subscription will end on ${subscription.currentPeriodEnd.toDateString()}`,
            {
                relatedModel: 'Subscription',
                relatedId: subscription._id,
            }
        );

        logger.info(`Subscription canceled for user ${userId}`);

        res.json({
            success: true,
            message: immediate
                ? 'Subscription canceled immediately'
                : 'Subscription will be canceled at the end of the billing period',
        });
    } catch (error) {
        logger.error('Cancel subscription error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel subscription',
        });
    }
};

/**
 * Handle successful subscription creation
 */
const handleSubscriptionSuccess = async (req, res) => {
    try {
        const { session_id } = req.query;

        if (!session_id) {
            return res.redirect('/subscription');
        }

        // Retrieve session from Stripe
        const session = await stripe.client.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid') {
            const userId = session.metadata.userId;
            const tierId = session.metadata.tierId;
            const billingPeriod = session.metadata.billingPeriod;

            // Check if subscription already created (webhook may have handled it)
            let subscription = await Subscription.findOne({
                stripeSubscriptionId: session.subscription,
            });

            if (!subscription) {
                // Create subscription
                const tier = await SubscriptionTier.findById(tierId);
                const user = await User.findById(userId);

                // Get subscription details from Stripe
                const stripeSubscription = await stripe.client.subscriptions.retrieve(
                    session.subscription
                );

                subscription = new Subscription({
                    user: userId,
                    tier: tierId,
                    billingPeriod,
                    amount: tier.calculatePrice(billingPeriod),
                    currency: tier.pricing.currency,
                    status: 'active',
                    stripeSubscriptionId: stripeSubscription.id,
                    stripeCustomerId: stripeSubscription.customer,
                    stripeSubscriptionItemId: stripeSubscription.items.data[0].id,
                    currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
                    currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
                    nextBillingDate: new Date(stripeSubscription.current_period_end * 1000),
                });

                await subscription.save();

                // Update user
                user.currentSubscription = subscription._id;
                await user.save();

                // Create notification
                await notifications.create(
                    userId,
                    'subscription_created',
                    'Subscription Activated',
                    `Welcome to ${tier.displayName}! Your subscription is now active.`,
                    {
                        relatedModel: 'Subscription',
                        relatedId: subscription._id,
                    }
                );

                logger.info(`Subscription created for user ${userId}`);
            }

            req.session.flashMessage = {
                type: 'success',
                message: 'Subscription activated successfully!',
            };
        }

        res.redirect('/subscription');
    } catch (error) {
        logger.error('Handle subscription success error:', error);
        res.redirect('/subscription');
    }
};

/**
 * Calculate proration for subscription change
 */
async function calculateProration(currentSubscription, newTier, newBillingPeriod) {
    const now = new Date();
    const periodEnd = new Date(currentSubscription.currentPeriodEnd);
    const daysRemaining = Math.ceil((periodEnd - now) / (1000 * 60 * 60 * 24));
    const totalDays = currentSubscription.billingPeriod === 'quarterly' ? 90 : 30;

    const currentDailyRate = currentSubscription.amount / totalDays;
    const newAmount = newTier.calculatePrice(newBillingPeriod);
    const newDailyRate = newAmount / (newBillingPeriod === 'quarterly' ? 90 : 30);

    const credit = currentDailyRate * daysRemaining;
    const charge = newDailyRate * daysRemaining;
    const proration = charge - credit;

    return {
        credit,
        charge,
        proration,
        daysRemaining,
    };
}

module.exports = {
    showSubscription,
    showUpgrade,
    upgradeSubscription,
    getSubscriptionTiers,
    createCheckoutSession,
    cancelSubscription,
    handleSubscriptionSuccess,
};
