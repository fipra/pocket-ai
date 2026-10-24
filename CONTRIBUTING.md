# Contributing to USB AI Rust

Please include your OS and architecture, reproduction steps, and expected versus actual behavior in bug reports. Do not attach private documents, chats, model weights, or secrets.

For code changes, run `cargo fmt --check`, `cargo test --offline`, and `cargo build --release --locked`. Add focused tests for behavior changes. If you modify packaging, verify the package on the target operating system and list any checks you could not run.

Keep inference local, preserve the portable workspace format where practical, and respect model and tool licenses. Original contributions first published after the [MIT baseline](LICENSE-MIT-LEGACY) are licensed under the [USB AI Personal Use License v1.0](LICENSE), unless the project expressly agrees otherwise. By submitting a contribution, you must have the right to license it under those terms. Do not submit third-party code under the project license without identifying its source, copyright owner, and license. Previously published code retains its MIT rights. Discuss a different contribution agreement with the maintainer before submitting code.

Before merging an external contribution, the maintainer must confirm its
copyright owner and whether a separate written grant permits commercial
licensing of that contribution. Submission under the personal-use license
alone does not establish that grant.
