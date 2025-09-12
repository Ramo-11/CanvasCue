const mongoose = require('mongoose');

const onboardingSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true,
            index: true,
        },

        // Business Information (Optional)
        businessDescription: {
            type: String,
            maxlength: 1000,
            default: null,
        },
        targetAudience: {
            type: String,
            maxlength: 500,
            default: null,
        },

        // Brand Guidelines
        brandGuidelines: {
            hasGuidelines: {
                type: Boolean,
                default: false,
            },
            guidelineFiles: [
                {
                    fileName: String,
                    fileUrl: String,
                    fileType: {
                        type: String,
                        enum: ['pdf', 'zip', 'other'],
                    },
                    fileSize: Number,
                    uploadedAt: {
                        type: Date,
                        default: Date.now,
                    },
                },
            ],
            logo: {
                fileName: String,
                fileUrl: String,
                uploadedAt: Date,
            },
            preferredFonts: [
                {
                    type: String,
                    trim: true,
                },
            ],
            brandColors: [
                {
                    name: String,
                    hex: {
                        type: String,
                        match: /^#[0-9A-Fa-f]{6}$/,
                    },
                    rgb: String,
                    usage: {
                        type: String,
                        enum: ['primary', 'secondary', 'accent', 'text', 'background', 'other'],
                    },
                },
            ],
        },

        // Design Usage Platforms
        designPlatforms: {
            linkedin: {
                type: Boolean,
                default: false,
            },
            instagram: {
                type: Boolean,
                default: false,
            },
            facebook: {
                type: Boolean,
                default: false,
            },
            twitter: {
                type: Boolean,
                default: false,
            },
            tiktok: {
                type: Boolean,
                default: false,
            },
            youtube: {
                type: Boolean,
                default: false,
            },
            website: {
                type: Boolean,
                default: false,
            },
            emailMarketing: {
                type: Boolean,
                default: false,
            },
            printMaterials: {
                type: Boolean,
                default: false,
            },
            presentations: {
                type: Boolean,
                default: false,
            },
            packaging: {
                type: Boolean,
                default: false,
            },
            merchandise: {
                type: Boolean,
                default: false,
            },
            digitalAds: {
                type: Boolean,
                default: false,
            },
            other: {
                selected: {
                    type: Boolean,
                    default: false,
                },
                description: String,
            },
        },

        // Website and Social Media Links
        onlinePresence: {
            website: {
                type: String,
                match: /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/,
                default: null,
            },
            socialMedia: {
                linkedin: {
                    type: String,
                    default: null,
                },
                instagram: {
                    type: String,
                    default: null,
                },
                facebook: {
                    type: String,
                    default: null,
                },
                twitter: {
                    type: String,
                    default: null,
                },
                tiktok: {
                    type: String,
                    default: null,
                },
                youtube: {
                    type: String,
                    default: null,
                },
                behance: {
                    type: String,
                    default: null,
                },
                dribbble: {
                    type: String,
                    default: null,
                },
            },
        },

        // Completion tracking
        completedSteps: {
            accountType: {
                type: Boolean,
                default: false,
            },
            businessInfo: {
                type: Boolean,
                default: false,
            },
            brandGuidelines: {
                type: Boolean,
                default: false,
            },
            designPlatforms: {
                type: Boolean,
                default: false,
            },
            onlinePresence: {
                type: Boolean,
                default: false,
            },
        },

        // Metadata
        completedAt: {
            type: Date,
            default: null,
        },
        lastUpdated: {
            type: Date,
            default: Date.now,
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Indexes
onboardingSchema.index({ 'completedSteps.accountType': 1 });
onboardingSchema.index({ completedAt: 1 });

// Virtual to check if onboarding is complete (mandatory fields only)
onboardingSchema.virtual('isComplete').get(function () {
    return this.completedSteps.accountType === true;
});

// Virtual to calculate completion percentage (including optional fields)
onboardingSchema.virtual('completionPercentage').get(function () {
    const steps = Object.values(this.completedSteps);
    const completedCount = steps.filter((step) => step === true).length;
    return Math.round((completedCount / steps.length) * 100);
});

// Virtual to get selected platforms as array
onboardingSchema.virtual('selectedPlatforms').get(function () {
    const platforms = [];
    const platformObj = this.designPlatforms.toObject();

    for (const [key, value] of Object.entries(platformObj)) {
        if (key === 'other' && value.selected) {
            platforms.push(`Other: ${value.description || 'Not specified'}`);
        } else if (value === true) {
            platforms.push(key.charAt(0).toUpperCase() + key.slice(1));
        }
    }

    return platforms;
});

// Method to mark a step as complete
onboardingSchema.methods.markStepComplete = function (stepName) {
    if (this.completedSteps[stepName] !== undefined) {
        this.completedSteps[stepName] = true;
        this.lastUpdated = new Date();

        // Check if all mandatory steps are complete
        if (this.completedSteps.accountType && !this.completedAt) {
            this.completedAt = new Date();
        }
    }
};

// Method to add brand color
onboardingSchema.methods.addBrandColor = function (colorData) {
    this.brandGuidelines.brandColors.push(colorData);
    this.lastUpdated = new Date();
};

// Method to update platform selection
onboardingSchema.methods.updatePlatforms = function (platforms) {
    for (const [key, value] of Object.entries(platforms)) {
        if (this.designPlatforms[key] !== undefined) {
            if (key === 'other' && typeof value === 'object') {
                this.designPlatforms.other = value;
            } else {
                this.designPlatforms[key] = value;
            }
        }
    }
    this.lastUpdated = new Date();
};

// Static method to get onboarding by user ID
onboardingSchema.statics.findByUserId = function (userId) {
    return this.findOne({ user: userId });
};

// Static method to create or update onboarding
onboardingSchema.statics.upsert = async function (userId, data) {
    const options = {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
    };

    return await this.findOneAndUpdate(
        { user: userId },
        { ...data, lastUpdated: new Date() },
        options
    );
};

// Ensure virtual fields are serialized
onboardingSchema.set('toJSON', {
    virtuals: true,
});

module.exports = mongoose.models.Onboarding || mongoose.model('Onboarding', onboardingSchema);
