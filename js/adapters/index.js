/**
 * Adapter Factory
 * Creates and manages backend adapters
 */

import { OpenAIAdapter } from './openaiAdapter.js';
import { CerebrasAdapter } from './cerebrasAdapter.js';
import { OllamaAdapter } from './ollamaAdapter.js';
import { ClaudeAdapter } from './claudeAdapter.js';
import { LMStudioAdapter } from './lmstudioAdapter.js';
import { OpenRouterAdapter } from './openrouterAdapter.js';
import { LocalOpenAIAdapter } from './localOpenaiAdapter.js';

/**
 * Create an adapter based on backend type
 * @param {string} backend - Backend type (openai, cerebras, ollama, claude, lmstudio, localopenai)
 * @param {Object} config - Configuration object
 * @returns {BaseAdapter}
 */
export function createAdapter(backend, config) {
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
        case 'localopenai':
            return new LocalOpenAIAdapter(config);
        default:
            throw new Error(`Unknown backend: ${backend}`);
    }
}

/**
 * Get available backend types
 * @returns {Array<string>}
 */
export function getAvailableBackends() {
    return ['openai', 'cerebras', 'ollama', 'claude', 'lmstudio', 'openrouter', 'localopenai'];
}

/**
 * Get backend display label
 * @param {string} backend - Backend type
 * @returns {string}
 */
export function getBackendLabel(backend) {
    const labels = {
        openai: 'OpenAI',
        cerebras: 'Cerebras',
        ollama: 'Ollama',
        claude: 'Claude',
        lmstudio: 'LM Studio',
        openrouter: 'OpenRouter',
        localopenai: 'Local OpenAI'
    };
    return labels[backend] || 'Unknown';
}
