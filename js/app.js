/**
 * Main Vue Application
 * Chat Hub application with modular architecture
 */

import { createApp, ref, computed, onMounted, nextTick, watch } from 'vue';
import { createAdapter, getBackendLabel } from './adapters/index.js';
import { renderMarkdown } from './utils/markdownRenderer.js';
import { saveSettings, loadSettings, saveChatHistory, loadChatHistory, clearChatHistory } from './utils/storage.js';

// Default settings configuration
const defaultSettings = {
    backend: 'openai',
    theme: 'dark',
    systemPrompt: 'You are a helpful coding assistant. You provide clear, well-commented code examples and explanations.',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0,
    stream: true,
    openai: {
        apiKey: '',
        model: 'gpt-4o',
        baseUrl: 'https://api.openai.com/v1',
        maxTokens: 4096,
        presencePenalty: 0,
        frequencyPenalty: 0
    },
    cerebras: {
        apiKey: '',
        model: 'llama-3.3-70b',
        baseUrl: 'https://api.cerebras.ai/v1',
        maxTokens: 4096,
        presencePenalty: 0,
        frequencyPenalty: 0
    },
    ollama: {
        host: 'http://localhost:11434',
        model: 'llama3',
        maxTokens: 4096,
        numCtx: 4096,
        repeatPenalty: 1.1,
        repeatLastN: 64
    },
    claude: {
        apiKey: '',
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 4096,
        topK: 40
    },
    lmstudio: {
        host: 'http://localhost:1234',
        model: '',
        maxTokens: 4096,
        presencePenalty: 0,
        frequencyPenalty: 0
    }
};

// Model context window sizes (in tokens)
const modelContextSizes = {
    openai: {
        // GPT-4o series - 128K context
        'gpt-4o': 128000,
        'gpt-4o-mini': 128000,
        'gpt-4o-2024-11-20': 128000,
        'gpt-4o-2024-08-06': 128000,
        // GPT-4 series
        'gpt-4-turbo': 128000,
        'gpt-4-turbo-preview': 128000,
        'gpt-4-0125-preview': 128000,
        'gpt-4-1106-preview': 128000,
        'gpt-4': 8192,
        // GPT-3.5 series
        'gpt-3.5-turbo': 16385,
        'gpt-3.5-turbo-0125': 16385,
        'gpt-3.5-turbo-1106': 16385,
        // Reasoning models
        'o1': 200000,
        'o1-mini': 128000,
        'o1-preview': 128000,
        'o3-mini': 200000
    },
    cerebras: {
        'llama-3.3-70b': 128000,
        'llama-3.1-70b': 128000,
        'llama-3.1-8b': 128000,
        'llama-3-70b': 8192,
        'llama-3-8b': 8192,
        'zai-glm-4.7': 8192
    },
    claude: {
        'claude-3-5-sonnet-20241022': 200000,
        'claude-3-5-sonnet-latest': 200000,
        'claude-3-opus-20240229': 200000,
        'claude-3-sonnet-20240229': 200000,
        'claude-3-haiku-20240307': 200000
    }
};

// Max output tokens per provider (API limits)
const providerMaxOutputTokens = {
    openai: 16384,  // Most OpenAI models support 16K output
    cerebras: 8192, // Cerebras default
    claude: 8192,   // Claude default, some models support up to 64K
    ollama: 8192,   // Depends on hardware
    lmstudio: 8192  // Depends on loaded model
};

// Maximum messages to keep in memory to prevent OOM
const MAX_MESSAGES_IN_MEMORY = 50;

