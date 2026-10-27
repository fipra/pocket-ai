#!/bin/zsh
set -e
cd "${0:A:h}"
PYTHON=$(command -v python3.11 || command -v python3)
if [[ -z "$PYTHON" ]]; then
  echo "Install Python 3.11, then run this installer again."
  read -k 1
  exit 1
fi
"$PYTHON" -c 'import sys; assert sys.version_info >= (3, 11), "Python 3.11 or newer is required"'
"$PYTHON" -m venv PocketAI-data/gguf-venv
PocketAI-data/gguf-venv/bin/python3 -m pip install --upgrade pip
PocketAI-data/gguf-venv/bin/python3 -m pip install 'torch>=2.4' 'transformers>=4.57,<5' 'mlx-lm[train]' gguf sentencepiece safetensors accelerate protobuf tiktoken numpy pyyaml requests tqdm
echo "GGUF conversion tools are ready. Restart LlamaNest and choose the GGUF file in Laboratory."
read -k 1
