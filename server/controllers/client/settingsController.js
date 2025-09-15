const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../../models/User');
const Onboarding = require('../../../models/Onboarding');
const { createAppLogger, createStorageService, createNotificationService } = require('@sahab/core');

const logger = createAppLogger();
const storage = createStorageService();
const notifications = createNotificationService(mongoose, {
    types: ['profile_updated', 'password_changed', 'brand_updated'],
    relatedModels: ['User', 'Onboarding'],
});

/**
 * Show settings page
 */
const showSettings = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { tab = 'profile' } = req.query;

        const user = await User.findById(userId);
        const onboarding = await Onboarding.findByUserId(userId);

        // Get flash messages from session
        const flashMessage = req.session.flashMessage;
        delete req.session.flashMessage;

        res.render('client/settings/index', {
            title: 'Settings - CanvasCue',
            layout: 'layout',
            additionalCSS: ['dashboard-shared.css', 'settings.css'],
            additionalJS: ['settings.js'],
            user: user.toJSON(),
            onboarding: onboarding ? onboarding.toJSON() : null,
            activeTab: tab,
            flashMessage,
        });
    } catch (error) {
        logger.error('Show settings error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Failed to load settings',
            layout: 'layout',
        });
    }
};

/**
 * Update profile information
 */
const updateProfile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { fullName, companyName, email, accountType } = req.body;

        const user = await User.findById(userId);

        // Check if email is being changed
        if (email && email !== user.email) {
            // Check if email already exists
            const existingUser = await User.findByEmail(email);
            if (existingUser && existingUser._id.toString() !== userId) {
                return res.status(400).json({
                    success: false,
                    message: 'Email already in use',
                });
            }

            user.email = email.toLowerCase().trim();
            user.isEmailVerified = false;

            // Generate verification token
            const verificationToken = user.generateEmailVerificationToken();
            await user.save();

            // Send verification email (implement email service)
            // await emailService.sendVerificationEmail(user.email, verificationToken);
        }

        // Update profile fields
        if (accountType === 'individual') {
            user.fullName = fullName?.trim() || user.fullName;
            user.companyName = null;
        } else if (accountType === 'company') {
            user.companyName = companyName?.trim() || user.companyName;
            user.fullName = null;
        }

        user.accountType = accountType || user.accountType;
        await user.save();

        // Update session
        req.session.userEmail = user.email;

        // Create notification
        await notifications.create(
            userId,
            'profile_updated',
            'Profile Updated',
            'Your profile information has been updated successfully',
            {
                relatedModel: 'User',
                relatedId: userId,
            }
        );

        logger.info(`Profile updated for user ${userId}`);

        res.json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                email: user.email,
                displayName: user.displayName,
            },
        });
    } catch (error) {
        logger.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update profile',
        });
    }
};

/**
 * Update password
 */
const updatePassword = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { currentPassword, newPassword, confirmPassword } = req.body;

        // Validate input
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'All password fields are required',
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'New passwords do not match',
            });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters',
            });
        }

        const user = await User.findById(userId);

        // Verify current password
        const isValidPassword = await user.comparePassword(currentPassword);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect',
            });
        }

        // Update password
        user.password = newPassword;
        await user.save();

        // Create notification
        await notifications.create(
            userId,
            'password_changed',
            'Password Changed',
            'Your password has been changed successfully. If you did not make this change, please contact support immediately.',
            {
                relatedModel: 'User',
                relatedId: userId,
                priority: 'high',
            }
        );

        logger.info(`Password updated for user ${userId}`);

        res.json({
            success: true,
            message: 'Password updated successfully',
        });
    } catch (error) {
        logger.error('Update password error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update password',
        });
    }
};

/**
 * Update brand guidelines
 */
const updateBrand = async (req, res) => {
    try {
        const userId = req.session.userId;
        const {
            businessDescription,
            targetAudience,
            preferredFonts,
            brandColors,
            designPlatforms,
            website,
            socialMedia,
        } = req.body;

        // Get or create onboarding record
        let onboarding = await Onboarding.findByUserId(userId);
        if (!onboarding) {
            onboarding = new Onboarding({ user: userId });
        }

        // Update business info
        if (businessDescription !== undefined) {
            onboarding.businessDescription = businessDescription.trim();
        }
        if (targetAudience !== undefined) {
            onboarding.targetAudience = targetAudience.trim();
        }

        // Update brand guidelines
        if (preferredFonts) {
            onboarding.brandGuidelines.preferredFonts = Array.isArray(preferredFonts)
                ? preferredFonts
                : preferredFonts.split(',').map((f) => f.trim());
        }

        if (brandColors && Array.isArray(brandColors)) {
            onboarding.brandGuidelines.brandColors = brandColors.filter(
                (color) => color.hex && /^#[0-9A-F]{6}$/i.test(color.hex)
            );
        }

        // Update design platforms
        if (designPlatforms) {
            const platformKeys = Object.keys(onboarding.designPlatforms.toObject());
            platformKeys.forEach((key) => {
                if (key !== 'other') {
                    onboarding.designPlatforms[key] = designPlatforms.includes(key);
                }
            });

            if (designPlatforms.includes('other')) {
                onboarding.designPlatforms.other = {
                    selected: true,
                    description: req.body.otherPlatformDescription || '',
                };
            }
        }

        // Update online presence
        if (website !== undefined) {
            onboarding.onlinePresence.website = website.trim();
        }

        if (socialMedia && typeof socialMedia === 'object') {
            Object.keys(socialMedia).forEach((platform) => {
                if (onboarding.onlinePresence.socialMedia[platform] !== undefined) {
                    onboarding.onlinePresence.socialMedia[platform] = socialMedia[platform].trim();
                }
            });
        }

        onboarding.lastUpdated = new Date();
        await onboarding.save();

        // Create notification
        await notifications.create(
            userId,
            'brand_updated',
            'Brand Guidelines Updated',
            'Your brand guidelines have been updated successfully',
            {
                relatedModel: 'Onboarding',
                relatedId: onboarding._id,
            }
        );

        logger.info(`Brand guidelines updated for user ${userId}`);

        res.json({
            success: true,
            message: 'Brand guidelines updated successfully',
        });
    } catch (error) {
        logger.error('Update brand error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update brand guidelines',
        });
    }
};

