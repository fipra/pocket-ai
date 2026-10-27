import importlib.util
import json
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path


spec = importlib.util.spec_from_file_location("export_model", Path(__file__).with_name("export_model.py"))
export_model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export_model)


def bundle(path, *, llama3):
    path.mkdir()
    (path / "config.json").write_text(json.dumps({"model_type": "llama" if llama3 else "qwen2"}))
    (path / "tokenizer.json").write_text(json.dumps({
        "model": {"type": "BPE", "vocab": {"<|begin_of_text|>": 1, "<|eot_id|>": 2} if llama3 else {"a": 1}},
        "added_tokens": [],
    }))
    (path / "tokenizer_config.json").write_text(json.dumps({"chat_template": "{{ messages }}"}))
    (path / "model.safetensors").write_bytes(b"trained weights")


class ExportTokenizerTests(unittest.TestCase):
    def test_original_gguf_bpe_metadata_is_copied_exactly(self):
        class FakeField:
            def __init__(self, value, types):
                self.value, self.types = value, types

            def contents(self):
                return self.value

        class FakeReader:
            fields = {
                "general.architecture": FakeField("llama", ["string"]),
                "tokenizer.ggml.model": FakeField("gpt2", ["string"]),
                "tokenizer.ggml.tokens": FakeField(["a", "b"], ["array", "string"]),
                "tokenizer.ggml.merges": FakeField(["a b"], ["array", "string"]),
                "tokenizer.ggml.bos_token_id": FakeField(0, ["uint32"]),
                "tokenizer.ggml.eos_token_id": FakeField(1, ["uint32"]),
                "tokenizer.chat_template": FakeField("{{ messages }}", ["string"]),
            }

            def get_field(self, name):
                return self.fields.get(name)

        class FakeWriter:
            values = {}

            def add_key_value(self, name, value, kind, subkind):
                self.values[name] = (value, kind, subkind)

        writer = FakeWriter()
        export_model.copy_gguf_tokenizer(FakeReader(), writer)
        self.assertEqual(writer.values["tokenizer.ggml.merges"], (["a b"], "array", "string"))
        self.assertEqual(writer.values["tokenizer.ggml.eos_token_id"], (1, "uint32", None))
        self.assertNotIn("general.architecture", writer.values)

    def test_llama3_uses_training_bpe_and_excludes_sentencepiece_path(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base, fused = root / "base", root / "fused"
            bundle(base, llama3=True)
            bundle(fused, llama3=True)
            (base / "tokenizer.model").write_bytes(b"tiktoken, not SentencePiece")
            (fused / "tokenizer.model").write_bytes(b"invalid protobuf")
            (fused / "tokenizer.json").write_text("{}")
            export_model.prepare_tokenizer(base, fused)
            self.assertTrue(export_model.llama3_bpe(fused))
            self.assertFalse((fused / "tokenizer.model").exists())
            self.assertEqual((base / "tokenizer.json").read_bytes(), (fused / "tokenizer.json").read_bytes())
            self.assertEqual((fused / "model.safetensors").read_bytes(), b"trained weights")

    def test_llama3_restores_original_gguf_eos_in_export_only(self):
        class FakeField:
            data = [0, 1, 2]

            def __init__(self, value):
                self.value = value

            def contents(self, index=None):
                if index is not None:
                    return ["ordinary", "<|begin_of_text|>", "<|eot_id|>"][index]
                return self.value

        class FakeReader:
            def get_field(self, name):
                return {
                    "tokenizer.ggml.tokens": FakeField(None),
                    "tokenizer.ggml.bos_token_id": FakeField(1),
                    "tokenizer.ggml.eos_token_id": FakeField(2),
                }.get(name)

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base, fused = root / "base", root / "fused"
            bundle(base, llama3=True)
            bundle(fused, llama3=True)
            (base / "tokenizer_config.json").write_text(json.dumps({"bos_token": "<|begin_of_text|>", "eos_token": "<|begin_of_text|>"}))
            with patch.object(export_model, "gguf_reader", return_value=FakeReader()):
                export_model.prepare_tokenizer(base, fused, "original.gguf")
            self.assertEqual(export_model.json_file(fused / "tokenizer_config.json")["eos_token"], "<|eot_id|>")
            self.assertEqual(export_model.json_file(fused / "tokenizer_config.json")["eos_token_id"], 2)
            self.assertEqual(export_model.json_file(fused / "config.json")["eos_token_id"], 2)
            self.assertEqual(export_model.json_file(base / "tokenizer_config.json")["eos_token"], "<|begin_of_text|>")

    def test_other_models_keep_their_sentencepiece_tokenizer(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base, fused = root / "base", root / "fused"
            bundle(base, llama3=False)
            bundle(fused, llama3=False)
            (base / "tokenizer.model").write_bytes(b"sentencepiece")
            export_model.prepare_tokenizer(base, fused)
            self.assertEqual((fused / "tokenizer.model").read_bytes(), b"sentencepiece")

    def test_mismatched_architecture_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            base, fused = root / "base", root / "fused"
            bundle(base, llama3=True)
            bundle(fused, llama3=False)
            with self.assertRaisesRegex(ValueError, "architecture differs"):
                export_model.prepare_tokenizer(base, fused)


if __name__ == "__main__":
    unittest.main()
