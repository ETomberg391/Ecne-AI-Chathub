/**
 * Stream Reader Utilities
 * Handles reading streaming responses from different API backends
 */

/**
 * Read SSE (Server-Sent Events) stream from OpenAI-compatible APIs
 * @param {Response} response - The fetch response object
 * @param {Function} onChunk - Callback for each parsed chunk
 * @param {Function} onError - Callback for errors
 * @returns {Promise<void>}
 */
export async function readStream(response, onChunk, onError) {
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

/**
 * Read JSONL (JSON Lines) stream from Ollama
 * @param {Response} response - The fetch response object
 * @param {Function} onChunk - Callback for each parsed chunk
 * @param {Function} onError - Callback for errors
 * @returns {Promise<void>}
 */
export async function readOllamaStream(response, onChunk, onError) {
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

/**
 * Read SSE stream from Claude API
 * @param {Response} response - The fetch response object
 * @param {Function} onChunk - Callback for each parsed chunk
 * @param {Function} onError - Callback for errors
 * @returns {Promise<void>}
 */
export async function readClaudeStream(response, onChunk, onError) {
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
