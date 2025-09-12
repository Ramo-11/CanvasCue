// Comprehensive Notification Manager
class NotificationManager {
    constructor() {
        this.container = null;
        this.unreadCount = 0;
        this.notifications = [];
        this.init();
    }

    init() {
        // Create container if it doesn't exist
        if (!document.getElementById("notification-container")) {
            this.container = document.createElement("div");
            this.container.id = "notification-container";
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById("notification-container");
        }

        // Initialize dropdown if exists
        this.initDropdown();
    }

    // Toast Notifications
    show(message, type = "info", options = {}) {
        const defaults = {
            title: null,
            duration: 5000,
            persistent: false,
            progress: true,
            icon: this.getIcon(type),
        };

        const config = { ...defaults, ...options };

        const notification = document.createElement("div");
        notification.className = `notification-toast notification-${type}`;

        notification.innerHTML = `
            <div class="notification-toast-content">
                <div class="notification-toast-icon">
                    <i class="fas ${config.icon}"></i>
                </div>
                <div class="notification-toast-body">
                    ${
                        config.title
                            ? `<div class="notification-toast-title">${config.title}</div>`
                            : ""
                    }
                    <div class="notification-toast-message">${message}</div>
                </div>
                <button class="notification-toast-close">&times;</button>
            </div>
            ${
                config.progress && !config.persistent
                    ? '<div class="notification-progress"></div>'
                    : ""
            }
        `;

        this.container.appendChild(notification);

        // Animate in
        requestAnimationFrame(() => {
            notification.classList.add("show");
        });

        // Close button
        const closeBtn = notification.querySelector(
            ".notification-toast-close"
        );
        closeBtn.addEventListener("click", () => this.remove(notification));

        // Auto dismiss
        if (!config.persistent && config.duration) {
            if (config.progress) {
                const progressBar = notification.querySelector(
                    ".notification-progress"
                );
                if (progressBar) {
                    progressBar.style.width = "100%";
                    progressBar.style.transition = `width ${config.duration}ms linear`;
                    requestAnimationFrame(() => {
                        progressBar.style.width = "0%";
                    });
                }
            }

            setTimeout(() => this.remove(notification), config.duration);
        }

        return notification;
    }

    remove(notification) {
        notification.classList.remove("show");
        setTimeout(() => notification.remove(), 300);
    }

    success(message, options) {
        return this.show(message, "success", { title: "Success", ...options });
    }

    error(message, options) {
        return this.show(message, "error", {
            title: "Error",
            persistent: true,
            ...options,
        });
    }

    warning(message, options) {
        return this.show(message, "warning", { title: "Warning", ...options });
    }

    info(message, options) {
        return this.show(message, "info", { title: "Info", ...options });
    }

    // Dropdown Notifications
    initDropdown() {
        const bell = document.querySelector(".notification-bell");
        const panel = document.querySelector(".notifications-panel");

        if (!bell || !panel) return;

        // Toggle dropdown
        bell.addEventListener("click", (e) => {
            e.stopPropagation();
            panel.classList.toggle("active");

            if (panel.classList.contains("active")) {
                this.loadNotifications();
            }
        });

        // Close on outside click
        document.addEventListener("click", (e) => {
            if (!panel.contains(e.target)) {
                panel.classList.remove("active");
            }
        });

        // Mark all read button
        const markAllBtn = document.querySelector(".mark-all-read");
        if (markAllBtn) {
            markAllBtn.addEventListener("click", () => this.markAllRead());
        }
    }

    async loadNotifications() {
        // Override this method to load from API
        const list = document.querySelector(".notifications-list");
        if (!list) return;

        if (this.notifications.length === 0) {
            list.innerHTML = `
                <div class="no-notifications">
                    <i class="fas fa-bell-slash"></i>
                    <p>No notifications</p>
                </div>
            `;
        } else {
            list.innerHTML = this.notifications
                .map((n) => this.renderNotification(n))
                .join("");
        }
    }

    renderNotification(notification) {
        const iconClass = this.getIconClass(notification.type);
        const timeAgo = this.getTimeAgo(notification.createdAt);

        return `
            <div class="notification-item ${
                notification.isRead ? "" : "unread"
            } priority-${notification.priority || "normal"}"
                 onclick="NotificationManager.markRead('${notification.id}')">
                <div class="notification-icon icon-${notification.type}">
                    <i class="fas ${iconClass}"></i>
                </div>
                <div class="notification-content">
                    <h5>${notification.title}</h5>
                    <p>${notification.message}</p>
                    <span class="notification-time">${timeAgo}</span>
                </div>
            </div>
        `;
    }

    updateBadge(count) {
        const badge = document.querySelector(".notification-badge");
        if (!badge) return;

        if (count > 0) {
            badge.style.display = "flex";
            badge.textContent = count > 99 ? "99+" : count;
        } else {
            badge.style.display = "none";
        }

        this.unreadCount = count;
    }

    async markRead(notificationId) {
        // Override to call API
        const notification = this.notifications.find(
            (n) => n.id === notificationId
        );
        if (notification) {
            notification.isRead = true;
            this.updateBadge(
                this.notifications.filter((n) => !n.isRead).length
            );
        }
    }

    async markAllRead() {
        // Override to call API
        this.notifications.forEach((n) => (n.isRead = true));
        this.updateBadge(0);
        this.loadNotifications();
    }

    // Utility Methods
    getIcon(type) {
        const icons = {
            success: "fa-check-circle",
            error: "fa-times-circle",
            warning: "fa-exclamation-triangle",
            info: "fa-info-circle",
        };
        return icons[type] || icons.info;
    }

    getIconClass(type) {
        const icons = {
            payment: "fa-credit-card",
            maintenance: "fa-tools",
            lease: "fa-file-contract",
            message: "fa-envelope",
            alert: "fa-bell",
            system: "fa-cog",
        };
        return icons[type] || "fa-bell";
    }

    getTimeAgo(date) {
        const now = new Date();
        const past = new Date(date);
        const diff = Math.floor((now - past) / 1000);

        if (diff < 60) return "Just now";
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;

        return past.toLocaleDateString();
    }
}

// Initialize globally
window.Notifications = new NotificationManager();
