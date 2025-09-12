// Modal Helper Functions
class ModalManager {
    static show(modalId, options = {}) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        // Update content if provided
        if (options.title) {
            const titleEl = modal.querySelector(".modal-title, h3");
            if (titleEl) titleEl.textContent = options.title;
        }

        if (options.message) {
            const messageEl = modal.querySelector(".modal-message");
            if (messageEl) messageEl.textContent = options.message;
        }

        if (options.onConfirm) {
            const confirmBtn = modal.querySelector(
                "#confirmModalBtn, #deleteConfirmBtn"
            );
            if (confirmBtn) {
                confirmBtn.onclick = () => {
                    options.onConfirm();
                    this.close(modalId);
                };
            }
        }

        modal.classList.add("active");
        document.body.style.overflow = "hidden";
    }

    static close(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;

        modal.classList.remove("active");
        document.body.style.overflow = "";

        // Reset form if present
        const form = modal.querySelector("form");
        if (form) form.reset();
    }

    static success(message, duration = 3000) {
        this.show("successModal", { message });
        if (duration) {
            setTimeout(() => this.close("successModal"), duration);
        }
    }

    static error(message) {
        this.show("errorModal", { message });
    }

    static warning(message) {
        this.show("warningModal", { message });
    }

    static confirm(message, onConfirm) {
        this.show("confirmModal", { message, onConfirm });
    }

    static deleteConfirm(message, onConfirm) {
        this.show("deleteModal", { message });

        const deleteBtn = document.getElementById("deleteConfirmBtn");
        const deleteInput = document.getElementById("deleteConfirmInput");

        if (deleteBtn && deleteInput) {
            deleteBtn.onclick = () => {
                if (deleteInput.value === "DELETE") {
                    onConfirm();
                    this.close("deleteModal");
                } else {
                    alert("Please type DELETE to confirm");
                }
            };
        }
    }
}

// Global functions for inline onclick
window.openModal = (modalId) => ModalManager.show(modalId);
window.closeModal = (modalId) => ModalManager.close(modalId);
window.Modal = ModalManager;
