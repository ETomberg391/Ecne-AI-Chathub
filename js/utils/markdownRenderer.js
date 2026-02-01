/**
 * Markdown Renderer
 * Handles markdown rendering with syntax highlighting
 */

/**
 * Render markdown content to HTML
 * @param {string} content - Markdown content
 * @returns {string} HTML string
 */
export function renderMarkdown(content) {
    if (!content || typeof content !== 'string') {
        return '<p>' + (content || '') + '</p>';
    }

    try {
        const renderer = new marked.Renderer();
        
        // Handle marked v5+ API which passes an object as first parameter
        renderer.code = function(codeOrObj, language, escaped) {
            let code, lang;
            
            // Check if first parameter is an object (marked v5+)
            if (typeof codeOrObj === 'object' && codeOrObj !== null) {
                code = codeOrObj.text || '';
                lang = codeOrObj.lang || '';
            } else {
                // marked v4 API
                code = codeOrObj || '';
                lang = language || '';
            }
            
            const codeStr = typeof code === 'string' ? code : String(code || '');
            const langStr = typeof lang === 'string' ? lang : 'plaintext';
            const displayLang = langStr || 'code';
            
            try {
                const highlighted = hljs.highlight(codeStr, { language: langStr }).value;
                return `<div class="code-block-wrapper">
                    <div class="code-header">
                        <span class="code-language">${displayLang}</span>
                        <button class="copy-btn" onclick="window.copyCode(this)">Copy</button>
                    </div>
                    <pre><code class="hljs language-${langStr}">${highlighted}</code></pre>
                </div>`;
            } catch (e) {
                const escaped = codeStr.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
                return `<div class="code-block-wrapper">
                    <div class="code-header">
                        <span class="code-language">${displayLang}</span>
                        <button class="copy-btn" onclick="window.copyCode(this)">Copy</button>
                    </div>
                    <pre><code class="language-${langStr}">${escaped}</code></pre>
                </div>`;
            }
        };

        renderer.blockquote = function(text) {
            // Handle both string and object inputs from marked.js
            const textStr = typeof text === 'string' ? text : (text?.text || String(text || ''));
            return `<blockquote>${textStr}</blockquote>`;
        };

        renderer.heading = function(text, level, raw) {
            const textStr = typeof text === 'string' ? text : (text?.text || String(text || ''));
            return `<h${level}>${textStr}</h${level}>`;
        };

        renderer.hr = function() {
            return '<hr>';
        };

        renderer.table = function(header, body) {
            const headerStr = typeof header === 'string' ? header : String(header || '');
            const bodyStr = typeof body === 'string' ? body : String(body || '');
            return `<table><thead>${headerStr}</thead><tbody>${bodyStr}</tbody></table>`;
        };

        marked.setOptions({ 
            renderer,
            breaks: true,
            gfm: true
        });
        
        return marked.parse(content);
    } catch (error) {
        console.error('Markdown render error:', error);
        return `<p>${content.replace(/</g, '<').replace(/>/g, '>')}</p>`;
    }
}

/**
 * Copy code to clipboard
 * @param {HTMLButtonElement} btn - The copy button element
 */
export function copyCode(btn) {
    try {
        const wrapper = btn.closest('.code-block-wrapper');
        const code = wrapper.querySelector('code').textContent;
        navigator.clipboard.writeText(code);
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
            btn.textContent = 'Copy';
            btn.classList.remove('copied');
        }, 2000);
    } catch (e) {
        console.error('Copy failed:', e);
    }
}

// Make copyCode available globally for onclick handlers
if (typeof window !== 'undefined') {
    window.copyCode = copyCode;
}
