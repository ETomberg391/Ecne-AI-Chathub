/**
 * OpenAI Adapter
 * Handles communication with OpenAI-compatible APIs
 */

import { BaseAdapter } from './baseAdapter.js';
import { readStream } from '../utils/streamReader.js';

export class OpenAIAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        this.apiKey = config.apiKey;
        this.model = config.model;
        this.systemPrompt = config.systemPrompt || 'You are a helpful assistant.';
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 4096;
        this.topP = config.topP ?? 1.0;
        this.presencePenalty = config.presencePenalty ?? 0;
        this.frequencyPenalty = config.frequencyPenalty ?? 0;
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
        const body = {
            model: this.model,
            messages: [{ role: 'system', content: this.systemPrompt }, ...messages],
            temperature: this.temperature,
            top_p: this.topP,
            stream
        };
        
        // Only include max_tokens if greater than 0
        if (this.maxTokens > 0) {
            body.max_tokens = this.maxTokens;
        }
        
        // Add penalties if non-zero (OpenAI-specific)
        if (this.presencePenalty !== 0) {
            body.presence_penalty = this.presencePenalty;
        }
        if (this.frequencyPenalty !== 0) {
            body.frequency_penalty = this.frequencyPenalty;
        }
        
        // Handle reasoning models (o1, o3) which don't support temperature/top_p
        if (this.model?.startsWith('o1') || this.model?.startsWith('o3')) {
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
