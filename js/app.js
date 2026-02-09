/**
 * Main Vue Application
 * Chat Hub application with modular architecture
 */

import { createApp, ref, computed, onMounted, nextTick, watch } from 'vue';
import { createAdapter, getBackendLabel } from './adapters/index.js';
import { renderMarkdown } from './utils/markdownRenderer.js';
// Import the new functions from storage.js
import { 
    saveSettings, 
    loadSettings, 
    saveChatHistory, 
    loadChatHistory, 
    clearChatHistory,
    saveOpenRouterModels, // New
    loadOpenRouterModels,  // New
    loadSessions,
    saveSessions,
    loadCurrentSessionId,
    saveCurrentSessionId,
    createSession,
    updateSession,
    deleteSession,
    getSessionById
} from './utils/storage.js';

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
    },
    openrouter: {
        apiKey: '',
        model: 'anthropic/claude-sonnet-4.5',
        baseUrl: 'https://openrouter.ai/api/v1',
        maxTokens: 4096,
        presencePenalty: 0,
        frequencyPenalty: 0,
        providerRouting: '',
        enablePromptCaching: false,
        userTracking: ''
    },
    localopenai: {
        baseUrl: 'http://localhost:11434/v1',
        apiKey: '',
        modelAlias: '',
        maxTokens: 4096,
        presencePenalty: 0,
        frequencyPenalty: 0
    }
};

// Default fallback models
const defaultOpenRouterModels = [
    'anthropic/claude-sonnet-4.5',
    'anthropic/claude-3.5-sonnet',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'google/gemini-pro-1.5',
    'meta-llama/llama-3.1-70b-instruct',
    'mistralai/mistral-large',
    'cohere/command-r-plus'
];

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
    },
    openrouter: {
        // Anthropic Claude models
        'anthropic/claude-sonnet-4.5': 200000,
        'anthropic/claude-opus-4': 200000,
        'anthropic/claude-3.5-sonnet': 200000,
        'anthropic/claude-3.5-haiku': 200000,
        'anthropic/claude-3-opus': 200000,
        'anthropic/claude-3-sonnet': 200000,
        'anthropic/claude-3-haiku': 200000,
        // OpenAI models
        'openai/gpt-4o': 128000,
        'openai/gpt-4o-mini': 128000,
        'openai/gpt-4-turbo': 128000,
        'openai/gpt-4': 8192,
        'openai/gpt-3.5-turbo': 16385,
        'openai/o1': 200000,
        'openai/o1-mini': 128000,
        'openai/o3-mini': 200000,
        // Google Gemini models
        'google/gemini-pro': 32000,
        'google/gemini-1.5-pro': 1000000,
        'google/gemini-1.5-flash': 1000000,
        // Meta Llama models
        'meta-llama/llama-3.1-405b': 128000,
        'meta-llama/llama-3.1-70b': 128000,
        'meta-llama/llama-3.1-8b': 128000,
        'meta-llama/llama-3-70b': 8192,
        'meta-llama/llama-3-8b': 8192,
        // Mistral models
        'mistralai/mistral-large': 128000,
        'mistralai/mistral-medium': 32000,
        'mistralai/mistral-small': 32000,
        'mistralai/mixtral-8x7b': 32000,
        // Cohere models
        'cohere/command-r': 128000,
        'cohere/command-r-plus': 128000
    },
    localopenai: {
        // Default context for local models (adjust as needed)
        'default': 8192,
        'llama-3': 8192,
        'llama-3.1': 8192,
        'llama-3.2': 8192,
        'llama-3.3': 8192,
        'mistral': 32768,
        'mixtral': 32768,
        'gpt': 128000,
        'qwen': 32768,
        'codellama': 16384,
        'phi': 16384,
        'yi': 16384
    }
};

// Max output tokens per provider
const providerMaxOutputTokens = {
    openai: 16384,
    cerebras: 8192,
    claude: 8192,
    ollama: 8192,
    lmstudio: 8192,
    openrouter: 16384,
    localopenai: 16384
};

