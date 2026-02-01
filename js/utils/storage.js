/**
 * Storage Utilities
 * Handles localStorage operations for settings and chat history
 */

const SETTINGS_KEY = 'chatHubSettings';
const CHAT_HISTORY_KEY = 'chatHubHistory';

/**
 * Save settings to localStorage
 * @param {Object} settings - Settings object
 */
export function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

/**
 * Load settings from localStorage
 * @param {Object} defaultSettings - Default settings object
 * @returns {Object} Settings object
 */
export function loadSettings(defaultSettings) {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Merge with defaults, preserving nested objects
            const merged = { ...defaultSettings, ...parsed };
            for (const key of ['openai', 'cerebras', 'ollama', 'claude', 'lmstudio']) {
                if (parsed[key]) {
                    merged[key] = { ...defaultSettings[key], ...parsed[key] };
                }
            }
            return merged;
        }
    } catch (e) {
        console.error('Failed to load settings:', e);
    }
    return { ...defaultSettings };
}

/**
 * Save chat history to localStorage
 * @param {Array} messages - Array of message objects
 */
export function saveChatHistory(messages) {
    try {
        // Limit history to prevent OOM issues
        const maxMessages = 100;
        const limitedMessages = messages.slice(-maxMessages);
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(limitedMessages));
    } catch (e) {
        console.error('Failed to save chat history:', e);
    }
}

/**
 * Load chat history from localStorage
 * @returns {Array} Array of message objects
 */
export function loadChatHistory() {
    try {
        const saved = localStorage.getItem(CHAT_HISTORY_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load chat history:', e);
    }
    return [];
}

/**
 * Clear chat history from localStorage
 */
export function clearChatHistory() {
    try {
        localStorage.removeItem(CHAT_HISTORY_KEY);
    } catch (e) {
        console.error('Failed to clear chat history:', e);
    }
}
