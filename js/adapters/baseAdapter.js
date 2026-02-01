/**
 * Base Adapter Class
 * Abstract base class for all backend adapters
 */

export class BaseAdapter {
    /**
     * @param {Object} config - Configuration object
     */
    constructor(config) {
        this.config = config;
    }

    /**
     * Send a streaming request
     * @param {Array} messages - Conversation messages
     * @param {Function} onChunk - Callback for each chunk
     * @param {AbortSignal} signal - Abort signal for cancellation
     * @returns {Promise<void>}
     */
    async stream(messages, onChunk, signal) {
        throw new Error('stream() must be implemented by subclass');
    }

    /**
     * Send a non-streaming request
     * @param {Array} messages - Conversation messages
     * @returns {Promise<string>}
     */
    async send(messages) {
        throw new Error('send() must be implemented by subclass');
    }

    /**
     * Build the request body
     * @param {Array} messages - Conversation messages
     * @param {boolean} stream - Whether to stream
     * @returns {Object}
     */
    buildRequestBody(messages, stream = false) {
        throw new Error('buildRequestBody() must be implemented by subclass');
    }

    /**
     * Get the API endpoint URL
     * @returns {string}
     */
    getEndpoint() {
        throw new Error('getEndpoint() must be implemented by subclass');
    }

    /**
     * Get the request headers
     * @returns {Object}
     */
    getHeaders() {
        throw new Error('getHeaders() must be implemented by subclass');
    }

    /**
     * Extract content from response
     * @param {Object} data - Response data
     * @returns {string}
     */
    extractContent(data) {
        throw new Error('extractContent() must be implemented by subclass');
    }

    /**
     * Handle API errors
     * @param {Response} response - Fetch response
     * @returns {Promise<never>}
     */
    async handleError(response) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error?.message || data.error || 'API error');
    }
}
