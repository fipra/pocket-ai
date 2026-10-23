# Contributing to USB AI Rust

Please include your OS and architecture, reproduction steps, and expected versus actual behavior in bug reports. Do not attach private documents, chats, model weights, or secrets.

For code changes, run `cargo fmt --check`, `cargo test --offline`, and `cargo build --release --locked`. Add focused tests for behavior changes. If you modify packaging, verify the package on the target operating system and list any checks you could not run.

Keep inference local, preserve the portable workspace format where practical, and respect model and tool licenses. Contributions to the application source are licensed under [MIT](LICENSE).
