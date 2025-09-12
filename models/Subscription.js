const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        tier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubscriptionTier',
            required: true,
        },

        // Billing Information
        billingPeriod: {
            type: String,
            enum: ['monthly', 'quarterly'],
            required: true,
            default: 'monthly',
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: 'USD',
            uppercase: true,
        },

        // Subscription Status
        status: {
            type: String,
            enum: ['active', 'canceled', 'past_due', 'trialing', 'paused', 'expired'],
            default: 'active',
            index: true,
        },

        // Usage Tracking
        usage: {
            designsUsedThisMonth: {
                type: Number,
                default: 0,
                min: 0,
            },
            activeDesignRequests: {
                type: Number,
                default: 0,
                min: 0,
            },
            lastResetDate: {
                type: Date,
                default: Date.now,
            },
        },

        // Dates
        startDate: {
            type: Date,
            required: true,
            default: Date.now,
        },
        currentPeriodStart: {
            type: Date,
            required: true,
            default: Date.now,
        },
        currentPeriodEnd: {
            type: Date,
            required: true,
        },
        nextBillingDate: {
            type: Date,
            required: true,
            index: true,
        },
        canceledAt: {
            type: Date,
            default: null,
        },
        cancelationReason: {
            type: String,
            default: null,
        },
        pausedAt: {
            type: Date,
            default: null,
        },
        resumeDate: {
            type: Date,
            default: null,
        },

        // Trial Information
        trialStart: {
            type: Date,
            default: null,
        },
        trialEnd: {
            type: Date,
            default: null,
        },

        // Stripe Information
        stripeSubscriptionId: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        stripeCustomerId: {
            type: String,
            index: true,
        },
        stripePaymentMethodId: String,

        // Payment History
        lastPaymentDate: {
            type: Date,
            default: null,
        },
        lastPaymentAmount: {
            type: Number,
            default: null,
        },
        lastPaymentStatus: {
            type: String,
            enum: ['succeeded', 'failed', 'pending', null],
            default: null,
        },
        failedPaymentAttempts: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Metadata
        notes: {
            type: String,
            default: null,
        },
        customFeatures: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
        updatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
subscriptionSchema.index({ user: 1, status: 1 });
subscriptionSchema.index({ nextBillingDate: 1, status: 1 });
subscriptionSchema.index({ currentPeriodEnd: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });

// Virtual to check if subscription is active
subscriptionSchema.virtual('isActive').get(function () {
    return this.status === 'active' || this.status === 'trialing';
});

// Virtual to check if in trial period
subscriptionSchema.virtual('isInTrial').get(function () {
    if (!this.trialEnd) return false;
    return this.status === 'trialing' && new Date() < this.trialEnd;
});

// Virtual to get days until next billing
subscriptionSchema.virtual('daysUntilNextBilling').get(function () {
    if (!this.nextBillingDate) return null;
    const now = new Date();
    const diff = this.nextBillingDate - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual to check if usage limit reached
subscriptionSchema.virtual('hasReachedDesignLimit').get(function () {
    if (!this.populated('tier')) return true;
    return this.usage.designsUsedThisMonth >= this.tier.features.designsPerMonth;
});

// Virtual to check if can add more active designs
subscriptionSchema.virtual('canAddActiveDesign').get(function () {
    if (!this.populated('tier')) return false;
    return this.usage.activeDesignRequests < this.tier.features.simultaneousDesigns;
});

// Method to calculate next billing date
subscriptionSchema.methods.calculateNextBillingDate = function () {
    const currentEnd = new Date(this.currentPeriodEnd);

    if (this.billingPeriod === 'quarterly') {
        currentEnd.setMonth(currentEnd.getMonth() + 3);
    } else {
        currentEnd.setMonth(currentEnd.getMonth() + 1);
    }

    return currentEnd;
};

// Method to reset monthly usage
subscriptionSchema.methods.resetMonthlyUsage = async function () {
    const now = new Date();
    const lastReset = new Date(this.usage.lastResetDate);

    // Check if a month has passed since last reset
    if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        this.usage.designsUsedThisMonth = 0;
        this.usage.lastResetDate = now;
        await this.save();
        return true;
    }

    return false;
};

// Method to increment design usage
subscriptionSchema.methods.incrementDesignUsage = async function () {
    // First check if we need to reset monthly usage
    await this.resetMonthlyUsage();

    // Check if limit reached
    await this.populate('tier');
    if (this.usage.designsUsedThisMonth >= this.tier.features.designsPerMonth) {
        throw new Error('Monthly design limit reached');
    }

    this.usage.designsUsedThisMonth += 1;
    await this.save();

    return this.usage.designsUsedThisMonth;
};

// Method to update active design count
subscriptionSchema.methods.updateActiveDesigns = async function (count) {
    await this.populate('tier');

    if (count > this.tier.features.simultaneousDesigns) {
        throw new Error('Simultaneous design limit exceeded');
    }

    this.usage.activeDesignRequests = count;
    await this.save();

    return this.usage.activeDesignRequests;
};

// Method to cancel subscription
subscriptionSchema.methods.cancel = async function (reason = null) {
    this.status = 'canceled';
    this.canceledAt = new Date();
    this.cancelationReason = reason;
    await this.save();

    return this;
};

// Method to pause subscription
subscriptionSchema.methods.pause = async function (resumeDate = null) {
    this.status = 'paused';
    this.pausedAt = new Date();
    this.resumeDate = resumeDate;
    await this.save();

    return this;
};

// Method to resume subscription
subscriptionSchema.methods.resume = async function () {
    if (this.status !== 'paused') {
        throw new Error('Subscription is not paused');
    }

    this.status = 'active';
    this.pausedAt = null;
    this.resumeDate = null;
    await this.save();

    return this;
};

// Static method to find active subscription for user
subscriptionSchema.statics.findActiveByUser = function (userId) {
    return this.findOne({
        user: userId,
        status: { $in: ['active', 'trialing'] },
    }).populate('tier');
};

// Static method to check for expiring subscriptions
subscriptionSchema.statics.findExpiringSoon = function (daysAhead = 7) {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    return this.find({
        status: 'active',
        nextBillingDate: {
            $gte: new Date(),
            $lte: futureDate,
        },
    }).populate('user tier');
};

// Static method to find past due subscriptions
subscriptionSchema.statics.findPastDue = function () {
    return this.find({
        status: 'past_due',
    }).populate('user tier');
};

// Pre-save middleware to update nextBillingDate
subscriptionSchema.pre('save', function (next) {
    if (this.isModified('currentPeriodEnd')) {
        this.nextBillingDate = this.calculateNextBillingDate();
    }
    next();
});

// Ensure virtual fields are serialized
subscriptionSchema.set('toJSON', {
    virtuals: true,
});

module.exports = mongoose.model('Subscription', subscriptionSchema);
