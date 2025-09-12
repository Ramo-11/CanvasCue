// Auth Page JavaScript

document.addEventListener('DOMContentLoaded', function () {
    // Password visibility toggle
    setupPasswordToggle();

    // Form submission
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');

    if (loginForm) {
        setupLoginForm();
    }

    if (signupForm) {
        setupSignupForm();
        setupPasswordValidation();
    }
});

/**
 * Setup password visibility toggle
 */
function setupPasswordToggle() {
    const toggleButtons = document.querySelectorAll('.password-toggle');

    toggleButtons.forEach((button) => {
        button.addEventListener('click', function () {
            const input = this.previousElementSibling;
            const icon = this.querySelector('i');

            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });
}

/**
 * Setup login form
 */
function setupLoginForm() {
    const form = document.getElementById('loginForm');

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        // Clear previous errors
        clearErrors();

        // Get form data
        const formData = {
            email: form.email.value.trim(),
            password: form.password.value,
        };

        // Basic validation
        if (!validateEmail(formData.email)) {
            Modal.error('Invalid email address');
            // showError('emailError', 'Please enter a valid email address');
            return;
        }

        if (formData.password.length < 6) {
            Modal.error('Password is required');
            // showError('passwordError', 'Password is required');
            return;
        }

        // Submit form
        await submitLogin(formData);
    });
}

/**
 * Setup signup form
 */
function setupSignupForm() {
    const form = document.getElementById('signupForm');

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        // Clear previous errors
        clearErrors();

        // Get form data
        const formData = {
            email: form.email.value.trim(),
            password: form.password.value,
            confirmPassword: form.confirmPassword.value,
        };

        // Validation
        let hasError = false;

        if (!validateEmail(formData.email)) {
            Modal.error('Invalid email address');
            showError('emailError', 'Please enter a valid email address');
            hasError = true;
        }

        if (!validatePassword(formData.password)) {
            Modal.error('Password does not meet requirements');
            showError('passwordError', 'Password does not meet requirements');
            hasError = true;
        }

        if (formData.password !== formData.confirmPassword) {
            Modal.error('Passwords do not match');
            showError('confirmPasswordError', 'Passwords do not match');
            hasError = true;
        }

        if (!form.terms.checked) {
            Modal.error('You must agree to the terms');
            showError('termsError', 'You must agree to the terms');
            hasError = true;
        }

        if (hasError) return;

        // Submit form
        await submitSignup(formData);
    });
}

/**
 * Setup real-time password validation
 */
function setupPasswordValidation() {
    const passwordInput = document.getElementById('password');
    const requirements = {
        length: document.getElementById('lengthReq'),
        upper: document.getElementById('upperReq'),
        lower: document.getElementById('lowerReq'),
        number: document.getElementById('numberReq'),
    };

    passwordInput.addEventListener('input', function () {
        const password = this.value;

        // Check length
        updateRequirement(requirements.length, password.length >= 8);

        // Check uppercase
        updateRequirement(requirements.upper, /[A-Z]/.test(password));

        // Check lowercase
        updateRequirement(requirements.lower, /[a-z]/.test(password));

        // Check number
        updateRequirement(requirements.number, /\d/.test(password));
    });
}

/**
 * Update requirement indicator
 */
function updateRequirement(element, isValid) {
    if (isValid) {
        element.classList.add('valid');
    } else {
        element.classList.remove('valid');
    }
}

/**
 * Submit login
 */
async function submitLogin(formData) {
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });

        const result = await response.json();

        if (result.success) {
            // Show success message
            Modal.success('Login successful!');

            // Redirect
            setTimeout(() => {
                window.location.href = result.redirectUrl || '/dashboard';
            }, 500);
        }
    } catch (error) {
        console.error('Login error:', error);
        Modal.error('An error occurred. Please try again.');
        showError('passwordError', 'An error occurred. Please try again.');
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

/**
 * Submit signup
 */
async function submitSignup(formData) {
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
        const response = await fetch('/signup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });

        const result = await response.json();

        if (result.success) {
            // Show success message
            Modal.success('Account created successfully!');

            // Redirect to onboarding
            setTimeout(() => {
                window.location.href = result.redirectUrl || '/onboarding';
            }, 500);
        } else {
            Modal.error(result.message || 'Failed to create account');
            showError('emailError', result.message || 'Failed to create account');
            submitBtn.classList.remove('loading');
            submitBtn.disabled = false;
        }
    } catch (error) {
        console.error('Signup error:', error);
        Modal.error('An error occurred. Please try again.');
        showError('emailError', 'An error occurred. Please try again.');
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
    }
}

/**
 * Validate email
 */
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate password
 */
function validatePassword(password) {
    return (
        password.length >= 8 &&
        /[A-Z]/.test(password) &&
        /[a-z]/.test(password) &&
        /\d/.test(password)
    );
}

/**
 * Show error message
 */
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    if (errorElement) {
        errorElement.textContent = message;

        // Add error class to input
        const input = errorElement.previousElementSibling;
        if (input && input.classList.contains('form-input')) {
            input.classList.add('error');
        }
    }
}

/**
 * Clear all errors
 */
function clearErrors() {
    const errorElements = document.querySelectorAll('.form-error');
    errorElements.forEach((element) => {
        element.textContent = '';
    });

    const inputs = document.querySelectorAll('.form-input');
    inputs.forEach((input) => {
        input.classList.remove('error');
    });
}
