/**
 * ChatHub Bundle - All modules combined for file:// protocol compatibility
 * This is a bundled version that doesn't use ES6 modules
 */

// ============================================
// ADAPTER FACTORY & BASE CLASSES
// ============================================

class BaseAdapter {
    constructor(config) {
        this.config = config;
    }

    async stream(messages, onChunk, signal) {
        throw new Error('stream() must be implemented by subclass');
    }

    async send(messages) {
        throw new Error('send() must be implemented by subclass');
    }

    buildRequestBody(messages, stream = false) {
        throw new Error('buildRequestBody() must be implemented by subclass');
    }

    getEndpoint() {
        throw new Error('getEndpoint() must be implemented by subclass');
    }

    getHeaders() {
        throw new Error('getHeaders() must be implemented by subclass');
    }

    extractContent(data) {
        throw new Error('extractContent() must be implemented by subclass');
    }

    async handleError(response) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || data.error || 'API error');
    }
}

// ============================================
// STREAM READERS
// ============================================

async function readStream(response, onChunk, onError) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || trimmedLine === 'data: [DONE]') continue;
                
                if (trimmedLine.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(trimmedLine.slice(6));
                        onChunk(data);
                    } catch (e) {
                        console.error('Parse error:', e);
                    }
                }
            }
        }
    } catch (error) {
        onError(error);
    }
}

async function readOllamaStream(response, onChunk, onError) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const data = JSON.parse(line);
                    onChunk(data);
                } catch (e) {
                    console.error('Parse error:', e);
                }
            }
        }
    } catch (error) {
        onError(error);
    }
}

async function readClaudeStream(response, onChunk, onError) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');

            for (const line of lines) {
                const trimmedLine = line.trim();
                if (!trimmedLine || !trimmedLine.startsWith('data: ')) continue;
                
                try {
                    const data = JSON.parse(trimmedLine.slice(6));
                    if (data.type === 'content_block_delta' && data.delta?.text) {
                        onChunk(data.delta.text);
                    }
                } catch (e) {
                    console.error('Parse error:', e);
                }
            }
        }
    } catch (error) {
        onError(error);
    }
}

// ============================================
// BACKEND ADAPTERS
// ============================================

class OpenAIAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.systemPrompt = config.systemPrompt || 'You are a helpful assistant.';
        this.temperature = Number(config.temperature) ?? 0.7;
        this.maxTokens = Number(config.maxTokens) ?? 4096;
        this.topP = Number(config.topP) ?? 1.0;
        this.presencePenalty = Number(config.presencePenalty) ?? 0;
        this.frequencyPenalty = Number(config.frequencyPenalty) ?? 0;
        this.images = config.images || [];
    }

    getEndpoint() {
        return `${this.baseUrl}/chat/completions`;
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
        };
    }

    buildRequestBody(messages, stream = false) {
        // Format messages for vision API if images are present
        const formattedMessages = messages.map(msg => {
            if (msg.role === 'user' && this.images.length > 0) {
                const content = [
                    { type: 'text', text: msg.content }
                ];
                this.images.forEach(img => {
                    content.push({
                        type: 'image_url',
                        image_url: { url: img }
                    });
                });
                return { role: msg.role, content };
            }
            return msg;
        });
        
        const body = {
            model: this.model,
            messages: [{ role: 'system', content: this.systemPrompt }, ...formattedMessages],
            temperature: this.temperature,
            top_p: this.topP,
            stream
        };
        
        // Only include max_tokens if greater than 0
        if (this.maxTokens > 0) {
            body.max_tokens = this.maxTokens;
        }
        
        if (this.presencePenalty !== 0) body.presence_penalty = this.presencePenalty;
        if (this.frequencyPenalty !== 0) body.frequency_penalty = this.frequencyPenalty;
        
        if (this.model && (this.model.startsWith('o1') || this.model.startsWith('o3'))) {
            delete body.temperature;
            delete body.top_p;
        }
        
        return body;
    }

    extractContent(data) {
        return data.choices?.[0]?.message?.content || 'No response';
    }

    async stream(messages, onChunk, signal) {
        const response = await fetch(this.getEndpoint(), {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(this.buildRequestBody(messages, true)),
            signal
        });

        if (!response.ok) {
            await this.handleError(response);
        }

        await readStream(response, (data) => {
            const content = data.choices?.[0]?.delta?.content;
            if (content) {
                onChunk(content);
            }
        }, (error) => {
            throw error;
        });
    }

    async send(messages) {
        const response = await fetch(this.getEndpoint(), {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(this.buildRequestBody(messages, false))
        });

        if (!response.ok) {
            await this.handleError(response);
        }

        const data = await response.json();
        return this.extractContent(data);
    }
}

class CerebrasAdapter extends OpenAIAdapter {
    constructor(config) {
        super({
            ...config,
            baseUrl: config.baseUrl || 'https://api.cerebras.ai/v1'
        });
    }

    async handleError(response) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Cerebras API error');
    }
}

class OllamaAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.host = config.host || 'http://localhost:11434';
        this.model = config.model || 'llama3';
        this.systemPrompt = config.systemPrompt || 'You are a helpful assistant.';
        this.temperature = Number(config.temperature) ?? 0.7;
        this.maxTokens = Number(config.maxTokens) ?? 4096;
        this.topP = Number(config.topP) ?? 1.0;
        this.numCtx = Number(config.numCtx) || 4096;
        this.repeatPenalty = Number(config.repeatPenalty) ?? 1.1;
        this.repeatLastN = Number(config.repeatLastN) ?? 64;
        this.images = config.images || [];
    }

    getEndpoint() {
        return `${this.host}/api/chat`;
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json'
        };
    }

    buildRequestBody(messages, stream = false) {
        const options = {
            temperature: this.temperature,
            top_p: this.topP,
            num_ctx: this.numCtx,
            repeat_penalty: this.repeatPenalty,
            repeat_last_n: this.repeatLastN
        };
        
        // Only include num_predict if max tokens is greater than 0
        if (this.maxTokens > 0) {
            options.num_predict = this.maxTokens;
        }
        
        // Add images to the last user message if present
        const formattedMessages = messages.map((msg, index) => {
            if (msg.role === 'user' && index === messages.length - 1 && this.images.length > 0) {
                return {
                    ...msg,
                    images: this.images.map(img => img.split(',')[1]) // Extract base64
                };
            }
            return msg;
        });
        
        return {
            model: this.model,
            messages: [{ role: 'system', content: this.systemPrompt }, ...formattedMessages],
            stream,
            options
        };
    }

    extractContent(data) {
        return data.message?.content || data.response || 'No response';
    }

    async stream(messages, onChunk, signal) {
        const response = await fetch(this.getEndpoint(), {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(this.buildRequestBody(messages, true)),
            signal
        });

        if (!response.ok) {
            await this.handleError(response);
        }

        await readOllamaStream(response, (data) => {
            const content = data.message?.content;
            if (content) {
                onChunk(content);
            }
        }, (error) => {
            throw error;
        });
    }

    async send(messages) {
        const response = await fetch(this.getEndpoint(), {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(this.buildRequestBody(messages, false))
        });

        if (!response.ok) {
            await this.handleError(response);
        }

        const data = await response.json();
        return this.extractContent(data);
    }

    async handleError(response) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Ollama error');
    }
}

class ClaudeAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.systemPrompt = config.systemPrompt || 'You are a helpful assistant.';
        this.temperature = Number(config.temperature) ?? 0.7;
        this.maxTokens = Number(config.maxTokens) ?? 4096;
        this.topP = Number(config.topP) ?? 1.0;
        this.topK = Number(config.topK) ?? 40;
        this.images = config.images || [];
    }

    getEndpoint() {
        return 'https://api.anthropic.com/v1/messages';
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': '2023-06-01'
        };
    }

    buildRequestBody(messages, stream = false) {
        // Format messages for vision API if images are present
        const formattedMessages = messages.map(msg => {
            if (msg.role === 'user' && this.images.length > 0) {
                const content = [
                    { type: 'text', text: msg.content }
                ];
                this.images.forEach(img => {
                    // Extract base64 data from data URL
                    const base64Data = img.split(',')[1];
                    const mediaType = img.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
                    content.push({
                        type: 'image',
                        source: {
                            type: 'base64',
                            media_type: mediaType,
                            data: base64Data
                        }
                    });
                });
                return { role: msg.role, content };
            }
            return msg;
        });
        
        const body = {
            model: this.model,
            system: this.systemPrompt,
            messages: formattedMessages,
            temperature: this.temperature,
            top_p: this.topP,
            stream
        };
        
        // Only include max_tokens if greater than 0
        if (this.maxTokens > 0) {
            body.max_tokens = this.maxTokens;
        }
        
        if (this.topK !== 40) body.top_k = this.topK;
        
        return body;
    }

    extractContent(data) {
        return data.content?.[0]?.text || 'No response';
    }

    async stream(messages, onChunk, signal) {
        const response = await fetch(this.getEndpoint(), {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(this.buildRequestBody(messages, true)),
            signal
        });

        if (!response.ok) {
            await this.handleError(response);
        }

        await readClaudeStream(response, (content) => {
            if (typeof content === 'string') {
                onChunk(content);
            }
        }, (error) => {
            throw error;
        });
    }

    async send(messages) {
        const response = await fetch(this.getEndpoint(), {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(this.buildRequestBody(messages, false))
        });

        if (!response.ok) {
            await this.handleError(response);
        }

        const data = await response.json();
        return this.extractContent(data);
    }

    async handleError(response) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || 'Claude API error');
    }
}

class LMStudioAdapter extends OpenAIAdapter {
    constructor(config) {
        super({
            ...config,
            baseUrl: `${config.host || 'http://localhost:1234'}/v1`,
            apiKey: ''
        });
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json'
        };
    }

    async handleError(response) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'LM Studio error');
    }
}

class OpenRouterAdapter extends OpenAIAdapter {
    constructor(config) {
        super(config);
        this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.systemPrompt = config.systemPrompt || 'You are a helpful assistant.';
        this.temperature = Number(config.temperature) ?? 0.7;
        this.maxTokens = Number(config.maxTokens) ?? 4096;
        this.topP = Number(config.topP) ?? 1.0;
        this.presencePenalty = Number(config.presencePenalty) ?? 0;
        this.frequencyPenalty = Number(config.frequencyPenalty) ?? 0;
        this.providerRouting = config.providerRouting || null;
        this.enablePromptCaching = config.enablePromptCaching || false;
        this.userTracking = config.userTracking || null;
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': window.location.origin || 'https://localhost',
            'X-Title': 'AI Chat Hub'
        };
        
        if (this.providerRouting) {
            headers['OpenRouter-Provider-Routing'] = this.providerRouting;
        }
        
        return headers;
    }

    buildRequestBody(messages, stream = false) {
        const body = super.buildRequestBody(messages, stream);
        
        if (this.userTracking) {
            body.user = this.userTracking;
        }
        
        return body;
    }

    async handleError(response) {
        const data = await response.json().catch(() => ({}));
        
        if (response.status === 401) {
            throw new Error('Invalid OpenRouter API key. Please check your settings.');
        }
        if (response.status === 429) {
            throw new Error('OpenRouter rate limit exceeded. Please try again later.');
        }
        if (response.status === 402) {
            throw new Error('OpenRouter account balance insufficient. Please add credits.');
        }
        
        // Provide detailed error message from OpenRouter
        if (data.error?.message) {
            throw new Error(`OpenRouter error: ${data.error.message}`);
        }
        if (data.message) {
            throw new Error(`OpenRouter error: ${data.message}`);
        }
        if (data.error) {
            throw new Error(`OpenRouter error: ${typeof data.error === 'string' ? data.error : JSON.stringify(data.error)}`);
        }
        
        await super.handleError(response);
    }
}

// Adapter Factory
function createAdapter(backend, config) {
    switch (backend) {
        case 'openai':
            return new OpenAIAdapter(config);
        case 'cerebras':
            return new CerebrasAdapter(config);
        case 'ollama':
            return new OllamaAdapter(config);
        case 'claude':
            return new ClaudeAdapter(config);
        case 'lmstudio':
            return new LMStudioAdapter(config);
        case 'openrouter':
            return new OpenRouterAdapter(config);
        default:
            throw new Error(`Unknown backend: ${backend}`);
    }
}

