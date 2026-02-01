/**
 * LM Studio Adapter
 * Handles communication with LM Studio local API (OpenAI-compatible)
 */

import { OpenAIAdapter } from './openaiAdapter.js';

export class LMStudioAdapter extends OpenAIAdapter {
    constructor(config) {
        super({
            ...config,
            baseUrl: `${config.host || 'http://localhost:1234'}/v1`,
            apiKey: '' // LM Studio doesn't require an API key
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
