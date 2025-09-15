const mongoose = require('mongoose');
const DesignRequest = require('../../../models/DesignRequest');
const Subscription = require('../../../models/Subscription');
const User = require('../../../models/User');
const Message = require('../../../models/Message');
const { createAppLogger, createStorageService, createNotificationService } = require('@sahab/core');

const logger = createAppLogger();
const storage = createStorageService();
const notifications = createNotificationService(mongoose, {
    types: ['request_created', 'request_updated', 'revision_requested', 'message_received'],
    relatedModels: ['DesignRequest', 'User'],
});

/**
 * Show all requests for client
 */
const showRequests = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { status, priority, sort = '-createdAt' } = req.query;

        // Build filter
        const filter = { client: userId, isArchived: false };
        if (status && status !== 'all') filter.status = status;
        if (priority && priority !== 'all') filter.priority = priority;

        // Get requests
        const requests = await DesignRequest.find(filter)
            .populate('designer', 'fullName email')
            .sort(sort)
            .lean();

        // Get stats for filters
        const stats = await DesignRequest.aggregate([
            { $match: { client: new mongoose.Types.ObjectId(userId), isArchived: false } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        const statusCounts = stats.reduce((acc, stat) => {
            acc[stat._id] = stat.count;
            return acc;
        }, {});

        res.render('client/requests/index', {
            title: 'My Design Requests - CanvasCue',
            layout: 'layout',
            additionalCSS: ['dashboard-shared.css', 'requests.css'],
            additionalJS: ['requests.js'],
            requests,
            statusCounts,
            currentFilters: { status, priority, sort },
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
            req.session.flashMessage = {
                type: 'warning',
                message: 'Please subscribe to a plan to create design requests',
            };
            return res.redirect('/subscription');
        }

        // Check if user has reached limits
        if (subscription.hasReachedDesignLimit) {
            req.session.flashMessage = {
                type: 'error',
                message: 'You have reached your monthly design limit',
            };
            return res.redirect('/requests');
        }

        if (!subscription.canAddActiveDesign) {
            req.session.flashMessage = {
                type: 'error',
                message: 'You have reached your simultaneous design limit',
            };
            return res.redirect('/requests');
        }

        // Get user's brand guidelines from onboarding
        const Onboarding = require('../../../models/Onboarding');
        const onboarding = await Onboarding.findByUserId(userId);

        res.render('client/requests/new', {
            title: 'New Design Request - CanvasCue',
            layout: 'layout',
            additionalCSS: ['dashboard-shared.css', 'request-form.css'],
            additionalJS: ['request-form.js'],
            subscription: subscription.toJSON(),
            brandGuidelines: onboarding?.brandGuidelines || null,
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
 * Create new request
 */
const createRequest = async (req, res) => {
    try {
        const userId = req.session.userId;
        const {
            title,
            description,
            category,
            platform,
            priority,
            deadline,
            specifications,
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

        // Create request
        const request = new DesignRequest({
            client: userId,
            subscription: subscription._id,
            title: title.trim(),
            description: description.trim(),
            category,
            platform: platform || null,
            priority: priority || 'normal',
            deadline: deadline || null,
            specifications: specifications || {},
            clientNotes: clientNotes?.trim() || null,
            status: 'draft',
        });

        // Handle file uploads if any
        if (req.files && req.files.length > 0) {
            request.referenceFiles = await Promise.all(
                req.files.map(async (file) => {
                    const result = await storage.uploadFile(file, `requests/${request._id}`);
                    return {
                        fileName: file.originalname,
                        fileUrl: await storage.getSignedUrl(result.fileName),
                        fileType: file.mimetype,
                        fileSize: file.size,
                        description: req.body[`file_description_${file.fieldname}`] || '',
                    };
                })
            );
        }

        // Save request
        await request.save();

        // Update subscription usage
        await subscription.incrementDesignUsage();
        await subscription.updateActiveDesigns(subscription.usage.activeDesignRequests + 1);

        // Create notification for admins
        await notifications.create(
            null, // Will be sent to admins
            'request_created',
            'New Design Request',
            `New request "${title}" created by ${req.session.userEmail}`,
            {
                relatedModel: 'DesignRequest',
                relatedId: request._id,
                priority,
            }
        );

        logger.info(`Design request created: ${request.requestNumber} by user ${userId}`);

        res.redirect(`/requests/${request._id}`);
    } catch (error) {
        logger.error('Create request error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to create request',
            layout: 'layout',
        });
    }
};

/**
 * Show single request details
 */
const showRequest = async (req, res) => {
    try {
        const userId = req.session.userId;
        const requestId = req.params.id;

        const request = await DesignRequest.findOne({
            _id: requestId,
            client: userId,
        })
            .populate('designer', 'fullName email')
            .populate('subscription');

        if (!request) {
            return res.status(404).render('error', {
                title: 'Not Found',
                message: 'Request not found',
                layout: 'layout',
            });
        }

        // Get messages for this request
        const messages = await Message.find({ designRequest: requestId })
            .populate('sender', 'fullName email role')
            .sort('createdAt');

        // Mark messages as read
        await Message.updateMany(
            {
                designRequest: requestId,
                sender: { $ne: userId },
                isRead: false,
            },
            { isRead: true, readAt: new Date() }
        );

        // Reset unread count
        request.unreadMessagesCount.client = 0;
        await request.save();

        res.render('client/requests/detail', {
            title: `${request.title} - CanvasCue`,
            layout: 'layout',
            additionalCSS: ['dashboard-shared.css', 'request-detail.css'],
            additionalJS: ['request-detail.js'],
            request: request.toJSON(),
            messages,
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
 * Get requests (API)
 */
const getRequests = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { status, priority, page = 1, limit = 20 } = req.query;

        const filter = { client: userId, isArchived: false };
        if (status) filter.status = status;
        if (priority) filter.priority = priority;

        const requests = await DesignRequest.find(filter)
            .populate('designer', 'fullName')
            .sort('-createdAt')
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .lean();

        const total = await DesignRequest.countDocuments(filter);

        res.json({
            success: true,
            data: {
                requests,
                pagination: {
                    total,
                    page: parseInt(page),
                    pages: Math.ceil(total / limit),
                },
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
 * Create request (API)
 */
const createRequestAPI = async (req, res) => {
    try {
        const userId = req.session.userId;

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

        // Create request
        const request = new DesignRequest({
            ...req.body,
            client: userId,
            subscription: subscription._id,
            status: 'draft',
        });

        await request.save();

        // Update subscription usage
        await subscription.incrementDesignUsage();
        await subscription.updateActiveDesigns(subscription.usage.activeDesignRequests + 1);

        logger.info(`Design request created via API: ${request.requestNumber}`);

        res.json({
            success: true,
            data: request,
        });
    } catch (error) {
        logger.error('Create request API error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create request',
        });
    }
};

/**
 * Update request
 */
const updateRequest = async (req, res) => {
    try {
        const userId = req.session.userId;
        const requestId = req.params.id;
        const updates = req.body;

        const request = await DesignRequest.findOne({
            _id: requestId,
            client: userId,
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found',
            });
        }

        // Only allow updates if status is draft or submitted
        if (!['draft', 'submitted'].includes(request.status)) {
            return res.status(403).json({
                success: false,
                message: 'Cannot update request in current status',
            });
        }

        // Update allowed fields
        const allowedFields = [
            'title',
            'description',
            'category',
            'platform',
            'priority',
            'deadline',
            'specifications',
            'clientNotes',
        ];
        allowedFields.forEach((field) => {
            if (updates[field] !== undefined) {
                request[field] = updates[field];
            }
        });

        // Update status if submitting
        if (updates.submit === true && request.status === 'draft') {
            await request.updateStatus('submitted', userId);
        }

        await request.save();

        logger.info(`Request ${request.requestNumber} updated by user ${userId}`);

        res.json({
            success: true,
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
 * Add message to request
 */
const addMessage = async (req, res) => {
    try {
        const userId = req.session.userId;
        const requestId = req.params.id;
        const { message, attachments } = req.body;

        // Verify request ownership
        const request = await DesignRequest.findOne({
            _id: requestId,
            client: userId,
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found',
            });
        }

        // Create message
        const newMessage = new Message({
            designRequest: requestId,
            sender: userId,
            recipient: request.designer,
            message: message.trim(),
            attachments: attachments || [],
        });

        await newMessage.save();

        // Update request
        request.lastMessageAt = new Date();
        if (request.designer) {
            request.unreadMessagesCount.designer += 1;
        }
        await request.save();

        // Send notification
        if (request.designer) {
            await notifications.create(
                request.designer,
                'message_received',
                'New Message',
                `New message on request ${request.requestNumber}`,
                {
                    relatedModel: 'DesignRequest',
                    relatedId: requestId,
                }
            );
        }

        logger.info(`Message added to request ${request.requestNumber}`);

        res.json({
            success: true,
            data: newMessage,
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
 * Request revision
 */
const requestRevision = async (req, res) => {
    try {
        const userId = req.session.userId;
        const requestId = req.params.id;
        const { description } = req.body;

        const request = await DesignRequest.findOne({
            _id: requestId,
            client: userId,
        });

        if (!request) {
            return res.status(404).json({
                success: false,
                message: 'Request not found',
            });
        }

        // Check if status allows revision
        if (!['pending-approval', 'completed'].includes(request.status)) {
            return res.status(403).json({
                success: false,
                message: 'Cannot request revision in current status',
            });
        }

        // Add revision
        const revision = await request.addRevision(description, userId);

        // Send notification to designer
        if (request.designer) {
            await notifications.create(
                request.designer,
                'revision_requested',
                'Revision Requested',
                `Revision requested for ${request.requestNumber}`,
                {
                    relatedModel: 'DesignRequest',
                    relatedId: requestId,
                }
            );
        }

        logger.info(`Revision requested for ${request.requestNumber}`);

        res.json({
            success: true,
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

module.exports = {
    showRequests,
    showNewRequest,
    createRequest,
    showRequest,
    getRequests,
    createRequestAPI,
    updateRequest,
    addMessage,
    requestRevision,
};