function getBackendLabel(backend) {
    const labels = {
        openai: 'OpenAI',
        cerebras: 'Cerebras',
        ollama: 'Ollama',
        claude: 'Claude',
        lmstudio: 'LM Studio',
        openrouter: 'OpenRouter'
    };
    return labels[backend] || 'Unknown';
}

// ============================================
// UTILITIES
// ============================================

function renderMarkdown(content) {
    if (!content || typeof content !== 'string') {
        return '<p>' + (content || '') + '</p>';
    }

    try {
        const renderer = new marked.Renderer();
        
        renderer.code = function(codeOrObj, language, escaped) {
            let code, lang;
            
            if (typeof codeOrObj === 'object' && codeOrObj !== null) {
                code = codeOrObj.text || '';
                lang = codeOrObj.lang || '';
            } else {
                code = codeOrObj || '';
                lang = language || '';
            }
            
            const codeStr = typeof code === 'string' ? code : String(code || '');
            const langStr = typeof lang === 'string' ? lang : 'plaintext';
            const displayLang = langStr || 'code';
            
            try {
                const highlighted = hljs.highlight(codeStr, { language: langStr }).value;
                return `<div class="code-block-wrapper">
                    <div class="code-header">
                        <span class="code-language">${displayLang}</span>
                        <button class="copy-btn" onclick="window.copyCode(this)">Copy</button>
                    </div>
                    <pre><code class="hljs language-${langStr}">${highlighted}</code></pre>
                </div>`;
            } catch (e) {
                const escaped = codeStr.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
                return `<div class="code-block-wrapper">
                    <div class="code-header">
                        <span class="code-language">${displayLang}</span>
                        <button class="copy-btn" onclick="window.copyCode(this)">Copy</button>
                    </div>
                    <pre><code class="language-${langStr}">${escaped}</code></pre>
                </div>`;
            }
        };

        renderer.blockquote = function(text) {
            // Handle both string and object inputs from marked.js
            const textStr = typeof text === 'string' ? text : (text?.text || String(text || ''));
            return `<blockquote>${textStr}</blockquote>`;
        };

        renderer.heading = function(text, level, raw) {
            const textStr = typeof text === 'string' ? text : (text?.text || String(text || ''));
            return `<h${level}>${textStr}</h${level}>`;
        };

        renderer.hr = function() {
            return '<hr>';
        };

        renderer.table = function(header, body) {
            const headerStr = typeof header === 'string' ? header : String(header || '');
            const bodyStr = typeof body === 'string' ? body : String(body || '');
            return `<table><thead>${headerStr}</thead><tbody>${bodyStr}</tbody></table>`;
        };

        marked.setOptions({ 
            renderer,
            breaks: true,
            gfm: true
        });
        
        return marked.parse(content);
    } catch (error) {
        console.error('Markdown render error:', error);
        return `<p>${content.replace(/</g, '<').replace(/>/g, '>')}</p>`;
    }
}

async function copyCode(btn) {
    try {
        const wrapper = btn.closest('.code-block-wrapper');
        if (!wrapper) {
            console.error('Could not find code block wrapper');
            return;
        }
        const codeElement = wrapper.querySelector('code');
        if (!codeElement) {
            console.error('Could not find code element');
            return;
        }
        const code = codeElement.textContent;
        await navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
        }, 2000);
    } catch (e) {
        console.error('Copy failed:', e);
        // Fallback for non-secure contexts
        try {
            const textArea = document.createElement('textarea');
            textArea.value = btn.closest('.code-block-wrapper').querySelector('code').textContent;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            btn.textContent = 'Copied!';
            setTimeout(() => {
                btn.textContent = 'Copy';
            }, 2000);
        } catch (fallbackError) {
            console.error('Fallback copy also failed:', fallbackError);
            btn.textContent = 'Failed';
            setTimeout(() => {
                btn.textContent = 'Copy';
            }, 2000);
        }
    }
}

// Make copyCode available globally for onclick handlers
window.copyCode = copyCode;

const SETTINGS_KEY = 'chatHubSettings';
const CHAT_HISTORY_KEY = 'chatHubHistory';
const OPENROUTER_MODELS_KEY = 'chatHubOpenRouterModels';
const MAX_MESSAGES_IN_MEMORY = 50;

function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
        console.error('Failed to save settings:', e);
    }
}

