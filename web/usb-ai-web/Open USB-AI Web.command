#!/bin/zsh
set -e
cd "${0:A:h}/.."
if [[ ! -d node_modules ]]; then
  echo "Installing USB-AI Web dependencies…"
  npm install
fi
echo "Starting USB-AI Web at http://127.0.0.1:5173/"
(sleep 2; open "http://127.0.0.1:5173/") &
npm run dev -- --host 127.0.0.1
