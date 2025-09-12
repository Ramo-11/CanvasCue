const mongoose = require('mongoose');
const {
    createNotificationService,
    createEmailService,
    createStorageService,
    createStripeService,
    createValidationService,
    createAppLogger,
} = require('@sahab/core');

// Initialize services that don't need mongoose
const logger = createAppLogger();
const emailService = createEmailService();
const storage = createStorageService();
const stripeService = createStripeService();
const validation = createValidationService();

// Lazy initialization for notification service
let notifications;
function getNotificationService() {
    if (!notifications) {
        notifications = createNotificationService(mongoose, {
            types: [
                'request_created',
                'request_updated',
                'subscription_changed',
                'payment_received',
            ],
            relatedModels: ['DesignRequest', 'Subscription', 'User', 'Payment'],
        });
    }
    return notifications;
}

module.exports = {
    logger,
    emailService,
    storage,
    stripeService,
    validation,
    notifications: getNotificationService,
};
