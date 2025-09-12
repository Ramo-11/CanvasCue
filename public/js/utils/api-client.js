// API Client - Standalone module
class APIClient {
    static async request(url, options = {}) {
        const defaultOptions = {
            headers: {
                "Content-Type": "application/json",
            },
        };

        const config = { ...defaultOptions, ...options };

        try {
            const response = await fetch(url, config);
            let data;

            try {
                data = await response.json();
            } catch (jsonError) {
                data = {
                    success: false,
                    message: response.statusText || "Request failed",
                };
            }

            if (!response.ok) {
                const errorMessage =
                    data.message ||
                    data.error ||
                    `HTTP error! status: ${response.status}`;
                console.error("API request failed:", errorMessage);
                return {
                    success: false,
                    error: errorMessage,
                    status: response.status,
                };
            }

            return { success: true, data };
        } catch (error) {
            console.error("API request failed:", error);
            return {
                success: false,
                error: error.message || "Network error occurred",
            };
        }
    }

    static get(url) {
        return this.request(url, { method: "GET" });
    }

    static post(url, data) {
        const isFormData = data instanceof FormData;
        return this.request(url, {
            method: "POST",
            body: isFormData ? data : JSON.stringify(data),
            headers: isFormData ? {} : { "Content-Type": "application/json" },
        });
    }

    static put(url, data) {
        return this.request(url, {
            method: "PUT",
            body: JSON.stringify(data),
        });
    }

    static delete(url) {
        return this.request(url, { method: "DELETE" });
    }
}

// Add to global namespace
if (window.App) window.App.API = APIClient;
window.APIClient = APIClient;
