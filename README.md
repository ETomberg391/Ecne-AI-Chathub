# AI Chat Hub - Refactored

A modular, airgap-friendly AI chat application with support for multiple backends.

## Features

- **Multiple Backend Support**: OpenAI, Cerebras, Ollama, Claude, and LM Studio
- **Streaming Responses**: Real-time text generation with visual feedback
- **Markdown Rendering**: Full markdown support with syntax highlighting
- **Code Blocks**: Copy-to-clipboard functionality for code snippets
- **Dark Theme**: Beautiful dark UI with gradient accents
- **Settings Persistence**: Automatic saving of configuration and chat history
- **OOM Protection**: Automatic message trimming to prevent memory issues

## Project Structure

```
source/
├── css/
│   ├── tailwind.css          # Tailwind CSS framework
│   ├── highlight.css         # Highlight.js syntax highlighting theme
│   ├── fonts.css            # Google Fonts CSS
│   └── styles.css           # Custom application styles
├── js/
│   ├── vue.global.prod.js    # Vue.js 3 framework
│   ├── marked.min.js         # Markdown parser
│   ├── highlight.min.js      # Syntax highlighting
│   ├── app.js               # Main Vue application
│   ├── adapters/
│   │   ├── baseAdapter.js    # Abstract base class for adapters
│   │   ├── openaiAdapter.js  # OpenAI API adapter
│   │   ├── cerebrasAdapter.js # Cerebras API adapter
│   │   ├── ollamaAdapter.js # Ollama local API adapter
│   │   ├── claudeAdapter.js  # Claude API adapter
│   │   ├── lmstudioAdapter.js # LM Studio adapter
│   │   └── index.js         # Adapter factory
│   └── utils/
│       ├── streamReader.js    # Stream parsing utilities
│       ├── markdownRenderer.js # Markdown rendering with highlighting
│       └── storage.js        # LocalStorage management
├── fonts/
│   └── inter-regular.woff2  # Inter font file
└── index.html               # Main HTML entry point
```

## Architecture

### Modular Design

The application is split into focused modules:

1. **Adapters**: Each backend has its own adapter class that implements a common interface
2. **Utils**: Reusable utilities for streaming, rendering, and storage
3. **App**: Main Vue application that orchestrates everything

### OOM Prevention

To prevent Out of Memory issues:

- **Message Limiting**: Maximum 50 messages kept in memory
- **History Limiting**: Maximum 100 messages saved to localStorage
- **Automatic Trimming**: Old messages are automatically removed when limits are exceeded

### Backend Adapters

All adapters extend [`BaseAdapter`](js/adapters/baseAdapter.js) and implement:

- `stream(messages, onChunk, signal)` - Send streaming request
- `send(messages)` - Send non-streaming request
- `buildRequestBody(messages, stream)` - Build API request body
- `getEndpoint()` - Get API endpoint URL
- `getHeaders()` - Get request headers
- `extractContent(data)` - Extract content from response

## Usage

### Running the Application

1. Open [`index.html`](index.html) in a web browser
2. Configure your backend in Settings
3. Start chatting!

### Backend Configuration

#### OpenAI
- API Key: Required
- Model: gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-3.5-turbo
- Base URL: https://api.openai.com/v1 (default)

#### Cerebras
- API Key: Required (free at cloud.cerebras.ai)
- Model: llama-3.3-70b, llama-3.1-70b, llama-3-70b, llama-3-8b, zai-glm-4.7
- Base URL: https://api.cerebras.ai/v1 (default)

#### Ollama
- Host URL: http://localhost:11434 (default)
- Model: Any model installed in Ollama

#### Claude
- API Key: Required
- Model: claude-3-5-sonnet-20241022, claude-3-opus-20240229, claude-3-haiku-20240307

#### LM Studio
- Host URL: http://localhost:1234 (default)
- Model: Auto-detected from LM Studio

## Development

### Adding a New Backend

1. Create a new adapter in [`js/adapters/`](js/adapters/)
2. Extend [`BaseAdapter`](js/adapters/baseAdapter.js)
3. Implement required methods
4. Add to [`js/adapters/index.js`](js/adapters/index.js) factory
5. Add option to settings UI in [`index.html`](index.html)

### Modifying Styles

- Custom styles: Edit [`css/styles.css`](css/styles.css)
- Tailwind classes: Already included via [`css/tailwind.css`](css/tailwind.css)

## Dependencies

All dependencies are included locally for airgap compatibility:

- **Vue.js 3**: Progressive JavaScript framework
- **Tailwind CSS**: Utility-first CSS framework
- **Marked**: Markdown parser
- **Highlight.js**: Syntax highlighting
- **Inter Font**: Primary typeface

## Browser Compatibility

- Modern browsers with ES6 module support
- Chrome/Edge 61+
- Firefox 60+
- Safari 11+

## License

This project is provided as-is for educational and personal use.
