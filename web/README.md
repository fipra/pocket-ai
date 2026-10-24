# USB-AI Web

**Temporary phone restriction:** USB-AI Web does not start on iPhone or Android smartphones while model loading is too slow and unreliable. The landing page shows a short “PC and Mac only” note and an alert when phone users tap the Mac, Windows, or Web actions. Mac, Windows, and tablet browsers remain available. The illustrative landing page demo remains accessible on phones. This is a browser UI restriction, not an access-control boundary.

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

The repository's main Vercel project builds the landing page and publishes USB-AI Web at `/app/`. The root `vercel.json` runs the web build with `USB_AI_WEB_BASE=/app/` and copies it into the static site output. Smartphone visitors see a temporary availability notice instead of the app.

USB-AI Web can also be deployed as an independent Vercel project: import the repository again with **Root Directory** set to `web`. Use `npm run build` and output directory `dist`. The `web/vercel.json` supplies cross-origin isolation headers for browser inference. The default build base is `/` in this separate project.

## What runs locally

- Wllama runs GGUF models in a browser worker using WebAssembly, and may use WebGPU where supported. Inference is on the user's device; there is no cloud inference endpoint, Ollama, account, or server API.
- The catalog includes Qwen 2.5 0.5B and a smaller 105 MB SmolLM2 135M model. SmolLM2 is mainly useful in English and has limited answer quality. Downloads are checked against pinned sizes and SHA-256 hashes before selection; sources and licenses are linked in the UI.
- On desktop Chrome and Edge, the first model download asks the user to select **Downloads**. The app creates `Downloads/usb-ai-models/` and streams verified GGUF files there. The app stores a file handle in IndexedDB, not another copy of the model; later sessions may require renewed file permission. Previously cached models can be moved with **Save to folder**, which downloads and verifies them again before removing the browser cache copy. Removing a folder model from the app list does not delete its GGUF file.
- Folder-backed models show their chosen folder and a **Show folder** button. Browsers cannot open Finder or File Explorer directly from a website; this button opens the system directory picker at the model's folder so users can locate the GGUF file. Existing folder-backed model records without a saved directory handle use the file handle as the picker starting point.
- Safari and Firefox do not provide the directory picker needed to create a folder inside Downloads from a website. They keep the existing browser-cache flow. Users can follow the model source link, save the GGUF with the browser, put it in `Downloads/usb-ai-models/` themselves, and select it through **Choose GGUF files**. A website cannot silently choose or create the user's Downloads directory in those browsers.
- Model search reads public Hugging Face GGUF metadata directly from the browser. Users can search by model name or GGUF filename. Search results must include an exact file size and LFS SHA-256; supported downloads are checked against both before use. Files under 32 MB, auxiliary GGUFs, and model shards are omitted. All matching files in each returned repository are listed, with Web-compatible files first. Each result shows rough minimum and recommended RAM estimates based on file size plus inference overhead; actual browser memory needs vary with context size, model architecture, and GPU use. Single files above 2 GB are shown with a Web compatibility warning and cannot be downloaded through the app. Local split files can still be selected together.
- Users can select GGUF files with the standard file picker. For split GGUF models, select every shard together. Local file selection is validated by Wllama when loaded.
- Chats, settings, extracted document text, and selected local model blobs are stored in IndexedDB. Downloaded models use files in `usb-ai-models` when directory access is available, otherwise Wllama's browser cache. Chat responses stream into the current message and Stop aborts generation. The loaded model stays in memory between prompts.
- Local document retrieval supports TXT, Markdown, CSV, JSON, and text-based PDFs (up to 20 MB each). It uses lexical matching and places excerpts in the prompt; PDFs are parsed in the browser. Scanned PDFs require OCR, which is not included.
- Five UI languages follow the browser language on first use and can be changed later. The choice is saved locally.
- The service worker caches the shell, bundled JavaScript, PDF worker, and Wllama WASM after their first use. Downloaded models remain in browser storage and can be reused offline, subject to browser storage policy.

## Browser limits

Browser memory, GPU support, IndexedDB quota, and persistent storage vary by device and browser. Large models can fail to load, even when the file picker accepts them. Wllama notes a 2 GB per-file ArrayBuffer limit; larger models need GGUF splits. WebGPU is not guaranteed, so WebAssembly is the fallback. A local model that cannot be saved to IndexedDB remains available only during the current page session. Clearing site data deletes chats, documents, and cached models. Private data is stored locally but is not encrypted by this app.

Safari needs Wllama's compatibility WASM and worker. These assets are bundled and served from the same site. Smartphone use is currently disabled because even small models can take too long to load. Tablets are still allowed, subject to browser memory limits.

The model dialog displays a spinner and loading text while downloading or opening a model. A load has a five-minute safety limit. After a timeout, reopen the page before trying another model because the browser worker may still hold memory.

Model downloads require internet the first time and the model host must allow browser cross-origin requests. The PWA is offline-capable after the app shell and a model have been loaded at least once. Browser inference performance will usually differ from native desktop inference.

## Verification

Run `npm test` and `npm run build` from `web/`. Then test a real model on target browsers: download Qwen 0.5B, verify streaming, Stop, a second prompt without reloading, page reload with chat persistence, local file selection, document retrieval, and offline launch. Desktop packaging and inference should be tested independently on macOS and Windows before a desktop release.
