# LlamaNest by FipraAI

> [!IMPORTANT]
> **Commercial use of current LlamaNest versions requires a separate paid written license before use.** This includes internal business use, client work, paid services, resale, and integration into a commercial product. [Contact the project owner about an agreement](https://github.com/fipra/usb-ai/issues/new?title=Commercial%20licensing%20inquiry) and read the [commercial licensing terms](COMMERCIAL_LICENSE.md).
>
> Earlier copies released under MIT retain their commercial-use rights; see the [licensing history](LICENSING_HISTORY.md). Third-party tools and models have their own licenses.

A private, portable AI assistant that runs on your computer. The Rust app opens in your browser and uses `llama-server` to keep GGUF models loaded locally. It needs no account or cloud API. Keep the entire folder on a USB drive to carry your models and data with you.

[**Download for Windows x64**](https://github.com/fipra/usb-ai/releases/tag/rust-windows-stop-2026-10-24) · [**Download for macOS**](https://github.com/fipra/usb-ai/releases/tag/rust-mac-stop-2026-10-24) · [Leggi in italiano](README.it.md)

## Licensing

The existing code and releases published through commit
[`4cf59ef`](https://github.com/fipra/usb-ai/commit/4cf59ef7709235092ef3ceba74aab680a3001d4e)
remain available under the [MIT License](LICENSE-MIT-LEGACY), including its
commercial-use rights. The download links above point to the current portable
releases. See the
[licensing history](LICENSING_HISTORY.md) for the source cutoff and exact asset
digests.

For future distributions, all LlamaNest code that Fabrizio Casula owns is offered
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
- Read formatted responses with headings, lists, tables, links, and copyable code blocks in Web, Mac, and Windows.
- Quantize a local GGUF to Q8_0, Q4_K_M, Q3_K_M, or Q2_K in the Mac and Windows app using bundled `llama-quantize`.
- Import text PDFs, TXT, and Markdown files (up to 20 MB each).
- Search documents by keyword, with excerpts and PDF page numbers.
- In the local Laboratory, choose a compatible GGUF file or a complete Hugging Face model folder for fine tuning, then export a new GGUF for the desktop chat. Distillation can generate reviewable examples from documents or questions.
- Save conversations and export them as Markdown.
- Choose among curated 0.5B, 3B, 7B, and 9B models with guidance based on your computer's RAM and CPU cores.
- Use the interface in English by default, or select Italian, German, French, or Spanish in the sidebar. The saved choice also guides the language of model responses unless you ask for another language.

The app normally opens at `http://127.0.0.1:48157`. If that port is busy, it picks a free port through `48167` and opens the right address. The normal launcher listens only on your computer. On Windows, use `Avvia LlamaNest LAN.cmd` to also open it from other computers at `http://SERVER-NAME:PORT/` or `http://SERVER-IP:PORT/`. The LAN launcher sets `USB_AI_BIND_ADDR=0.0.0.0`; the app prints the selected port. Both launchers use a Vulkan GPU when available and fall back to the CPU. Allow the selected TCP port through Windows Firewall for trusted networks. LAN mode has no login and uses unencrypted HTTP, so anyone who can reach the port can access the workspace. Data is stored **without encryption** in `PocketAI-data/`.

Laboratory fine tuning and GGUF export run on an Apple Silicon Mac with MLX-LM or on Windows with an NVIDIA CUDA GPU and the optional training tools installed. **Choose GGUF file** selects the model you use in chat; **Choose model folder** also accepts a complete Hugging Face model. A compatible GGUF is converted locally into trainable weights before fine tuning, requiring extra RAM and free disk space. On Mac, LlamaNest reuses the Python environment already used by MLX-LM when it has GGUF conversion dependencies; only missing dependencies require `Installa Fine Tuning GGUF.command`. Verified catalog GGUFs can also use their matching full-precision training base. Windows setup is described below. In Distillation, the teacher can be a local GGUF (offline) or an OpenRouter model whose terms permit this use. OpenRouter can answer saved questions or generate examples from a document or topic. The API key stays in the unencrypted local workspace until removed; document excerpts, questions, or topics sent to OpenRouter reach the model provider and may incur charges. Review all generated examples before training. Word `.docx` extraction uses Python 3; text PDF extraction uses `pdftotext`. Scanned PDFs need OCR first. Training on examples does not guarantee that the model will recall every detail in a document; include source documents when exact answers matter.

Open **Models → Quantize Model** in a build that includes `llama-quantize`. Choose a local GGUF and a target precision. The app estimates RAM and free disk space before starting, writes progress in the background, and lets you cancel. It keeps the source file and adds the completed result to the model library with a suffix such as `-Q3_K_M.gguf`. Quantizing an already quantized model can significantly reduce quality; it requires explicit confirmation. Prefer an F16/BF16/F32 source. Older release ZIPs may not yet contain `llama-quantize`; build the current source or use a newly published package that includes it. The standalone Web app links to the desktop releases for this feature.

Free space for quantization is checked on the drive containing the app's `models/` output folder. The preflight estimate reserves approximately the source GGUF size plus a margin, so a Q2 result may use less space than the estimate. On Windows, the check uses the output folder's volume directly.

## Portable USB packages

### Windows x64

1. Download [**USB-AI-Rust-Windows-x64.zip**](https://github.com/fipra/usb-ai/releases/download/rust-windows-stop-2026-10-24/USB-AI-Rust-Windows-x64.zip).
2. Extract the complete folder to your USB drive or another location.
3. Double-click `Avvia LlamaNest.cmd`. It uses a detected Vulkan GPU (including NVIDIA RTX) and falls back to the CPU when no Vulkan device is available. Use `Avvia LlamaNest GPU.cmd` for an explicit GPU start that reports an error if Vulkan is unavailable. The corresponding network launchers are `Avvia LlamaNest LAN.cmd` and `Avvia LlamaNest LAN GPU.cmd`.
4. Open **Models → Import GGUF into models** to select a model already on the PC, or send your first prompt and choose a download. Chat and document search then work offline.

The destination PC does **not** need Rust or Cargo. Keep the whole folder together. Imported and newly downloaded models are stored in `USB-AI-Rust-Windows-x64\models`; importing copies the GGUF and keeps the source file. Files downloaded by older versions in `PocketAI-data\models` remain discoverable. GPU mode needs a working Vulkan graphics driver. Run `bin\gpu\llama-server.exe --list-devices` to check which GPU the bundled runtime detects. This build is for Windows x64. The automated Windows build checks the package and included tools, but GPU inference on a physical Windows PC still needs testing.

For Windows fine tuning, install Python 3.11 and double-click `Installa Fine Tuning GPU.cmd` in the extracted folder. It downloads CUDA PyTorch, PEFT, Transformers, bitsandbytes, and conversion dependencies into `PocketAI-data\cuda-venv`; the chat launcher does not need these packages. Restart the app, open Laboratory, and choose a GGUF file or a complete Hugging Face model folder. Training uses 4-bit QLoRA on the NVIDIA GPU, saves an adapter locally, and can create a GGUF for chat. A compatible NVIDIA driver, enough GPU memory, and free disk space are required. A chat template is required for the selected model. Windows adapters made before the chat-format fix must be trained again; the Laboratory marks them outdated. The automated package test cannot run real CUDA training; verify it on the target Windows server before relying on an exported model.

### macOS

Download the ZIP that matches your Mac from the [macOS release](https://github.com/fipra/usb-ai/releases/tag/rust-mac-stop-2026-10-24): **arm64** for Apple Silicon or **x86_64** for Intel. Extract the complete folder to your USB drive and double-click `Avvia LlamaNest.command`. Send your first prompt to download the default model, or choose another model. The ZIP includes the app, its license, `llama-server`, `llama-cli`, `pdftotext`, and their required libraries; it does not include model weights or personal data.

On Mac, llama.cpp uses Metal automatically when its bundled backend detects a compatible GPU. Run `bin/llama-server --list-devices` inside the extracted folder to check for `Metal:`. The Apple Silicon package build checks that Metal is available.

On first launch, the launcher verifies the bundled executables and libraries' local signatures and clears their quarantine attributes if present, before starting the app. This prevents a bundled `.dylib` from being blocked on the first prompt. The package is not Developer ID signed or notarized, so macOS may still ask you to allow the launcher itself. Developers can create the folder locally with `python3 scripts/package-mac.py` on a Mac of the same architecture.

## Models and hardware guidance

Open the model picker to see detected total RAM, logical CPU cores, and architecture. On a fresh installation, the first prompt automatically downloads, verifies, and starts Qwen 2.5 0.5B. It then sends that same prompt. The app verifies the pinned SHA-256 hash, exact size, and GGUF format before use. Internet is needed for the first download; afterward chat and document search run locally. You can also place a compatible instruct `.gguf` file in `models/`, import one, or find another model through search.

Qwen 2.5 0.5B is the only built-in test download (491 MB, Apache 2.0). RAM guidance is an estimate based on total RAM; actual speed also depends on GPU, context length, and other open programs. The download source, hash, and license are recorded in [models/catalog.json](models/catalog.json). Model weights are not tracked in this repository. Check each model's license before redistributing it.

## Run from source

Install Rust, `llama-server`, and `llama-cli` from llama.cpp. Install `pdftotext` from Poppler if you want PDF import. On macOS, the tools can be installed with `brew install llama.cpp poppler`. Put the executables on your PATH, then run:

```bash
cargo run --release
```

On Windows, use PowerShell to run the same Cargo command after installing Rust, `llama-server.exe`, `llama-cli.exe`, and `pdftotext.exe`. Developers can build the portable Windows folder with `scripts/package-windows.ps1`; GitHub Actions builds the downloadable ZIP automatically.

## Data, limits, and development


- `POCKET_AI_HOME` selects another data directory. `USB_AI_DIR` selects the base directory containing `models/` and, by default, `PocketAI-data/`.
- `LLAMA_SERVER` and `PDFTOTEXT` select alternate tool executables.
- The first answer starts `llama-server`; subsequent answers reuse the loaded model until another GGUF is selected or LlamaNest closes. Answers appear as they are generated. Stop ends the current answer and keeps any text already generated, so you can send another prompt.
- Document search is keyword based. Scanned PDFs require OCR before import.

Before contributing, run:

```bash
cargo fmt --check
cargo test --offline
cargo build --release --locked
```

See [VERIFICHE.md](VERIFICHE.md) for verification status and the licensing section above before using or distributing a future version.
