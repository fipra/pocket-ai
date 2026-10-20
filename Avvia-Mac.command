#!/bin/bash
set -e

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

USB_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNTIME_DIR="$HOME/Library/Application Support/PocketAI-mac-runtime"

mkdir -p "$RUNTIME_DIR"

if [ ! -d "$RUNTIME_DIR/node_modules/electron/dist/Electron.app" ] || [ ! -d "$RUNTIME_DIR/node_modules/@node-llama-cpp" ]; then
  echo "Prima configurazione per questo Mac in corso..."
  cp "$USB_DIR/package.json" "$RUNTIME_DIR/package.json"
  cp "$USB_DIR/package-lock.json" "$RUNTIME_DIR/package-lock.json"
  (cd "$RUNTIME_DIR" && npm ci)
fi

rsync -a --delete --exclude='._*' "$USB_DIR/src/" "$RUNTIME_DIR/src/"
rsync -a --delete --exclude='._*' "$USB_DIR/ui/" "$RUNTIME_DIR/ui/"
ln -sfn "$USB_DIR/models" "$RUNTIME_DIR/models"

cd "$RUNTIME_DIR"
export POCKET_AI_HOME="$USB_DIR/PocketAI-data"
exec ./node_modules/.bin/electron .