/**
 * Upload brand file
 */
const uploadBrandFile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { type } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                success: false,
                message: 'No file provided',
            });
        }

        // Validate file type
        const allowedTypes = {
            logo: ['image/jpeg', 'image/png', 'image/svg+xml'],
            guidelines: ['application/pdf', 'application/zip', 'image/jpeg', 'image/png'],
        };

        if (!allowedTypes[type]?.includes(file.mimetype)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid file type',
            });
        }

        // Upload to storage
        const result = await storage.uploadFile(file, `brands/${userId}`);

        // Update onboarding record
        const onboarding = await Onboarding.findByUserId(userId);
        if (!onboarding) {
            return res.status(404).json({
                success: false,
                message: 'Onboarding record not found',
            });
        }

        const fileData = {
            fileName: file.originalname,
            fileUrl: await storage.getSignedUrl(result.fileName),
            fileType: file.mimetype.split('/')[1],
            fileSize: file.size,
            uploadedAt: new Date(),
        };

        if (type === 'logo') {
            onboarding.brandGuidelines.logo = fileData;
        } else if (type === 'guidelines') {
            onboarding.brandGuidelines.guidelineFiles.push(fileData);
        }

        onboarding.brandGuidelines.hasGuidelines = true;
        await onboarding.save();

        logger.info(`Brand file uploaded for user ${userId}: ${type}`);

        res.json({
            success: true,
            message: 'File uploaded successfully',
            data: fileData,
        });
    } catch (error) {
        logger.error('Upload brand file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload file',
        });
    }
};

/**
 * Delete brand file
 */
const deleteBrandFile = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { fileId, type } = req.params;

        const onboarding = await Onboarding.findByUserId(userId);
        if (!onboarding) {
            return res.status(404).json({
                success: false,
                message: 'Onboarding record not found',
            });
        }

        if (type === 'logo') {
            onboarding.brandGuidelines.logo = null;
        } else if (type === 'guidelines') {
            onboarding.brandGuidelines.guidelineFiles =
                onboarding.brandGuidelines.guidelineFiles.filter(
                    (file) => file._id.toString() !== fileId
                );
        }

        await onboarding.save();

        logger.info(`Brand file deleted for user ${userId}: ${type}`);

        res.json({
            success: true,
            message: 'File deleted successfully',
        });
    } catch (error) {
        logger.error('Delete brand file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file',
        });
    }
};

/**
 * Export user data
 */
const exportData = async (req, res) => {
    try {
        const userId = req.session.userId;

        // Gather all user data
        const user = await User.findById(userId).select('-password');
        const onboarding = await Onboarding.findByUserId(userId);
        const Subscription = require('../../../models/Subscription');
        const subscriptions = await Subscription.find({ user: userId });
        const DesignRequest = require('../../../models/DesignRequest');
        const requests = await DesignRequest.find({ client: userId });

        const exportData = {
            user: user.toJSON(),
            onboarding: onboarding ? onboarding.toJSON() : null,
            subscriptions: subscriptions.map((s) => s.toJSON()),
            requests: requests.map((r) => r.toJSON()),
            exportDate: new Date(),
        };

        logger.info(`Data exported for user ${userId}`);

        res.json({
            success: true,
            data: exportData,
        });
    } catch (error) {
        logger.error('Export data error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export data',
        });
    }
};

/**
 * Delete account
 */
const deleteAccount = async (req, res) => {
    try {
        const userId = req.session.userId;
        const { password, confirmation } = req.body;

        if (confirmation !== 'DELETE') {
            return res.status(400).json({
                success: false,
                message: 'Please type DELETE to confirm',
            });
        }

        const user = await User.findById(userId);

        // Verify password
        const isValidPassword = await user.comparePassword(password);
        if (!isValidPassword) {
            return res.status(401).json({
                success: false,
                message: 'Incorrect password',
            });
        }

        // Cancel active subscription
        const Subscription = require('../../../models/Subscription');
        const activeSubscription = await Subscription.findActiveByUser(userId);
        if (activeSubscription) {
            await activeSubscription.cancel('Account deleted');
        }

        // Soft delete user (keep for records)
        user.isActive = false;
        user.email = `deleted_${Date.now()}_${user.email}`;
        await user.save();

        // Log out
        req.session.destroy();

        logger.info(`Account deleted for user ${userId}`);

        res.json({
            success: true,
            message: 'Account deleted successfully',
        });
    } catch (error) {
        logger.error('Delete account error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete account',
        });
    }
};

module.exports = {
    showSettings,
    updateProfile,
    updatePassword,
    updateBrand,
    uploadBrandFile,
    deleteBrandFile,
    exportData,
    deleteAccount,
};
