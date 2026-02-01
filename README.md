# AI Chat Hub

A modular, airgap-friendly AI chat application with support for multiple LLM backends, document parsing, OCR, and text-to-speech.
<img width="2717" height="1587" alt="image" src="https://github.com/user-attachments/assets/dea4a782-f606-4d12-bfca-3110743c253b" />

## Features

### Multi-Backend LLM Support
- **OpenAI**: GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo, o1/o3 reasoning models
- **Cerebras**: Llama 3.3 70B, Llama 3.1 (70B/8B), Llama 3 (70B/8B)
- **Ollama**: Local models (llama3, codellama, deepseek-coder, etc.)
- **Claude**: Claude 3.5 Sonnet, Claude 3 Opus/Sonnet/Haiku
- **LM Studio**: Local API-compatible server

### Document & File Support
- **Text Files**: TXT, MD, CSV, JSON, code files (JS, PY, PHP, HTML, CSS)
- **PDF Documents**: Full text extraction via PDF.js
- **Word Documents**: DOCX parsing via Mammoth.js
- **Excel Files**: XLSX/XLS support via SheetJS
- **EPUB**: E-book format support
- **Images**: JPG, PNG, GIF, WebP with vision API support (where available)

### Text-to-Speech (TTS)
- **Web Speech API**: Built-in browser TTS with voice selection
- **Kokoro TTS**: Local ONNX-based TTS (~80MB model download)
  - Multiple voices: American/British, Male/Female
  - Runs 100% locally, no API keys needed
- Auto-read AI responses option
- Per-message play controls
- Adjustable rate and pitch

### Chat Features
- **Streaming Responses**: Real-time token generation with visual feedback
- **Markdown Rendering**: Full support with syntax highlighting via Highlight.js
- **Code Blocks**: Copy-to-clipboard functionality for code snippets
- **File Attachments**: Drag & drop or click to upload multiple files
- **Image OCR**: Text extraction from images via Tesseract.js
- **Chat History**: Automatic persistence to localStorage
- **OOM Protection**: Automatic message trimming (max 50 in memory, 100 saved)

### UI/UX
- **Dark Theme**: Beautiful dark UI with purple gradient accents
- **Responsive Design**: Works on desktop and mobile
- **Settings Persistence**: All configuration saved locally
- **Message Actions**: Copy, read aloud, stop generation
- **Drag & Drop**: Drop files directly into the chat input

## Project Structure

```
.
├── index.html              # Main HTML entry point
├── css/
│   ├── tailwind.js         # Tailwind CSS framework (bundled)
│   ├── highlight.css       # Syntax highlighting theme
│   ├── fonts.css           # Google Fonts (Inter)
│   └── styles.css          # Custom application styles
├── js/
│   ├── vue.global.prod.js  # Vue.js 3 framework
│   ├── marked.min.js       # Markdown parser
│   ├── highlight.min.js    # Syntax highlighting
│   ├── bundle.js           # Main application bundle
│   ├── adapters/           # LLM backend adapters
│   │   ├── baseAdapter.js
│   │   ├── openaiAdapter.js
│   │   ├── cerebrasAdapter.js
│   │   ├── ollamaAdapter.js
│   │   ├── claudeAdapter.js
│   │   ├── lmstudioAdapter.js
│   │   └── index.js
│   └── utils/              # Utility modules
│       ├── markdownRenderer.js
│       ├── storage.js
│       └── streamReader.js
├── fonts/
│   └── inter-regular.woff2
└── settings_scrolled.png   # Screenshot
```

## Quick Start

1. **Clone or download** the repository
2. **Open** [`index.html`](index.html) in a modern web browser
3. **Configure** your preferred backend in Settings
4. **Start chatting!**

