# AI Chat Hub Enhancement Plan
## Document Support, Image Handling & TTS Integration

---

## 1. Document Parsing Support

### Supported File Types & Libraries

| File Type | Library | Size | Notes |
|-----------|---------|------|-------|
| **.txt, .md, .csv, .json** | Native JS (FileReader) | 0 KB | Built-in, no library needed |
| **.html, .htm** | Native JS (DOMParser) | 0 KB | Extract text content |
| **.js, .php, .py, etc.** | Native JS (FileReader) | 0 KB | Code files as plain text |
| **.pdf** | PDF.js (Mozilla) | ~1.5 MB | Best option, maintained by Mozilla |
| **.docx** | Mammoth.js | ~150 KB | Converts to HTML/Markdown |
| **.doc** | No direct browser lib* | N/A | Recommend converting to docx/pdf first |
| **.xlsx, .xls** | SheetJS (xlsx) | ~500 KB | Full Excel support |
| **.pptx** | PptxGenJS or custom | ~200 KB | Limited options |
| **.epub** | EPub.js | ~100 KB | E-book format |

### Recommended Implementation

```javascript
// Document Parser Module
class DocumentParser {
    async parse(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        
        switch(ext) {
            case 'txt':
            case 'md':
            case 'csv':
            case 'json':
            case 'js':
            case 'php':
            case 'py':
            case 'css':
            case 'html':
                return this.parseText(file);
                
            case 'pdf':
                return this.parsePDF(file);
                
            case 'docx':
                return this.parseDocx(file);
                
            case 'xlsx':
            case 'xls':
                return this.parseExcel(file);
                
            case 'epub':
                return this.parseEPub(file);
                
            default:
                throw new Error(`Unsupported file type: ${ext}`);
        }
    }
}
```

### CDN Links (No npm required)

```html
<!-- PDF.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>

<!-- Mammoth.js (DOCX) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>

<!-- SheetJS (Excel) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

<!-- EPub.js -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/epub.js/0.3.93/epub.min.js"></script>
```

---

## 2. Image Support

### Options for LLM Image Processing

| Approach | Best For | Implementation |
|----------|----------|----------------|
| **Vision-enabled Models** | GPT-4o, Claude 3, Gemini | Send base64 image directly to API |
| **OCR (Text Extraction)** | Documents, screenshots | Use Tesseract.js for text extraction |
| **Thumbnail Preview** | UI/UX | Canvas resizing for display |

### Vision API Support by Provider

| Provider | Models | Implementation |
|----------|--------|----------------|
| **OpenAI** | gpt-4o, gpt-4-turbo, gpt-4o-mini | Base64 in `image_url` or `image` field |
| **Claude** | claude-3-opus, claude-3-sonnet, claude-3-haiku | Base64 in `content` array |
| **Ollama** | llava, bakllava, moondream | Base64 in `images` array |
| **LM Studio** | Depends on loaded model | OpenAI-compatible format |

### Tesseract.js for OCR (Fallback)

```html
<script src='https://unpkg.com/tesseract.js@4.1.1/dist/tesseract.min.js'></script>
```

```javascript
// OCR Example
const result = await Tesseract.recognize(
    imageFile,
    'eng',
    { logger: m => console.log(m) }
);
const text = result.data.text;
```

---

## 3. Text-to-Speech (TTS)

### Browser Native TTS (Free, No API Key)

**Web Speech API** - Built into modern browsers

```javascript
const utterance = new SpeechSynthesisUtterance(text);
utterance.rate = 1.0;
utterance.pitch = 1.0;
utterance.volume = 1.0;

// Get available voices
const voices = speechSynthesis.getVoices();
utterance.voice = voices.find(v => v.name.includes('Google') || v.lang === 'en-US');

speechSynthesis.speak(utterance);
```

**Pros:**
- Completely free
- Works offline
- No API keys
- Multiple voices
- Instant response

**Cons:**
- Voice quality varies by OS
- Limited voice options
- No voice cloning

### Alternative: ResponsiveVoice (Free Tier)

```html
<script src="https://code.responsivevoice.org/responsivevoice.js?key=YOUR_KEY"></script>
```

### TTS UI Controls

- Play/Pause/Stop buttons
- Voice selector dropdown
- Rate slider (0.5x - 2x)
- Pitch slider
- Volume slider
- Auto-read AI responses toggle

---

## 4. Implementation Phases

### Phase 1: Text Document Support
1. Add file drop zone to chat input
2. Parse .txt, .md, .csv, .json, code files
3. Show file attachment preview
4. Include file content in context

### Phase 2: PDF & Office Documents
1. Integrate PDF.js
2. Integrate Mammoth.js (DOCX)
3. Integrate SheetJS (Excel)
4. Add progress indicator for large files

### Phase 3: Image Support
1. Add image upload/drop
2. Implement vision API for supported providers
3. Add OCR fallback with Tesseract.js
4. Show image thumbnails in chat

### Phase 4: TTS Integration
1. Add Web Speech API support
2. Create TTS controls UI
3. Add voice selection
4. Implement auto-read toggle

---

## 5. UI/UX Considerations

### File Drop Zone
- Drag & drop area in chat input
- Supported file types badge display
- File size limit (e.g., 10MB)
- Progress indicator for parsing
- Remove attachment button

### Attachment Preview
```
┌─────────────────────────────────────┐
│ 📄 document.pdf (245 KB)         ❌ │
│ Extracted: 1,240 characters         │
└─────────────────────────────────────┘
```

### Image Preview
- Thumbnail in message bubble
- Click to expand
- OCR text extraction option
- Remove before sending option

### TTS Controls
- Floating or inline player
- Voice settings in main settings modal
- Per-message play button

---

## 6. Security Considerations

1. **File Size Limits** - Prevent DOS (max 10-50MB)
2. **File Type Validation** - Check MIME types, not just extensions
3. **Content Sanitization** - Strip scripts from HTML/PDF
4. **Memory Management** - Clear file data after sending
5. **No Server Upload** - All processing client-side

---

## 7. Libraries Summary

| Feature | Library | Size | CDN |
|---------|---------|------|-----|
| PDF Parsing | PDF.js | 1.5 MB | ✅ |
| DOCX Parsing | Mammoth.js | 150 KB | ✅ |
| Excel Parsing | SheetJS | 500 KB | ✅ |
| EPUB Parsing | EPub.js | 100 KB | ✅ |
| OCR | Tesseract.js | 10 MB* | ✅ |
| TTS | Web Speech API | 0 KB | Native |

*Tesseract.js can load language data on demand to reduce initial load

---

## 8. Next Steps

1. Review and approve this plan
2. Decide on which file types are priority
3. Implement Phase 1 (text documents)
4. Test with different LLM providers
5. Add remaining phases iteratively