function loadSettings(defaultSettings) {
    try {
        const saved = localStorage.getItem(SETTINGS_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
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

function saveChatHistory(messages) {
    try {
        const maxMessages = 100;
        const limitedMessages = messages.slice(-maxMessages);
        localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(limitedMessages));
    } catch (e) {
        console.error('Failed to save chat history:', e);
    }
}

function loadChatHistory() {
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

function clearChatHistory() {
    try {
        localStorage.removeItem(CHAT_HISTORY_KEY);
    } catch (e) {
        console.error('Failed to clear chat history:', e);
    }
}

// ============================================
// MAIN VUE APPLICATION
// ============================================

// Lazy Loader for external libraries
const LibraryLoader = {
    loaded: {},
    
    async loadScript(src, globalVar) {
        if (this.loaded[src]) return;
        if (globalVar && typeof window[globalVar] !== 'undefined') return;
        
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = () => {
                this.loaded[src] = true;
                resolve();
            };
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });
    },
    
    async loadPDFJS() {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
    },
    
    async loadMammoth() {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js', 'mammoth');
    },
    
    async loadXLSX() {
        await this.loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js', 'XLSX');
    },
    
    async loadTesseract() {
        await this.loadScript('https://unpkg.com/tesseract.js@4.1.1/dist/tesseract.min.js', 'Tesseract');
    }
};

// Document Parser Class
class DocumentParser {
    constructor() {
        this.maxFileSize = 50 * 1024 * 1024; // 50MB
        this.supportedTypes = {
            // Text files
            'txt': 'text',
            'md': 'text',
            'markdown': 'text',
            'csv': 'text',
            'json': 'text',
            'xml': 'text',
            // Code files
            'js': 'code',
            'ts': 'code',
            'jsx': 'code',
            'tsx': 'code',
            'py': 'code',
            'php': 'code',
            'java': 'code',
            'cpp': 'code',
            'c': 'code',
            'h': 'code',
            'cs': 'code',
            'go': 'code',
            'rs': 'code',
            'rb': 'code',
            'swift': 'code',
            'kt': 'code',
            'scala': 'code',
            'r': 'code',
            'm': 'code',
            'mm': 'code',
            'sql': 'code',
            'sh': 'code',
            'bash': 'code',
            'zsh': 'code',
            'ps1': 'code',
            'html': 'code',
            'htm': 'code',
            'css': 'code',
            'scss': 'code',
            'sass': 'code',
            'less': 'code',
            'vue': 'code',
            'svelte': 'code',
            // Documents
            'pdf': 'pdf',
            'docx': 'docx',
            // Spreadsheets
            'xlsx': 'excel',
            'xls': 'excel',
            // Images
            'jpg': 'image',
            'jpeg': 'image',
            'png': 'image',
            'gif': 'image',
            'webp': 'image',
            'bmp': 'image',
            'svg': 'image'
        };
    }

    getFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        return this.supportedTypes[ext] || 'unknown';
    }

    getFileIcon(type, ext) {
        const icons = {
            text: '📄',
            code: '💻',
            pdf: '📑',
            docx: '📝',
            excel: '📊',
            image: '🖼️',
            unknown: '📎'
        };
        return icons[type] || icons.unknown;
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async parse(file) {
        const type = this.getFileType(file.name);
        
        if (file.size > this.maxFileSize) {
            throw new Error(`File too large. Max size: ${this.formatFileSize(this.maxFileSize)}`);
        }

        switch (type) {
            case 'text':
            case 'code':
                return this.parseText(file);
            case 'pdf':
                return this.parsePDF(file);
            case 'docx':
                return this.parseDocx(file);
            case 'excel':
                return this.parseExcel(file);
            case 'image':
                return this.parseImage(file);
            default:
                throw new Error(`Unsupported file type: ${file.name}`);
        }
    }

    parseText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    type: 'text',
                    name: file.name,
                    content: e.target.result,
                    icon: this.getFileIcon('text'),
                    size: this.formatFileSize(file.size)
                });
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(file);
        });
    }

    async parsePDF(file) {
        if (typeof pdfjsLib === 'undefined') {
            await LibraryLoader.loadPDFJS();
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `\n--- Page ${i} ---\n${pageText}`;
        }

        return {
            type: 'pdf',
            name: file.name,
            content: fullText.trim(),
            icon: this.getFileIcon('pdf'),
            size: this.formatFileSize(file.size),
            pages: pdf.numPages
        };
    }

    async parseDocx(file) {
        if (typeof mammoth === 'undefined') {
            await LibraryLoader.loadMammoth();
        }

        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });

        return {
            type: 'docx',
            name: file.name,
            content: result.value,
            icon: this.getFileIcon('docx'),
            size: this.formatFileSize(file.size)
        };
    }

    async parseExcel(file) {
        if (typeof XLSX === 'undefined') {
            await LibraryLoader.loadXLSX();
        }

        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        let fullText = '';
        workbook.SheetNames.forEach(sheetName => {
            const worksheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_csv(worksheet);
            fullText += `\n--- Sheet: ${sheetName} ---\n${data}`;
        });

        return {
            type: 'excel',
            name: file.name,
            content: fullText.trim(),
            icon: this.getFileIcon('excel'),
            size: this.formatFileSize(file.size),
            sheets: workbook.SheetNames.length
        };
    }

    parseImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                resolve({
                    type: 'image',
                    name: file.name,
                    content: null,
                    dataUrl: e.target.result,
                    icon: this.getFileIcon('image'),
                    size: this.formatFileSize(file.size),
                    preview: e.target.result
                });
            };
            reader.onerror = () => reject(new Error('Failed to read image'));
            reader.readAsDataURL(file);
        });
    }

    async performOCR(imageDataUrl) {
        if (typeof Tesseract === 'undefined') {
            await LibraryLoader.loadTesseract();
        }

        const result = await Tesseract.recognize(
            imageDataUrl,
            'eng',
            { logger: () => {} }
        );

        return result.data.text;
    }
}

// Session Management Functions (copied from storage.js for bundle)
const SESSIONS_KEY = 'chatHubSessions';
const CURRENT_SESSION_KEY = 'chatHubCurrentSession';

function generateSessionId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateSessionTitle(messages) {
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (firstUserMessage) {
        const text = firstUserMessage.content.replace(/\n/g, ' ').slice(0, 40);
        return text.length > 40 ? text + '...' : text || 'New Chat';
    }
    return 'New Chat';
}

function createSession(messages = []) {
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

function saveSessions(sessions) {
    try {
        const limitedSessions = sessions.slice(-50);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(limitedSessions));
    } catch (e) {
        console.error('Failed to save sessions:', e);
    }
}

function loadSessions() {
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

function updateSession(sessions, sessionId, updates) {
    const index = sessions.findIndex(s => s.id === sessionId);
    if (index === -1) return sessions;
    
    const session = sessions[index];
    const updatedSession = {
        ...session,
        ...updates,
        updatedAt: Date.now()
    };
    
    if (updates.messages) {
        updatedSession.metadata = {
            messageCount: updates.messages.length,
            hasImages: updates.messages.some(m => m.attachments?.some(a => a.type === 'image')),
            previewText: updates.messages[0]?.content?.slice(0, 100) || ''
        };
        if (updatedSession.title === 'New Chat' && updates.messages.length > 0) {
            updatedSession.title = generateSessionTitle(updates.messages);
        }
    }
    
    const newSessions = [...sessions];
    newSessions[index] = updatedSession;
    return newSessions;
}

function deleteSession(sessions, sessionId) {
    return sessions.filter(s => s.id !== sessionId);
}

function saveCurrentSessionId(sessionId) {
    try {
        localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
    } catch (e) {
        console.error('Failed to save current session:', e);
    }
}

function loadCurrentSessionId() {
    try {
        return localStorage.getItem(CURRENT_SESSION_KEY);
    } catch (e) {
        console.error('Failed to load current session:', e);
    }
    return null;
}

function getSessionById(sessions, sessionId) {
    return sessions.find(s => s.id === sessionId) || null;
}

const defaultSettings = {
    backend: 'openai',
    theme: 'dark',
    systemPrompt: 'You are a helpful coding assistant. You provide clear, well-commented code examples and explanations.',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0,
    stream: true,
    tts: {
        autoRead: false,
        rate: 1.0,
        pitch: 1.0,
        voice: '',
        engine: 'auto'
    },
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
    }
};

