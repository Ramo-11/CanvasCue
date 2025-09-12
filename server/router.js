const express = require('express');
const router = express.Router();

// Controllers
const authController = require('./controllers/authController');
const onboardingController = require('./controllers/onboardingController');
const dashboardController = require('./controllers/dashboardController');

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

// Password reset (future implementation)
router.get('/forgot-password', authController.showForgotPassword);
router.post('/forgot-password', authController.forgotPassword);
router.get('/reset-password/:token', authController.showResetPassword);
router.post('/reset-password/:token', authController.resetPassword);

/**
 * Protected Routes - Requires Authentication
 */
const protectedRouter = express.Router();
protectedRouter.use(auth.isAuthenticated);

// Onboarding flow (only for new users)
protectedRouter.get('/onboarding', onboardingController.showOnboarding);
protectedRouter.post('/onboarding/account-type', onboardingController.saveAccountType);
protectedRouter.post('/onboarding/business-info', onboardingController.saveBusinessInfo);
protectedRouter.post('/onboarding/brand-guidelines', onboardingController.saveBrandGuidelines);
protectedRouter.post('/onboarding/platforms', onboardingController.savePlatforms);
protectedRouter.post('/onboarding/online-presence', onboardingController.saveOnlinePresence);
protectedRouter.post('/onboarding/complete', onboardingController.completeOnboarding);

// Dashboard (redirect based on onboarding status)
protectedRouter.get('/dashboard', dashboardController.showDashboard);

// Design requests
protectedRouter.get('/requests', dashboardController.showRequests);
protectedRouter.get('/requests/new', dashboardController.showNewRequest);
protectedRouter.post('/requests/new', dashboardController.createRequest);
protectedRouter.get('/requests/:id', dashboardController.showRequest);

// Subscription management
protectedRouter.get('/subscription', dashboardController.showSubscription);
protectedRouter.get('/subscription/upgrade', dashboardController.showUpgrade);
protectedRouter.post('/subscription/upgrade', dashboardController.upgradeSubscription);

// Account settings
protectedRouter.get('/settings', dashboardController.showSettings);
protectedRouter.post('/settings/profile', dashboardController.updateProfile);
protectedRouter.post('/settings/password', dashboardController.updatePassword);
protectedRouter.post('/settings/brand', dashboardController.updateBrand);

// Mount protected routes
router.use('/', protectedRouter);

/**
 * API Routes - Requires Authentication
 */
const apiRouter = express.Router();
apiRouter.use('/api', auth.isAuthenticated);

// Onboarding API
apiRouter.get('/api/onboarding/status', onboardingController.getStatus);
apiRouter.post('/api/onboarding/upload', onboardingController.uploadFile);

// Design Request API
apiRouter.get('/api/requests', dashboardController.getRequests);
apiRouter.post('/api/requests', dashboardController.createRequestAPI);
apiRouter.put('/api/requests/:id', dashboardController.updateRequest);
apiRouter.post('/api/requests/:id/message', dashboardController.addMessage);
apiRouter.post('/api/requests/:id/revision', dashboardController.requestRevision);

// Subscription API
apiRouter.get('/api/subscription/tiers', dashboardController.getSubscriptionTiers);
apiRouter.post('/api/subscription/checkout', dashboardController.createCheckoutSession);
apiRouter.post('/api/subscription/cancel', dashboardController.cancelSubscription);

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
