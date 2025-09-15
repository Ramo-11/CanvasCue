const mongoose = require('mongoose');
const User = require('../../../models/User');
const Onboarding = require('../../../models/Onboarding');
const SubscriptionTier = require('../../../models/SubscriptionTier');
const { createAppLogger, createStorageService, createNotificationService } = require('@sahab/core');

const logger = createAppLogger();
const storage = createStorageService();
const notifications = createNotificationService(mongoose, {
    types: ['onboarding_complete', 'profile_updated'],
    relatedModels: ['User', 'Onboarding'],
});

/**
 * Show onboarding page based on current step
 */
const showOnboarding = async (req, res) => {
    try {
        const userId = req.session.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.redirect('/login');
        }

        // Only for client role
        if (user.role !== 'client') {
            return res.redirect('/dashboard');
        }

        // If onboarding is already complete, redirect to dashboard
        if (user.onboardingCompleted) {
            return res.redirect('/dashboard');
        }

        // Get or create onboarding record
        let onboarding = await Onboarding.findByUserId(userId);
        if (!onboarding) {
            onboarding = await Onboarding.create({ user: userId });
        }

        // Get subscription tiers for display after onboarding
        const tiers = await SubscriptionTier.getActiveTiers();

        res.render('client/onboarding/index', {
            title: "Welcome to CanvasCue - Let's Get Started",
            layout: 'layout',
            showNav: false,
            showFooter: false,
            additionalCSS: ['onboarding.css'],
            additionalJS: ['onboarding.js'],
            currentStep: user.onboardingStep || 1,
            onboarding: onboarding.toJSON(),
            tiers,
            user: {
                email: user.email,
                accountType: user.accountType,
            },
        });
    } catch (error) {
        logger.error('Show onboarding error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load onboarding',
            layout: 'layout',
        });
    }
};

/**
 * Save account type (Step 1 - Mandatory)
 */
const saveAccountType = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { accountType, fullName, companyName } = req.body;

        // Validate input
        if (!accountType || !['individual', 'company'].includes(accountType)) {
            return res.status(400).json({
                success: false,
                message: 'Please select account type',
            });
        }

        if (accountType === 'individual' && !fullName) {
            return res.status(400).json({
                success: false,
                message: 'Full name is required for individual accounts',
            });
        }

        if (accountType === 'company' && !companyName) {
            return res.status(400).json({
                success: false,
                message: 'Company name is required for business accounts',
            });
        }

        // Update user
        const user = await User.findById(userId);
        user.accountType = accountType;
        user.fullName = accountType === 'individual' ? fullName.trim() : null;
        user.companyName = accountType === 'company' ? companyName.trim() : null;
        user.onboardingStep = 2;
        await user.save();

        // Update onboarding record
        const onboarding = await Onboarding.findByUserId(userId);
        onboarding.completedSteps.accountType = true;
        onboarding.markStepComplete('accountType');
        await onboarding.save();

        logger.info(`Account type saved for user ${userId}: ${accountType}`);

        res.json({
            success: true,
            message: 'Account type saved successfully',
            nextStep: 2,
        });
    } catch (error) {
        logger.error('Save account type error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save account type',
        });
    }
};

/**
 * Save business information (Step 2 - Optional)
 */
const saveBusinessInfo = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { businessDescription, targetAudience, skip } = req.body;

        const user = await User.findById(userId);

        // If skipping, just update step
        if (skip) {
            user.onboardingStep = 3;
            await user.save();

            return res.json({
                success: true,
                message: 'Skipped business information',
                nextStep: 3,
            });
        }

        // Update onboarding record
        const onboarding = await Onboarding.findByUserId(userId);

        if (businessDescription) {
            onboarding.businessDescription = businessDescription.trim();
        }
        if (targetAudience) {
            onboarding.targetAudience = targetAudience.trim();
        }

        if (businessDescription || targetAudience) {
            onboarding.completedSteps.businessInfo = true;
        }

        onboarding.lastUpdated = new Date();
        await onboarding.save();

        // Update user step
        user.onboardingStep = 3;
        await user.save();

        logger.info(`Business info saved for user ${userId}`);

        res.json({
            success: true,
            message: 'Business information saved',
            nextStep: 3,
        });
    } catch (error) {
        logger.error('Save business info error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save business information',
        });
    }
};

