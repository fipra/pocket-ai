"""CUDA LoRA worker for the Windows Laboratory.

The Rust application writes this file into its private run directory. Model paths and
dataset paths come from the application's native folder picker and workspace.
"""

import argparse
import json
import sys
from pathlib import Path


def prompt_tokens(tokenizer, prompt):
    if getattr(tokenizer, "chat_template", None):
        return tokenizer.apply_chat_template(
            [{"role": "user", "content": prompt}],
            tokenize=True,
            add_generation_prompt=True,
        )
    return tokenizer("User: " + prompt + "\nAssistant:", add_special_tokens=True).input_ids


def training_row(tokenizer, prompt, completion, max_length=1024):
    prefix = prompt_tokens(tokenizer, prompt)
    answer = tokenizer(completion, add_special_tokens=False).input_ids
    if tokenizer.eos_token_id is not None:
        answer.append(tokenizer.eos_token_id)
    if not answer:
        raise ValueError("Training answer produced no tokens")
    answer = answer[: max_length - 1]
    prefix = prefix[-(max_length - len(answer)) :]
    tokens = prefix + answer
    return {"input_ids": tokens, "attention_mask": [1] * len(tokens), "labels": [-100] * len(prefix) + answer}


def read_dataset(path, tokenizer):
    rows = []
    with Path(path).open(encoding="utf-8") as stream:
        for line in stream:
            item = json.loads(line)
            if not isinstance(item.get("prompt"), str) or not isinstance(item.get("completion"), str):
                raise ValueError("Training dataset contains an invalid pair")
            rows.append(training_row(tokenizer, item["prompt"], item["completion"]))
    if len(rows) < 5:
        raise ValueError("Training requires at least five examples")
    return rows


def cuda_dependencies():
    try:
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
        from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training
    except ImportError as error:
        raise RuntimeError("CUDA training packages are missing. Run Installa Fine Tuning GPU.cmd.") from error
    if not torch.cuda.is_available():
        raise RuntimeError("PyTorch cannot access a CUDA GPU. Check the NVIDIA driver and CUDA PyTorch installation.")
    print("CUDA GPU: " + torch.cuda.get_device_name(0), file=sys.stderr, flush=True)
    return torch, AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training


def tokenizer_for(folder, tokenizer_class):
    tokenizer = tokenizer_class.from_pretrained(folder, local_files_only=True, trust_remote_code=False)
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    return tokenizer


def quantized_model(folder, dependencies):
    torch, model_class, _, bnb_class, *_ = dependencies
    dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    quantization = bnb_class(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_use_double_quant=True,
        bnb_4bit_compute_dtype=dtype,
    )
    model = model_class.from_pretrained(
        folder,
        local_files_only=True,
        trust_remote_code=False,
        quantization_config=quantization,
        device_map={"": 0},
        torch_dtype=dtype,
    )
    return model, dtype


def train(args):
    deps = cuda_dependencies()
    torch, _, tokenizer_class, _, lora_class, peft_class, get_peft_model, prepare_kbit = deps
    tokenizer = tokenizer_for(args.model, tokenizer_class)
    examples = read_dataset(args.data, tokenizer)
    model, dtype = quantized_model(args.model, deps)
    model.config.use_cache = False
    model = prepare_kbit(model, use_gradient_checkpointing=True)
    if args.resume:
        model = peft_class.from_pretrained(model, args.resume, is_trainable=True, local_files_only=True)
    else:
        config = lora_class(
            r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            bias="none",
            task_type="CAUSAL_LM",
            target_modules="all-linear",
        )
        model = get_peft_model(model, config)
    model.train()
    optimizer = torch.optim.AdamW((p for p in model.parameters() if p.requires_grad), lr=2e-4)
    scaler = torch.amp.GradScaler("cuda", enabled=dtype == torch.float16)
    for step in range(args.iters):
        row = examples[step % len(examples)]
        batch = {key: torch.tensor([value], device="cuda") for key, value in row.items()}
        optimizer.zero_grad(set_to_none=True)
        with torch.autocast("cuda", dtype=dtype):
            loss = model(**batch).loss
        if not torch.isfinite(loss):
            raise RuntimeError("Training loss is not finite")
        scaler.scale(loss).backward()
        scaler.step(optimizer)
        scaler.update()
        print(f"[{step + 1}/{args.iters}] loss={loss.item():.4f}", flush=True)
    model.save_pretrained(args.adapter, safe_serialization=True)
    if not (Path(args.adapter) / "adapter_model.safetensors").is_file():
        raise RuntimeError("LoRA adapter was not saved")


def preview(args):
    deps = cuda_dependencies()
    torch, _, tokenizer_class, _, _, peft_class, *_ = deps
    tokenizer = tokenizer_for(args.model, tokenizer_class)
    base, _ = quantized_model(args.model, deps)
    model = peft_class.from_pretrained(base, args.adapter, is_trainable=False, local_files_only=True)
    model.eval()
    tokens = prompt_tokens(tokenizer, args.prompt)
    inputs = torch.tensor([tokens], device="cuda")
    with torch.inference_mode():
        result = model.generate(
            input_ids=inputs,
            attention_mask=torch.ones_like(inputs),
            max_new_tokens=args.max_tokens,
            do_sample=False,
            pad_token_id=tokenizer.pad_token_id,
        )
    print(tokenizer.decode(result[0, len(tokens) :], skip_special_tokens=True).strip(), end="")


def merge(args):
    deps = cuda_dependencies()
    torch, model_class, tokenizer_class, _, _, peft_class, *_ = deps
    tokenizer = tokenizer_for(args.model, tokenizer_class)
    base = model_class.from_pretrained(
        args.model,
        local_files_only=True,
        trust_remote_code=False,
        device_map={"": "cpu"},
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    )
    model = peft_class.from_pretrained(base, args.adapter, is_trainable=False, local_files_only=True)
    model = model.merge_and_unload()
    model.save_pretrained(args.output, safe_serialization=True, max_shard_size="2GB")
    tokenizer.save_pretrained(args.output)
    if not (Path(args.output) / "config.json").is_file():
        raise RuntimeError("Merged model was not saved")


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="action", required=True)
    train_parser = sub.add_parser("train")
    train_parser.add_argument("--model", required=True)
    train_parser.add_argument("--data", required=True)
    train_parser.add_argument("--adapter", required=True)
    train_parser.add_argument("--iters", type=int, required=True)
    train_parser.add_argument("--resume")
    preview_parser = sub.add_parser("preview")
    preview_parser.add_argument("--model", required=True)
    preview_parser.add_argument("--adapter", required=True)
    preview_parser.add_argument("--prompt", required=True)
    preview_parser.add_argument("--max-tokens", type=int, default=160)
    merge_parser = sub.add_parser("merge")
    merge_parser.add_argument("--model", required=True)
    merge_parser.add_argument("--adapter", required=True)
    merge_parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        {"train": train, "preview": preview, "merge": merge}[args.action](args)
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
