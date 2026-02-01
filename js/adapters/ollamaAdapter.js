/**
 * Ollama Adapter
 * Handles communication with Ollama local API
 */

import { BaseAdapter } from './baseAdapter.js';
import { readOllamaStream } from '../utils/streamReader.js';

export class OllamaAdapter extends BaseAdapter {
    constructor(config) {
        super(config);
        this.host = config.host || 'http://localhost:11434';
        this.model = config.model || 'llama3';
        this.systemPrompt = config.systemPrompt || 'You are a helpful assistant.';
        this.temperature = config.temperature ?? 0.7;
        this.maxTokens = config.maxTokens ?? 4096;
        this.topP = config.topP ?? 1.0;
        this.numCtx = config.numCtx || 4096;
        this.repeatPenalty = config.repeatPenalty ?? 1.1;
        this.repeatLastN = config.repeatLastN ?? 64;
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
        
        return {
            model: this.model,
            messages: [{ role: 'system', content: this.systemPrompt }, ...messages],
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
