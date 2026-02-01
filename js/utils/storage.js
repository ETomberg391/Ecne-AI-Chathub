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

// Session Management
const SESSIONS_KEY = 'chatHubSessions';
const CURRENT_SESSION_KEY = 'chatHubCurrentSession';

/**
 * Generate a unique session ID
 * @returns {string} UUID string
 */
function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Generate a title from first message
 * @param {Array} messages - Array of messages
 * @returns {string} Generated title
 */
function generateSessionTitle(messages) {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
        const text = firstUserMessage.content.replace(/\n/g, ' ').slice(0, 40);
        return text.length > 40 ? text + '...' : text || 'New Chat';
    }
    return 'New Chat';
}

/**
 * Create a new session
 * @param {Array} messages - Initial messages (optional)
 * @returns {Object} New session object
 */
export function createSession(messages = []) {
    const now = Date.now();
    return {
        id: generateSessionId(),
        title: generateSessionTitle(messages),
        createdAt: now,
        updatedAt: now,
        messages: messages,
        metadata: {
            messageCount: messages.length,
            hasImages: messages.some(m => m.attachments?.some(a => a.type === 'image')),
            previewText: messages[0]?.content?.slice(0, 100) || ''
        }
    };
}

/**
 * Save all sessions to localStorage
 * @param {Array} sessions - Array of session objects
 */
export function saveSessions(sessions) {
    try {
        // Keep only last 50 sessions to prevent storage issues
        const limitedSessions = sessions.slice(-50);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(limitedSessions));
    } catch (e) {
        console.error('Failed to save sessions:', e);
    }
}

/**
 * Load all sessions from localStorage
 * @returns {Array} Array of session objects
 */
export function loadSessions() {
    try {
        const saved = localStorage.getItem(SESSIONS_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (e) {
        console.error('Failed to load sessions:', e);
    }
    return [];
}

/**
 * Update a session
 * @param {Array} sessions - All sessions array
 * @param {string} sessionId - Session ID to update
 * @param {Object} updates - Updates to apply
 * @returns {Array} Updated sessions array
 */
export function updateSession(sessions, sessionId, updates) {
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index === -1) return sessions;
    
    const session = sessions[index];
    const updatedSession = {
        ...session,
        ...updates,
        updatedAt: Date.now()
    };
    
    // Update metadata if messages changed
    if (updates.messages) {
        updatedSession.metadata = {
            messageCount: updates.messages.length,
            hasImages: updates.messages.some(m => m.attachments?.some(a => a.type === 'image')),
            previewText: updates.messages[0]?.content?.slice(0, 100) || ''
        };
        // Update title if it's still the default and we have messages
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
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Session object or null
 */
export function getSessionById(sessions, sessionId) {
    return sessions.find(s => s.id === sessionId) || null;
}
