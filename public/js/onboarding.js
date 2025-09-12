// Onboarding JavaScript
const totalSteps = 5;

let currentStep = parseInt(document.getElementById('onboardingRoot')?.dataset.currentStep || '1');

document.addEventListener('DOMContentLoaded', function () {
    goToStep(currentStep);
    setupAccountTypeSelector();
    setupColorInputs();
    setupFileUpload();
});

document.addEventListener('DOMContentLoaded', function () {
    // Initialize current step
    goToStep(currentStep);

    // Setup account type selector
    setupAccountTypeSelector();

    // Setup color inputs
    setupColorInputs();

    // Setup file upload
    setupFileUpload();
});

/**
 * Navigate to specific step
 */
function goToStep(step) {
    // Hide all steps
    document.querySelectorAll('.onboarding-step').forEach((s) => {
        s.style.display = 'none';
    });

    // Show current step
    const stepElement = document.getElementById(`step${step}`);
    if (stepElement) {
        stepElement.style.display = 'block';
    }

    // Update progress
    updateProgress(step);
    currentStep = step;
}

/**
 * Update progress bar and steps
 */
function updateProgress(step) {
    const progress = (step / totalSteps) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;

    // Update step indicators
    document.querySelectorAll('.step').forEach((s, index) => {
        s.classList.remove('active', 'completed');
        if (index + 1 < step) {
            s.classList.add('completed');
        } else if (index + 1 === step) {
            s.classList.add('active');
        }
    });
}

/**
 * Setup account type selector
 */
function setupAccountTypeSelector() {
    const individualRadio = document.getElementById('individualType');
    const companyRadio = document.getElementById('companyType');
    const nameInput = document.getElementById('nameInput');
    const nameLabel = document.getElementById('nameLabel');
    const nameField = document.getElementById('nameField');

    function toggleNameInput() {
        if (individualRadio.checked) {
            nameInput.style.display = 'block';
            nameLabel.textContent = 'Full Name';
            nameField.placeholder = 'Enter your full name';
        } else if (companyRadio.checked) {
            nameInput.style.display = 'block';
            nameLabel.textContent = 'Company Name';
            nameField.placeholder = 'Enter your company name';
        } else {
            nameInput.style.display = 'none';
        }
    }

    individualRadio?.addEventListener('change', toggleNameInput);
    companyRadio?.addEventListener('change', toggleNameInput);
}

/**
 * Setup color inputs
 */
function setupColorInputs() {
    document.querySelectorAll('.color-input-group').forEach((group) => {
        const hexInput = group.querySelector('.color-hex');
        const colorPicker = group.querySelector('.color-picker');

        if (hexInput && colorPicker) {
            colorPicker.addEventListener('change', function () {
                hexInput.value = this.value;
            });

            hexInput.addEventListener('change', function () {
                if (/^#[0-9A-F]{6}$/i.test(this.value)) {
                    colorPicker.value = this.value;
                }
            });
        }
    });
}

/**
 * Add color input
 */
