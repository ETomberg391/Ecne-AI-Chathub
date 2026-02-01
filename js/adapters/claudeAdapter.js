/**
 * Claude Adapter
 * Handles communication with Anthropic Claude API
 */

import { BaseAdapter } from './baseAdapter.js';
import { readClaudeStream } from '../utils/streamReader.js';

export class ClaudeAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.systemPrompt = config.systemPrompt || 'You are a helpful assistant.';
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 4096;
        this.topP = config.topP ?? 1.0;
        this.topK = config.topK ?? 40;
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
        const body = {
            model: this.model,
            system: this.systemPrompt,
            messages,
            temperature: this.temperature,
            top_p: this.topP,
            stream
        };
        
        // Only include max_tokens if greater than 0
        if (this.maxTokens > 0) {
            body.max_tokens = this.maxTokens;
        }
        
        // Add top_k if not default (Claude-specific)
        if (this.topK !== 40) {
            body.top_k = this.topK;
        }
        
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