/**
 * Save brand guidelines (Step 3 - Optional)
 */
const saveBrandGuidelines = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { preferredFonts, brandColors, skip } = req.body;

        const user = await User.findById(userId);

        // If skipping, just update step
        if (skip) {
            user.onboardingStep = 4;
            await user.save();

            return res.json({
                success: true,
                message: 'Skipped brand guidelines',
                nextStep: 4,
            });
        }

        // Update onboarding record
        const onboarding = await Onboarding.findByUserId(userId);

        // Process fonts (comma-separated string to array)
        if (preferredFonts) {
            onboarding.brandGuidelines.preferredFonts = preferredFonts
                .split(',')
                .map((font) => font.trim())
                .filter((font) => font.length > 0);
        }

        // Process colors (expecting array of color objects)
        if (brandColors && Array.isArray(brandColors)) {
            const validUsages = ['primary', 'secondary', 'accent', 'text', 'background', 'other'];
            onboarding.brandGuidelines.brandColors = brandColors.map((color) => ({
                name: color.name || '',
                hex: color.hex || '',
                usage: validUsages.includes(color.usage) ? color.usage : 'other',
            }));
        }

        if (preferredFonts || brandColors) {
            onboarding.brandGuidelines.hasGuidelines = true;
            onboarding.completedSteps.brandGuidelines = true;
        }

        onboarding.lastUpdated = new Date();
        await onboarding.save();

        // Update user step
        user.onboardingStep = 4;
        await user.save();

        logger.info(`Brand guidelines saved for user ${userId}`);

        res.json({
            success: true,
            message: 'Brand guidelines saved',
            nextStep: 4,
        });
    } catch (error) {
        logger.error('Save brand guidelines error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save brand guidelines',
        });
    }
};

/**
 * Save design platforms (Step 4 - Optional)
 */
const savePlatforms = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { platforms, otherDescription, skip } = req.body;

        const user = await User.findById(userId);

        // If skipping, just update step
        if (skip) {
            user.onboardingStep = 5;
            await user.save();

            return res.json({
                success: true,
                message: 'Skipped platform selection',
                nextStep: 5,
            });
        }

        // Update onboarding record
        const onboarding = await Onboarding.findByUserId(userId);

        // Reset all platforms to false first
        const platformKeys = [
            'linkedin',
            'instagram',
            'facebook',
            'twitter',
            'tiktok',
            'youtube',
            'website',
            'emailMarketing',
            'printMaterials',
            'presentations',
            'packaging',
            'merchandise',
            'digitalAds',
        ];

        platformKeys.forEach((key) => {
            onboarding.designPlatforms[key] = false;
        });

        // Set selected platforms to true
        if (platforms && Array.isArray(platforms)) {
            platforms.forEach((platform) => {
                if (platformKeys.includes(platform)) {
                    onboarding.designPlatforms[platform] = true;
                }
            });

            // Handle "other" option
            if (platforms.includes('other')) {
                onboarding.designPlatforms.other = {
                    selected: true,
                    description: otherDescription || '',
                };
            }
        }

        if (platforms && platforms.length > 0) {
            onboarding.completedSteps.designPlatforms = true;
        }

        onboarding.lastUpdated = new Date();
        await onboarding.save();

        // Update user step
        user.onboardingStep = 5;
        await user.save();

        logger.info(`Design platforms saved for user ${userId}`);

        res.json({
            success: true,
            message: 'Platform preferences saved',
            nextStep: 5,
        });
    } catch (error) {
        logger.error('Save platforms error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save platform preferences',
        });
    }
};

/**
 * Save online presence (Step 5 - Optional)
 */
