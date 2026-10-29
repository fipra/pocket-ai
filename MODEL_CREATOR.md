# Model Creator Lab (experimental)

Model Creator is a desktop-only local research tool. It trains a decoder-only
Transformer from randomly initialized weights, not an adapter or pretrained
model. Small datasets can be memorized without producing useful generalization.
Neither the training nor model generation uses an external model or API.

## Installation and launch

The desktop Model Creator Lab is reachable from the main sidebar under
**Laboratory**. Python 3 and PyTorch must already be installed on the computer that
runs LlamaNest. GGUF export additionally requires the `gguf` Python package in
the same Python environment. These packages are not bundled in the portable ZIP.
The model creator worker is embedded in the Rust binary and written into the
local workspace when needed. For example, on macOS:

```sh
python3 -m venv .venv-creator
.venv-creator/bin/python -m pip install torch gguf
LLAMANEST_CREATOR_PYTHON="$PWD/.venv-creator/bin/python" cargo run --release
```

For a packaged macOS app, set `LLAMANEST_CREATOR_PYTHON` to the absolute Python
path before launching `bin/usb-ai-rust` from the package directory. On Windows:

```powershell
py -3 -m venv .venv-creator
.\.venv-creator\Scripts\python.exe -m pip install torch gguf
$env:LLAMANEST_CREATOR_PYTHON = (Resolve-Path .\.venv-creator\Scripts\python.exe).Path
.\bin\usb-ai-rust.exe
```

For a source checkout, replace the last line with `cargo run --release`. Select
CPU, MPS (Apple Silicon) or CUDA in the UI and use **Check available devices**.
CUDA requires a compatible PyTorch installation and GPU driver. The requested
device must be available: the worker never silently switches devices.

## Datasets and training

Choose an architecture and inspect its parameter count and estimated memory.
The estimates are not a guarantee; a 6 GB estimated limit prevents oversized
configurations. The default Small preset has about 1.9 million parameters.
The tokenizer orders UTF-8 bytes according to their frequency in training data,
retains all 256 byte values and adds four reserved markers. Extra configured
vocabulary slots are reserved but unused. This allows arbitrary UTF-8 text and
requires no downloads.

Import at most 2 MB and at least three distinct examples. Question/answer data
can be JSON arrays, JSONL, CSV with `question,answer` columns, or TXT with one
question and answer separated by a tab on each line. JSON and JSONL also accept
`prompt` and `completion`. Example:

```json
[
  {"question":"What pumps blood?","answer":"The heart."},
  {"question":"What organ helps breathing?","answer":"The lungs."},
  {"question":"What organ controls thought?","answer":"The brain."}
]
```

Language-model data uses non-empty lines in TXT, or `text` fields in CSV,
JSON or JSONL. Each example must fit into the configured byte context. The
system automatically holds out approximately 20% of distinct questions or
text examples. Identical questions are grouped to prevent crossing the split;
exact duplicates are counted. The validation preview contains up to five
examples. Question-and-answer loss masks the question and trains the answer and
end marker. A model can appear successful by memorizing repeated answers.

Choose the learning rate, batch size, epochs and seed, then start training.
The optimizer is AdamW with cross-entropy loss and gradient clipping. The
monitor shows measured training and validation loss, learning rate, gradient
norm, parameter statistics and an example generated from the held-out split.
Graph series use independent scales; use the numeric labels for exact values.
Checkpoints are written atomically after each epoch. Stop terminates the worker;
the previous complete checkpoint remains available. Resume uses the same
configuration, seed and dataset and treats the epoch value as the desired
**total**, not additional epochs. Different devices may not reproduce identical
training runs.

## Evaluate, chat, save

The evaluation button uses the held-out split, or a user-supplied unseen file in
the same format. It reports token-weighted loss, perplexity, exact matches,
training-question and exact-example overlap, and the closest training question
by character similarity. It does **not** score semantic correctness: review
meaning yourself and do not interpret lower loss as proof of understanding.

The local chat generates from the model's own checkpoint. Temperature 0 uses
greedy decoding; other settings use top-k and top-p sampling. A fixed seed makes
sampling repeatable when the execution backend and settings are compatible.
Each prompt is independent; previous chat turns are displayed but not passed
into the model. Generated token speed is measured locally.

Saved projects are reloaded from `PocketAI-data/model-creator/` when the app
restarts. Export downloads a native `.pt` checkpoint containing architecture,
tokenizer, weights, optimizer, split data and training metadata; it therefore
contains the user's training examples. Treat it as private. Importing an
exported checkpoint into another installation is not yet supported. Do not load
untrusted checkpoints.

For LlamaNest Web, select a trained model and click **Create GGUF**, then
**Download GGUF**. In the Web app, use the local GGUF import control and select
the downloaded file. The exporter preserves the trained GPT-style weights and
the dataset-derived byte vocabulary and creates an F32 GGUF; it does not use
pretrained assets. The web runtime uses the most recent user prompt only and
limits generation to the model's small training context. Prompts that exceed
that context are rejected. This conversion does not improve model quality.

## Tests and observed result

```sh
cargo fmt --check
cargo test --offline
python3 scripts/test_model_creator.py
# To exercise Rust-to-Python integration too:
LLAMANEST_CREATOR_PYTHON=/path/to/python cargo test --offline creator::tests::worker_creates_trains_reloads_and_evaluates_when_python_is_configured
```

The test suite checks parameter count, forward dimensions, causal masking,
actual weight updates, tokenizer round trips, data parsing and split isolation,
checkpoint reload, seeded generation, CPU and MPS when available. A tiny test
on CPU trained a 31,456-parameter model on synthetic heart/lungs/brain examples:
training exact match was 100%, while three separately written unseen questions
scored 1/3 exact match. The other predictions were `lungs` instead of `heart`
and `braings` instead of `brain`. This tiny controlled example is not a
benchmark and does not establish semantic generalization.

CUDA execution and testing on physical Windows hardware require separate
validation on their target systems.
