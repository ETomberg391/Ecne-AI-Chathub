/**
 * Local OpenAI Adapter
 * Handles communication with OpenAI-compatible local APIs (e.g., LM Studio, vLLM, Ollama with OpenAI compat)
 */

import { OpenAIAdapter } from './openaiAdapter.js';

export class LocalOpenAIAdapter extends OpenAIAdapter {
    constructor(config) {
        super({
            ...config,
            baseUrl: config.baseUrl || 'http://localhost:11434/v1',
            apiKey: config.apiKey || '' // Local APIs often don't require API keys
        });
        this.modelAlias = config.modelAlias || config.model || 'default';
    }

    getEndpoint() {
        return `${this.baseUrl}/chat/completions`;
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };
        // Only add Authorization header if API key is provided
        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }
        return headers;
    }

    buildRequestBody(messages, stream = false) {
        const body = {
            model: this.modelAlias,
            messages: [{ role: 'system', content: this.systemPrompt }, ...messages],
            temperature: this.temperature,
            top_p: this.topP,
            stream
        };
        
        // Only include max_tokens if greater than 0
        if (this.maxTokens > 0) {
            body.max_tokens = this.maxTokens;
        }
        
        // Add penalties if non-zero
        if (this.presencePenalty !== 0) {
            body.presence_penalty = this.presencePenalty;
        }
        if (this.frequencyPenalty !== 0) {
            body.frequency_penalty = this.frequencyPenalty;
        }
        
        return body;
    }

    async handleError(response) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || data.error || 'Local OpenAI API error');
    }
}