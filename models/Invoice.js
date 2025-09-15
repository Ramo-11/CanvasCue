const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema(
    {
        // Invoice Number
        invoiceNumber: {
            type: String,
            unique: true,
            required: true,
            index: true,
        },

        // References
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        subscription: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subscription',
            required: true,
        },
        subscriptionTier: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'SubscriptionTier',
            required: true,
        },

        // Billing Details
        billingPeriod: {
            type: String,
            enum: ['monthly', 'quarterly', 'annual'],
            required: true,
        },
        periodStart: {
            type: Date,
            required: true,
        },
        periodEnd: {
            type: Date,
            required: true,
        },

        // Amount Details
        subtotal: {
            type: Number,
            required: true,
            min: 0,
        },
        discount: {
            amount: {
                type: Number,
                default: 0,
            },
            percentage: {
                type: Number,
                default: 0,
            },
            code: String,
            description: String,
        },
        tax: {
            amount: {
                type: Number,
                default: 0,
            },
            rate: {
                type: Number,
                default: 0,
            },
            taxId: String,
        },
        total: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            default: 'USD',
            uppercase: true,
        },

        // Payment Information
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded', 'partial_refund', 'void'],
            default: 'pending',
            index: true,
        },
        paymentMethod: {
            type: String,
            enum: ['card', 'bank_transfer', 'paypal', 'other'],
            default: 'card',
        },
        paymentDate: {
            type: Date,
            default: null,
        },
        dueDate: {
            type: Date,
            required: true,
            index: true,
        },

        // Stripe Information
        stripeInvoiceId: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        stripePaymentIntentId: String,
        stripeChargeId: String,
        stripeReceiptUrl: String,

        // Line Items
        lineItems: [
            {
                description: String,
                quantity: {
                    type: Number,
                    default: 1,
                },
                unitPrice: Number,
                amount: Number,
                type: {
                    type: String,
                    enum: ['subscription', 'addon', 'credit', 'debit'],
                },
            },
        ],

        // Billing Address
        billingAddress: {
            name: String,
            company: String,
            addressLine1: String,
            addressLine2: String,
            city: String,
            state: String,
            postalCode: String,
            country: String,
        },

        // Notes
        notes: {
            type: String,
            maxlength: 500,
        },
        internalNotes: {
            type: String,
            maxlength: 500,
        },

        // Status Flags
        isProforma: {
            type: Boolean,
            default: false,
        },
        isCreditNote: {
            type: Boolean,
            default: false,
        },
        isDisputed: {
            type: Boolean,
            default: false,
        },
        disputeReason: String,
        disputeResolvedAt: Date,

        // Metadata
        metadata: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            index: true,
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

// Indexes for performance
invoiceSchema.index({ user: 1, createdAt: -1 });
invoiceSchema.index({ paymentStatus: 1, dueDate: 1 });
invoiceSchema.index({ subscription: 1, periodStart: 1 });

// Virtual for formatted invoice number
invoiceSchema.virtual('formattedNumber').get(function () {
    return `INV-${this.invoiceNumber}`;
});

// Virtual for is overdue
invoiceSchema.virtual('isOverdue').get(function () {
    if (this.paymentStatus === 'paid' || this.paymentStatus === 'void') {
        return false;
    }
    return new Date() > this.dueDate;
});

// Virtual for days until due
invoiceSchema.virtual('daysUntilDue').get(function () {
    if (this.paymentStatus === 'paid') return null;
    const now = new Date();
    const diff = this.dueDate - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to generate invoice number
invoiceSchema.pre('save', async function (next) {
    if (!this.invoiceNumber) {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');

        // Find the last invoice number for this month
        const lastInvoice = await this.constructor
            .findOne({
                invoiceNumber: new RegExp(`^${year}${month}`),
            })
            .sort('-invoiceNumber');

        let sequence = 1;
        if (lastInvoice) {
            const lastSequence = parseInt(lastInvoice.invoiceNumber.slice(-4));
            sequence = lastSequence + 1;
        }

        this.invoiceNumber = `${year}${month}${sequence.toString().padStart(4, '0')}`;
    }

    // Calculate total if not set
    if (!this.total && this.subtotal) {
        this.total = this.subtotal - (this.discount?.amount || 0) + (this.tax?.amount || 0);
    }

    next();
});

// Method to mark as paid
invoiceSchema.methods.markAsPaid = async function (paymentDetails = {}) {
    this.paymentStatus = 'paid';
    this.paymentDate = new Date();

    if (paymentDetails.stripeChargeId) {
        this.stripeChargeId = paymentDetails.stripeChargeId;
    }
    if (paymentDetails.stripeReceiptUrl) {
        this.stripeReceiptUrl = paymentDetails.stripeReceiptUrl;
    }

    await this.save();
    return this;
};

// Method to issue refund
invoiceSchema.methods.issueRefund = async function (amount = null, reason = '') {
    if (amount && amount < this.total) {
        this.paymentStatus = 'partial_refund';
    } else {
        this.paymentStatus = 'refunded';
    }

    this.notes = reason || this.notes;
    await this.save();
    return this;
};

// Method to void invoice
invoiceSchema.methods.voidInvoice = async function (reason = '') {
    this.paymentStatus = 'void';
    this.internalNotes = reason || 'Invoice voided';
    await this.save();
    return this;
};

// Static method to create from subscription
invoiceSchema.statics.createFromSubscription = async function (subscription) {
    const user = await mongoose.model('User').findById(subscription.user);
    const tier = await mongoose.model('SubscriptionTier').findById(subscription.tier);

    const invoice = new this({
        user: subscription.user,
        subscription: subscription._id,
        subscriptionTier: subscription.tier,
        billingPeriod: subscription.billingPeriod,
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        subtotal: subscription.amount,
        total: subscription.amount,
        currency: subscription.currency,
        dueDate: subscription.nextBillingDate,
        stripeInvoiceId: subscription.stripeInvoiceId || null,
        lineItems: [
            {
                description: `${tier.displayName} - ${subscription.billingPeriod} subscription`,
                quantity: 1,
                unitPrice: subscription.amount,
                amount: subscription.amount,
                type: 'subscription',
            },
        ],
        billingAddress: {
            name: user.displayName,
            company: user.companyName || null,
        },
    });

    await invoice.save();
    return invoice;
};

// Static method to find unpaid invoices
invoiceSchema.statics.findUnpaid = async function (userId = null) {
    const filter = {
        paymentStatus: { $in: ['pending', 'failed'] },
        dueDate: { $lte: new Date() },
    };

    if (userId) {
        filter.user = userId;
    }

    return await this.find(filter).populate('user', 'email fullName').sort('dueDate');
};

// Static method to get revenue statistics
invoiceSchema.statics.getRevenueStats = async function (startDate, endDate) {
    const stats = await this.aggregate([
        {
            $match: {
                paymentStatus: 'paid',
                paymentDate: {
                    $gte: startDate,
                    $lte: endDate,
                },
            },
        },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$total' },
                invoiceCount: { $sum: 1 },
                avgInvoiceAmount: { $avg: '$total' },
            },
        },
        {
            $project: {
                _id: 0,
                totalRevenue: 1,
                invoiceCount: 1,
                avgInvoiceAmount: { $round: ['$avgInvoiceAmount', 2] },
            },
        },
    ]);

    return (
        stats[0] || {
            totalRevenue: 0,
            invoiceCount: 0,
            avgInvoiceAmount: 0,
        }
    );
};

// Ensure virtual fields are serialized
invoiceSchema.set('toJSON', {
    virtuals: true,
});

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
