const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

// Controllers
const authController = require('./controllers/authController');
const onboardingController = require('./controllers/client/onboardingController');
const clientDashboardController = require('./controllers/client/dashboardController');
const clientRequestsController = require('./controllers/client/requestsController');
const clientSubscriptionController = require('./controllers/client/subscriptionController');
const clientSettingsController = require('./controllers/client/settingsController');
// const designerDashboardController = require('./controllers/designer/dashboardController');
// const adminDashboardController = require('./controllers/admin/dashboardController');

// Middleware from sahab-core
const { createAuthMiddleware } = require('@sahab/core');
const auth = createAuthMiddleware({
    loginPath: '/login',
    sessionKey: 'userId',
    roleKey: 'userRole',
});

/**
 * Public Routes
 */
// Landing page with pricing
router.get('/', (req, res) => {
    res.render('index', {
        title: 'CanvasCue - Professional Design Services',
        layout: 'layout',
        showNav: true,
        showFooter: true,
    });
});

// Authentication routes
router.get('/login', authController.showLogin);
router.post('/login', authController.login);
router.get('/signup', authController.showSignup);
router.post('/signup', authController.signup);
router.get('/logout', authController.logout);

// Password reset
router.get('/forgot-password', authController.showForgotPassword);
router.post('/forgot-password', authController.forgotPassword);
router.get('/reset-password/:token', authController.showResetPassword);
router.post('/reset-password/:token', authController.resetPassword);

const requireRole = (role) => (req, res, next) => {
    if (req.session.userRole !== role) {
        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'You do not have permission to access this page',
        });
    }
    next();
};

/**
 * Protected Routes - Requires Authentication
 */
const protectedRouter = express.Router();
protectedRouter.use(auth.isAuthenticated);

// Onboarding flow (client specific)
protectedRouter.get('/onboarding', onboardingController.showOnboarding);
protectedRouter.post('/onboarding/account-type', onboardingController.saveAccountType);
protectedRouter.post('/onboarding/business-info', onboardingController.saveBusinessInfo);
protectedRouter.post('/onboarding/brand-guidelines', onboardingController.saveBrandGuidelines);
protectedRouter.post('/onboarding/platforms', onboardingController.savePlatforms);
protectedRouter.post('/onboarding/online-presence', onboardingController.saveOnlinePresence);
protectedRouter.post('/onboarding/complete', onboardingController.completeOnboarding);
protectedRouter.post('/onboarding/upload', upload.single('file'), onboardingController.uploadFile);

/**
 * Client Routes
 */
// Dashboard
protectedRouter.get('/dashboard', clientDashboardController.showDashboard);

// Design requests
protectedRouter.get('/requests', clientRequestsController.showRequests);
protectedRouter.get('/requests/new', clientRequestsController.showNewRequest);
protectedRouter.post(
    '/requests/new',
    upload.array('referenceFiles', 10),
    clientRequestsController.createRequest
);
protectedRouter.get('/requests/:id', clientRequestsController.showRequest);

// Subscription management
protectedRouter.get('/subscription', clientSubscriptionController.showSubscription);
protectedRouter.get('/subscription/upgrade', clientSubscriptionController.showUpgrade);
protectedRouter.post('/subscription/upgrade', clientSubscriptionController.upgradeSubscription);
protectedRouter.get(
    '/subscription/success',
    clientSubscriptionController.handleSubscriptionSuccess
);

// Account settings
protectedRouter.get('/settings', clientSettingsController.showSettings);
protectedRouter.post('/settings/profile', clientSettingsController.updateProfile);
protectedRouter.post('/settings/password', clientSettingsController.updatePassword);
protectedRouter.post('/settings/brand', clientSettingsController.updateBrand);
protectedRouter.post(
    '/settings/brand/upload',
    upload.single('file'),
    clientSettingsController.uploadBrandFile
);
protectedRouter.delete(
    '/settings/brand/file/:type/:fileId',
    clientSettingsController.deleteBrandFile
);

/**
 * Designer Routes (to be implemented)
 */
// protectedRouter.get('/designer/dashboard', requireRole('designer'), designerDashboardController.showDashboard);
// protectedRouter.get('/designer/assignments', requireRole('designer'), designerDashboardController.showAssignments);
// protectedRouter.get('/designer/available', requireRole('designer'), designerDashboardController.showAvailable);
// protectedRouter.post('/designer/claim/:id', requireRole('designer'), designerDashboardController.claimRequest);
// protectedRouter.post('/designer/complete/:id', requireRole('designer'), designerDashboardController.completeRequest);

/**
 * Admin Routes (to be implemented)
 */
// protectedRouter.get('/admin/dashboard', requireRole('admin'), adminDashboardController.showDashboard);
// protectedRouter.get('/admin/users', requireRole('admin'), adminDashboardController.showUsers);
// protectedRouter.get('/admin/requests', requireRole('admin'), adminDashboardController.showAllRequests);
// protectedRouter.get('/admin/analytics', requireRole('admin'), adminDashboardController.showAnalytics);

// Mount protected routes
router.use('/', protectedRouter);

/**
 * API Routes - Requires Authentication
 */
const apiRouter = express.Router();
apiRouter.use(auth.isAuthenticated);

// Onboarding API
apiRouter.get('/api/onboarding/status', onboardingController.getStatus);

// Client API Routes
apiRouter.get('/api/dashboard/stats', clientDashboardController.getStats);
apiRouter.get('/api/dashboard/usage', clientDashboardController.getUsage);

// Design Request API
apiRouter.get('/api/requests', clientRequestsController.getRequests);
apiRouter.post('/api/requests', clientRequestsController.createRequestAPI);
apiRouter.put('/api/requests/:id', clientRequestsController.updateRequest);
apiRouter.post('/api/requests/:id/message', clientRequestsController.addMessage);
apiRouter.post('/api/requests/:id/revision', clientRequestsController.requestRevision);

// Subscription API
apiRouter.get('/api/subscription/tiers', clientSubscriptionController.getSubscriptionTiers);
apiRouter.post('/api/subscription/checkout', clientSubscriptionController.createCheckoutSession);
apiRouter.post('/api/subscription/cancel', clientSubscriptionController.cancelSubscription);

// Settings API
apiRouter.get('/api/settings/export', clientSettingsController.exportData);
apiRouter.delete('/api/settings/account', clientSettingsController.deleteAccount);

// Designer API Routes (to be implemented)
// apiRouter.get('/api/designer/queue', requireRole('designer'), designerDashboardController.getQueue);
// apiRouter.post('/api/designer/update-status/:id', requireRole('designer'), designerDashboardController.updateStatus);
// apiRouter.post('/api/designer/upload/:id', requireRole('designer'), upload.array('designs', 5), designerDashboardController.uploadDesign);

// Admin API Routes (to be implemented)
// apiRouter.get('/api/admin/stats', requireRole('admin'), adminDashboardController.getSystemStats);
// apiRouter.get('/api/admin/users', requireRole('admin'), adminDashboardController.getUsers);
// apiRouter.put('/api/admin/users/:id', requireRole('admin'), adminDashboardController.updateUser);

// Mount API routes
router.use('/', apiRouter);

/**
 * Webhook Routes (No auth required)
 */
// router.post(
//     '/webhooks/stripe',
//     express.raw({ type: 'application/json' }),
//     require('./controllers/webhookController').handleStripeWebhook
// );

/**
 * Error handling
 */
router.use((req, res) => {
    res.status(404).render('error', {
        title: '404 - Page Not Found',
        message: 'The page you are looking for does not exist.',
        layout: 'layout',
    });
});

module.exports = router;
