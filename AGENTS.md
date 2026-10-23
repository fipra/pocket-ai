# Repository Guidelines

## Structure

USB AI is a Rust application. `src/main.rs` implements the localhost HTTP server, workspace persistence, document retrieval, model selection, and inference through `llama-cli`. `web/index.html` contains the browser interface. `models/default-model.json` pins the optional first-run download; `models/QWEN-LICENSE.txt` provides the default model's license. `scripts/` creates portable macOS and Windows packages. `PocketAI-data/`, GGUF weights, `target/`, and `release/` are local/generated and ignored.

## Build and test

- `cargo run --release`: run locally; needs `llama-cli` and `pdftotext` for PDFs.
- `cargo fmt --check`: check Rust formatting.
- `cargo test --offline`: run unit tests using cached dependencies.
- `cargo build --release --locked`: build the native executable.
- `python3 scripts/package-mac.py`: create a portable Mac folder on a Mac.
- `powershell -ExecutionPolicy Bypass -File scripts\package-windows.ps1`: create a portable Windows folder on Windows.

## Style and tests

Use `rustfmt` and keep operations inside the local application and restricted localhost API. Add focused Rust tests for retrieval, file validation, model download integrity, and persistence changes. Review `web/index.html` for DOM injection and loading states. Test packaging and actual model inference on each intended platform; a successful Rust build alone is insufficient.

## Security and data

Keep private documents, conversations, downloaded weights, and generated packages out of version control. Never weaken the localhost bind or allow arbitrary filesystem paths from browser requests. Verify the downloaded default model against the pinned size and SHA-256 before use. Respect third-party licenses. The portable workspace is not encrypted.
