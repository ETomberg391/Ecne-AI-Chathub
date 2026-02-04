/**
 * OpenRouter Adapter
 * Handles communication with OpenRouter's API (OpenAI-compatible)
 * Extends OpenAIAdapter with OpenRouter-specific defaults and headers
 */

import { OpenAIAdapter } from './openaiAdapter.js';
import { readStream } from '../utils/streamReader.js';

export class OpenRouterAdapter extends OpenAIAdapter {
    constructor(config) {
        super(config);
        // OpenRouter uses its own base URL by default
        this.baseUrl = config.baseUrl || 'https://openrouter.ai/api/v1';
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.systemPrompt = config.systemPrompt || 'You are a helpful assistant.';
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 4096;
        this.topP = config.topP ?? 1.0;
        this.presencePenalty = config.presencePenalty ?? 0;
        this.frequencyPenalty = config.frequencyPenalty ?? 0;
        
        // OpenRouter-specific features
        this.providerRouting = config.providerRouting || null; // e.g., 'anthropic', 'openai', etc.
        this.enablePromptCaching = config.enablePromptCaching || false; // For Gemini models
        this.userTracking = config.userTracking || null; // User identifier for analytics/caching
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            // OpenRouter requires these headers for identification
            'HTTP-Referer': window.location.origin || 'https://localhost',
            'X-Title': 'AI Chat Hub' // App name shown in OpenRouter dashboard
        };
        
        // Add provider routing if specified
        if (this.providerRouting) {
            headers['OpenRouter-Provider-Routing'] = this.providerRouting;
        }
        
        return headers;
    }

    buildRequestBody(messages, stream = false) {
        // Use parent method to build the base request body
        const body = super.buildRequestBody(messages, stream);
        
        // OpenRouter-specific: add extra parameters
        // Add user tracking if specified
        if (this.userTracking) {
            body.user = this.userTracking;
        }
        
        // Note: prompt caching is automatically handled by OpenRouter for supported models
        // The enablePromptCaching flag is stored but not sent as a parameter
        // It serves as a UI indicator for Gemini models where manual activation is needed
        
        return body;
    }

    // Override extractContent to handle OpenRouter's response format
    // OpenRouter returns the same format as OpenAI, so parent method works
    // But we'll keep this for potential future customizations
    extractContent(data) {
        return super.extractContent(data);
    }

    // Override handleError to provide better error messages for OpenRouter
    async handleError(response) {
        const data = await response.json().catch(() => ({}));
        
        // OpenRouter-specific error handling
        if (response.status === 401) {
            throw new Error('Invalid OpenRouter API key. Please check your settings.');
        }
        if (response.status === 429) {
            throw new Error('OpenRouter rate limit exceeded. Please try again later.');
        }
        if (response.status === 402) {
            throw new Error('OpenRouter account balance insufficient. Please add credits.');
        }
        
        // Use parent's generic error handling
        await super.handleError(response);
    }
}
