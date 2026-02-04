/**
 * Storage Utilities
 * Handles localStorage operations for settings and chat history
 */

const SETTINGS_KEY = 'chatHubSettings';
const CHAT_HISTORY_KEY = 'chatHubHistory';
const SESSIONS_KEY = 'chatHubSessions';
const CURRENT_SESSION_KEY = 'chatHubCurrentSession';
// New Key for OpenRouter Models
const OPENROUTER_MODELS_KEY = 'chatHubOpenRouterModels';

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
            for (const key of ['openai', 'cerebras', 'ollama', 'claude', 'lmstudio', 'openrouter']) {
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
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(messages));
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
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error('Failed to load chat history:', e);
        return [];
    }
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

// --- NEW FUNCTIONS FOR OPENROUTER MODELS ---

/**
 * Save OpenRouter models list to localStorage
 * @param {Array} models - Array of model ID strings
 */
export function saveOpenRouterModels(models) {
    try {
        localStorage.setItem(OPENROUTER_MODELS_KEY, JSON.stringify(models));
    } catch (e) {
        console.error('Failed to save OpenRouter models:', e);
    }
}

/**
 * Load OpenRouter models list from localStorage
 * @returns {Array} Array of model ID strings or null
 */
export function loadOpenRouterModels() {
    try {
        const saved = localStorage.getItem(OPENROUTER_MODELS_KEY);
        return saved ? JSON.parse(saved) : null;
    } catch (e) {
        console.error('Failed to load OpenRouter models:', e);
        return null;
    }
}

// --- SESSION MANAGEMENT ---

/**
 * Generate a title for a session based on the first user message
 * @param {Array} messages - Session messages
 * @returns {string} Session title
 */
export function generateSessionTitle(messages) {
    const firstUserMsg = messages.find(m => m.role === 'user');
    if (!firstUserMsg) return 'New Chat';
    
    let title = firstUserMsg.content.trim();
    if (title.length > 30) {
        title = title.substring(0, 30) + '...';
    }
    return title;
}

/**
 * Create a new session structure
 * @param {Array} messages - Initial messages (optional)
 * @returns {Object} New session object
 */
export function createSession(messages = []) {
    return {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        title: generateSessionTitle(messages),
        updatedAt: Date.now(),
        messages: messages
    };
}

/**
 * Save all sessions
 * @param {Array} sessions - Array of session objects
 */
export function saveSessions(sessions) {
    try {
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
    } catch (e) {
        console.error('Failed to save sessions:', e);
    }
}

/**
 * Load all sessions
 * @returns {Array} Array of session objects
 */
export function loadSessions() {
    try {
        const saved = localStorage.getItem(SESSIONS_KEY);
        return saved ? JSON.parse(saved) : [];
    } catch (e) {
        console.error('Failed to load sessions:', e);
        return [];
    }
}

/**
 * Update a specific session
 * @param {Array} sessions - All sessions array
 * @param {string} sessionId - ID of session to update
 * @param {Object} updates - Object containing properties to update
 * @returns {Array} Updated sessions array
 */
export function updateSession(sessions, sessionId, updates) {
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index === -1) return sessions;
    
    const updatedSession = { ...sessions[index], ...updates, updatedAt: Date.now() };
    
    // Auto-update title if it's "New Chat" and we have messages
    if (updates.messages) {
        if (updatedSession.title === 'New Chat' && updates.messages.length > 0) {
            updatedSession.title = generateSessionTitle(updates.messages);
        }
    }
    
    const newSessions = [...sessions];
    newSessions[index] = updatedSession;
    return newSessions;
}

/**
 * Delete a session
 * @param {Array} sessions - All sessions array
 * @param {string} sessionId - Session ID to delete
 * @returns {Array} Updated sessions array
 */
export function deleteSession(sessions, sessionId) {
    return sessions.filter(s => s.id !== sessionId);
}

/**
 * Save current session ID
 * @param {string} sessionId - Current session ID
 */
export function saveCurrentSessionId(sessionId) {
    try {
        localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
    } catch (e) {
        console.error('Failed to save current session:', e);
    }
}

/**
 * Load current session ID
 * @returns {string|null} Current session ID
 */
export function loadCurrentSessionId() {
    try {
        return localStorage.getItem(CURRENT_SESSION_KEY);
    } catch (e) {
        console.error('Failed to load current session:', e);
    }
    return null;
}

/**
 * Get session by ID
 * @param {Array} sessions - All sessions array
 * @param {string} sessionId - Session ID to find
 * @returns {Object|undefined} Session object
 */
export function getSessionById(sessions, sessionId) {
    return sessions.find(s => s.id === sessionId);
}