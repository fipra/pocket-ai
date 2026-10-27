"""Expand a selected local GGUF into a private Hugging Face training base.

The source GGUF is never changed. Transformers supports only selected architectures;
unsupported files fail here before training starts.
"""

import argparse
import json
import shutil
from pathlib import Path


PREPARATION_VERSION = 2


def source_identity(path):
    stat = path.stat()
    return {"source": str(path.resolve()), "size": stat.st_size,
            "modified_ns": stat.st_mtime_ns, "preparation_version": PREPARATION_VERSION}


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


def load_dense_gguf(source, torch, transformers):
    """Load real floating point weights, not a packed GGUF inference model."""
    options = {
        "gguf_file": source.name,
        "local_files_only": True,
        "trust_remote_code": False,
        "device_map": {"": "cpu"},
    }
    if hasattr(transformers, "GgufConfig"):
        # New Transformers releases can retain GGUF blocks. Such a model
        # cannot be serialized or used as the full-precision LoRA base.
        options["quantization_config"] = transformers.GgufConfig(dequantize=True)
        options["dtype"] = torch.float16
    else:
        # Older releases always dequantize GGUF while loading it.
        options["torch_dtype"] = torch.float16
    model = transformers.AutoModelForCausalLM.from_pretrained(str(source.parent), **options)
    if (
        getattr(model, "hf_quantizer", None) is not None
        or getattr(model, "is_quantized", False)
        or getattr(model.config, "quantization_config", None) is not None
    ):
        raise RuntimeError("GGUF loading did not produce a dense training model")
    return model


def restore_gguf_special_tokens(source, tokenizer, model):
    from gguf import GGUFReader

    reader = GGUFReader(str(source))
    vocabulary = reader.get_field("tokenizer.ggml.tokens")
    if vocabulary is None:
        raise ValueError("The selected GGUF has no tokenizer vocabulary")
    for kind in ("bos", "eos"):
        special = reader.get_field(f"tokenizer.ggml.{kind}_token_id")
        if special is None:
            continue
        token_id = special.contents()
        if not isinstance(token_id, int) or not 0 <= token_id < len(vocabulary.data):
            raise ValueError(f"The selected GGUF has an invalid {kind} token ID")
        token = vocabulary.contents(token_id)
        if tokenizer.convert_tokens_to_ids(token) != token_id:
            raise ValueError(f"The imported tokenizer changed the GGUF {kind} token ID")
        setattr(tokenizer, f"{kind}_token", token)
        setattr(model.config, f"{kind}_token_id", token_id)
        if getattr(model, "generation_config", None) is not None:
            setattr(model.generation_config, f"{kind}_token_id", token_id)


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
        import transformers
        from transformers import AutoTokenizer
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
        model = load_dense_gguf(source, torch, transformers)
        restore_gguf_special_tokens(source, tokenizer, model)
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
