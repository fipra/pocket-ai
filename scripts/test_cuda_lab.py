import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location("cuda_lab", Path(__file__).with_name("cuda_lab.py"))
cuda_lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cuda_lab)
prepare_spec = importlib.util.spec_from_file_location("gguf_prepare", Path(__file__).with_name("gguf_prepare.py"))
gguf_prepare = importlib.util.module_from_spec(prepare_spec)
prepare_spec.loader.exec_module(gguf_prepare)


class FakeTokenizer:
    chat_template = "fixture"
    eos_token_id = 99

    def apply_chat_template(self, messages, tokenize=True, add_generation_prompt=False):
        prefix = [1] + [ord(char) for char in messages[0]["content"]] + [2]
        if add_generation_prompt:
            return prefix
        return prefix + [ord(char) for char in messages[1]["content"]] + [100]

    def get_vocab(self):
        return {"<|im_end|>": 100}


class TrainingDataTests(unittest.TestCase):
    def test_prompt_is_masked_and_answer_is_trained(self):
        row = cuda_lab.training_row(FakeTokenizer(), "question", "answer")
        self.assertEqual(row["labels"][-7:], [ord(char) for char in "answer"] + [100])
        self.assertTrue(all(token == -100 for token in row["labels"][:-7]))
        self.assertEqual(len(row["input_ids"]), len(row["labels"]))

    def test_long_prompt_keeps_answer_within_context(self):
        row = cuda_lab.training_row(FakeTokenizer(), "q" * 2000, "yes", max_length=100)
        self.assertEqual(len(row["input_ids"]), 100)
        self.assertEqual(row["labels"][-4:], [ord(char) for char in "yes"] + [100])

    def test_missing_chat_template_is_rejected_before_training(self):
        tokenizer = FakeTokenizer()
        tokenizer.chat_template = None
        with self.assertRaisesRegex(ValueError, "no chat template"):
            cuda_lab.training_row(tokenizer, "question", "answer")

    def test_preview_stops_at_assistant_end_marker(self):
        self.assertEqual(cuda_lab.response_stop_ids(FakeTokenizer()), [99, 100])

    def test_dataset_requires_five_pairs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.jsonl"
            path.write_text("".join(json.dumps({"prompt": str(i), "completion": "a"}) + "\n" for i in range(4)))
            with self.assertRaisesRegex(ValueError, "at least five"):
                cuda_lab.read_dataset(path, FakeTokenizer())

    def test_gguf_cache_requires_matching_source_and_complete_weights(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "model.gguf"
            source.write_bytes(b"GGUF" + bytes(28))
            output = root / "prepared"
            output.mkdir()
            (output / "config.json").write_text('{}')
            (output / "chat_template.jinja").write_text('{{ messages }}')
            (output / "model.safetensors").write_bytes(b"weights")
            identity = gguf_prepare.source_identity(source)
            (output / "source.json").write_text(json.dumps(identity))
            self.assertTrue(gguf_prepare.prepared(output, identity))
            source.write_bytes(b"GGUF" + bytes(32))
            self.assertFalse(gguf_prepare.prepared(output, gguf_prepare.source_identity(source)))


if __name__ == "__main__":
    unittest.main()
