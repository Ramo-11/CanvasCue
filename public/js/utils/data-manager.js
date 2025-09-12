// Date Utilities - Standalone module
class DataManager {
    static format(date, format = "MM/DD/YYYY") {
        const d = new Date(date);
        const month = (d.getMonth() + 1).toString().padStart(2, "0");
        const day = d.getDate().toString().padStart(2, "0");
        const year = d.getFullYear();

        return format
            .replace("MM", month)
            .replace("DD", day)
            .replace("YYYY", year);
    }

    static getDaysUntil(date) {
        const now = new Date();
        const target = new Date(date);
        const diff = target - now;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }

    static getDaysSince(date) {
        return -this.getDaysUntil(date);
    }

    static isOverdue(date) {
        return new Date(date) < new Date();
    }

    static timeAgo(date) {
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

// Add to global namespace
if (window.App) window.App.Date = DataManager;
window.DataManager = DataManager;
