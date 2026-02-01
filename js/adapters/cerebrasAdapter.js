/**
 * Cerebras Adapter
 * Handles communication with Cerebras API (OpenAI-compatible)
 */

import { OpenAIAdapter } from './openaiAdapter.js';

export class CerebrasAdapter extends OpenAIAdapter {
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
