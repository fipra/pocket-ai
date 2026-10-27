import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


spec = importlib.util.spec_from_file_location("cuda_lab", Path(__file__).with_name("cuda_lab.py"))
cuda_lab = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cuda_lab)


class FakeTokenizer:
    chat_template = None
    eos_token_id = 99

    def __call__(self, value, add_special_tokens=False):
        class Result:
            input_ids = [ord(char) for char in value]

        return Result()


class TrainingDataTests(unittest.TestCase):
    def test_prompt_is_masked_and_answer_is_trained(self):
        row = cuda_lab.training_row(FakeTokenizer(), "question", "answer")
        self.assertEqual(row["labels"][-7:], [ord(char) for char in "answer"] + [99])
        self.assertTrue(all(token == -100 for token in row["labels"][:-7]))
        self.assertEqual(len(row["input_ids"]), len(row["labels"]))

    def test_long_prompt_keeps_answer_within_context(self):
        row = cuda_lab.training_row(FakeTokenizer(), "q" * 2000, "yes", max_length=100)
        self.assertEqual(len(row["input_ids"]), 100)
        self.assertEqual(row["labels"][-4:], [ord(char) for char in "yes"] + [99])

    def test_dataset_requires_five_pairs(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "train.jsonl"
            path.write_text("".join(json.dumps({"prompt": str(i), "completion": "a"}) + "\n" for i in range(4)))
            with self.assertRaisesRegex(ValueError, "at least five"):
                cuda_lab.read_dataset(path, FakeTokenizer())


if __name__ == "__main__":
    unittest.main()