createApp({
    setup() {
        // State
        const messages = ref([]);
        const userInput = ref('');
        const isLoading = ref(false);
        const showSettings = ref(false);
        const messagesContainer = ref(null);
        const textarea = ref(null);
        const connectionError = ref('');
        const testingConnection = ref(false);
        const abortController = ref(null);
        const settings = ref({ ...defaultSettings });
        const activeTab = ref('general');
        const showHelp = ref(false);
        
        // Search functionality
        const showSearch = ref(false);
        const searchQuery = ref('');
        const searchResults = ref([]);
        const hasSearched = ref(false);
        const searchInput = ref(null);
        
        // Session management
        const sessions = ref([]);
        const currentSessionId = ref(null);
        const sidebarCollapsed = ref(true); // Default collapsed
        const sessionMenu = ref({ show: false, x: 0, y: 0, session: null });
        const showRenameModal = ref(false);
        const renameValue = ref('');
        const renameInput = ref(null);
        const sessionToRename = ref(null);
        let autoSaveTimeout = null;

        // Computed
        const sortedSessions = computed(() => {
            return [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt);
        });

        const currentBackendLabel = computed(() => {
            return getBackendLabel(settings.value.backend);
        });

        // Methods
        const scrollToBottom = () => {
            nextTick(() => {
                if (messagesContainer.value) {
                    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
                }
            });
        };

        const autoResize = (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
        };

        const handleEnter = (e) => {
            if (e.shiftKey) {
                // Allow default behavior (new line)
                return;
            }
            // Send message
            e.preventDefault();
            sendMessage();
        };

        const getAdapterConfig = () => {
            const backend = settings.value.backend;
            const backendSettings = settings.value[backend];
            
            // Build config with per-provider overrides and fallbacks
            const config = {
                systemPrompt: settings.value.systemPrompt,
                temperature: settings.value.temperature,
                topP: settings.value.topP,
                // Use per-provider maxTokens if set, otherwise fall back to global
                maxTokens: backendSettings.maxTokens || settings.value.maxTokens
            };
            
            // Add provider-specific parameters
            if (backend === 'openai' || backend === 'cerebras' || backend === 'lmstudio') {
                config.presencePenalty = backendSettings.presencePenalty ?? 0;
                config.frequencyPenalty = backendSettings.frequencyPenalty ?? 0;
            }
            
            if (backend === 'claude') {
                config.topK = backendSettings.topK ?? 40;
            }
            
            if (backend === 'ollama') {
                config.numCtx = backendSettings.numCtx || 4096;
                config.repeatPenalty = backendSettings.repeatPenalty ?? 1.1;
                config.repeatLastN = backendSettings.repeatLastN ?? 64;
            }
            
            return { ...backendSettings, ...config };
        };

        // Helper: Get model context window size
        const getModelContext = (backend) => {
            const model = settings.value[backend]?.model;
            const contextSize = modelContextSizes[backend]?.[model] || 'Unknown';
            return typeof contextSize === 'number' ? contextSize.toLocaleString() : contextSize;
        };

        // Helper: Get max tokens limit for slider
        const getMaxTokensLimit = (backend) => {
            // Return appropriate limit based on provider capabilities
            if (backend === 'claude') {
                // Claude supports up to 8K output (64K for some models)
                return 8192;
            }
            if (backend === 'openai') {
                // Check if using o1/o3 models which have different limits
                const model = settings.value.openai?.model || '';
                if (model.startsWith('o1') || model.startsWith('o3')) {
                    return 32768; // Reasoning models can output more
                }
                return 16384;
            }
            if (backend === 'cerebras') {
                return 8192;
            }
            return 8192;
        };

        // Helper: Get token step size for slider
        const getTokenStep = (backend) => {
            const limit = getMaxTokensLimit(backend);
            return limit >= 16000 ? 512 : 256;
        };

        // Helper: Format token numbers
        const formatTokens = (tokens) => {
            if (tokens >= 1000) {
                return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}K`;
            }
            return tokens.toString();
        };

        // Helper: Update max tokens when model changes
        const updateMaxTokensForModel = (backend) => {
            const model = settings.value[backend]?.model;
            const limit = getMaxTokensLimit(backend);
            const currentTokens = settings.value[backend]?.maxTokens;
            
            // If current tokens exceed new limit, cap it
            if (currentTokens && currentTokens > limit) {
                settings.value[backend].maxTokens = limit;
            }
        };

        const sendMessage = async () => {
            if (!userInput.value.trim() || isLoading.value) return;

            const userMessage = userInput.value.trim();
            messages.value.push({ role: 'user', content: userMessage });
            
            // Reset textarea height
            const textareaEl = textarea.value;
            if (textareaEl) textareaEl.style.height = 'auto';
            userInput.value = '';
            
            isLoading.value = true;
            connectionError.value = '';
            
            // Add empty assistant message for streaming
            const assistantMessageIndex = messages.value.length;
            messages.value.push({ role: 'assistant', content: '', streaming: settings.value.stream });
            
            scrollToBottom();

            abortController.value = new AbortController();

            try {
                const conversation = messages.value.slice(0, -1).map(m => ({
                    role: m.role,
                    content: m.content
                }));

                const adapter = createAdapter(settings.value.backend, getAdapterConfig());

                if (settings.value.stream) {
                    await adapter.stream(conversation, (chunk) => {
                        messages.value[assistantMessageIndex].content += chunk;
                        scrollToBottom();
                    }, abortController.value.signal);
                } else {
                    const response = await adapter.send(conversation);
                    messages.value[assistantMessageIndex].content = response;
                }
            } catch (error) {
                console.error('Send message error:', error);
                if (error.name === 'AbortError') {
                    messages.value[assistantMessageIndex].content += '\n\n*[Response stopped by user]*';
                } else {
                    connectionError.value = error.message;
                    messages.value[assistantMessageIndex].content = `**Error:** ${error.message}\n\nPlease check your settings and try again.`;
                }
            } finally {
                messages.value[assistantMessageIndex].streaming = false;
                isLoading.value = false;
                abortController.value = null;
                scrollToBottom();
                
                // Re-render with syntax highlighting
                nextTick(() => {
                    messages.value[assistantMessageIndex].content = messages.value[assistantMessageIndex].content;
                });

                // Trim messages to prevent OOM
                trimMessages();
                saveChatHistory(messages.value);
            }
        };

        const trimMessages = () => {
            if (messages.value.length > MAX_MESSAGES_IN_MEMORY) {
                // Keep the first message (if any) and the most recent messages
                const keepCount = Math.floor(MAX_MESSAGES_IN_MEMORY / 2);
                messages.value = [
                    ...messages.value.slice(0, 1),
                    ...messages.value.slice(-keepCount)
                ];
            }
        };

        const clearChat = () => {
            if (abortController.value) {
                abortController.value.abort();
            }
            messages.value = [];
            clearChatHistory();
        };

        const saveSettingsHandler = () => {
            saveSettings(settings.value);
            showSettings.value = false;
            connectionError.value = '';
        };

        const loadSettingsHandler = () => {
            settings.value = loadSettings(defaultSettings);
        };

        const testConnection = async () => {
            testingConnection.value = true;
            connectionError.value = '';
            try {
                await sendMessage();
            } catch (error) {
                connectionError.value = error.message;
            } finally {
                testingConnection.value = false;
            }
        };

        // Theme handling
        const applyTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
        };

        const toggleTheme = () => {
            const newTheme = settings.value.theme === 'dark' ? 'light' : 'dark';
            settings.value.theme = newTheme;
            applyTheme(newTheme);
            saveSettings(settings.value);
        };

        // Helper to check if backend supports vision
        const supportsVision = (backend) => {
            const visionModels = {
                openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini'],
                claude: ['claude-3', 'claude-3-5'],
                ollama: ['llava', 'bakllava', 'moondream']
            };
            
            if (!visionModels[backend]) return false;
            
            const model = settings.value[backend]?.model || '';
            return visionModels[backend].some(vm => model.toLowerCase().includes(vm.toLowerCase()));
        };

        // Computed property for current vision support
        const visionSupported = computed(() => {
            return supportsVision(settings.value.backend);
        });

        // Search functionality
        const performSearch = () => {
            if (!searchQuery.value.trim()) {
                searchResults.value = [];
                hasSearched.value = false;
                return;
            }
            
            hasSearched.value = true;
            const query = searchQuery.value.toLowerCase();
            const results = [];
            
            messages.value.forEach((msg, index) => {
                const content = msg.content?.toLowerCase() || '';
                if (content.includes(query)) {
                    results.push({
                        index,
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp
                    });
                }
            });
            
            searchResults.value = results;
        };
        
        const highlightMatch = (content, query) => {
            if (!query) return content;
            const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
            return content.replace(regex, '<mark style="background-color: var(--accent-primary); color: var(--text-primary); padding: 0 2px; border-radius: 2px;">$1</mark>');
        };
        
        const escapeRegExp = (string) => {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        };
        
        const jumpToMessage = (index) => {
            showSearch.value = false;
            nextTick(() => {
                const messageElements = messagesContainer.value?.querySelectorAll('[data-message-index]');
                if (messageElements && messageElements[index]) {
                    messageElements[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    // Add a brief highlight effect
                    messageElements[index].style.transition = 'background-color 0.3s';
                    const originalBg = messageElements[index].style.backgroundColor;
                    messageElements[index].style.backgroundColor = 'var(--accent-primary)';
                    setTimeout(() => {
                        messageElements[index].style.backgroundColor = originalBg;
                    }, 1000);
                }
            });
        };

        // Session Management Functions
        const formatTimeAgo = (timestamp) => {
            const seconds = Math.floor((Date.now() - timestamp) / 1000);
            if (seconds < 60) return 'just now';
            const minutes = Math.floor(seconds / 60);
            if (minutes < 60) return `${minutes}m ago`;
            const hours = Math.floor(minutes / 60);
            if (hours < 24) return `${hours}h ago`;
            const days = Math.floor(hours / 24);
            if (days < 30) return `${days}d ago`;
            return new Date(timestamp).toLocaleDateString();
        };

        const createNewSession = () => {
            // Save current session if it exists
            if (currentSessionId.value) {
                saveCurrentSession();
            }
            
            // Create new session
            const newSession = createSession([]);
            sessions.value.push(newSession);
            currentSessionId.value = newSession.id;
            messages.value = [];
            attachments.value = [];
            
            saveSessions(sessions.value);
            saveCurrentSessionId(newSession.id);
            
            // Close sidebar on mobile
            if (window.innerWidth < 1024) {
                sidebarCollapsed.value = true;
            }
        };

        const switchToSession = (sessionId) => {
            if (sessionId === currentSessionId.value) return;
            
            // Save current session
            saveCurrentSession();
            
            // Load new session
            const session = getSessionById(sessions.value, sessionId);
            if (session) {
                currentSessionId.value = sessionId;
                messages.value = [...session.messages];
                attachments.value = [];
                saveCurrentSessionId(sessionId);
            }
            
            // Close sidebar on mobile
            if (window.innerWidth < 1024) {
                sidebarCollapsed.value = true;
            }
        };

        const saveCurrentSession = () => {
            if (!currentSessionId.value) return;
            
            sessions.value = updateSession(sessions.value, currentSessionId.value, {
                messages: [...messages.value]
            });
            saveSessions(sessions.value);
        };

        const debouncedAutoSave = () => {
            if (autoSaveTimeout) clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                saveCurrentSession();
            }, 2000);
        };

        const showSessionMenu = (session, event) => {
            sessionMenu.value = {
                show: true,
                x: event.clientX,
                y: event.clientY,
                session: session
            };
        };

        const renameSession = (session) => {
            sessionMenu.value.show = false;
            sessionToRename.value = session;
            renameValue.value = session.title;
            showRenameModal.value = true;
            nextTick(() => {
                if (renameInput.value) renameInput.value.focus();
            });
        };

        const confirmRename = () => {
            if (sessionToRename.value && renameValue.value.trim()) {
                sessions.value = updateSession(sessions.value, sessionToRename.value.id, {
                    title: renameValue.value.trim()
                });
                saveSessions(sessions.value);
            }
            showRenameModal.value = false;
            sessionToRename.value = null;
            renameValue.value = '';
        };

        const duplicateSession = (session) => {
            sessionMenu.value.show = false;
            const newSession = createSession([...session.messages]);
            newSession.title = `${session.title} (Copy)`;
            sessions.value.push(newSession);
            saveSessions(sessions.value);
        };

        const deleteSessionHandler = (session) => {
            sessionMenu.value.show = false;
            sessions.value = deleteSession(sessions.value, session.id);
            
            // If we deleted the current session, switch to another or create new
            if (currentSessionId.value === session.id) {
                if (sessions.value.length > 0) {
                    switchToSession(sessions.value[sessions.value.length - 1].id);
                } else {
                    createNewSession();
                }
            }
            
            saveSessions(sessions.value);
        };

        // Keyboard shortcuts handler
        const handleGlobalKeydown = (e) => {
            // Cmd/Ctrl + Enter to send message
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
            // Esc to cancel/close modals
            if (e.key === 'Escape') {
                if (showSearch.value) {
                    showSearch.value = false;
                    return;
                }
                if (showSettings.value) {
                    showSettings.value = false;
                    return;
                }
                if (showHelp.value) {
                    showHelp.value = false;
                    return;
                }
            }
            // Cmd/Ctrl + K to open search (when not in search input)
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                if (document.activeElement !== searchInput.value) {
                    showSearch.value = true;
                    nextTick(() => {
                        if (searchInput.value) {
                            searchInput.value.focus();
                        }
                    });
                }
            }
            // Cmd/Ctrl + Shift + K to focus chat input
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'K') {
                e.preventDefault();
                if (textarea.value) {
                    textarea.value.focus();
                }
            }
            // Cmd/Ctrl + / to toggle settings
            if ((e.metaKey || e.ctrlKey) && e.key === '/') {
                e.preventDefault();
                showSettings.value = !showSettings.value;
            }
            // ? to show help (when not in input)
            if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                const activeElement = document.activeElement;
                if (activeElement && activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    showHelp.value = !showHelp.value;
                }
            }
        };

        // Lifecycle
        onMounted(() => {
            loadSettingsHandler();
            
            // Load sessions
            sessions.value = loadSessions();
            const savedSessionId = loadCurrentSessionId();
            
            // Migrate old chat history to a session if it exists
            const oldHistory = loadChatHistory();
            if (oldHistory.length > 0 && sessions.value.length === 0) {
                const migratedSession = createSession(oldHistory);
                sessions.value.push(migratedSession);
                currentSessionId.value = migratedSession.id;
                messages.value = [...oldHistory];
                saveSessions(sessions.value);
                saveCurrentSessionId(migratedSession.id);
            } else if (savedSessionId && getSessionById(sessions.value, savedSessionId)) {
                // Restore last active session
                currentSessionId.value = savedSessionId;
                const session = getSessionById(sessions.value, savedSessionId);
                messages.value = [...session.messages];
            } else if (sessions.value.length > 0) {
                // Use most recent session
                const mostRecent = sessions.value.sort((a, b) => b.updatedAt - a.updatedAt)[0];
                currentSessionId.value = mostRecent.id;
                messages.value = [...mostRecent.messages];
            } else {
                // Create first session
                createNewSession();
            }
            
            // Apply theme on load
            applyTheme(settings.value.theme || 'dark');
            
            // Add global keyboard event listeners
            document.addEventListener('keydown', handleGlobalKeydown);
            
            // Close sidebar when clicking outside
            document.addEventListener('click', (e) => {
                const sidebar = document.querySelector('aside');
                const toggleBtn = document.querySelector('[title="Toggle Sidebar"]');
                if (sidebar && !sidebar.contains(e.target) && toggleBtn && !toggleBtn.contains(e.target)) {
                    sidebarCollapsed.value = true;
                }
            });
        });

        // Watchers
        watch(() => settings.value.stream, () => {
            saveSettings(settings.value);
        });

        // Auto-save messages when they change
        watch(messages, () => {
            debouncedAutoSave();
        }, { deep: true });

        // Expose to template
        return {
            messages,
            userInput,
            isLoading,
            showSettings,
            messagesContainer,
            textarea,
            settings,
            showHelp,
            currentBackendLabel,
            connectionError,
            testingConnection,
            activeTab,
            sendMessage,
            clearChat,
            saveSettings: saveSettingsHandler,
            testConnection,
            renderMarkdown,
            autoResize,
            handleEnter,
            toggleTheme,
            // New helper methods for settings UI
            getModelContext,
            getMaxTokensLimit,
            getTokenStep,
            formatTokens,
            updateMaxTokensForModel,
            // Search functionality
            showSearch,
            searchQuery,
            searchResults,
            hasSearched,
            searchInput,
            performSearch,
            highlightMatch,
            jumpToMessage,
            // Vision support
            supportsVision,
            visionSupported,
            // Session management
            sessions,
            sortedSessions,
            currentSessionId,
            sidebarCollapsed,
            sessionMenu,
            showRenameModal,
            renameValue,
            renameInput,
            formatTimeAgo,
            createNewSession,
            switchToSession,
            showSessionMenu,
            renameSession,
            confirmRename,
            duplicateSession,
            deleteSessionHandler
        };
    }
}).mount('#app');
