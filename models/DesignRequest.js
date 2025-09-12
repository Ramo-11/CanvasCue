const mongoose = require('mongoose');

const designRequestSchema = new mongoose.Schema(
    {
        // Request Identification
        requestNumber: {
            type: String,
            unique: true,
            required: true,
            index: true,
        },

        // User & Subscription
        client: {
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
        designer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
            index: true,
        },

        // Request Details
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: {
            type: String,
            required: true,
            maxlength: 2000,
        },
        category: {
            type: String,
            enum: [
                'social-media',
                'print',
                'web-graphics',
                'presentation',
                'email-template',
                'banner-ads',
                'logo-branding',
                'packaging',
                'merchandise',
                'other',
            ],
            required: true,
        },
        platform: {
            type: String,
            enum: [
                'instagram-post',
                'instagram-story',
                'facebook-post',
                'facebook-cover',
                'linkedin-post',
                'linkedin-banner',
                'twitter-post',
                'twitter-header',
                'youtube-thumbnail',
                'youtube-banner',
                'tiktok',
                'website',
                'email',
                'print',
                'presentation',
                'other',
            ],
            default: null,
        },

        // Specifications
        specifications: {
            dimensions: {
                width: Number,
                height: Number,
                unit: {
                    type: String,
                    enum: ['px', 'in', 'cm', 'mm'],
                    default: 'px',
                },
            },
            fileFormat: [
                {
                    type: String,
                    enum: ['jpg', 'png', 'pdf', 'svg', 'ai', 'psd', 'eps', 'gif', 'mp4'],
                },
            ],
            colorMode: {
                type: String,
                enum: ['rgb', 'cmyk', 'pantone'],
                default: 'rgb',
            },
            resolution: {
                type: String,
                enum: ['72dpi', '150dpi', '300dpi', 'vector'],
                default: '72dpi',
            },
        },

        // Status & Priority
        status: {
            type: String,
            enum: [
                'draft',
                'submitted',
                'in-review',
                'in-progress',
                'revision-requested',
                'pending-approval',
                'approved',
                'completed',
                'canceled',
            ],
            default: 'draft',
            index: true,
        },
        priority: {
            type: String,
            enum: ['low', 'normal', 'high', 'urgent'],
            default: 'normal',
            index: true,
        },
        isRushOrder: {
            type: Boolean,
            default: false,
        },

        // Attachments & Files
        referenceFiles: [
            {
                fileName: String,
                fileUrl: String,
                fileType: String,
                fileSize: Number,
                description: String,
                uploadedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        deliverables: [
            {
                version: Number,
                fileName: String,
                fileUrl: String,
                fileType: String,
                fileSize: Number,
                uploadedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
                uploadedAt: {
                    type: Date,
                    default: Date.now,
                },
                isApproved: {
                    type: Boolean,
                    default: false,
                },
                feedback: String,
            },
        ],

        // Revision Tracking
        revisions: [
            {
                revisionNumber: Number,
                requestedBy: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: 'User',
                },
                requestedAt: {
                    type: Date,
                    default: Date.now,
                },
                description: String,
                status: {
                    type: String,
                    enum: ['pending', 'in-progress', 'completed'],
                    default: 'pending',
                },
                completedAt: Date,
            },
        ],
        revisionCount: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Timeline
        timeline: {
            submittedAt: Date,
            assignedAt: Date,
            startedAt: Date,
            firstDraftAt: Date,
            completedAt: Date,
            approvedAt: Date,
            canceledAt: Date,
        },
        deadline: {
            type: Date,
            index: true,
        },
        estimatedHours: {
            type: Number,
            min: 0,
            default: null,
        },
        actualHours: {
            type: Number,
            min: 0,
            default: null,
        },

        // Communication
        internalNotes: {
            type: String,
            maxlength: 1000,
            default: null,
        },
        clientNotes: {
            type: String,
            maxlength: 1000,
            default: null,
        },
        lastMessageAt: {
            type: Date,
            default: null,
        },
        unreadMessagesCount: {
            client: {
                type: Number,
                default: 0,
            },
            designer: {
                type: Number,
                default: 0,
            },
        },

        // Ratings & Feedback
        rating: {
            score: {
                type: Number,
                min: 1,
                max: 5,
                default: null,
            },
            feedback: String,
            ratedAt: Date,
        },

        // Metadata
        tags: [
            {
                type: String,
                trim: true,
                lowercase: true,
            },
        ],
        isArchived: {
            type: Boolean,
            default: false,
            index: true,
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
designRequestSchema.index({ client: 1, status: 1, createdAt: -1 });
designRequestSchema.index({ designer: 1, status: 1, priority: -1 });
designRequestSchema.index({ requestNumber: 1 });
designRequestSchema.index({ deadline: 1, status: 1 });

// Virtual for turnaround time
designRequestSchema.virtual('turnaroundTime').get(function () {
    if (!this.timeline.completedAt || !this.timeline.submittedAt) return null;

    const diff = this.timeline.completedAt - this.timeline.submittedAt;
    return Math.round(diff / (1000 * 60 * 60)); // in hours
});

// Virtual for is overdue
designRequestSchema.virtual('isOverdue').get(function () {
    if (!this.deadline || this.status === 'completed' || this.status === 'canceled') {
        return false;
    }
    return new Date() > this.deadline;
});

// Virtual for days until deadline
designRequestSchema.virtual('daysUntilDeadline').get(function () {
    if (!this.deadline) return null;

    const now = new Date();
    const diff = this.deadline - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// Virtual for latest version
designRequestSchema.virtual('latestVersion').get(function () {
    if (this.deliverables.length === 0) return null;

    return this.deliverables.reduce((latest, current) => {
        return current.version > latest.version ? current : latest;
    });
});

// Pre-save middleware to generate request number
designRequestSchema.pre('save', async function (next) {
    if (!this.requestNumber) {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');

        // Find the last request number for this month
        const lastRequest = await this.constructor
            .findOne({
                requestNumber: new RegExp(`^DR${year}${month}`),
            })
            .sort('-requestNumber');

        let sequence = 1;
        if (lastRequest) {
            const lastSequence = parseInt(lastRequest.requestNumber.slice(-4));
            sequence = lastSequence + 1;
        }

        this.requestNumber = `DR${year}${month}${sequence.toString().padStart(4, '0')}`;
    }

    next();
});

// Method to update status
designRequestSchema.methods.updateStatus = async function (newStatus, userId = null) {
    const oldStatus = this.status;
    this.status = newStatus;

    // Update timeline based on status change
    const now = new Date();
    switch (newStatus) {
        case 'submitted':
            this.timeline.submittedAt = now;
            break;
        case 'in-progress':
            if (!this.timeline.startedAt) {
                this.timeline.startedAt = now;
            }
            break;
        case 'completed':
            this.timeline.completedAt = now;
            break;
        case 'approved':
            this.timeline.approvedAt = now;
            this.timeline.completedAt = this.timeline.completedAt || now;
            break;
        case 'canceled':
            this.timeline.canceledAt = now;
            break;
    }

    await this.save();

    return { oldStatus, newStatus };
};

// Method to add revision
designRequestSchema.methods.addRevision = async function (description, requestedBy) {
    const revisionNumber = this.revisionCount + 1;

    this.revisions.push({
        revisionNumber,
        description,
        requestedBy,
        requestedAt: new Date(),
    });

    this.revisionCount = revisionNumber;
    this.status = 'revision-requested';

    await this.save();

    return this.revisions[this.revisions.length - 1];
};

// Method to add deliverable
designRequestSchema.methods.addDeliverable = async function (fileData, uploadedBy) {
    const version = this.deliverables.length + 1;

    const deliverable = {
        version,
        ...fileData,
        uploadedBy,
        uploadedAt: new Date(),
    };

    this.deliverables.push(deliverable);

    if (!this.timeline.firstDraftAt) {
        this.timeline.firstDraftAt = new Date();
    }

    await this.save();

    return deliverable;
};

// Static method to find requests by client
designRequestSchema.statics.findByClient = function (clientId, options = {}) {
    const query = { client: clientId };

    if (!options.includeArchived) {
        query.isArchived = false;
    }

    return this.find(query)
        .sort(options.sort || '-createdAt')
        .populate('designer', 'fullName email');
};

// Static method to find requests by designer
designRequestSchema.statics.findByDesigner = function (designerId, options = {}) {
    const query = { designer: designerId };

    if (options.status) {
        query.status = options.status;
    }

    return this.find(query)
        .sort(options.sort || '-priority createdAt')
        .populate('client', 'fullName companyName email');
};

// Static method to get statistics
designRequestSchema.statics.getStatistics = async function (filter = {}) {
    const stats = await this.aggregate([
        { $match: filter },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                completed: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
                },
                inProgress: {
                    $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] },
                },
                avgTurnaround: {
                    $avg: {
                        $subtract: ['$timeline.completedAt', '$timeline.submittedAt'],
                    },
                },
                avgRevisions: { $avg: '$revisionCount' },
                avgRating: { $avg: '$rating.score' },
            },
        },
    ]);

    return (
        stats[0] || {
            total: 0,
            completed: 0,
            inProgress: 0,
            avgTurnaround: 0,
            avgRevisions: 0,
            avgRating: 0,
        }
    );
};

// Ensure virtual fields are serialized
designRequestSchema.set('toJSON', {
    virtuals: true,
});

module.exports = mongoose.model('DesignRequest', designRequestSchema);
