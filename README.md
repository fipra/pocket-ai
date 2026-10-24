# USB AI Rust

A private, portable AI assistant that runs on your computer. The Rust app opens in your browser and uses `llama-server` to keep GGUF models loaded locally. It needs no account or cloud API. Keep the entire folder on a USB drive to carry your models and data with you.

[**Download for Windows x64**](https://github.com/fipra/usb-ai/releases/tag/rust-windows-portable) · [**Download for macOS**](https://github.com/fipra/usb-ai/releases/tag/rust-mac-portable) · [Leggi in italiano](README.it.md)

## Licensing

The existing code and releases published through commit
[`4cf59ef`](https://github.com/fipra/usb-ai/commit/4cf59ef7709235092ef3ceba74aab680a3001d4e)
remain available under the [MIT License](LICENSE-MIT-LEGACY), including its
commercial-use rights. The download links above point to previously published
release assets; this licensing change does not alter them. See the
[licensing history](LICENSING_HISTORY.md) for the source cutoff and exact asset
digests.

For future distributions, all USB AI code that Fabrizio Casula owns is offered
under the [USB AI Personal Use License v1.0](LICENSE), including owned code
that appeared in the earlier MIT versions. Personal, educational, and
non-commercial research use is free. Commercial use, resale, commercial
redistribution, and integration into commercial products require a separate
written, paid agreement; see [commercial licensing](COMMERCIAL_LICENSE.md).
Previously MIT-licensed copies remain usable under MIT, including for
commercial purposes. Bundled tools, Rust dependencies, and downloaded models
have their own licenses.

## Features

- Chat with a local GGUF model.
- Import text PDFs, TXT, and Markdown files (up to 20 MB each).
- Search documents by keyword, with excerpts and PDF page numbers.
- Save conversations and export them as Markdown.
- Choose among curated 0.5B, 3B, 7B, and 9B models with guidance based on your computer's RAM and CPU cores.
- Use the interface in English by default, or select Italian, German, French, or Spanish in the sidebar. The saved choice also guides the language of model responses unless you ask for another language.

The app normally opens at `http://127.0.0.1:48157`. If that port is busy, it picks a free port through `48167` and opens the right address. The server listens only on your computer. Data is stored **without encryption** in `PocketAI-data/`.

## Portable USB packages

### Windows x64

1. Download [**USB-AI-Rust-Windows-x64.zip**](https://github.com/fipra/usb-ai/releases/download/rust-windows-portable/USB-AI-Rust-Windows-x64.zip).
2. Extract the complete folder to your USB drive or another location.
3. Double-click `Avvia USB AI Rust.cmd`. Your browser opens automatically.
4. Choose a model in the app and download it once. Chat and document search then work offline.

The destination PC does **not** need Rust, Cargo, or a PowerShell setup. Keep the whole folder together; downloaded models and data stay inside it. This build is for Windows x64. The automated Windows build checks the package and included tools, but use on a physical Windows PC and USB drive still needs testing. The old `Prepara.USB.AI.0.1.0.exe` release belongs to the former Electron app.

### macOS

Download the ZIP that matches your Mac from the [macOS release](https://github.com/fipra/usb-ai/releases/tag/rust-mac-portable): **arm64** for Apple Silicon or **x86_64** for Intel. Extract the complete folder to your USB drive and double-click `Avvia USB AI Rust.command`. Choose and download a model in the app on first use. The ZIP includes the app, `llama-server`, `llama-cli`, `pdftotext`, and their required libraries; it does not include model weights or personal data.

On first launch, the launcher verifies the bundled executables and libraries' local signatures and clears their quarantine attributes if present, before starting the app. This prevents a bundled `.dylib` from being blocked on the first prompt. The package is not Developer ID signed or notarized, so macOS may still ask you to allow the launcher itself. Developers can create the folder locally with `python3 scripts/package-mac.py` on a Mac of the same architecture.

## Models and hardware guidance

Open the model picker to see detected total RAM, logical CPU cores, and architecture. A download starts only after you click a model. The app shows progress and verifies its SHA-256 hash and GGUF format before use. Internet is needed for the initial download; afterward chat and document search run locally. You can also place a compatible instruct `.gguf` file in `models/`.

| Model | Approximate download | Suggested minimum RAM | More comfortable RAM | License |
|---|---:|---:|---:|---|
| Qwen 2.5 0.5B | 0.49 GB | 4 GB | 6 GB | Apache 2.0 |
| Qwen 2.5 3B | 2.1 GB | 8 GB | 10 GB | Qwen Research |
| Qwen 2.5 7B | 4.68 GB | 12 GB | 16 GB | Apache 2.0 |
| Gemma 2 9B | 5.76 GB | 16 GB | 24 GB | Gemma |

These are conservative estimates based on **total RAM**, not a measurement of free memory. Actual speed also depends on available memory, GPU, context length, and other open programs. Download sources, hashes, and licenses are recorded in [models/catalog.json](models/catalog.json). Model weights are not tracked in this repository. Check each model's license before redistributing it.

## Run from source

Install Rust, `llama-server`, and `llama-cli` from llama.cpp. Install `pdftotext` from Poppler if you want PDF import. On macOS, the tools can be installed with `brew install llama.cpp poppler`. Put the executables on your PATH, then run:

```bash
cargo run --release
```

On Windows, use PowerShell to run the same Cargo command after installing Rust, `llama-server.exe`, `llama-cli.exe`, and `pdftotext.exe`. Developers can build the portable Windows folder with `scripts/package-windows.ps1`; GitHub Actions builds the downloadable ZIP automatically.

## Data, limits, and development

- `POCKET_AI_HOME` selects another data directory. `USB_AI_DIR` selects the base directory containing `models/` and, by default, `PocketAI-data/`.
- `LLAMA_SERVER` and `PDFTOTEXT` select alternate tool executables.
- The first answer starts `llama-server`; subsequent answers reuse the loaded model until another GGUF is selected or USB AI closes. Token streaming and a stop button are not available yet.
- Document search is keyword based. Scanned PDFs require OCR before import.

Before contributing, run:

```bash
cargo fmt --check
cargo test --offline
cargo build --release --locked
```

See [VERIFICHE.md](VERIFICHE.md) for verification status and the licensing section above before using or distributing a future version.
