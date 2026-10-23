# Security policy

USB AI Rust serves its interface only on `127.0.0.1`. Conversations and indexed documents in `PocketAI-data/` are **not encrypted**. Treat the USB drive and host computer as sensitive. The default model download is an explicit action and is verified against a pinned SHA-256 before use. Local models may still produce inaccurate answers.

Please report vulnerabilities privately through the repository's security reporting feature, if available, or contact the maintainer privately. Include reproduction steps and impact without attaching personal data.
