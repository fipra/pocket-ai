# USB AI Rust

USB AI Rust is a local, portable assistant. The Rust application opens its interface in your browser and runs GGUF models through `llama-cli`. It supports local chat, keyword search over text PDFs/TXT/Markdown, PDF page references, persistent conversations, and Markdown export. It does not require an account or cloud API. The interface defaults to English. Select Italian, German, French or Spanish from the sidebar; the choice is saved and guides the response language unless you ask for another language.

## Run from source

Install Rust, `llama-cli` from llama.cpp, and `pdftotext` from Poppler for PDF import. Put a compatible instruct `.gguf` file in `models/`, then run:

```bash
cargo run --release
```

The browser normally opens at `http://127.0.0.1:48157`. If that port is occupied, the app chooses a free port through `48167` and opens the correct address. The server binds only to localhost. The model picker shows detected total RAM, logical cores and architecture, with conservative guidance for 0.5B, 3B, 7B and 9B models. Downloads start only after a click, show progress and verify SHA-256 and GGUF format before use. Internet is needed once for each model download; normal chat and document use stay offline afterward. You can also put your own compatible instruct GGUF in `models/`. Data lives in `PocketAI-data/` and is **not encrypted**. Model weights are not tracked in the repository. See [models/catalog.json](models/catalog.json) for model sources and licenses.

## Portable USB packages

On macOS, run `python3 scripts/package-mac.py`. Copy the entire `release/USB-AI-Rust-mac-<architecture>/` folder to your USB drive and double-click `Avvia USB AI Rust.command`. The package contains the local model files and the required tools and libraries. Build on a Mac with the same architecture as the target Mac. The build is not Developer ID signed or notarized.

On Windows x64, download **USB-AI-Rust-Windows-x64.zip** from the [portable Windows release](https://github.com/fipra/usb-ai/releases/tag/rust-windows-portable). Extract the complete folder and double-click `Avvia USB AI Rust.cmd`. The destination PC needs no Rust, Cargo, PowerShell setup, or other installation. Choose and download a model in the interface on first use; afterward the USB folder works offline. Data and downloaded models remain in the portable folder. This x64 build still needs testing on a physical Windows PC. The old `Prepara.USB.AI.0.1.0.exe` release is the former Electron app.

Developers can recreate the package on Windows with `scripts/package-windows.ps1` after installing Rust, `llama-cli.exe`, and `pdftotext.exe`. GitHub Actions generates the release above automatically.

## Current limits

Each answer launches `llama-cli` and reloads the model. There is no token streaming or stop control yet. Search is keyword based, and scanned PDFs need OCR. Imported files are limited to 20 MB. Use `POCKET_AI_HOME` for a different data directory, `USB_AI_DIR` for a different base directory, and `LLAMA_CLI` or `PDFTOTEXT` for custom tool paths.

Run `cargo fmt --check`, `cargo test --offline`, and `cargo build --release --locked` before contributing. The application code uses the [MIT license](LICENSE); model weights and bundled tools have their own licenses.