> **Note**: For local file access (file:// protocol), the app uses a bundled version ([`js/bundle.js`](js/bundle.js)) for full compatibility.

## Backend Configuration

### OpenAI
- **API Key**: Required (get at [platform.openai.com](https://platform.openai.com))
- **Models**: GPT-4o, GPT-4o Mini, GPT-4 Turbo, GPT-3.5 Turbo, o1, o3-mini
- **Base URL**: `https://api.openai.com/v1` (default)
- **Features**: Full parameter control (temperature, top_p, presence/frequency penalty, max tokens)

### Cerebras
- **API Key**: Required (free at [cloud.cerebras.ai](https://cloud.cerebras.ai))
- **Models**: Llama 3.3 70B, Llama 3.1 70B/8B, Llama 3 70B/8B
- **Base URL**: `https://api.cerebras.ai/v1` (default)
- **Features**: 128K context window, fast inference

### Ollama
- **Host URL**: `http://localhost:11434` (default)
- **Models**: Any locally installed model
- **Parameters**: Context window size, repeat penalty, repeat last N
- **Requirements**: [Ollama](https://ollama.ai) must be running locally

### Claude
- **API Key**: Required (get at [console.anthropic.com](https://console.anthropic.com))
- **Models**: Claude 3.5 Sonnet, Claude 3 Opus/Sonnet/Haiku
- **Features**: 200K context window, up to 8K output tokens

### LM Studio
- **Host URL**: `http://localhost:1234` (default)
- **Model**: Auto-detected from LM Studio
- **Requirements**: [LM Studio](https://lmstudio.ai) must be running with server enabled

## File Attachments

The app supports dragging and dropping or selecting files for processing:

1. **Click the paperclip icon** or **drag files** into the chat area
2. Files are parsed client-side (no server upload)
3. Content is included in the context sent to the LLM
4. Images can be processed via OCR or vision APIs

### Supported File Types

| Type | Extensions | Library |
|------|------------|---------|
| Text | .txt, .md, .csv, .json | Native |
| Code | .js, .py, .php, .html, .css | Native |
| PDF | .pdf | PDF.js |
| Word | .docx | Mammoth.js |
| Excel | .xlsx, .xls | SheetJS |
| EPUB | .epub | EPub.js |
| Images | .jpg, .png, .gif, .webp | Native + Tesseract.js OCR |

## Architecture

### Modular Design

The application uses a modular adapter pattern:

1. **Adapters**: Each backend extends [`BaseAdapter`](js/adapters/baseAdapter.js) and implements:
   - `stream(messages, onChunk, signal)` - Streaming requests
   - `send(messages)` - Non-streaming requests
   - `buildRequestBody(messages, stream)` - API request formatting
   - `getEndpoint()` - API URL
   - `getHeaders()` - Authentication headers
   - `extractContent(data)` - Response parsing

2. **Document Parser**: Client-side file parsing with progress indicators
3. **TTS Engine**: Pluggable TTS with Web Speech API and Kokoro support
4. **Storage**: localStorage-based settings and chat history

### Security

- **No server uploads**: All file processing is client-side
- **No data collection**: API keys stored only in browser localStorage
- **CORS-friendly**: Works with local LLM servers (Ollama, LM Studio)

## Development

### Adding a New Backend

1. Create a new adapter in [`js/adapters/`](js/adapters/)
2. Extend [`BaseAdapter`](js/adapters/baseAdapter.js)
3. Implement required methods
4. Add to [`js/adapters/index.js`](js/adapters/index.js) factory
5. Add settings UI section in [`index.html`](index.html)
6. Rebuild [`js/bundle.js`](js/bundle.js) if needed

### Modifying Styles

- **Custom styles**: Edit [`css/styles.css`](css/styles.css)
- **Tailwind**: Utility classes via [`css/tailwind.js`](css/tailwind.js)

## Dependencies

All dependencies are included locally or loaded via CDN for airgap compatibility:

| Dependency | Purpose | Source |
|------------|---------|--------|
| Vue.js 3 | UI framework | Local |
| Tailwind CSS | Styling | Local |
| Marked | Markdown parsing | Local |
| Highlight.js | Syntax highlighting | Local |
| PDF.js | PDF parsing | CDN |
| Mammoth.js | DOCX parsing | CDN |
| SheetJS | Excel parsing | CDN |
| Tesseract.js | OCR | CDN |
| Kokoro-js | Local TTS | CDN (on demand) |
| Inter Font | Typography | Local |

## Browser Compatibility

- Chrome/Edge 80+
- Firefox 75+
- Safari 13+
- Requires ES6 module support
- Web Speech API for TTS (optional)

## License

This project is provided as-is for educational and personal use.

---

**Note**: This is a client-side application. API keys and data are stored locally in your browser. Always use appropriate security measures when handling API keys.

