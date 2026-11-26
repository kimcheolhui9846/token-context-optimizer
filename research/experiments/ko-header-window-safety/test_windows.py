"""Synthetic geometry and pixel checks for the header-window comparator."""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import unittest

from PIL import Image

from windows import compose_windows, window_rects


def fixture():
    decision = {"applied": True, "headerRect": [10, 4, 50, 16]}
    diag = {
        "qualified": [7],
        "header": {"line": 7, "target": 2, "comp": 1, "match": [False, True]},
        "lines": [
            {"line": 2, "why": "ineligible"},
            {
                "line": 7,
                "why": "eligible",
                "failure": None,
                "groups": [
                    {"box": ["19", "9", "28", "10"], "text": "repeated"},
                    {"box": ["10.25", "8.1", "14.01", "10"], "text": "repeated"},
                    {"box": ["32.99", "9", "38.01", "11.5"], "text": "repeated"},
                ],
            },
        ],
    }
    return decision, diag


class WindowRectsTests(unittest.TestCase):
    def test_uses_title_geometry_with_repeated_text_and_fractional_edges(self):
        decision, diag = fixture()
        self.assertEqual(window_rects(decision, diag), [[10, 4, 19, 16], [28, 4, 43, 16]])

    def test_clips_right_padding_to_header_edge(self):
        decision, diag = fixture()
        diag["lines"][1]["groups"][2]["box"][2] = "49.25"
        self.assertEqual(window_rects(decision, diag), [[10, 4, 19, 16], [28, 4, 50, 16]])

    def test_merges_overlapping_and_touching_strips(self):
        for right_start in ("22.99", "23.01"):
            with self.subTest(right_start=right_start):
                decision, diag = fixture()
                diag["lines"][1]["groups"][2]["box"][0] = right_start
                self.assertEqual(window_rects(decision, diag), [[10, 4, 43, 16]])

    def test_declined_decision_ignores_diagnostics(self):
        self.assertEqual(window_rects({"applied": False}, None), [])

    def test_applied_decision_rejects_contradictory_diagnostics(self):
        for change in ("ambiguous", "missing line", "duplicate line", "ineligible",
                       "failure", "header mismatch", "both matched", "wrong target",
                       "missing group", "invalid label group", "invalid title group"):
            with self.subTest(change=change):
                decision, diag = fixture()
                line = diag["lines"][1]
                if change == "ambiguous":
                    diag["qualified"].append(2)
                elif change == "missing line":
                    diag["lines"].pop()
                elif change == "duplicate line":
                    diag["lines"].append(line.copy())
                elif change == "ineligible":
                    line["why"] = "ineligible"
                elif change == "failure":
                    line["failure"] = "invalid"
                elif change == "header mismatch":
                    diag["header"]["line"] = 2
                elif change == "both matched":
                    diag["header"]["match"] = [True, True]
                elif change == "wrong target":
                    diag["header"].update(target=1, comp=2)
                elif change == "missing group":
                    line["groups"].pop()
                elif change == "invalid label group":
                    line["groups"][0] = None
                else:
                    line["groups"][2] = {}
                with self.assertRaises(ValueError):
                    window_rects(decision, diag)

    def test_applied_decision_rejects_invalid_title_boxes(self):
        for box in (
            ["b", "8", "14", "10"], ["NaN", "8", "14", "10"],
            [True, "8", "14", "10"], ["14", "8", "14", "10"],
            ["9.99", "8", "14", "10"], ["11", "8", "50.01", "10"],
            ["11", "8", "14"], ["11", "8", "14", "7"],
            ["11", "3.99", "14", "10"],
        ):
            with self.subTest(box=box):
                decision, diag = fixture()
                diag["lines"][1]["groups"][1]["box"] = box
                with self.assertRaises(ValueError):
                    window_rects(decision, diag)

    def test_applied_decision_rejects_invalid_header_rect(self):
        for rect in (None, [10, 4, 50, 4], [10.5, 4, 50, 16], [-1, 4, 50, 16]):
            with self.subTest(rect=rect):
                decision, diag = fixture()
                decision["headerRect"] = rect
                with self.assertRaises(ValueError):
                    window_rects(decision, diag)


class ComposeWindowsTests(unittest.TestCase):
    def test_preserves_exact_pixels_at_original_display_positions(self):
        candidate_path = Path(__file__).resolve().parents[1] / "ko-fallback-header-holdout" / "candidate.py"
        spec = spec_from_file_location("candidate", candidate_path)
        candidate = module_from_spec(spec)
        spec.loader.exec_module(candidate)

        decision, diag = fixture()
        baseline = Image.frombytes("L", (40, 3), bytes(range(120)))
        source = Image.frombytes("L", (60, 18), bytes(range(200)) * 5 + bytes(range(80)))
        full_display = candidate.compose(source, baseline, decision)
        original = full_display.tobytes()
        result = compose_windows(full_display, baseline, decision, window_rects(decision, diag))

        self.assertEqual((result.mode, result.size), ("L", (40, 23)))
        for y in range(12):
            row = original[y * 40:(y + 1) * 40]
            expected = row[:9] + b"\xff" * 9 + row[18:33] + b"\xff" * 7
            self.assertEqual(result.crop((0, y, 40, y + 1)).tobytes(), expected)
        self.assertEqual(result.crop((0, 12, 40, 20)).tobytes(), original[480:800])
        self.assertEqual(result.crop((0, 20, 40, 23)).tobytes(), baseline.tobytes())
        self.assertEqual(full_display.tobytes(), original)

    def test_declined_decision_returns_baseline_unchanged(self):
        baseline = Image.new("L", (3, 2), 91)
        self.assertIs(compose_windows(None, baseline, {"applied": False}, []), baseline)

    def test_applied_decision_rejects_incompatible_images(self):
        decision, _ = fixture()
        full_display = Image.new("L", (40, 23))
        baseline = Image.new("L", (40, 3))
        for full, body in (
            (full_display, Image.new("L", (39, 3))),
            (Image.new("L", (39, 23)), baseline),
            (Image.new("L", (40, 22)), baseline),
            (Image.new("L", (40, 20)), Image.new("L", (40, 0))),
            (full_display.convert("RGB"), baseline),
            (full_display, baseline.convert("RGB")),
        ):
            with self.subTest(full=full.size, body=body.size, modes=(full.mode, body.mode)):
                with self.assertRaises(ValueError):
                    compose_windows(full, body, decision, [[10, 4, 19, 16]])

    def test_applied_decision_rejects_invalid_strips(self):
        decision, _ = fixture()
        full_display = Image.new("L", (40, 23))
        baseline = Image.new("L", (40, 3))
        for rects in ([], [[9, 4, 19, 16]], [[19, 4, 19, 16]], [[10, 5, 19, 16]],
                      [[10, 4, 51, 16]], [[10, 4, 19, 16.0]]):
            with self.subTest(rects=rects):
                with self.assertRaises(ValueError):
                    compose_windows(full_display, baseline, decision, rects)


if __name__ == "__main__":
    unittest.main()
