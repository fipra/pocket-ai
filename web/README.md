# USB-AI Web

This directory contains two separate interfaces. `index.html` and `i18n.js` are embedded by the existing Rust desktop application; keep them unchanged. `usb-ai-web/` is the independent browser app. Its Vite build outputs to `web/dist/` and never uses the desktop localhost API.

## Run and deploy

From `web/`:

```sh
npm install
npm run dev
npm test
npm run build
```

For a local double-click launch, use `usb-ai-web/Open USB-AI Web.command` on macOS or `usb-ai-web/Open USB-AI Web.bat` on Windows. Node.js and internet access are needed for the first dependency installation. Keep the terminal window open while using the app. Opening the source `index.html` directly as a `file://` page cannot run the app: browser modules, model cache, and PWA storage need an HTTP or HTTPS origin. The source page displays launcher instructions in this case.

The repository's main Vercel project builds the landing page and publishes USB-AI Web at `/app/`. Its hero button points to that path, so the same URL works on phones and computers. The root `vercel.json` runs the web build with `USB_AI_WEB_BASE=/app/` and copies it into the static site output.

USB-AI Web can also be deployed as an independent Vercel project: import the repository again with **Root Directory** set to `web`. Use `npm run build` and output directory `dist`. The `web/vercel.json` supplies cross-origin isolation headers for browser inference. The default build base is `/` in this separate project.

## What runs locally

- Wllama runs GGUF models in a browser worker using WebAssembly, and may use WebGPU where supported. Inference is on the user's device; there is no cloud inference endpoint, Ollama, account, or server API.
- The catalog includes Qwen 2.5 0.5B and a smaller 105 MB SmolLM2 135M model for phones. SmolLM2 is mainly useful in English and has limited answer quality. Downloads are checked against pinned sizes and SHA-256 hashes before selection; sources and licenses are linked in the UI.
- Model search reads public Hugging Face GGUF metadata directly from the browser. Search results must include an exact file size and LFS SHA-256; downloads are checked against both before use. Files above 2 GB, projector files, and model shards are omitted from search. Local split files can still be selected together.
- Users can select GGUF files with the standard file picker, including **Browse > Files** on iOS. For split GGUF models, select every shard together. Local file selection is validated by Wllama when loaded.
- Chats, settings, extracted document text, and selected local model blobs are stored in IndexedDB. Downloaded models use Wllama's browser cache. Chat responses stream into the current message and Stop aborts generation. The loaded model stays in memory between prompts.
- Local document retrieval supports TXT, Markdown, CSV, JSON, and text-based PDFs (up to 20 MB each). It uses lexical matching and places excerpts in the prompt; PDFs are parsed in the browser. Scanned PDFs require OCR, which is not included.
- Five UI languages follow the browser language on first use and can be changed later. The choice is saved locally.
- The service worker caches the shell, bundled JavaScript, PDF worker, and Wllama WASM after their first use. Downloaded models remain in browser storage and can be reused offline, subject to browser storage policy.

## Browser limits

Browser memory, GPU support, IndexedDB quota, and persistent storage vary by device and browser. Small Q4 GGUF models are the practical starting point on phones. Large models can fail to load, even when the file picker accepts them. Wllama notes a 2 GB per-file ArrayBuffer limit; larger models need GGUF splits. WebGPU is not guaranteed, so WebAssembly is the fallback. On iOS, PWA installation uses Safari's **Add to Home Screen** command. A local model that cannot be saved to IndexedDB remains available only during the current page session. Clearing site data deletes chats, documents, and cached models. Private data is stored locally but is not encrypted by this app.

Safari needs Wllama's compatibility WASM and worker. These assets are bundled and served from the same site. On iPhone/iPad, model loading uses CPU mode with a smaller context and batch to reduce memory pressure. A model can still fail if the device or browser cannot allocate enough memory. Try a smaller quantized GGUF and keep the tab open while it loads.

The model dialog displays a spinner and loading text while downloading or opening a model. A load that has not completed within 90 seconds on iPhone/iPad (180 seconds elsewhere) reports an error so the controls do not remain disabled indefinitely. After a timeout, reopen the page before trying another model because the browser worker may still hold memory.

Model downloads require internet the first time and the model host must allow browser cross-origin requests. The PWA is offline-capable after the app shell and a model have been loaded at least once. Browser inference performance will usually differ from native desktop inference.

## Verification

Run `npm test` and `npm run build` from `web/`. Then test a real model on target browsers: download Qwen 0.5B, verify streaming, Stop, a second prompt without reloading, page reload with chat persistence, local file selection, document retrieval, and offline launch. Desktop packaging and inference should be tested independently on macOS and Windows before a desktop release.
