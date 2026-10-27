"""Expand a selected local GGUF into a private Hugging Face training base.

The source GGUF is never changed. Transformers supports only selected architectures;
unsupported files fail here before training starts.
"""

import argparse
import json
import shutil
from pathlib import Path


def source_identity(path):
    stat = path.stat()
    return {"source": str(path.resolve()), "size": stat.st_size, "modified_ns": stat.st_mtime_ns}


def prepared(output, identity):
    try:
        tokenizer_config = output / "tokenizer_config.json"
        has_template = (output / "chat_template.jinja").is_file() or (
            tokenizer_config.is_file()
            and bool(json.loads(tokenizer_config.read_text(encoding="utf-8")).get("chat_template"))
        )
        return (
            json.loads((output / "source.json").read_text(encoding="utf-8")) == identity
            and (output / "config.json").is_file()
            and any(output.glob("*.safetensors"))
            and has_template
        )
    except (OSError, ValueError):
        return False


def prepare(source, output):
    source = Path(source)
    output = Path(output)
    if not source.is_file() or source.suffix.lower() != ".gguf":
        raise ValueError("Choose a GGUF model file")
    with source.open("rb") as stream:
        if stream.read(4) != b"GGUF":
            raise ValueError("The selected file is not a GGUF model")
    identity = source_identity(source)
    if prepared(output, identity):
        print("Prepared model already available", flush=True)
        return
    free = shutil.disk_usage(output.parent).free
    if free < max(3 * 1024**3, source.stat().st_size * 5):
        raise RuntimeError("Not enough free disk space to unpack this GGUF for fine tuning")
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer
    except ImportError as error:
        raise RuntimeError("GGUF conversion tools are missing. Run the fine tuning installer.") from error
    print("Unpacking GGUF into a trainable model; this can take several minutes", flush=True)
    temporary = output.with_name(output.name + ".part")
    if temporary.exists():
        shutil.rmtree(temporary)
    temporary.mkdir(parents=True)
    try:
        tokenizer = AutoTokenizer.from_pretrained(
            str(source.parent), gguf_file=source.name, local_files_only=True, trust_remote_code=False
        )
        if not tokenizer.chat_template:
            raise ValueError("This GGUF has no chat template. Choose an instruct/chat GGUF that includes tokenizer.chat_template.")
        model = AutoModelForCausalLM.from_pretrained(
            str(source.parent), gguf_file=source.name, local_files_only=True,
            trust_remote_code=False, torch_dtype=torch.float16, device_map={"": "cpu"},
        )
        model.save_pretrained(temporary, safe_serialization=True, max_shard_size="2GB")
        tokenizer.save_pretrained(temporary)
        (temporary / "source.json").write_text(json.dumps(identity), encoding="utf-8")
        if output.exists():
            shutil.rmtree(output)
        temporary.rename(output)
    except Exception:
        shutil.rmtree(temporary, ignore_errors=True)
        raise
    print("GGUF base prepared for fine tuning", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    prepare(args.source, args.output)
