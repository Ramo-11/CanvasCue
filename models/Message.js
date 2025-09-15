const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
    {
        // References
        designRequest: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'DesignRequest',
            required: true,
            index: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        recipient: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },

        // Message Content
        message: {
            type: String,
            required: true,
            maxlength: 2000,
        },
        messageType: {
            type: String,
            enum: ['text', 'system', 'status_change', 'file_upload'],
            default: 'text',
        },

        // Attachments
        attachments: [
            {
                fileName: String,
                fileUrl: String,
                fileType: String,
                fileSize: Number,
                uploadedAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],

        // Status
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },
        readAt: {
            type: Date,
            default: null,
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
        editedAt: {
            type: Date,
            default: null,
        },
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedAt: {
            type: Date,
            default: null,
        },

        // System Message Data
        systemData: {
            action: String,
            oldValue: String,
            newValue: String,
            metadata: mongoose.Schema.Types.Mixed,
        },

        // Timestamps
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
messageSchema.index({ designRequest: 1, createdAt: -1 });
messageSchema.index({ sender: 1, recipient: 1, isRead: 1 });
messageSchema.index({ designRequest: 1, sender: 1, isRead: 1 });

// Virtual for formatted time
messageSchema.virtual('formattedTime').get(function () {
    const now = new Date();
    const diff = now - this.createdAt;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 7) {
        return this.createdAt.toLocaleDateString();
    } else if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
        return 'Just now';
    }
});

// Method to mark as read
messageSchema.methods.markAsRead = async function () {
    if (!this.isRead) {
        this.isRead = true;
        this.readAt = new Date();
        await this.save();
    }
};

// Method to edit message
messageSchema.methods.editMessage = async function (newMessage) {
    this.message = newMessage;
    this.isEdited = true;
    this.editedAt = new Date();
    await this.save();
};

// Method to soft delete
messageSchema.methods.softDelete = async function () {
    this.isDeleted = true;
    this.deletedAt = new Date();
    await this.save();
};

// Static method to get unread count
messageSchema.statics.getUnreadCount = async function (userId, requestId = null) {
    const filter = {
        recipient: userId,
        isRead: false,
        isDeleted: false,
    };

    if (requestId) {
        filter.designRequest = requestId;
    }

    return await this.countDocuments(filter);
};

// Static method to mark all as read
messageSchema.statics.markAllAsRead = async function (userId, requestId) {
    return await this.updateMany(
        {
            recipient: userId,
            designRequest: requestId,
            isRead: false,
        },
        {
            isRead: true,
            readAt: new Date(),
        }
    );
};

// Static method to get conversation
messageSchema.statics.getConversation = async function (requestId, options = {}) {
    const { limit = 50, before = null, includeDeleted = false } = options;

    const filter = { designRequest: requestId };
    if (!includeDeleted) {
        filter.isDeleted = false;
    }
    if (before) {
        filter.createdAt = { $lt: before };
    }

    return await this.find(filter)
        .populate('sender', 'fullName email role')
        .sort('-createdAt')
        .limit(limit);
};

// Static method to create system message
messageSchema.statics.createSystemMessage = async function (requestId, action, data = {}) {
    const systemMessages = {
        status_change: (data) => `Status changed from ${data.oldValue} to ${data.newValue}`,
        designer_assigned: (data) => `${data.designerName} has been assigned to this request`,
        file_uploaded: (data) => `${data.fileName} has been uploaded`,
        revision_requested: () => 'A revision has been requested',
        request_approved: () => 'The design has been approved',
    };

    const messageText = systemMessages[action]?.(data) || `System action: ${action}`;

    return await this.create({
        designRequest: requestId,
        sender: data.userId || null,
        message: messageText,
        messageType: 'system',
        systemData: {
            action,
            ...data,
        },
    });
};

// Ensure virtual fields are serialized
messageSchema.set('toJSON', {
    virtuals: true,
});

module.exports = mongoose.models.Message || mongoose.model('Message', messageSchema);
