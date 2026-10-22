# USB AI

**Created by FipraAI** · Contact: [fabrizio.casula@gmail.com](mailto:fabrizio.casula@gmail.com)
**Your private AI assistant. Offline. Portable. Yours.**

USB AI is an open-source desktop assistant that runs language models locally using Electron and `node-llama-cpp`. Chat, search your own documents, and carry your workspace on a USB drive — without an account, cloud API, or Ollama.

> **Project status:** early release (v0.1.0). Builds are not code-signed. The default 0.5B model is small and has limited accuracy.

[Italiano](README.it.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md) · [Changelog](CHANGELOG.md)

## Highlights

- **Local chat:** inference runs on your computer; stop generation and export conversations as Markdown.
- **Ask your documents:** import text-based PDF, TXT and Markdown, and inspect retrieved excerpts (with PDF page references).
- **Portable workspace:** conversations, imported models and indexed text live in `PocketAI-data/`.
- **Five interface languages:** English, Italian, German, French and Spanish.
- **Bring your own model:** import a compatible *instruct* GGUF model.
- **Windows and macOS builds:** platform-specific packages can be built from source.

## Quick start (developers)

Requires **Node.js 22+**, a supported Windows/macOS machine, and an internet connection **once** to install dependencies and download the default model.

```bash
git clone https://github.com/fipra/usb-ai.git
cd usb-ai
npm ci
npm run model:download
npm start
```

Replace `YOUR-USERNAME` with the repository owner. `model:download` checks the downloaded model against the manifest. To run tests: `npm test`.

On macOS, you can double-click `Avvia-Mac.command` after installing Node.js 22+. It installs dependencies on first launch, which requires Internet access. If macOS blocks the downloaded launcher, run `xattr -d com.apple.quarantine Avvia-Mac.command` from the extracted project folder in Terminal and try again. If copying removed its executable permission, also run `chmod +x Avvia-Mac.command`.

## For non-developers

Download a Windows portable EXE or macOS package from **Releases**, *when a release is available*. GitHub's **Code → Download ZIP** downloads the source, not a ready-to-run application. Open the app from a writable folder, select a model and click **Load model**. Prebuilt packages are intended to contain the default model. The app is not currently signed or notarized, so your OS may display a warning.

## Use it from a USB drive

For guided setup, download **Prepara USB AI** for your operating system when a build is available. Open the compiled `.exe` or `.app`, not `preparer/index.html` in a browser; the HTML page alone cannot access the USB drive. Choose a folder on the USB drive and click **Prepara USB**. The preparer includes the compiled app and model, checks free space, copies and verifies the files, and leaves any existing `PocketAI-data/` untouched. It stops if the app is already present in the chosen folder. The Windows and Mac preparers contain separate platform builds.

Put the extracted portable app in a writable USB folder. USB AI stores its workspace in `PocketAI-data/` next to the app (or in the absolute path specified by `POCKET_AI_HOME`). Close the application before ejecting the drive. Windows and macOS can use the same data folder, **not simultaneously**.

**Privacy limitations:** inference is local, but the data folder is **not encrypted**. The host OS may retain metadata or caches. Avoid untrusted machines for sensitive data. Installation and model downloads require network access; offline use starts after setup.

## Document support

| Supported | Limitations |
|---|---|
| Text PDFs, TXT, Markdown | 20 MB per file |
| Keyword-based retrieval | Not semantic search; synonyms may be missed |
| PDF page references | Scanned PDFs need external OCR |
| Up to four retrieved excerpts | Always verify AI answers against originals |

Word, Excel and image imports are not supported in this version.

## Download and use other GGUF models

USB AI is **not limited to the bundled model**. You can import another compatible **instruct GGUF** language model and run it locally without Ollama or a cloud API.

### Import a downloaded model

1. Open the model's Hugging Face page (examples below), then select **Files and versions**.
2. Download a **single-file `Q4_K_M` GGUF** where available (not FP16 weights). Check the model's license.
3. In USB AI, open **Model and local storage → Import GGUF** (the label may appear in your selected interface language).
4. Select the downloaded `.gguf` file. USB AI copies it into `PocketAI-data/models/`, so ensure sufficient free space, especially on USB drives.
5. Select the imported model and click **Load model**.

### Example models: Qwen2.5 Instruct

The file sizes below are approximate for **Q4_K_M** quantization. RAM figures are **conservative estimates of total system RAM**, not download sizes or performance guarantees.

| Model | Approx. Q4_K_M file | Suggested system RAM | Notes |
| --- | ---: | ---: | --- |
| [Qwen2.5 0.5B](https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/tree/main) | 0.5 GB | 4 GB | Smallest option; limited answer quality. |
| [Qwen2.5 1.5B](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/tree/main) | 1.1 GB | 6 GB | First upgrade over the bundled model. |
| [Qwen2.5 3B](https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/tree/main) | 2.1 GB | 8 GB | More capable; may respond more slowly. |
| [Qwen2.5 7B](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF/tree/main) | 4.7 GB | 16 GB | For stronger machines; see split-file warning. |

**Important: split GGUF files.** Some larger releases, including the official 7B example above, are distributed in multiple parts. USB AI's import dialog accepts **one GGUF file**, so split parts must first be merged into a single compatible GGUF using an appropriate tool. For an easier start, use the single-file 1.5B or 3B examples above.

**Compatibility and performance:** Not every GGUF model or architecture works with the bundled `node-llama-cpp` runtime. Memory use also includes chat context and compute buffers, while the operating system and other applications need RAM. More RAM may let you *load* a larger model but does not guarantee fast inference; CPU/GPU support matters. Test with a small model first and respect each model's license before redistribution.

For the same instructions in Italian, see [Scegliere un modello più potente](README.it.md#scegliere-un-modello-più-potente).

## Build packages

```bash
npm ci
npm run model:download
npm test
npm run dist:win   # on Windows x64
npm run dist:mac   # on macOS
```

Outputs are written to `release/`. Native dependencies must be installed on the target platform. Apple Silicon and Intel require separate builds. The GitHub Actions build is manually triggered and uploads artifacts; it does **not** automatically publish a GitHub Release.

## Architecture

```text
src/       Electron main process and local assistant logic
ui/        Desktop interface and translations
scripts/   Model setup and build helpers
tests/     Automated tests
models/    Model manifest, attribution and licensing notices
.github/   Build and collaboration workflows
```

## Roadmap

- [ ] Verified signed/notarized releases
- [ ] Improved document retrieval
- [ ] Optional local data encryption
- [ ] Expanded model compatibility tests
- [ ] Usability improvements and screenshots

## Contribute

Bug reports, documentation fixes and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md). For security issues, see [SECURITY.md](SECURITY.md).

## License

The **application source code** is released under the [MIT License](LICENSE). Model weights and third-party dependencies retain their **own** licenses; see `models/` for the default model's notices.

Created by Fabrizio Casula.
