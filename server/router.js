const express = require('express');
const router = express.Router();

// Controllers
const authController = require('./controllers/authController');
const onboardingController = require('./controllers/onboardingController');
const clientDashboardController = require('./controllers/client/dashboardController');
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

// Onboarding flow (only for new client users)
protectedRouter.get('/onboarding', onboardingController.showOnboarding);
protectedRouter.post('/onboarding/account-type', onboardingController.saveAccountType);
protectedRouter.post('/onboarding/business-info', onboardingController.saveBusinessInfo);
protectedRouter.post('/onboarding/brand-guidelines', onboardingController.saveBrandGuidelines);
protectedRouter.post('/onboarding/platforms', onboardingController.savePlatforms);
protectedRouter.post('/onboarding/online-presence', onboardingController.saveOnlinePresence);
protectedRouter.post('/onboarding/complete', onboardingController.completeOnboarding);
protectedRouter.post('/onboarding/upload', onboardingController.uploadFile);

/**
 * Client Routes
 */
// Dashboard
protectedRouter.get('/dashboard', clientDashboardController.showDashboard);

// Design requests
protectedRouter.get('/requests', clientDashboardController.showRequests);
protectedRouter.get('/requests/new', clientDashboardController.showNewRequest);
protectedRouter.post('/requests/new', clientDashboardController.createRequest);
protectedRouter.get('/requests/:id', clientDashboardController.showRequest);

// Subscription management
protectedRouter.get('/subscription', clientDashboardController.showSubscription);
protectedRouter.get('/subscription/upgrade', clientDashboardController.showUpgrade);
protectedRouter.post('/subscription/upgrade', clientDashboardController.upgradeSubscription);

// Account settings
protectedRouter.get('/settings', clientDashboardController.showSettings);
protectedRouter.post('/settings/profile', clientDashboardController.updateProfile);
protectedRouter.post('/settings/password', clientDashboardController.updatePassword);
protectedRouter.post('/settings/brand', clientDashboardController.updateBrand);

/**
 * Designer Routes (to be implemented)
 */
// protectedRouter.get('/designer/dashboard', designerDashboardController.showDashboard);
// protectedRouter.get('/designer/assignments', designerDashboardController.showAssignments);
// protectedRouter.get('/designer/available', designerDashboardController.showAvailable);
// protectedRouter.post('/designer/claim/:id', designerDashboardController.claimRequest);
// protectedRouter.post('/designer/complete/:id', designerDashboardController.completeRequest);

/**
 * Admin Routes (to be implemented)
 */
// protectedRouter.get('/admin/dashboard', adminDashboardController.showDashboard);
// protectedRouter.get('/admin/users', adminDashboardController.showUsers);
// protectedRouter.get('/admin/requests', adminDashboardController.showAllRequests);
// protectedRouter.get('/admin/analytics', adminDashboardController.showAnalytics);

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
apiRouter.get('/api/requests', clientDashboardController.getRequests);
apiRouter.post('/api/requests', clientDashboardController.createRequestAPI);
apiRouter.put('/api/requests/:id', clientDashboardController.updateRequest);
apiRouter.post('/api/requests/:id/message', clientDashboardController.addMessage);
apiRouter.post('/api/requests/:id/revision', clientDashboardController.requestRevision);

// Subscription API
apiRouter.get('/api/subscription/tiers', clientDashboardController.getSubscriptionTiers);
apiRouter.post('/api/subscription/checkout', clientDashboardController.createCheckoutSession);
apiRouter.post('/api/subscription/cancel', clientDashboardController.cancelSubscription);

// Designer API Routes (to be implemented)
// apiRouter.get('/api/designer/queue', designerDashboardController.getQueue);
// apiRouter.post('/api/designer/update-status/:id', designerDashboardController.updateStatus);
// apiRouter.post('/api/designer/upload/:id', designerDashboardController.uploadDesign);

// Admin API Routes (to be implemented)
// apiRouter.get('/api/admin/stats', adminDashboardController.getSystemStats);
// apiRouter.get('/api/admin/users', adminDashboardController.getUsers);
// apiRouter.put('/api/admin/users/:id', adminDashboardController.updateUser);

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
