"""Check the tokenizer and GGUF produced by Laboratory model export.

The training base is authoritative for token IDs: LoRA was trained against it.
The script never changes model weights.
"""

import argparse
import importlib.util
import json
import shutil
import sys
from pathlib import Path


TOKENIZER_FILES = (
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "added_tokens.json",
    "chat_template.jinja",
    "vocab.json",
    "merges.txt",
    "tokenizer.model",
    "sentencepiece.bpe.model",
    "spiece.model",
)


def json_file(path):
    with path.open(encoding="utf-8") as stream:
        return json.load(stream)


def llama3_bpe(folder):
    config = json_file(folder / "config.json")
    tokenizer_path = folder / "tokenizer.json"
    if not tokenizer_path.is_file():
        return False
    tokenizer = json_file(tokenizer_path)
    if config.get("model_type") != "llama" or tokenizer.get("model", {}).get("type") != "BPE":
        return False
    vocab = tokenizer.get("model", {}).get("vocab", {})
    added = {token.get("content") for token in tokenizer.get("added_tokens", [])}
    return {"<|begin_of_text|>", "<|eot_id|>"}.issubset(set(vocab) | added)


def gguf_reader(original, gguf_package=None):
    if gguf_package:
        sys.path.insert(0, str(Path(gguf_package)))
    from gguf import GGUFReader
    return GGUFReader(str(original))


def restore_original_special_tokens(fused, original, gguf_package=None):
    reader = gguf_reader(original, gguf_package)
    tokens = reader.get_field("tokenizer.ggml.tokens")
    if tokens is None:
        raise ValueError("The original GGUF has no tokenizer vocabulary")
    tokenizer = json_file(fused / "tokenizer.json")
    available = set(tokenizer.get("model", {}).get("vocab", {})) | {
        item.get("content") for item in tokenizer.get("added_tokens", [])
    }
    config = json_file(fused / "config.json")
    tokenizer_config = json_file(fused / "tokenizer_config.json")
    special_map_path = fused / "special_tokens_map.json"
    special_map = json_file(special_map_path) if special_map_path.is_file() else {}
    for name in ("bos", "eos"):
        token_id = field(reader, f"tokenizer.ggml.{name}_token_id")
        if not isinstance(token_id, int) or token_id < 0 or token_id >= len(tokens.data):
            raise ValueError(f"The original GGUF has no valid {name} token")
        token = tokens.contents(token_id)
        if token not in available:
            raise ValueError(f"The training tokenizer is missing the original {name} token")
        config[f"{name}_token_id"] = token_id
        tokenizer_config[f"{name}_token"] = token
        tokenizer_config[f"{name}_token_id"] = token_id
        special_map[f"{name}_token"] = token
    (fused / "config.json").write_text(json.dumps(config, ensure_ascii=False), encoding="utf-8")
    (fused / "tokenizer_config.json").write_text(json.dumps(tokenizer_config, ensure_ascii=False), encoding="utf-8")
    special_map_path.write_text(json.dumps(special_map, ensure_ascii=False), encoding="utf-8")
    generation = fused / "generation_config.json"
    if generation.is_file():
        values = json_file(generation)
        values["bos_token_id"] = config["bos_token_id"]
        values["eos_token_id"] = config["eos_token_id"]
        generation.write_text(json.dumps(values, ensure_ascii=False), encoding="utf-8")


def prepare_tokenizer(base, fused, original=None, gguf_package=None):
    base, fused = Path(base), Path(fused)
    source_config = json_file(base / "config.json")
    target_config = json_file(fused / "config.json")
    if source_config.get("model_type") != target_config.get("model_type"):
        raise ValueError("The fused model architecture differs from the training base")
    source_tokenizer = base / "tokenizer.json"
    if not (source_tokenizer.is_file() or (base / "tokenizer.model").is_file()):
        raise ValueError("The training base has no tokenizer")
    bpe = llama3_bpe(base)
    for name in TOKENIZER_FILES:
        source, target = base / name, fused / name
        if bpe and name == "tokenizer.model":
            # Llama 3 uses tiktoken BPE. llama.cpp treats any tokenizer.model
            # as SentencePiece, so that file must not enter the converter.
            target.unlink(missing_ok=True)
        elif source.is_file():
            shutil.copy2(source, target)
        elif target.is_file():
            target.unlink()
    if not ((fused / "tokenizer.json").is_file() or (fused / "tokenizer.model").is_file()):
        raise ValueError("The fused model has no tokenizer")
    if bpe and (fused / "tokenizer.model").exists():
        raise ValueError("A Llama 3 BPE tokenizer cannot contain tokenizer.model")
    if source_tokenizer.is_file() and (fused / "tokenizer.json").read_bytes() != source_tokenizer.read_bytes():
        raise ValueError("The fused tokenizer differs from the training tokenizer")
    if bpe and original:
        restore_original_special_tokens(fused, original, gguf_package)
    print("Export tokenizer: Llama 3 BPE" if bpe else "Export tokenizer: training base", flush=True)