// Model context window sizes (in tokens)
const modelContextSizes = {
    openai: {
        'gpt-4o': 128000, 'gpt-4o-mini': 128000, 'gpt-4o-2024-11-20': 128000, 'gpt-4o-2024-08-06': 128000,
        'gpt-4-turbo': 128000, 'gpt-4-turbo-preview': 128000, 'gpt-4-0125-preview': 128000, 'gpt-4-1106-preview': 128000,
        'gpt-4': 8192,
        'gpt-3.5-turbo': 16385, 'gpt-3.5-turbo-0125': 16385, 'gpt-3.5-turbo-1106': 16385,
        'o1': 200000, 'o1-mini': 128000, 'o1-preview': 128000, 'o3-mini': 200000
    },
    cerebras: {
        'llama-3.3-70b': 128000, 'llama-3.1-70b': 128000, 'llama-3.1-8b': 128000,
        'llama-3-70b': 8192, 'llama-3-8b': 8192, 'zai-glm-4.7': 8192
    },
    claude: {
        'claude-3-5-sonnet-20241022': 200000, 'claude-3-5-sonnet-latest': 200000,
        'claude-3-opus-20240229': 200000, 'claude-3-sonnet-20240229': 200000, 'claude-3-haiku-20240307': 200000
    }
};

