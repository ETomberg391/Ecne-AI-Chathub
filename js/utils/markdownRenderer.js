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
    // Handle non-string content properly to avoid "[object Object]"
    if (!content) {
        return '<p></p>';
    }
    
    // Convert content to string if it's an object or other type
    let contentStr;
    if (typeof content === 'string') {
        contentStr = content;
    } else if (typeof content === 'object') {
        contentStr = content.text || content.content || JSON.stringify(content);
    } else {
        contentStr = String(content);
    }

    try {
        const renderer = new marked.Renderer();
        
        // ONLY override the code block renderer for syntax highlighting
        // Let marked handle everything else with defaults
        renderer.code = function(token) {
            // marked v15+ passes a token object
            let code, lang;
            
            if (token && typeof token === 'object') {
                code = token.text || '';
                lang = token.lang || '';
            } else {
                // Fallback for old API
                code = arguments[0] || '';
                lang = arguments[1] || '';
            }
            
            const codeStr = String(code || '');
            const langStr = String(lang || '');
            const displayLang = langStr || 'code';
            
            try {
                if (langStr && langStr !== 'plaintext') {
                    const highlighted = hljs.highlight(codeStr, { language: langStr }).value;
                    return `<div class="code-block-wrapper">
                        <div class="code-header">
                            <span class="code-language">${displayLang}</span>
                            <button class="copy-btn" onclick="window.copyCode(this)">Copy</button>
                        </div>
                        <pre><code class="hljs language-${langStr}">${highlighted}</code></pre>
                    </div>`;
                } else {
                    const highlighted = hljs.highlightAuto(codeStr).value;
                    return `<div class="code-block-wrapper">
                        <div class="code-header">
                            <span class="code-language">${displayLang}</span>
                            <button class="copy-btn" onclick="window.copyCode(this)">Copy</button>
                        </div>
                        <pre><code class="hljs">${highlighted}</code></pre>
                    </div>`;
                }
            } catch (e) {
                const escaped = codeStr.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
                return `<div class="code-block-wrapper">
                    <div class="code-header">
                        <span class="code-language">${displayLang}</span>
                        <button class="copy-btn" onclick="window.copyCode(this)">Copy</button>
                    </div>
                    <pre><code>${escaped}</code></pre>
                </div>`;
            }
        };

        marked.setOptions({ 
            renderer,
            breaks: true,
            gfm: true,
            headerIds: false,
            mangle: false
        });
        
        return marked.parse(contentStr);
    } catch (error) {
        console.error('Markdown render error:', error);
        const safeContent = contentStr.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
        return `<p>${safeContent}</p>`;
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
