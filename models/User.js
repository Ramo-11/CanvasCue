const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        // Authentication
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        password: {
            type: String,
            required: true,
            minlength: 6,
        },

        // User Role
        role: {
            type: String,
            enum: ['client', 'designer', 'admin'],
            default: 'client',
            required: true,
        },

        // Account Status
        isActive: {
            type: Boolean,
            default: true,
        },
        isEmailVerified: {
            type: Boolean,
            default: false,
        },
        emailVerificationToken: String,
        emailVerificationExpires: Date,

        // Password Reset
        passwordResetToken: String,
        passwordResetExpires: Date,

        // Onboarding Status
        onboardingCompleted: {
            type: Boolean,
            default: false,
        },
        onboardingStep: {
            type: Number,
            default: 1,
            min: 1,
            max: 5,
        },

        // User Type (from onboarding)
        accountType: {
            type: String,
            enum: ['individual', 'company', null],
            default: null,
        },

        // Profile Information
        fullName: {
            type: String,
            trim: true,
            default: null,
        },
        companyName: {
            type: String,
            trim: true,
            default: null,
        },

        // Subscription Reference
        currentSubscription: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subscription',
            default: null,
        },

        // Stripe Customer ID
        stripeCustomerId: {
            type: String,
            default: null,
        },

        // Timestamps
        lastLogin: {
            type: Date,
            default: null,
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
userSchema.index({ email: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ stripeCustomerId: 1 });

// Virtual for display name
userSchema.virtual('displayName').get(function () {
    if (this.accountType === 'company' && this.companyName) {
        return this.companyName;
    }
    return this.fullName || this.email.split('@')[0];
});

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
    // Only hash the password if it has been modified
    if (!this.isModified('password')) return next();

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Update the updatedAt timestamp
userSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Method to compare password for login
userSchema.methods.comparePassword = async function (candidatePassword) {
    try {
        return await bcrypt.compare(candidatePassword, this.password);
    } catch (error) {
        throw error;
    }
};

// Method to generate email verification token
userSchema.methods.generateEmailVerificationToken = function () {
    const token = require('crypto').randomBytes(32).toString('hex');
    this.emailVerificationToken = require('crypto')
        .createHash('sha256')
        .update(token)
        .digest('hex');
    this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    return token;
};

// Method to generate password reset token
userSchema.methods.generatePasswordResetToken = function () {
    const token = require('crypto').randomBytes(32).toString('hex');
    this.passwordResetToken = require('crypto').createHash('sha256').update(token).digest('hex');
    this.passwordResetExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    return token;
};

// Method to check if user has active subscription
userSchema.methods.hasActiveSubscription = async function () {
    if (!this.currentSubscription) return false;

    const Subscription = mongoose.model('Subscription');
    const subscription = await Subscription.findById(this.currentSubscription);

    return subscription && subscription.status === 'active';
};

// Method to get subscription details
userSchema.methods.getSubscriptionDetails = async function () {
    if (!this.currentSubscription) return null;

    const Subscription = mongoose.model('Subscription');
    return await Subscription.findById(this.currentSubscription).populate('tier');
};

// Static method to find by email
userSchema.statics.findByEmail = function (email) {
    return this.findOne({
        email: email.toLowerCase().trim(),
    });
};

// Ensure virtual fields are serialized
userSchema.set('toJSON', {
    virtuals: true,
    transform: function (doc, ret) {
        delete ret.password;
        delete ret.emailVerificationToken;
        delete ret.passwordResetToken;
        delete ret.__v;
        return ret;
    },
});

module.exports = mongoose.model('User', userSchema);