Vue.createApp({
    setup() {
        const messages = Vue.ref([]);
        const userInput = Vue.ref('');
        const isLoading = Vue.ref(false);
        const showSettings = Vue.ref(false);
        const messagesContainer = Vue.ref(null);
        const textarea = Vue.ref(null);
        const connectionError = Vue.ref('');
        const testingConnection = Vue.ref(false);
        const abortController = Vue.ref(null);
        const settings = Vue.ref({ ...defaultSettings });
        const activeTab = Vue.ref('general');
        const showHelp = Vue.ref(false);
        
        // Search functionality
        const showSearch = Vue.ref(false);
        const searchQuery = Vue.ref('');
        const searchResults = Vue.ref([]);
        const hasSearched = Vue.ref(false);
        const searchInput = Vue.ref(null);
        
        // Session management
        const sessions = Vue.ref([]);
        const currentSessionId = Vue.ref(null);
        const sidebarCollapsed = Vue.ref(true); // Default collapsed
        const sessionMenu = Vue.ref({ show: false, x: 0, y: 0, session: null });
        const showRenameModal = Vue.ref(false);
        const renameValue = Vue.ref('');
        const renameInput = Vue.ref(null);
        const sessionToRename = Vue.ref(null);
        let autoSaveTimeout = null;
        const isLoadingModels = Vue.ref(false);
        const openRouterModels = Vue.ref([]);
        const modelSearchQuery = Vue.ref('');
        const showModelDropdown = Vue.ref(false);
        const modelSearchInput = Vue.ref(null);
        
        // File handling
        const attachments = Vue.ref([]);
        const isDragging = Vue.ref(false);
        const fileInput = Vue.ref(null);
        const documentParser = new DocumentParser();
        
        // TTS
        const ttsEnabled = Vue.ref(false);
        const availableVoices = Vue.ref([]);
        const ttsStatus = Vue.ref('loading');
        const currentTTSEngine = Vue.ref('');
        const kokoroLoading = Vue.ref(false);
        const showKokoroLoadButton = Vue.ref(false);
        let kokoroTTS = null;
        let kokoroAudioContext = null;
        
        // Message hover tracking for floating action buttons
        const hoveredMessageIndex = Vue.ref(null);
        const hoveredMessage = Vue.computed(() => {
            if (hoveredMessageIndex.value === null) return null;
            return messages.value[hoveredMessageIndex.value];
        });

        const currentBackendLabel = Vue.computed(() => {
            return getBackendLabel(settings.value.backend);
        });

        const sortedSessions = Vue.computed(() => {
            return [...sessions.value].sort((a, b) => b.updatedAt - a.updatedAt);
        });

        const filteredOpenRouterModels = Vue.computed(() => {
            if (!modelSearchQuery.value.trim()) {
                return openRouterModels.value;
            }
            const query = modelSearchQuery.value.toLowerCase();
            return openRouterModels.value.filter(model =>
                model.toLowerCase().includes(query)
            );
        });

        const scrollToBottom = () => {
            Vue.nextTick(() => {
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
            
            const config = {
                systemPrompt: settings.value.systemPrompt,
                temperature: settings.value.temperature,
                topP: settings.value.topP,
                maxTokens: backendSettings.maxTokens != null ? backendSettings.maxTokens : settings.value.maxTokens
            };
            
            if (backend === 'openai' || backend === 'cerebras' || backend === 'lmstudio' || backend === 'openrouter') {
                config.presencePenalty = backendSettings.presencePenalty != null ? backendSettings.presencePenalty : 0;
                config.frequencyPenalty = backendSettings.frequencyPenalty != null ? backendSettings.frequencyPenalty : 0;
            }
            
            if (backend === 'claude') {
                config.topK = backendSettings.topK != null ? backendSettings.topK : 40;
            }
            
            if (backend === 'ollama') {
                config.numCtx = backendSettings.numCtx || 4096;
                config.repeatPenalty = backendSettings.repeatPenalty != null ? backendSettings.repeatPenalty : 1.1;
                config.repeatLastN = backendSettings.repeatLastN != null ? backendSettings.repeatLastN : 64;
            }
            
            if (backend === 'openrouter') {
                config.enablePromptCaching = backendSettings.enablePromptCaching || false;
                config.userTracking = backendSettings.userTracking || null;
            }
            
            return { ...backendSettings, ...config };
        };

        // Helper: Get model context window size
        const getModelContext = (backend) => {
            const model = settings.value[backend]?.model;
            const contextSize = modelContextSizes[backend]?.[model];
            return contextSize ? contextSize.toLocaleString() : 'Unknown';
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
            return 8192;
        };

        // Helper: Get token step size for slider
        const getTokenStep = (backend) => {
            return getMaxTokensLimit(backend) >= 16000 ? 512 : 256;
        };

        // Helper: Format token numbers
        const formatTokens = (tokens) => {
            if (tokens >= 1000) {
                return (tokens / 1000).toFixed(tokens >= 10000 ? 0 : 1) + 'K';
            }
            return tokens.toString();
        };

        // Helper: Update max tokens when model changes
        const updateMaxTokensForModel = (backend) => {
            const limit = getMaxTokensLimit(backend);
            const currentTokens = settings.value[backend]?.maxTokens;
            if (currentTokens && currentTokens > limit) {
                settings.value[backend].maxTokens = limit;
            }
        };

        // File handling methods
        const handleFileSelect = async (event) => {
            const files = Array.from(event.target.files);
            await processFiles(files);
            event.target.value = ''; // Reset input
        };

        const processFiles = async (files) => {
            for (const file of files) {
                try {
                    const parsed = await documentParser.parse(file);
                    attachments.value.push(parsed);
                } catch (error) {
                    console.error('Error parsing file:', error);
                    connectionError.value = `Error parsing ${file.name}: ${error.message}`;
                }
            }
        };

        const removeAttachment = (index) => {
            attachments.value.splice(index, 1);
        };

        const handlePaste = async (event) => {
            const items = event.clipboardData.items;
            const files = [];
            
            for (const item of items) {
                if (item.type.indexOf('image') !== -1) {
                    const file = item.getAsFile();
                    if (file) files.push(file);
                }
            }
            
            if (files.length > 0) {
                event.preventDefault();
                await processFiles(files);
            }
        };

        // Drag and drop handlers
        const setupDragAndDrop = () => {
            document.addEventListener('dragenter', (e) => {
                e.preventDefault();
                isDragging.value = true;
            });
            
            document.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            
            document.addEventListener('dragleave', (e) => {
                e.preventDefault();
                if (e.relatedTarget === null) {
                    isDragging.value = false;
                }
            });
            
            document.addEventListener('drop', async (e) => {
                e.preventDefault();
                isDragging.value = false;
                
                const files = Array.from(e.dataTransfer.files);
                if (files.length > 0) {
                    await processFiles(files);
                }
            });
        };

        // TTS methods
        const loadVoices = () => {
            const engine = settings.value.tts?.engine || 'auto';
            
            // If Kokoro is explicitly selected, don't try Web Speech
            if (engine === 'kokoro') {
                if (kokoroTTS) {
                    ttsStatus.value = 'ready';
                    currentTTSEngine.value = 'Kokoro';
                } else {
                    ttsStatus.value = 'standby';
                    showKokoroLoadButton.value = true;
                }
                return;
            }
            
            // Check Web Speech API availability
            if (typeof speechSynthesis === 'undefined') {
                console.warn('Speech synthesis not supported');
                if (engine === 'auto') {
                    // Offer Kokoro as fallback
                    ttsStatus.value = 'standby';
                    showKokoroLoadButton.value = true;
                } else {
                    ttsStatus.value = 'error';
                }
                return;
            }
            
            const voices = speechSynthesis.getVoices();
            availableVoices.value = voices;
            
            if (voices.length > 0) {
                ttsStatus.value = 'ready';
                currentTTSEngine.value = 'Web Speech';
                console.log(`Loaded ${voices.length} voices`);
            } else {
                // Check if this is Brave browser (no voices available)
                const isBrave = navigator.brave?.isBrave?.name === 'isBrave' ||
                               (navigator.userAgent.includes('Brave') && voices.length === 0);
                
                if (isBrave || voices.length === 0) {
                    if (engine === 'auto') {
                        // Offer Kokoro as fallback
                        ttsStatus.value = 'standby';
                        showKokoroLoadButton.value = true;
                        console.log('Web Speech not available - Kokoro can be loaded as fallback');
                    } else {
                        ttsStatus.value = 'error';
                        console.warn('No TTS voices available');
                    }
                } else {
                    // Voices might load later on other browsers
                    ttsStatus.value = 'loading';
                    console.log('No voices available yet');
                }
            }
        };
        
        const onTTSEngineChange = () => {
            const engine = settings.value.tts?.engine || 'auto';
            showKokoroLoadButton.value = false;
            
            if (engine === 'kokoro') {
                if (kokoroTTS) {
                    ttsStatus.value = 'ready';
                    currentTTSEngine.value = 'Kokoro';
                } else {
                    ttsStatus.value = 'standby';
                    showKokoroLoadButton.value = true;
                }
            } else if (engine === 'webspeech') {
                loadVoices();
            } else {
                // Auto mode - check what's available
                loadVoices();
            }
        };
        
        const loadKokoroTTS = async () => {
            if (kokoroLoading.value || kokoroTTS) return;
            
            kokoroLoading.value = true;
            ttsStatus.value = 'loading';
            
            try {
                // Dynamically import Kokoro TTS
                const { KokoroTTS } = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.1.1/+esm');
                
                console.log('Loading Kokoro TTS model (~80MB)...');
                kokoroTTS = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
                    dtype: 'q8',  // Quantized 8-bit for smaller size
                    device: 'wasm',  // Run in browser using WASM
                });
                
                console.log('Kokoro TTS loaded successfully');
                ttsStatus.value = 'ready';
                currentTTSEngine.value = 'Kokoro';
                showKokoroLoadButton.value = false;
                
                // Set default voice if not set
                if (!settings.value.tts.voice) {
                    settings.value.tts.voice = 'af_heart';
                }
            } catch (error) {
                console.error('Failed to load Kokoro TTS:', error);
                ttsStatus.value = 'error';
                alert('Failed to load Kokoro TTS. Please check your internet connection and try again.');
            } finally {
                kokoroLoading.value = false;
            }
        };
        
        const testTTS = () => {
            if (ttsStatus.value !== 'ready') {
                if (showKokoroLoadButton.value) {
                    alert('Text-to-Speech is not available. Click "Load Kokoro TTS" to enable local text-to-speech that works in all browsers including Brave.');
                } else {
                    alert('Text-to-Speech is not available in this browser.');
                }
                return;
            }
            const testText = "Hello! Text to speech is working correctly.";
            speakMessage(testText);
        };

        const speakMessage = async (text) => {
            // Strip markdown and HTML for cleaner speech
            let cleanText = text
                .replace(/<[^>]*>/g, '') // Remove HTML tags
                .replace(/[#*_`\[\]()]/g, ' ') // Remove markdown
                .replace(/\s+/g, ' ') // Normalize whitespace
                .trim();
            
            // Limit text length for TTS (prevent issues with very long responses)
            const maxLength = 5000;
            if (cleanText.length > maxLength) {
                cleanText = cleanText.substring(0, maxLength) + '. Text truncated for speech.';
            }
            
            if (!cleanText) return;
            
            // Use Kokoro if available and selected
            const engine = settings.value.tts?.engine || 'auto';
            if ((engine === 'kokoro' || (engine === 'auto' && kokoroTTS)) && kokoroTTS) {
                await speakWithKokoro(cleanText);
                return;
            }
            
            // Fall back to Web Speech API
            await speakWithWebSpeech(cleanText);
        };
        
        const speakWithKokoro = async (text) => {
            if (!kokoroTTS) {
                console.warn('Kokoro TTS not loaded');
                return;
            }
            
            try {
                ttsEnabled.value = true;
                console.log('Generating speech with Kokoro...');
                
                const voice = settings.value.tts.voice || 'af_heart';
                const audio = await kokoroTTS.generate(text, { voice });
                
                // Play the generated audio
                if (!kokoroAudioContext) {
                    kokoroAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                
                // Convert to blob and play
                const blob = await audio.toBlob();
                const url = URL.createObjectURL(blob);
                const audioElement = new Audio(url);
                
                audioElement.onended = () => {
                    ttsEnabled.value = false;
                    URL.revokeObjectURL(url);
                    console.log('Kokoro TTS ended');
                };
                
                audioElement.onerror = (e) => {
                    ttsEnabled.value = false;
                    console.error('Kokoro TTS playback error:', e);
                    URL.revokeObjectURL(url);
                };
                
                await audioElement.play();
                console.log('Kokoro TTS started');
            } catch (error) {
                ttsEnabled.value = false;
                console.error('Kokoro TTS error:', error);
            }
        };
        
        const speakWithWebSpeech = (text) => {
            if (typeof speechSynthesis === 'undefined') {
                console.warn('Speech synthesis not supported in this browser');
                return;
            }
            
            // Check if voices are available
            const voices = speechSynthesis.getVoices();
            if (voices.length === 0) {
                console.warn('No TTS voices available');
                return;
            }
            
            // Stop any current speech
            speechSynthesis.cancel();
            
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = parseFloat(settings.value.tts.rate) || 1.0;
            utterance.pitch = parseFloat(settings.value.tts.pitch) || 1.0;
            utterance.volume = 1.0;
            
            // Set voice if available (voices already fetched above)
            if (settings.value.tts.voice && voices.length > 0) {
                const voice = voices.find(v => v.name === settings.value.tts.voice);
                if (voice) utterance.voice = voice;
            } else if (voices.length > 0) {
                // Try to find a good default voice
                const defaultVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
                utterance.voice = defaultVoice;
            }
            
            utterance.onstart = () => {
                ttsEnabled.value = true;
                console.log('TTS started');
            };
            utterance.onend = () => {
                ttsEnabled.value = false;
                console.log('TTS ended');
            };
            utterance.onerror = (e) => {
                ttsEnabled.value = false;
                console.error('TTS error:', e);
            };
            
            // Some browsers require user interaction first
            try {
                speechSynthesis.speak(utterance);
            } catch (e) {
                console.error('Failed to speak:', e);
            }
        };

        const stopTTS = () => {
            // Stop Web Speech
            if (typeof speechSynthesis !== 'undefined') {
                speechSynthesis.cancel();
            }
            ttsEnabled.value = false;
        };

        const copyMessageContent = async (content, event) => {
            try {
                await navigator.clipboard.writeText(content);
                // Visual feedback on the button
                const btn = event.target.closest('button');
                const originalHTML = btn.innerHTML;
                btn.innerHTML = '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                btn.title = 'Copied!';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.title = 'Copy full response';
                }, 2000);
            } catch (e) {
                console.error('Copy failed:', e);
                // Fallback for non-secure contexts
                try {
                    const textArea = document.createElement('textarea');
                    textArea.value = content;
                    textArea.style.position = 'fixed';
                    textArea.style.left = '-9999px';
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand('copy');
                    document.body.removeChild(textArea);
                    const btn = event.target.closest('button');
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<svg class="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                    setTimeout(() => {
                        btn.innerHTML = originalHTML;
                    }, 2000);
                } catch (fallbackError) {
                    console.error('Fallback copy also failed:', fallbackError);
                    const btn = event.target.closest('button');
                    btn.title = 'Failed to copy';
                    setTimeout(() => {
                        btn.title = 'Copy full response';
                    }, 2000);
                }
            }
        };

        const sendMessage = async () => {
            if ((!userInput.value.trim() && attachments.value.length === 0) || isLoading.value) return;

            // Build display content (what user sees)
            const displayContent = userInput.value.trim();
            
            // Build LLM content (what gets sent to API)
            let llmContent = userInput.value.trim();
            const textAttachments = attachments.value.filter(a => a.type !== 'image');
            if (textAttachments.length > 0) {
                const attachmentText = textAttachments.map(att => {
                    return `\n\n--- File: ${att.name} ---\n${att.content}`;
                }).join('\n');
                llmContent += attachmentText;
            }
            
            // Get image attachments
            const imageAttachments = attachments.value.filter(a => a.type === 'image');
            
            // Store attachment metadata for display
            const attachmentsMeta = attachments.value.map(a => ({
                name: a.name,
                icon: a.icon,
                size: a.size,
                type: a.type
            }));
            
            // Push message with display content and llm content
            messages.value.push({
                role: 'user',
                content: displayContent,
                attachments: attachmentsMeta,
                llmContent: llmContent || displayContent
            });
            
            const textareaEl = textarea.value;
            if (textareaEl) textareaEl.style.height = 'auto';
            userInput.value = '';
            
            // Clear processed attachments
            attachments.value = [];
            
            isLoading.value = true;
            connectionError.value = '';
            
            const assistantMessageIndex = messages.value.length;
            messages.value.push({ role: 'assistant', content: '', streaming: settings.value.stream });
            
            scrollToBottom();

            abortController.value = new AbortController();

            try {
                // Prepare messages for API (use llmContent if available)
                let conversation = messages.value.slice(0, -1).map(m => ({
                    role: m.role,
                    content: m.llmContent || m.content
                }));
                
                // If images are attached, use vision API format
                const adapterConfig = getAdapterConfig();
                if (imageAttachments.length > 0 && supportsVision(settings.value.backend)) {
                    adapterConfig.images = imageAttachments.map(img => img.dataUrl);
                }

                const adapter = createAdapter(settings.value.backend, adapterConfig);

                if (settings.value.stream) {
                    await adapter.stream(conversation, (chunk) => {
                        messages.value[assistantMessageIndex].content += chunk;
                        scrollToBottom();
                    }, abortController.value.signal);
                } else {
                    const response = await adapter.send(conversation);
                    messages.value[assistantMessageIndex].content = response;
                }
                
                // Auto-read if enabled
                if (settings.value.tts.autoRead && messages.value[assistantMessageIndex].content) {
                    speakMessage(messages.value[assistantMessageIndex].content);
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
                
                Vue.nextTick(() => {
                    messages.value[assistantMessageIndex].content = messages.value[assistantMessageIndex].content;
                });

                trimMessages();
                saveChatHistory(messages.value);
            }
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
        const visionSupported = Vue.computed(() => {
            return supportsVision(settings.value.backend);
        });

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
                    const fetchedModels = data.data
                        .map(m => m.id)
                        .filter(id => id)
                        .sort();
                    
                    // Update the reactive variable
                    openRouterModels.value = fetchedModels;
                    
                    // SAVE TO LOCAL STORAGE
                    localStorage.setItem(OPENROUTER_MODELS_KEY, JSON.stringify(fetchedModels));
                    
                    // Auto-select first model if none or default is set
                    if (!settings.value.openrouter.model || settings.value.openrouter.model === 'anthropic/claude-sonnet-4.5') {
                        if (fetchedModels.length > 0) {
                            settings.value.openrouter.model = fetchedModels[0];
                        }
                    }
                    
                    saveSettings(settings.value);
                    
                    alert(`Successfully fetched ${fetchedModels.length} models!`);
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

        // OpenRouter Model Dropdown Methods
        const toggleModelDropdown = () => {
            showModelDropdown.value = !showModelDropdown.value;
            if (showModelDropdown.value) {
                Vue.nextTick(() => {
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
        
        const escapeRegExp = (string) => {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        };
        
        const highlightMatch = (content, query) => {
            if (!query) return content;
            const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');
            return content.replace(regex, '<mark style="background-color: var(--accent-primary); color: var(--text-primary); padding: 0 2px; border-radius: 2px;">$1</mark>');
        };
        
        const jumpToMessage = (index) => {
            showSearch.value = false;
            Vue.nextTick(() => {
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
            if (currentSessionId.value) {
                saveCurrentSession();
            }
            
            const newSession = createSession([]);
            sessions.value.push(newSession);
            currentSessionId.value = newSession.id;
            messages.value = [];
            attachments.value = [];
            
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
                attachments.value = [];
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

        const showSessionMenuFn = (session, event) => {
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
            Vue.nextTick(() => {
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
                    Vue.nextTick(() => {
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

        Vue.onMounted(() => {
            loadSettingsHandler();
            setupDragAndDrop();
            loadVoices();
            
            // Load voices when they become available
            if (typeof speechSynthesis !== 'undefined') {
                speechSynthesis.onvoiceschanged = loadVoices;
            }
            
            // Load OpenRouter models from localStorage
            const savedModels = localStorage.getItem(OPENROUTER_MODELS_KEY);
            if (savedModels) {
                try {
                    openRouterModels.value = JSON.parse(savedModels);
                } catch (e) {
                    console.error("Failed to parse saved models", e);
                }
            }
            
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

        Vue.watch(() => settings.value.stream, () => {
            saveSettings(settings.value);
        });

        // Auto-save messages when they change
        Vue.watch(messages, () => {
            debouncedAutoSave();
        }, { deep: true });

        return {
            messages,
            userInput,
            isLoading,
            showSettings,
            messagesContainer,
            textarea,
            fileInput,
            settings,
            activeTab,
            showHelp,
            currentBackendLabel,
            connectionError,
            testingConnection,
            attachments,
            isDragging,
            ttsEnabled,
            ttsStatus,
            availableVoices,
            currentTTSEngine,
            kokoroLoading,
            showKokoroLoadButton,
            sendMessage,
            clearChat,
            saveSettings: saveSettingsHandler,
            testConnection,
            fetchOpenRouterModels,
            isLoadingModels,
            openRouterModels,
            filteredOpenRouterModels,
            modelSearchQuery,
            showModelDropdown,
            modelSearchInput,
            toggleModelDropdown,
            closeModelDropdown,
            selectModel,
            enableCustomModel,
            testTTS,
            loadKokoroTTS,
            onTTSEngineChange,
            renderMarkdown,
            autoResize,
            getModelContext,
            getMaxTokensLimit,
            getTokenStep,
            formatTokens,
            updateMaxTokensForModel,
            handleFileSelect,
            removeAttachment,
            handlePaste,
            handleEnter,
            speakMessage,
            stopTTS,
            copyMessageContent,
            hoveredMessageIndex,
            hoveredMessage,
            toggleTheme,
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
            showSessionMenu: showSessionMenuFn,
            renameSession,
            confirmRename,
            duplicateSession,
            deleteSessionHandler
        };
    }
}).mount('#app');
