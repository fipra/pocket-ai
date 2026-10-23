#!/bin/sh
cd "$(dirname "$0")" || exit 1
cargo run --release