def field(reader, name):
    item = reader.get_field(name)
    return item.contents() if item else None


def same_field(first, second):
    if first is None or second is None or first.types != second.types:
        return False
    if len(first.types) > 1:
        if len(first.data) != len(second.data):
            return False
        return all(
            first.contents(slice(offset, offset + 1024)) == second.contents(slice(offset, offset + 1024))
            for offset in range(0, len(first.data), 1024)
        )
    return first.contents() == second.contents()


def copy_gguf_tokenizer(source, writer):
    """Use the exact token IDs and BPE metadata used during GGUF training."""
    if field(source, "general.architecture") != "llama" or field(source, "tokenizer.ggml.model") != "gpt2":
        raise ValueError("The source is not a Llama BPE GGUF")
    required = ("tokenizer.ggml.tokens", "tokenizer.ggml.merges", "tokenizer.ggml.bos_token_id", "tokenizer.ggml.eos_token_id")
    for name in required:
        if source.get_field(name) is None:
            raise ValueError(f"The source GGUF is missing {name}")
    for name, item in source.fields.items():
        if name.startswith("tokenizer."):
            writer.add_key_value(name, item.contents(), item.types[0], item.types[-1] if len(item.types) > 1 else None)


def convert_fused(converter, fused, outfile, original=None, vocab_only=False):
    converter = Path(converter).resolve()
    if not converter.is_file():
        raise FileNotFoundError(converter)
    sys.path.insert(0, str(converter.parent))
    spec = importlib.util.spec_from_file_location("llamanest_hf_converter", converter)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if original and llama3_bpe(Path(fused)):
        source = gguf_reader(original, converter.parent / "gguf-py")
        if field(source, "tokenizer.ggml.model") != "gpt2":
            raise ValueError("The source GGUF does not use the expected Llama BPE tokenizer")
        from conversion.llama import LlamaModel

        def set_original_vocab(model):
            copy_gguf_tokenizer(source, model.gguf_writer)

        LlamaModel.set_vocab = set_original_vocab
        print("GGUF conversion: preserving the original Llama 3 BPE tokenizer", flush=True)
    arguments = [str(converter), str(fused), "--outfile", str(outfile), "--outtype", "f16"]
    if vocab_only:
        arguments.append("--vocab-only")
    previous = sys.argv
    try:
        sys.argv = arguments
        module.main()
    finally:
        sys.argv = previous


def verify_gguf(model, base, original=None, gguf_package=None):
    base = Path(base)
    model = Path(model)
    output = gguf_reader(model, gguf_package)
    if not output.tensors:
        raise ValueError("The exported GGUF has no model tensors")
    if llama3_bpe(base):
        if field(output, "general.architecture") != "llama":
            raise ValueError("The exported GGUF is not a Llama model")
        if field(output, "tokenizer.ggml.model") != "gpt2":
            raise ValueError("Llama 3 requires the GGUF BPE tokenizer")
    if original:
        source = gguf_reader(original, gguf_package)
        for name in (
            "general.architecture",
            "tokenizer.ggml.model",
            "tokenizer.ggml.bos_token_id",
            "tokenizer.ggml.eos_token_id",
        ):
            if field(source, name) != field(output, name):
                raise ValueError(f"Exported GGUF changed {name}")
        source_tokens = source.get_field("tokenizer.ggml.tokens")
        output_tokens = output.get_field("tokenizer.ggml.tokens")
        if source_tokens and output_tokens and len(source_tokens.data) != len(output_tokens.data):
            raise ValueError("Exported GGUF changed the tokenizer vocabulary size")
        if llama3_bpe(base):
            for name, item in source.fields.items():
                if name.startswith("tokenizer.") and not same_field(item, output.get_field(name)):
                    raise ValueError(f"Exported GGUF changed {name}")
    print(f"GGUF verified: {len(output.tensors)} tensors", flush=True)


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    prepare = sub.add_parser("prepare-tokenizer")
    prepare.add_argument("--base", required=True)
    prepare.add_argument("--fused", required=True)
    prepare.add_argument("--original")
    prepare.add_argument("--gguf-package")
    verify = sub.add_parser("verify-gguf")
    verify.add_argument("--model", required=True)
    verify.add_argument("--base", required=True)
    verify.add_argument("--original")
    verify.add_argument("--gguf-package")
    convert = sub.add_parser("convert-fused")
    convert.add_argument("--converter", required=True)
    convert.add_argument("--fused", required=True)
    convert.add_argument("--outfile", required=True)
    convert.add_argument("--original")
    convert.add_argument("--vocab-only", action="store_true")
    args = parser.parse_args()
    if args.command == "prepare-tokenizer":
        prepare_tokenizer(args.base, args.fused, args.original, args.gguf_package)
    elif args.command == "verify-gguf":
        verify_gguf(args.model, args.base, args.original, args.gguf_package)
    else:
        convert_fused(args.converter, args.fused, args.outfile, args.original, args.vocab_only)


if __name__ == "__main__":
    main()
