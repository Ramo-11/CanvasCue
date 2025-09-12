// Form Utilities - Standalone module
class FormManager {
    static init() {
        // Any initialization if needed
    }

    static formatters = {
        card: (input) => {
            let value = input.value.replace(/\D/g, "");
            input.value = value.match(/.{1,4}/g)?.join(" ") || value;
        },

        expiry: (input) => {
            let value = input.value.replace(/\D/g, "");
            if (value.length >= 2) {
                value = value.slice(0, 2) + "/" + value.slice(2, 4);
            }
            input.value = value;
        },

        currency: (input) => {
            let value = parseFloat(input.value.replace(/[^0-9.-]/g, ""));
            if (!isNaN(value)) {
                input.value = value.toFixed(2);
            }
        },

        phone: (input) => {
            let value = input.value.replace(/\D/g, "");
            if (value.length > 0) {
                if (value.length <= 3) {
                    value = `(${value}`;
                } else if (value.length <= 6) {
                    value = `(${value.slice(0, 3)}) ${value.slice(3)}`;
                } else {
                    value = `(${value.slice(0, 3)}) ${value.slice(
                        3,
                        6
                    )}-${value.slice(6, 10)}`;
                }
            }
            input.value = value;
        },
    };

    static validators = {
        email: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
        phone: (phone) => phone.replace(/\D/g, "").length === 10,
        required: (value) => value && value.trim() !== "",
        minLength: (value, min) => value && value.length >= min,
        maxLength: (value, max) => value && value.length <= max,
    };

    static serialize(form) {
        const formData = new FormData(form);
        const data = {};
        for (let [key, value] of formData.entries()) {
            data[key] = value;
        }
        return data;
    }

    static validate(form) {
        let isValid = true;

        form.querySelectorAll("[required]").forEach((field) => {
            if (!this.validators.required(field.value)) {
                field.classList.add("error");
                isValid = false;
            } else {
                field.classList.remove("error");
            }
        });

        return isValid;
    }
}

// Add to global namespace
if (window.App) window.App.Form = FormManager;
window.FormManager = FormManager;
