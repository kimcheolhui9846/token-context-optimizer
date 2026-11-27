"""Regression checks for the revised Figure 2 caption using public inputs."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))
from d03_checks import check_f2, figure_verdict  # noqa: E402


class Figure2Caption(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = Path(cls.enterClassContext(tempfile.TemporaryDirectory()))
        cls.graded = {
            model: ROOT / "research/results/exp2-heldout" / model / "graded.jsonl"
            for model in ("gpt4o", "haiku")
        }
        cls.manuscript = ROOT / "docs/research/image-first-paper-draft.ko.md"
        cls.source = cls.manuscript.read_text(encoding="utf-8")
        capture = scratch / "probe.json"
        subprocess.run(
            [sys.executable, str(HERE / "d03_figprobe.py"), str(capture),
             str(ROOT / "research/figures/exp2_figures.py"),
             "--gpt4o", str(cls.graded["gpt4o"].parent),
             "--haiku", str(cls.graded["haiku"].parent), "--tag", str(scratch / "figures")],
            capture_output=True, check=True,
        )
        cls.probe = json.loads(capture.read_text(encoding="utf-8"))["fig5_exp2_accuracy_vs_tokens"]

    def setUp(self):
        self.scratch = Path(self.enterContext(tempfile.TemporaryDirectory()))

    def check_variant(self, source, graded=None):
        manuscript = self.scratch / "manuscript.md"
        manuscript.write_text(source, encoding="utf-8")
        return check_f2(self.probe, self.graded if graded is None else graded, manuscript=manuscript)

    def assert_caption_failure(self, result, *details):
        render = {"within": True, "bytesEqual": True}
        self.assertEqual(figure_verdict("F2", result, render)["verdict"], "MISMATCH")
        messages = "\n".join(map(str, result["problems"]))
        for detail in details:
            self.assertIn(detail, messages)

    def test_public_caption_matches_all_coordinates_from_graded_data(self):
        result = check_f2(self.probe, self.graded, manuscript=self.manuscript)
        self.assertEqual(result["problems"], [])
        caption = result["caption"]
        self.assertEqual((caption["matchedValues"], caption["totalValues"]), (24, 24))
        self.assertEqual(len(caption["points"]), 12)
        points = {(p["model"], p["arm"]): p for p in caption["points"]}
        self.assertEqual(points["haiku", "A"]["expected"], {"x": 1361, "y": 81.3})
        self.assertEqual(points["gpt4o", "D"]["expected"], {"x": 635, "y": 78.5})
        self.assertEqual(points["gpt4o", "D′"]["expected"], {"x": 629, "y": 79.2})
        for point in points.values():
            self.assertEqual(point["expected"], point["observed"])

    def test_exact_token_half_rounds_up(self):
        path = self.scratch / "graded.jsonl"
        rows = [json.loads(line) for line in self.graded["gpt4o"].read_text(encoding="utf-8").splitlines()]
        a_rows = [row for row in rows if row["arm"] == "A"]
        a_rows[0]["promptTokens"] += 824 * 144 + 72 - sum(row["promptTokens"] for row in a_rows)
        path.write_text("\n".join(map(json.dumps, rows)), encoding="utf-8")
        source = self.source.replace("GPT-4o A (824,", "GPT-4o A (825,", 1)
        caption = self.check_variant(source, dict(self.graded, gpt4o=path))["caption"]
        self.assertEqual(caption["matchedValues"], 24)
        self.assertEqual(caption["points"][0]["expected"]["x"], 825)

    def test_omitted_or_duplicated_caption_fails(self):
        caption = next(line for line in self.source.splitlines() if line.startswith("그림 2."))
        for replacement in ("", f"{caption}\n{caption}"):
            with self.subTest(duplicate=bool(replacement)):
                self.assert_caption_failure(self.check_variant(self.source.replace(caption, replacement)),
                                            "Figure 2 caption")

    def test_caption_coordinate_mutations_fail(self):
        for before, after, details in (
            (", C (572, 72.2%)", "", ("GPT-4o", "C")),
            ("A (824, 85.4%)", "A (825, 85.3%)", ("GPT-4o", "A", "825", "85.3")),
            ("A (1,361, 81.3%)", "A (1,361, 81.2%)", ("Haiku 4.5", "81.3", "81.2")),
            ("C (572, 72.2%)", "C (572, 72.2)", ("GPT-4o", "C")),
            ("C (572, 72.2%)", "C (572, 72.2%), C (572, 72.2%)", ("GPT-4o", "C")),
            ("(590·688)과 다르다.", "(590·688)과 다르다. C (572, 72.2%).", ("extra coordinate",)),
            ("A (824, 85.4%), B (824, 84.0%)", "B (824, 84.0%), A (824, 85.4%)", ("GPT-4o", "order")),
            ("D′ (629, 79.2%)", "D (629, 79.2%)", ("GPT-4o", "D′")),
            ("D′ (629, 79.2%)", "D' (629, 79.2%)", ("GPT-4o", "D′")),
        ):
            with self.subTest(after=after):
                source = self.source.replace(before, after, 1)
                self.assertNotEqual(source, self.source)
                self.assert_caption_failure(self.check_variant(source), *details)

    def test_swapping_provider_labels_or_blocks_fails(self):
        first = "GPT-4o A (824, 85.4%), B (824, 84.0%), C (572, 72.2%), D (635, 78.5%), E (374, 89.6%), D′ (629, 79.2%)."
        second = ("Haiku 4.5 A (1,361, 81.3%), B (1,361, 81.9%), C (621, 68.1%), "
                  "D (765, 77.1%), E (129, 82.6%), D′ (765, 76.4%).")
        for replacement in (
            first.replace("GPT-4o", "Haiku 4.5") + " " + second.replace("Haiku 4.5", "GPT-4o"),
            f"{second} {first}",
        ):
            with self.subTest(replacement=replacement):
                source = self.source.replace(f"{first} {second}", replacement, 1)
                self.assertNotEqual(source, self.source)
                self.assert_caption_failure(self.check_variant(source), "GPT-4o", "Haiku 4.5", "order")

    def test_missing_graded_rows_fail_even_if_rounding_could_mask_them(self):
        path = self.scratch / "graded.jsonl"
        rows = self.graded["gpt4o"].read_text(encoding="utf-8").splitlines()
        for removed in (rows[:1], [line for line in rows if json.loads(line)["arm"] == "A"], rows):
            with self.subTest(removed=len(removed)):
                deleted = set(removed)
                path.write_text("\n".join(line for line in rows if line not in deleted), encoding="utf-8")
                result = self.check_variant(self.source, dict(self.graded, gpt4o=path))
                self.assert_caption_failure(result, "gpt4o", "A", "144")
                self.assertLess(result["caption"]["matchedValues"], 24)

    def test_duplicate_graded_query_cannot_replace_a_missing_query(self):
        path = self.scratch / "graded.jsonl"
        rows = self.graded["gpt4o"].read_text(encoding="utf-8").splitlines()
        first = json.loads(rows[0])
        index = next(i for i, row in enumerate(map(json.loads, rows))
                     if i and (row["family"], row["arm"]) == (first["family"], first["arm"]))
        rows[index] = rows[0]
        path.write_text("\n".join(rows), encoding="utf-8")
        result = self.check_variant(self.source, dict(self.graded, gpt4o=path))
        self.assert_caption_failure(result, "gpt4o", "A", "duplicate", first["key"])
        self.assertLess(result["caption"]["matchedValues"], 24)

    def check_graded_variant(self, mutate, models=("gpt4o",)):
        graded = dict(self.graded)
        for model in models:
            rows = [json.loads(line) for line in graded[model].read_text(encoding="utf-8").splitlines()]
            mutate(rows)
            path = self.scratch / f"{model}.jsonl"
            path.write_text("\n".join(map(json.dumps, rows)), encoding="utf-8")
            graded[model] = path
        result = self.check_variant(self.source, graded)
        self.assertLess(result["caption"]["matchedValues"], 24)
        return result

    def test_missing_query_key_fails_with_full_row_count(self):
        def mutate(rows):
            del next(row for row in rows if row["arm"] == "A")["key"]

        self.assert_caption_failure(self.check_graded_variant(mutate), "gpt4o", "A", "key")

    def test_duplicate_question_condition_fails_with_distinct_keys(self):
        def mutate(rows):
            row = next(row for row in rows if row["arm"] == "A" and row["condition"] == "jpeg-only")
            row["condition"] = "clean"

        self.assert_caption_failure(self.check_graded_variant(mutate), "gpt4o", "A", "condition")

    def test_unknown_question_fails_even_when_all_arms_and_models_agree(self):
        def mutate(rows):
            family = rows[0]["family"]
            for row in rows:
                if row["family"] == family:
                    row["question"] = "unknown-question"
                    row["key"] = "/".join(row[field] for field in ("family", "question", "condition", "arm"))

        result = self.check_graded_variant(mutate, models=("gpt4o", "haiku"))
        self.assert_caption_failure(result, "unknown-question", "gpt4o", "haiku")

    def test_original_call_omits_caption(self):
        self.assertEqual(check_f2(self.probe, self.graded), {"values": 48, "problems": []})


if __name__ == "__main__":
    unittest.main()
