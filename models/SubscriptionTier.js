const mongoose = require('mongoose');

const subscriptionTierSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        displayName: {
            type: String,
            required: true,
        },
        tierLevel: {
            type: Number,
            required: true,
            unique: true,
            min: 1,
            max: 3,
        },

        // Pricing
        pricing: {
            monthly: {
                type: Number,
                required: true,
                min: 0,
            },
            quarterly: {
                type: Number,
                required: true,
                min: 0,
            },
            quarterlyDiscount: {
                type: Number,
                default: 15,
                min: 0,
                max: 100,
            },
            currency: {
                type: String,
                default: 'USD',
                uppercase: true,
            },
        },

        // Features
        features: {
            designsPerMonth: {
                type: Number,
                required: true,
                min: 0,
            },
            simultaneousDesigns: {
                type: Number,
                required: true,
                min: 1,
            },
            unlimitedRevisions: {
                type: Boolean,
                default: true,
            },
            prioritySupport: {
                type: Boolean,
                default: false,
            },
            dedicatedDesigner: {
                type: Boolean,
                default: false,
            },
            brandGuidelines: {
                type: Boolean,
                default: true,
            },
            sourceFiles: {
                type: Boolean,
                default: true,
            },
            rushDelivery: {
                type: Boolean,
                default: false,
            },
            videoDesigns: {
                type: Boolean,
                default: false,
            },
        },

        // Display Information
        description: {
            type: String,
            maxlength: 500,
        },
        highlights: [
            {
                type: String,
                maxlength: 100,
            },
        ],
        badge: {
            text: String,
            color: String,
        },
        isPopular: {
            type: Boolean,
            default: false,
        },

        // Custom Tier Settings
        isCustom: {
            type: Boolean,
            default: false,
        },
        customMessage: {
            type: String,
            default: null,
        },

        // Stripe Product IDs
        stripeProductId: {
            monthly: String,
            quarterly: String,
        },
        stripePriceId: {
            monthly: String,
            quarterly: String,
        },

        // Status
        isActive: {
            type: Boolean,
            default: true,
        },
        isAvailable: {
            type: Boolean,
            default: true,
        },

        // Metadata
        sortOrder: {
            type: Number,
            default: 0,
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
subscriptionTierSchema.index({ isActive: 1, isAvailable: 1 });
subscriptionTierSchema.index({ sortOrder: 1 });

// Virtual for formatted prices
subscriptionTierSchema.virtual('formattedPrices').get(function () {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: this.pricing.currency,
    });

    return {
        monthly: formatter.format(this.pricing.monthly),
        quarterly: formatter.format(this.pricing.quarterly),
        quarterlySavings: formatter.format(this.pricing.monthly * 3 - this.pricing.quarterly),
    };
});

// Virtual for quarterly monthly rate
subscriptionTierSchema.virtual('quarterlyMonthlyRate').get(function () {
    return Math.round(this.pricing.quarterly / 3);
});

// Method to calculate price based on billing period
subscriptionTierSchema.methods.calculatePrice = function (billingPeriod = 'monthly') {
    if (billingPeriod === 'quarterly') {
        return this.pricing.quarterly;
    }
    return this.pricing.monthly;
};

// Method to get feature list for display
subscriptionTierSchema.methods.getFeatureList = function () {
    const features = [];

    if (this.features.designsPerMonth) {
        features.push(`Up to ${this.features.designsPerMonth} designs per month`);
    }

    features.push(
        `${this.features.simultaneousDesigns} design${
            this.features.simultaneousDesigns > 1 ? 's' : ''
        } at a time`
    );

    if (this.features.unlimitedRevisions) {
        features.push('Unlimited revisions');
    }

    if (this.features.prioritySupport) {
        features.push('Priority support');
    }

    if (this.features.dedicatedDesigner) {
        features.push('Dedicated designer');
    }

    if (this.features.sourceFiles) {
        features.push('Source files included');
    }

    if (this.features.rushDelivery) {
        features.push('Rush delivery available');
    }

    if (this.features.videoDesigns) {
        features.push('Video designs included');
    }

    return features;
};

// Static method to get all active tiers
subscriptionTierSchema.statics.getActiveTiers = function () {
    return this.find({
        isActive: true,
        isAvailable: true,
    }).sort('sortOrder tierLevel');
};

// Static method to get tier by level
subscriptionTierSchema.statics.getByLevel = function (level) {
    return this.findOne({
        tierLevel: level,
        isActive: true,
    });
};

// Static method to seed default tiers
subscriptionTierSchema.statics.seedDefaultTiers = async function () {
    const tiers = [
        {
            name: 'starter',
            displayName: 'Starter',
            tierLevel: 1,
            pricing: {
                monthly: 299,
                quarterly: 764.25, // 15% off monthly * 3
                quarterlyDiscount: 15,
            },
            features: {
                designsPerMonth: 10,
                simultaneousDesigns: 1,
                unlimitedRevisions: true,
                prioritySupport: false,
                dedicatedDesigner: false,
                sourceFiles: true,
                rushDelivery: false,
                videoDesigns: false,
            },
            description:
                'Perfect for small businesses and individuals getting started with professional design.',
            highlights: [
                'Up to 10 designs monthly',
                '1 active design request',
                'Unlimited revisions',
                '48-hour turnaround',
            ],
            sortOrder: 1,
        },
        {
            name: 'professional',
            displayName: 'Professional',
            tierLevel: 2,
            pricing: {
                monthly: 399,
                quarterly: 1017.45, // 15% off monthly * 3
                quarterlyDiscount: 15,
            },
            features: {
                designsPerMonth: 20,
                simultaneousDesigns: 3,
                unlimitedRevisions: true,
                prioritySupport: true,
                dedicatedDesigner: false,
                sourceFiles: true,
                rushDelivery: true,
                videoDesigns: false,
            },
            description: 'Ideal for growing businesses with regular design needs.',
            highlights: [
                'Up to 20 designs monthly',
                '3 active design requests',
                'Priority support',
                'Rush delivery available',
                '24-hour turnaround',
            ],
            badge: {
                text: 'Most Popular',
                color: '#3b82f6',
            },
            isPopular: true,
            sortOrder: 2,
        },
        {
            name: 'enterprise',
            displayName: 'Enterprise',
            tierLevel: 3,
            isCustom: true,
            customMessage:
                'Contact Bader for custom pricing and features tailored to your business needs.',
            pricing: {
                monthly: 0,
                quarterly: 0,
                quarterlyDiscount: 0,
            },
            features: {
                designsPerMonth: 999,
                simultaneousDesigns: 999,
                unlimitedRevisions: true,
                prioritySupport: true,
                dedicatedDesigner: true,
                sourceFiles: true,
                rushDelivery: true,
                videoDesigns: true,
            },
            description:
                'Custom solutions for large organizations with extensive design requirements.',
            highlights: [
                'Unlimited designs',
                'Unlimited active requests',
                'Dedicated design team',
                'Custom integrations',
                'White-glove service',
            ],
            sortOrder: 3,
        },
    ];

    for (const tierData of tiers) {
        await this.findOneAndUpdate({ tierLevel: tierData.tierLevel }, tierData, {
            upsert: true,
            new: true,
        });
    }

    return await this.getActiveTiers();
};

// Ensure virtual fields are serialized
subscriptionTierSchema.set('toJSON', {
    virtuals: true,
});

module.exports =
    mongoose.models.SubscriptionTier || mongoose.model('SubscriptionTier', subscriptionTierSchema);