function addColorInput() {
    const container = document.getElementById('colorInputs');
    const newGroup = document.createElement('div');
    newGroup.className = 'color-input-group';
    newGroup.innerHTML = `
        <input type="text" class="form-input color-hex" placeholder="#000000">
        <input type="color" class="color-picker">
        <button class="btn-icon" onclick="removeColor(this)">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(newGroup);
    setupColorInputs();
}

/**
 * Remove color input
 */
function removeColor(button) {
    button.closest('.color-input-group').remove();
}

/**
 * Setup file upload
 */
function setupFileUpload() {
    const fileInput = document.getElementById('brandFile');
    const uploadArea = document.getElementById('logoUpload');

    fileInput?.addEventListener('change', async function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('type', 'guidelines');

        try {
            uploadArea.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';

            const response = await fetch('/onboarding/upload', {
                method: 'POST',
                body: formData,
            });

            const result = await response.json();

            if (result.success) {
                uploadArea.innerHTML = `
                    <i class="fas fa-check-circle" style="color: var(--success-color)"></i>
                    <p>${file.name}</p>
                    <span>Upload successful</span>
                `;
            } else {
                throw new Error(result.message);
            }
        } catch (error) {
            console.error('Upload error:', error);
            uploadArea.innerHTML = `
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Upload failed. Try again.</p>
                <span>PDF, ZIP, or image files</span>
            `;
        }
    });
}

/**
 * Skip step
 */
function skipStep(step) {
    goToStep(step + 1);
}

/**
 * Save Step 1 - Account Type
 */
async function saveStep1() {
    const accountType = document.querySelector('input[name="accountType"]:checked')?.value;
    const nameField = document.getElementById('nameField');

    if (!accountType) {
        showErrorModal('Please select account type');
        return;
    }

    const name = nameField.value.trim();
    if (!name) {
        showErrorModal('Please enter your name');
        return;
    }

    const data = {
        accountType,
        [accountType === 'individual' ? 'fullName' : 'companyName']: name,
    };

    try {
        const response = await fetch('/onboarding/account-type', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
            goToStep(2);
        } else {
            showErrorModal(result.message);
        }
    } catch (error) {
        showErrorModal('Failed to save. Please try again.');
    }
}

/**
 * Save Step 2 - Business Info
 */
async function saveStep2() {
    const data = {
        businessDescription: document.getElementById('businessDescription').value.trim(),
        targetAudience: document.getElementById('targetAudience').value.trim(),
    };

    try {
        const response = await fetch('/onboarding/business-info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
            goToStep(3);
        } else {
            showErrorModal(result.message);
        }
    } catch (error) {
        showErrorModal('Failed to save. Please try again.');
    }
}

/**
 * Save Step 3 - Brand Guidelines
 */
async function saveStep3() {
    const fonts = document.getElementById('preferredFonts').value.trim();
    const colors = [];

    document.querySelectorAll('.color-input-group').forEach((group) => {
        const hex = group.querySelector('.color-hex').value;
        if (hex) {
            colors.push({ hex, usage: 'brand' });
        }
    });

    const data = {
        preferredFonts: fonts,
        brandColors: colors,
    };

    try {
        const response = await fetch('/onboarding/brand-guidelines', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
            goToStep(4);
        } else {
            showErrorModal(result.message);
        }
    } catch (error) {
        showErrorModal('Failed to save. Please try again.');
    }
}

/**
 * Save Step 4 - Platforms
 */
async function saveStep4() {
    const platforms = [];
    document.querySelectorAll('input[name="platform"]:checked').forEach((input) => {
        platforms.push(input.value);
    });

    try {
        const response = await fetch('/onboarding/platforms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platforms }),
        });

        const result = await response.json();
        if (result.success) {
            goToStep(5);
        } else {
            showErrorModal(result.message);
        }
    } catch (error) {
        showErrorModal('Failed to save. Please try again.');
    }
}

/**
 * Save Step 5 - Online Presence
 */
async function saveStep5() {
    const website = document.getElementById('website').value.trim();
    const socialMedia = {};

    document.querySelectorAll('input[name="social"]').forEach((input) => {
        const platform = input.dataset.platform;
        const value = input.value.trim();
        if (value) {
            socialMedia[platform] = value;
        }
    });

    const data = { website, socialMedia };

    try {
        const response = await fetch('/onboarding/online-presence', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        const result = await response.json();
        if (result.success) {
            showSuccessModal('Setup complete! Welcome to CanvasCue.', () => {
                window.location.href = result.redirectUrl || '/dashboard';
            });
        } else {
            showErrorModal(result.message);
        }
    } catch (error) {
        showErrorModal('Failed to save. Please try again.');
    }
}

/**
 * Modal helpers
 */
function showSuccessModal(message, callback) {
    if (window.Modal) {
        window.Modal.success(message);
        if (callback) setTimeout(callback, 2000);
    } else if (callback) {
        callback();
    }
}

function showErrorModal(message) {
    if (window.Modal) {
        window.Modal.error(message);
    } else {
        alert(message);
    }
}