const saveOnlinePresence = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { website, socialMedia, skip } = req.body;

        const user = await User.findById(userId);

        // If skipping or no data, complete onboarding
        if (skip) {
            return completeOnboarding(req, res);
        }

        // Update onboarding record
        const onboarding = await Onboarding.findByUserId(userId);

        // Save website
        if (website) {
            onboarding.onlinePresence.website = website.trim();
        }

        // Save social media links
        if (socialMedia && typeof socialMedia === 'object') {
            Object.keys(socialMedia).forEach((platform) => {
                if (onboarding.onlinePresence.socialMedia[platform] !== undefined) {
                    onboarding.onlinePresence.socialMedia[platform] = socialMedia[platform].trim();
                }
            });
        }

        if (website || (socialMedia && Object.keys(socialMedia).length > 0)) {
            onboarding.completedSteps.onlinePresence = true;
        }

        onboarding.lastUpdated = new Date();
        await onboarding.save();

        logger.info(`Online presence saved for user ${userId}`);

        // Complete onboarding after last step
        return completeOnboarding(req, res);
    } catch (error) {
        logger.error('Save online presence error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save online presence',
        });
    }
};

/**
 * Complete onboarding process
 */
const completeOnboarding = async (req, res) => {
    try {
        const userId = req.session.userId;

        // Update user
        const user = await User.findById(userId);
        user.onboardingCompleted = true;
        user.onboardingStep = null;
        await user.save();

        // Update onboarding record
        const onboarding = await Onboarding.findByUserId(userId);
        onboarding.completedAt = new Date();
        await onboarding.save();

        // Update session
        req.session.onboardingCompleted = true;

        // Create notification
        await notifications.create(
            userId,
            'onboarding_complete',
            'Welcome to CanvasCue!',
            'Your profile setup is complete. You can now subscribe to a plan and start creating design requests.',
            {
                relatedModel: 'User',
                relatedId: userId,
            }
        );

        logger.info(`Onboarding completed for user ${userId}`);

        res.json({
            success: true,
            message: 'Onboarding completed successfully!',
            redirectUrl: '/dashboard',
        });
    } catch (error) {
        logger.error('Complete onboarding error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete onboarding',
        });
    }
};

/**
 * Get onboarding status (API)
 */
const getStatus = async (req, res) => {
    try {
        const userId = req.session.userId;

        const user = await User.findById(userId);
        const onboarding = await Onboarding.findByUserId(userId);

        res.json({
            success: true,
            data: {
                completed: user.onboardingCompleted,
                currentStep: user.onboardingStep,
                completedSteps: onboarding?.completedSteps || {},
                completionPercentage: onboarding?.completionPercentage || 0,
            },
        });
    } catch (error) {
        logger.error('Get onboarding status error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get onboarding status',
        });
    }
};

/**
 * Upload file (brand guidelines, logo, etc.)
 */
const uploadFile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { type } = req.body; // 'guidelines', 'logo', etc.
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'No file provided',
            });
        }

        // Upload to storage
        const result = await storage.uploadFile(file, `onboarding/${userId}`);

        // Update onboarding record based on file type
        const onboarding = await Onboarding.findByUserId(userId);

        if (type === 'logo') {
            onboarding.brandGuidelines.logo = {
                fileName: result.fileName,
                fileUrl: await storage.getSignedUrl(result.fileName),
                uploadedAt: new Date(),
            };
        } else if (type === 'guidelines') {
            onboarding.brandGuidelines.guidelineFiles.push({
                fileName: result.fileName,
                fileUrl: await storage.getSignedUrl(result.fileName),
                fileType: file.originalname.split('.').pop().toLowerCase(),
                fileSize: result.size,
                uploadedAt: new Date(),
            });
        }

        onboarding.brandGuidelines.hasGuidelines = true;
        await onboarding.save();

        logger.info(`File uploaded for user ${userId}: ${type}`);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: {
                fileName: result.fileName,
                fileUrl: await storage.getSignedUrl(result.fileName),
            },
        });
    } catch (error) {
        logger.error('Upload file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload file',
        });
    }
};

module.exports = {
    showOnboarding,
    saveAccountType,
    saveBusinessInfo,
    saveBrandGuidelines,
    savePlatforms,
    saveOnlinePresence,
    completeOnboarding,
    getStatus,
    uploadFile,
};
