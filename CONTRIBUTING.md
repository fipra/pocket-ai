# Contributing to Pocket AI

Thanks for helping make local AI more accessible!

## Before you start

Check existing issues and open a discussion for major design changes. For bugs, include your OS, architecture, Node version, exact steps to reproduce, expected behavior and actual behavior. **Never upload private documents, chats, model files or secrets.**

## Development

1. Fork the repository and create a feature branch.
2. Install Node.js 22+, run `npm ci` and `npm run model:download`.
3. Make a focused change with tests where applicable.
4. Run `npm test` before opening a pull request.
5. Explain what changed, why, and how it was tested.

## Principles

- Keep core inference offline and avoid unnecessary telemetry.
- Preserve backward compatibility of the portable data folder where possible.
- Make security trade-offs explicit; do not silently weaken Electron isolation.
- Respect third-party model and dependency licenses.
- Keep interface translations consistent.

By contributing, you agree that your contributions are licensed under the repository's MIT License.