// Memory Limit
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
        const sidebarCollapsed = ref(true);
        const sessionMenu = ref({ show: false, x: 0, y: 0, session: null });
        const showRenameModal = ref(false);
        const renameValue = ref('');
        const renameInput = ref(null);
        const sessionToRename = ref(null);
        let autoSaveTimeout = null;
        
        // OpenRouter Model Management
        const isLoadingModels = ref(false);
        const openRouterModels = ref([]);
        const modelSearchQuery = ref('');
        const showModelDropdown = ref(false);
        const modelSearchInput = ref(null);

        // Computed
        const sortedSessions = computed(() => {
            return [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt);
        });

        const currentBackendLabel = computed(() => {
            return getBackendLabel(settings.value.backend);
        });

        const filteredOpenRouterModels = computed(() => {
            if (!modelSearchQuery.value.trim()) {
                return openRouterModels.value;
            }
            const query = modelSearchQuery.value.toLowerCase();
            return openRouterModels.value.filter(model => 
                model.toLowerCase().includes(query)
            );
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
            e.target.style.height = Math.min(e.target.scrollHeight, 300) + 'px';
        };

        const handleEnter = (e) => {
            if (e.shiftKey) {
                // Allow default behavior (new line) for Shift+Enter
                return;
            }
            // Prevent default and send for plain Enter (only if not already loading)
            e.preventDefault();
            if (!isLoading.value) {
                sendMessage();
            }
        };

        const getAdapterConfig = () => {
            const backend = settings.value.backend;
            let backendSettings = settings.value[backend];
            
            // Initialize backend-specific settings if they don't exist (e.g., when switching to localopenai)
            if (!backendSettings) {
                console.log(`Initializing ${backend} settings`);
                backendSettings = defaultSettings[backend] || {};
                settings.value[backend] = { ...defaultSettings[backend] };
            }
            
            const config = {
                systemPrompt: settings.value.systemPrompt,
                temperature: settings.value.temperature,
                topP: settings.value.topP,
                maxTokens: (backendSettings && backendSettings.maxTokens) ? backendSettings.maxTokens : settings.value.maxTokens
            };
            
            // Access settings with fallbacks to ensure no undefined errors
            if (backend === 'openai' || backend === 'cerebras' || backend === 'lmstudio' || backend === 'openrouter' || backend === 'localopenai') {
                config.presencePenalty = backendSettings?.presencePenalty ?? 0;
                config.frequencyPenalty = backendSettings?.frequencyPenalty ?? 0;
            }
            
            if (backend === 'claude') {
                config.topK = backendSettings?.topK ?? 40;
            }
            
            if (backend === 'ollama') {
                config.numCtx = backendSettings?.numCtx || 4096;
                config.repeatPenalty = backendSettings?.repeatPenalty ?? 1.1;
                config.repeatLastN = backendSettings?.repeatLastN ?? 64;
            }
            
            // Access settings with fallbacks to ensure no undefined errors
            if (backend === 'openrouter') {
                if (backendSettings?.providerRouting) {
                    config.providerRouting = backendSettings.providerRouting;
                }
                config.enablePromptCaching = backendSettings?.enablePromptCaching || false;
                config.userTracking = backendSettings?.userTracking || null;
            }
            
            return { ...(backendSettings || {}), ...config };
        };

        // Helper: Get model context window size
        const getModelContext = (backend) => {
            const model = backend === 'localopenai'
                ? settings.value[backend]?.modelAlias
                : settings.value[backend]?.model;
            const contextSize = modelContextSizes[backend]?.[model] || modelContextSizes[backend]?.['default'] || 'Unknown';
            return typeof contextSize === 'number' ? contextSize.toLocaleString() : contextSize;
        };

        // Helper: Get max tokens limit for slider
        const getMaxTokensLimit = (backend) => {
            if (backend === 'claude') return 8192;
            
            if (backend === 'openai') {
                const model = settings.value.openai?.model || '';
                if (model.startsWith('o1') || model.startsWith('o3')) return 32768;
                return 16384;
            }
            
            if (backend === 'cerebras') return 8192;
            
            if (backend === 'openrouter') {
                const model = settings.value.openrouter?.model || '';
                if (model.includes('o1') || model.includes('o3')) return 32768;
                if (model.includes('anthropic/claude')) return 8192;
                return providerMaxOutputTokens.openrouter;
            }
            
            if (backend === 'localopenai') {
                return providerMaxOutputTokens.localopenai;
            }
            return 8192;
        };

        const getTokenStep = (backend) => {
            const limit = getMaxTokensLimit(backend);
            return limit >= 16000 ? 512 : 256;
        };

        const formatTokens = (tokens) => {
            if (tokens >= 1000) {
                return `${(tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1)}K`;
            }
            return tokens.toString();
        };

        const updateMaxTokensForModel = (backend) => {
            const model = settings.value[backend]?.model;
            const limit = getMaxTokensLimit(backend);
            const currentTokens = settings.value[backend]?.maxTokens;
            
            if (currentTokens && currentTokens > limit) {
                settings.value[backend].maxTokens = limit;
            }
        };

        const sendMessage = async () => {
            if (!userInput.value.trim() || isLoading.value) return;

            const userMessage = userInput.value.trim();
            messages.value.push({ role: 'user', content: userMessage });
            
            const textareaEl = textarea.value;
            if (textareaEl) textareaEl.style.height = 'auto';
            userInput.value = '';
            
            isLoading.value = true;
            connectionError.value = '';
            
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
                
                nextTick(() => {
                    messages.value[assistantMessageIndex].content = messages.value[assistantMessageIndex].content;
                });

                trimMessages();
                saveChatHistory(messages.value);
            }
        };

        const trimMessages = () => {
            if (messages.value.length > MAX_MESSAGES_IN_MEMORY) {
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
            // Ensure all backend-specific settings exist immediately after loading
            for (const backend of ['openai', 'cerebras', 'ollama', 'claude', 'lmstudio', 'openrouter', 'localopenai']) {
                if (!settings.value[backend]) {
                    console.log(`Initializing missing backend settings in loadSettingsHandler: ${backend}`);
                    settings.value[backend] = { ...defaultSettings[backend] };
                }
            }
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

        // Fetch available models from OpenRouter API
        const fetchOpenRouterModels = async () => {
            if (!settings.value.openrouter.apiKey) {
                alert('Please enter your OpenRouter API key first.');
                return;
            }
            
            isLoadingModels.value = true;
            connectionError.value = '';
            try {
                const response = await fetch('https://openrouter.ai/api/v1/models', {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${settings.value.openrouter.apiKey}`,
                        'HTTP-Referer': window.location.origin || 'https://localhost',
                        'X-Title': 'AI Chat Hub'
                    }
                });
                
                if (!response.ok) {
                    const error = await response.json().catch(() => ({}));
                    throw new Error(error.error?.message || `Failed to fetch models: ${response.status} ${response.statusText}`);
                }
                
                const data = await response.json();
                
                if (data.data && Array.isArray(data.data)) {
                    // Extract model IDs and sort them
                    const fetchedModels = data.data
                        .map(m => m.id)
                        .filter(id => id)
                        .sort();
                    
                    // Logic: Compare, Wipe, Replace
                    const currentModels = openRouterModels.value;
                    const isSame = (a, b) => {
                        return a.length === b.length && a.every((val, index) => val === b[index]);
                    };

                    if (isSame(currentModels, fetchedModels)) {
                        alert('Model list is already up to date.');
                    } else {
                        // Wipe old list and add new ones
                        openRouterModels.value = fetchedModels;
                        
                        // SAVE TO STORAGE USING NEW FUNCTION
                        saveOpenRouterModels(fetchedModels);
                        
                        console.log('Updated model list. Count:', fetchedModels.length);
                        alert(`Successfully fetched and updated ${fetchedModels.length} models from OpenRouter!`);
                        
                        // Auto-select defaults if needed
                        if (!settings.value.openrouter.model || settings.value.openrouter.model === 'anthropic/claude-sonnet-4.5') {
                            if (fetchedModels.length > 0) {
                                settings.value.openrouter.model = fetchedModels[0];
                                saveSettings(settings.value);
                            }
                        }
                    }
                } else {
                    throw new Error('Invalid response format from OpenRouter');
                }
            } catch (error) {
                console.error('Failed to fetch OpenRouter models:', error);
                connectionError.value = `Failed to fetch models: ${error.message}`;
                alert(`Error fetching models: ${error.message}`);
            } finally {
                isLoadingModels.value = false;
            }
        };

        const toggleModelDropdown = () => {
            showModelDropdown.value = !showModelDropdown.value;
            if (showModelDropdown.value) {
                nextTick(() => {
                    if (modelSearchInput.value) modelSearchInput.value.focus();
                });
            }
        };

        const closeModelDropdown = () => {
            showModelDropdown.value = false;
        };

        const selectModel = (modelId) => {
            settings.value.openrouter.model = modelId;
            closeModelDropdown();
            saveSettingsHandler();
        };

        const enableCustomModel = () => {
            if (modelSearchQuery.value.trim()) {
                settings.value.openrouter.model = modelSearchQuery.value.trim();
                closeModelDropdown();
                saveSettingsHandler();
            }
        };

        const applyTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
        };

        const toggleTheme = () => {
            const newTheme = settings.value.theme === 'dark' ? 'light' : 'dark';
            settings.value.theme = newTheme;
            applyTheme(newTheme);
            saveSettings(settings.value);
        };

        const supportsVision = (backend) => {
            const visionModels = {
                openai: ['gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini'],
                claude: ['claude-3', 'claude-3-5'],
                ollama: ['llava', 'bakllava', 'moondream'],
                localopenai: ['gpt-4o', 'gpt-4-turbo', 'gpt-4o-mini', 'llava', 'bakllava', 'moondream']
            };
            
            if (!visionModels[backend]) return false;
            
            const model = settings.value[backend]?.model || settings.value[backend]?.modelAlias || '';
            return visionModels[backend].some(vm => model.toLowerCase().includes(vm.toLowerCase()));
        };

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
                    messageElements[index].style.transition = 'background-color 0.3s';
                    const originalBg = messageElements[index].style.backgroundColor;
                    messageElements[index].style.backgroundColor = 'var(--accent-primary)';
                    setTimeout(() => {
                        messageElements[index].style.backgroundColor = originalBg;
                    }, 1000);
                }
            });
        };

        // Session Management
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
            if (currentSessionId.value) {
                saveCurrentSession();
            }
            
            const newSession = createSession([]);
            sessions.value.push(newSession);
            currentSessionId.value = newSession.id;
            messages.value = [];
            
            saveSessions(sessions.value);
            saveCurrentSessionId(newSession.id);
            
            if (window.innerWidth < 1024) {
                sidebarCollapsed.value = true;
            }
        };

        const switchToSession = (sessionId) => {
            if (sessionId === currentSessionId.value) return;
            
            saveCurrentSession();
            
            const session = getSessionById(sessions.value, sessionId);
            if (session) {
                currentSessionId.value = sessionId;
                messages.value = [...session.messages];
                saveCurrentSessionId(sessionId);
            }
            
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
            
            if (currentSessionId.value === session.id) {
                if (sessions.value.length > 0) {
                    switchToSession(sessions.value[sessions.value.length - 1].id);
                } else {
                    createNewSession();
                }
            }
            
            saveSessions(sessions.value);
        };

        const handleGlobalKeydown = (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                sendMessage();
            }
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
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'K') {
                e.preventDefault();
                if (textarea.value) {
                    textarea.value.focus();
                }
            }
            if ((e.metaKey || e.ctrlKey) && e.key === '/') {
                e.preventDefault();
                showSettings.value = !showSettings.value;
            }
            if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                const activeElement = document.activeElement;
                if (activeElement && activeElement.tagName !== 'INPUT' && activeElement.tagName !== 'TEXTAREA') {
                    e.preventDefault();
                    showHelp.value = !showHelp.value;
                }
            }
        };

        onMounted(() => {
            loadSettingsHandler();
            
            // Ensure all backend-specific settings exist (for backwards compatibility with new backends)
            const currentBackend = settings.value.backend;
            for (const backend of ['openai', 'cerebras', 'ollama', 'claude', 'lmstudio', 'openrouter', 'localopenai']) {
                if (!settings.value[backend]) {
                    console.log(`Initializing missing backend settings: ${backend}`);
                    settings.value[backend] = { ...defaultSettings[backend] };
                }
            }
            // Force reactivity update for current backend
            if (currentBackend === 'localopenai' && settings.value.localopenai) {
                console.log('Local OpenAI settings initialized:', settings.value.localopenai);
            }
            
            // LOAD MODELS FROM STORAGE ON STARTUP
            const cachedModels = loadOpenRouterModels();
            if (cachedModels && cachedModels.length > 0) {
                openRouterModels.value = cachedModels;
            } else {
                openRouterModels.value = defaultOpenRouterModels;
            }
            
            sessions.value = loadSessions();
            const savedSessionId = loadCurrentSessionId();
            
            const oldHistory = loadChatHistory();
            if (oldHistory.length > 0 && sessions.value.length === 0) {
                const migratedSession = createSession(oldHistory);
                sessions.value.push(migratedSession);
                currentSessionId.value = migratedSession.id;
                messages.value = [...oldHistory];
                saveSessions(sessions.value);
                saveCurrentSessionId(migratedSession.id);
            } else if (savedSessionId && getSessionById(sessions.value, savedSessionId)) {
                currentSessionId.value = savedSessionId;
                const session = getSessionById(sessions.value, savedSessionId);
                messages.value = [...session.messages];
            } else if (sessions.value.length > 0) {
                const mostRecent = sessions.value.sort((a, b) => b.updatedAt - a.updatedAt)[0];
                currentSessionId.value = mostRecent.id;
                messages.value = [...mostRecent.messages];
            } else {
                createNewSession();
            }
            
            applyTheme(settings.value.theme || 'dark');
            
            document.addEventListener('keydown', handleGlobalKeydown);
            
            document.addEventListener('click', (e) => {
                const sidebar = document.querySelector('aside');
                const toggleBtn = document.querySelector('[title="Toggle Sidebar"]');
                if (sidebar && !sidebar.contains(e.target) && toggleBtn && !toggleBtn.contains(e.target)) {
                    sidebarCollapsed.value = true;
                }
            });
        });

        watch(() => settings.value.stream, () => {
            saveSettings(settings.value);
        });

        watch(() => settings.value.backend, () => {
            // Ensure the backend-specific settings exist
            if (!settings.value[settings.value.backend]) {
                settings.value[settings.value.backend] = { ...defaultSettings[settings.value.backend] };
            }
        }, { immediate: true });

        watch(messages, () => {
            debouncedAutoSave();
        }, { deep: true });

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
            getModelContext,
            getMaxTokensLimit,
            getTokenStep,
            formatTokens,
            updateMaxTokensForModel,
            showSearch,
            searchQuery,
            searchResults,
            hasSearched,
            searchInput,
            performSearch,
            highlightMatch,
            jumpToMessage,
            supportsVision,
            visionSupported,
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
            deleteSessionHandler,
            // OpenRouter Exports
            fetchOpenRouterModels,
            isLoadingModels,
            openRouterModels,
            modelSearchQuery,
            filteredOpenRouterModels,
            showModelDropdown,
            modelSearchInput,
            toggleModelDropdown,
            closeModelDropdown,
            selectModel,
            enableCustomModel
        };
    }
}).mount('#app');