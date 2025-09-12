const User = require('../../models/User');
const Onboarding = require('../../models/Onboarding');

const {
    logger,
    emailService,
    storage,
    stripeService,
    validation,
    notifications,
} = require('../utils/services');

/**
 * Show login page
 */
const showLogin = async (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }

    res.render('auth/login', {
        title: 'Login - CanvasCue',
        layout: 'layout',
        showNav: false,
        showFooter: false,
        additionalCSS: ['auth.css'],
        additionalJS: ['auth.js'],
        error: null,
        success: null,
    });
};

/**
 * Show signup page
 */
const showSignup = async (req, res) => {
    // If already logged in, redirect to dashboard
    if (req.session && req.session.userId) {
        return res.redirect('/dashboard');
    }

    res.render('auth/signup', {
        title: 'Sign Up - CanvasCue',
        layout: 'layout',
        showNav: false,
        showFooter: false,
        additionalCSS: ['auth.css'],
        additionalJS: ['auth.js'],
        error: null,
    });
};

/**
 * Process login
 */
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Please provide email and password',
            });
        }

        // Validate email format
        if (!validation.validators.email(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address',
            });
        }

        // Find user by email
        const user = await User.findByEmail(email);

        if (!user) {
            logger.warn(`Login attempt failed - user not found: ${email}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
            });
        }

        // Check if account is active
        if (!user.isActive) {
            logger.warn(`Login attempt on inactive account: ${email}`);
            return res.status(403).json({
                success: false,
                message: 'Your account has been deactivated. Please contact support.',
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);

        if (!isPasswordValid) {
            logger.warn(`Login failed - invalid password for: ${email}`);
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password',
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Create session
        req.session.userId = user._id.toString();
        req.session.userEmail = user.email;
        req.session.onboardingCompleted = user.onboardingCompleted;

        logger.info(`User logged in successfully: ${user.email}`);

        // Determine redirect based on onboarding status
        const redirectUrl = user.onboardingCompleted ? '/dashboard' : '/onboarding';

        res.json({
            success: true,
            message: 'Login successful',
            redirectUrl,
            user: {
                id: user._id,
                email: user.email,
                displayName: user.displayName,
                onboardingCompleted: user.onboardingCompleted,
            },
        });
    } catch (error) {
        logger.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred during login. Please try again.',
        });
    }
};

/**
 * Process signup
 */
const signup = async (req, res) => {
    try {
        const { email, password, confirmPassword } = req.body;

        // Validate input
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required',
            });
        }

        // Validate email format
        if (!validation.validators.email(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address',
            });
        }

        // Check password match
        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match',
            });
        }

        // Validate password strength
        if (!validation.validators.strongPassword(password)) {
            return res.status(400).json({
                success: false,
                message:
                    'Password must be at least 8 characters with uppercase, lowercase, and numbers',
            });
        }

        // Check if user already exists
        const existingUser = await User.findByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'An account with this email already exists',
            });
        }

        // Create new user
        const user = new User({
            email: email.toLowerCase().trim(),
            password,
            isActive: true,
            onboardingCompleted: false,
            onboardingStep: 1,
            role: 'client',
        });

        await user.save();

        // Create empty onboarding record
        await Onboarding.create({
            user: user._id,
        });

        // Send welcome email
        try {
            await emailService.send(
                user.email,
                'Welcome to CanvasCue!',
                `
                <h2>Welcome to CanvasCue!</h2>
                <p>Thank you for signing up. Your account has been created successfully.</p>
                <p>Next, we'll guide you through a quick onboarding process to set up your profile and preferences.</p>
                <p>If you have any questions, feel free to reach out to our support team.</p>
                <br>
                <p>Best regards,<br>The CanvasCue Team</p>
                `
            );
        } catch (emailError) {
            logger.error('Failed to send welcome email:', emailError);
            // Don't fail signup if email fails
        }

        // Auto-login after signup
        req.session.userId = user._id.toString();
        req.session.userEmail = user.email;
        req.session.onboardingCompleted = false;

        logger.info(`New user registered: ${user.email}`);

        res.json({
            success: true,
            message: 'Account created successfully',
            redirectUrl: '/onboarding',
        });
    } catch (error) {
        logger.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred during signup. Please try again.',
        });
    }
};

/**
 * Logout
 */
const logout = async (req, res) => {
    const userEmail = req.session?.userEmail;

    req.session.destroy((err) => {
        if (err) {
            logger.error('Logout error:', err);
        } else if (userEmail) {
            logger.info(`User logged out: ${userEmail}`);
        }

        res.clearCookie('app.sid');
        res.redirect('/');
    });
};

/**
 * Show forgot password page
 */
const showForgotPassword = (req, res) => {
    res.render('auth/forgot-password', {
        title: 'Forgot Password - CanvasCue',
        layout: 'layout',
        showNav: false,
        showFooter: false,
        additionalCSS: ['auth.css'],
        additionalJS: ['auth.js'],
    });
};

/**
 * Process forgot password request
 */
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;

        if (!email || !validation.validators.email(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address',
            });
        }

        const user = await User.findByEmail(email);

        // Always return success to prevent email enumeration
        if (!user) {
            logger.warn(`Password reset requested for non-existent email: ${email}`);
            return res.json({
                success: true,
                message:
                    'If an account exists with this email, you will receive password reset instructions.',
            });
        }

        // Generate reset token
        const resetToken = user.generatePasswordResetToken();
        await user.save();

        // Send reset email
        const resetUrl = `${process.env.PORTAL_URL}/reset-password/${resetToken}`;

        try {
            await emailService.send(
                user.email,
                'Password Reset Request - CanvasCue',
                `
                <h2>Password Reset Request</h2>
                <p>You requested to reset your password. Click the link below to create a new password:</p>
                <p><a href="${resetUrl}" style="display: inline-block; padding: 10px 20px; background: #3b82f6; color: white; text-decoration: none; border-radius: 5px;">Reset Password</a></p>
                <p>This link will expire in 1 hour.</p>
                <p>If you didn't request this, please ignore this email.</p>
                <br>
                <p>Best regards,<br>The CanvasCue Team</p>
                `
            );
        } catch (emailError) {
            logger.error('Failed to send password reset email:', emailError);
            return res.status(500).json({
                success: false,
                message: 'Failed to send reset email. Please try again.',
            });
        }

        logger.info(`Password reset email sent to: ${user.email}`);

        res.json({
            success: true,
            message:
                'If an account exists with this email, you will receive password reset instructions.',
        });
    } catch (error) {
        logger.error('Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again.',
        });
    }
};

/**
 * Show reset password page
 */
const showResetPassword = async (req, res) => {
    const { token } = req.params;

    res.render('auth/reset-password', {
        title: 'Reset Password - CanvasCue',
        layout: 'layout',
        showNav: false,
        showFooter: false,
        additionalCSS: ['auth.css'],
        additionalJS: ['auth.js'],
        token,
    });
};

/**
 * Process password reset
 */
const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password, confirmPassword } = req.body;

        // Validate passwords
        if (!password || password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Passwords do not match',
            });
        }

        if (!validation.validators.strongPassword(password)) {
            return res.status(400).json({
                success: false,
                message:
                    'Password must be at least 8 characters with uppercase, lowercase, and numbers',
            });
        }

        // Find user with valid token
        const hashedToken = require('crypto').createHash('sha256').update(token).digest('hex');

        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired reset token',
            });
        }

        // Update password
        user.password = password;
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        logger.info(`Password reset successful for: ${user.email}`);

        res.json({
            success: true,
            message: 'Password reset successful. You can now login with your new password.',
            redirectUrl: '/login',
        });
    } catch (error) {
        logger.error('Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'An error occurred. Please try again.',
        });
    }
};

module.exports = {
    showLogin,
    showSignup,
    login,
    signup,
    logout,
    showForgotPassword,
    forgotPassword,
    showResetPassword,
    resetPassword,
};
