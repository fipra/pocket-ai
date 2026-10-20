# Pocket AI

**Created by FipraAI** · Contact: [fabrizio.casula@gmail.com](mailto:fabrizio.casula@gmail.com)
**Your private AI assistant. Offline. Portable. Yours.**

Pocket AI is an open-source desktop assistant that runs language models locally using Electron and `node-llama-cpp`. Chat, search your own documents, and carry your workspace on a USB drive — without an account, cloud API, or Ollama.

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
git clone https://github.com/YOUR-USERNAME/pocket-ai.git
cd pocket-ai
npm ci
npm run model:download
npm start
```

Replace `YOUR-USERNAME` with the repository owner. `model:download` checks the downloaded model against the manifest. To run tests: `npm test`.

## For non-developers

Download a Windows portable EXE or macOS package from **Releases**, *when a release is available*. GitHub's **Code → Download ZIP** downloads the source, not a ready-to-run application. Open the app from a writable folder, select a model and click **Load model**. Prebuilt packages are intended to contain the default model. The app is not currently signed or notarized, so your OS may display a warning.

## Use it from a USB drive

Put the extracted portable app in a writable USB folder. Pocket AI stores its workspace in `PocketAI-data/` next to the app (or in the absolute path specified by `POCKET_AI_HOME`). Close the application before ejecting the drive. Windows and macOS can use the same data folder, **not simultaneously**.

**Privacy limitations:** inference is local, but the data folder is **not encrypted**. The host OS may retain metadata or caches. Avoid untrusted machines for sensitive data. Installation and model downloads require network access; offline use starts after setup.

## Document support

| Supported | Limitations |
|---|---|
| Text PDFs, TXT, Markdown | 20 MB per file |
| Keyword-based retrieval | Not semantic search; synonyms may be missed |
| PDF page references | Scanned PDFs need external OCR |
| Up to four retrieved excerpts | Always verify AI answers against originals |

Word, Excel and image imports are not supported in this version.

## Models and performance

The default build uses a small Qwen2.5 0.5B Instruct GGUF model. It prioritizes portability, **not answer quality**. Larger compatible single-file GGUF instruct models can be imported through the application; memory and speed depend on model, quantization, context length and hardware. See [the Italian guide](README.it.md#scegliere-un-modello-più-potente) for example sizes and RAM estimates. Check model licenses before redistribution.

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
