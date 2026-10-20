# Repository Guidelines

## Project Structure & Module Organization

Pocket AI is an Electron app. `src/main.mjs` owns the main process, `src/preload.cjs` exposes the restricted renderer bridge, and `src/core.mjs` contains retrieval and workspace helpers. `ui/` holds HTML, CSS, client logic, and translations. `tests/*.test.mjs` contains Node tests; `scripts/` contains launch, model, and packaging helpers. `models/` holds the manifest, license, and optional GGUF weights. `PocketAI-data/` is local runtime data. Packaging output goes to `release/`.

## Build, Test, and Development Commands

- `npm ci`: install dependencies from `package-lock.json` (Node.js 22 or newer).
- `npm run model:download`: fetch or verify the pinned GGUF model before packaging.
- `npm start`: launch the app in Electron for local development.
- `npm run start:compat`: launch with reduced Chromium sandboxing only when the normal start fails in a restricted environment.
- `npm test`: run the Node test suite.
- `npm run dist:mac` or `npm run dist:win`: verify the model, then package on the target operating system. Artifacts appear in `release/`.

## Coding Style & Naming Conventions

Follow conventions in the file you edit: ES modules (`.mjs`) for main process and shared logic, CommonJS (`.cjs`) for preload, two-space indentation in UI files, and single quotes in JavaScript. Keep renderer code behind the preload bridge; do not enable Node integration or weaken the Content Security Policy. Use descriptive camelCase names. There is no repository lint or formatter command; review formatting in the diff.

## Testing Guidelines

Add focused tests in `tests/<feature>.test.mjs` using `node:test` and `node:assert/strict`. Cover behavior changes in retrieval, persistence, localization, or IPC where practical. Run `npm test` before submitting. Packaging and model inference also require manual checks on the intended platform; see `README.md` and `VERIFICHE.md`.

## Commit & Pull Request Guidelines

This checkout has no Git history, so no established commit message convention can be verified. Use short, imperative subjects that name the change, such as `Fix document citation lookup`. Pull requests should explain the user-visible change, list test commands and results, link relevant issues, and include screenshots for UI changes. Call out any platform-specific packaging or model checks that were not run.

## Security & Local Data

Keep proxy credentials and private documents out of the repository. Do not commit generated `PocketAI-data/`, downloaded weights, or `release/` artifacts unless the change explicitly requires them. Preserve the offline runtime design and the model license and manifest when changing model packaging.
