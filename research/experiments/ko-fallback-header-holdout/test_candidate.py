"""Fabricated geometry and provenance checks for W6."""

from copy import deepcopy
import unittest

from PIL import Image

from candidate import compose, decide


def fixture():
    w1 = {"left": 2, "top": 16, "width": 30, "height": 11}
    pred = {
        "state": "matched", "width": 34, "height": 30,
        "w1": w1.copy(), "w4": w1.copy(), "w4From": "w1",
        "w4Reason": "not_applicable",
        "w4Diag": {
            "qualified": [1],
            "header": {"line": 1, "target": 1, "comp": 2, "match": [True, False]},
            "question": {"field": "\uff21\u0085\u3000B"},
            "lines": [{
                "line": 1, "why": "eligible", "failure": None,
                "groups": [
                    {"text": "Name", "box": ["2", "5.75", "9", "8.25"]},
                    {"text": "AB", "box": ["10", "6.25", "19", "9"]},
                    {"text": "CD", "box": ["21", "7", "32", "9.25"]},
                ],
            }],
        },
    }
    coords = {
        "w5Reason": "w4_not_applied", "w5Kind": "w1",
        "w1": w1.copy(), "w4": w1.copy(), "page": {"width": 34, "height": 30},
        "B": None, "H": None, "t": None, "b": None, "p": None,
        "pieces": [{"kind": "source", "sourceRect": [2, 16, 32, 27],
                    "displayRect": [0, 0, 30, 11]}],
        "display": {"width": 30, "height": 11},
    }
    return pred, coords


class CandidateTests(unittest.TestCase):
    def assert_declines(self, pred, coords, band=None):
        result = decide(pred, coords)
        self.assertIs(result["applied"], False)
        self.assertIsNone(result["headerRect"])
        self.assertEqual(result["candidateBand"], band)
        self.assertTrue(result["reason"])

    def test_exact_touch_fractional_bounds_and_normalization(self):
        pred, coords = fixture()
        before = deepcopy((pred, coords))
        result = decide(pred, coords)
        self.assertIs(result["applied"], True)
        self.assertEqual(result["headerRect"], [2, 0, 32, 16])
        self.assertEqual(result["candidateBand"], [2, 0, 32, 16])
        self.assertEqual((pred, coords), before)

    def test_target_can_be_group_two(self):
        pred, coords = fixture()
        diag = pred["w4Diag"]
        diag["header"].update(target=2, comp=1, match=[False, True])
        diag["question"]["field"] = "C\u202fD"
        self.assertIs(decide(pred, coords)["applied"], True)

    def test_overlap_keeps_candidate_band(self):
        pred, coords = fixture()
        pred["w4Diag"]["lines"][0]["groups"][2]["box"][3] = "10.0000000000000001"
        self.assert_declines(pred, coords, [2, 0, 32, 17])

    def test_bottom_padding_clips_to_page_height(self):
        pred, coords = fixture()
        pred["w4Diag"]["lines"][0]["groups"][2]["box"][3] = "30"
        self.assert_declines(pred, coords, [2, 0, 32, 30])

    def test_unqualified_missing_duplicate_or_ineligible_line(self):
        for change in ("unqualified", "multiple", "duplicate-qualified", "missing",
                       "duplicate-line", "wrong-line", "not-eligible", "failure"):
            with self.subTest(change=change):
                pred, coords = fixture()
                diag = pred["w4Diag"]
                if change in ("unqualified", "multiple", "duplicate-qualified"):
                    diag["qualified"] = {
                        "unqualified": [], "multiple": [1, 2], "duplicate-qualified": [1, 1],
                    }[change]
                elif change == "missing":
                    diag["lines"].clear()
                elif change == "duplicate-line":
                    diag["lines"].append(deepcopy(diag["lines"][0]))
                elif change == "wrong-line":
                    diag["header"]["line"] = 2
                elif change == "not-eligible":
                    diag["lines"][0]["why"] = "below_anchor"
                else:
                    diag["lines"][0]["failure"] = "group_count"
                self.assert_declines(pred, coords)

    def test_bad_group_geometry_cannot_derive_band(self):
        for box in (None, ["2", "3", "1", "4"], ["2", "5", "9", "5"],
                    ["1.999", "5", "9", "8"], ["2", "-0.1", "9", "8"],
                    ["2", "5", "32.001", "8"], ["2", "5", "9", "30.001"],
                    ["2", "NaN", "9", "8"], ["2", "5", "Infinity", "8"],
                    ["2", 5.25, "9", "8"], ["2", "5_0", "9", "8"]):
            with self.subTest(box=box):
                pred, coords = fixture()
                pred["w4Diag"]["lines"][0]["groups"][0]["box"] = box
                self.assert_declines(pred, coords)
        pred, coords = fixture()
        pred["w4Diag"]["lines"][0]["groups"].pop()
        self.assert_declines(pred, coords)

    def test_inconsistent_header_cannot_apply(self):
        for update in ({"match": [True, True]}, {"match": [1, 0]},
                       {"match": [False, True]}, {"comp": 1}, {"target": True}):
            with self.subTest(update=update):
                pred, coords = fixture()
                pred["w4Diag"]["header"].update(update)
                self.assert_declines(pred, coords, [2, 0, 32, 16])

    def test_field_matches_target_only_under_pinned_whitespace(self):
        for case in ("competitor", "both", "control-is-not-whitespace", "empty"):
            with self.subTest(case=case):
                pred, coords = fixture()
                diag = pred["w4Diag"]
                if case == "both":
                    diag["lines"][0]["groups"][2]["text"] = "AB"
                else:
                    diag["question"]["field"] = {
                        "competitor": "CD", "control-is-not-whitespace": "A\u001cB",
                        "empty": "\u3000",
                    }[case]
                self.assert_declines(pred, coords, [2, 0, 32, 16])

    def test_baseline_gates_and_exact_fallback_provenance(self):
        for case in ("no-display", "w4-applied", "w5-applied", "wrong-kind",
                     "wrong-page", "wrong-w4", "wrong-w1", "wrong-source",
                     "wrong-destination", "extra-piece", "wrong-size", "bool-coordinate",
                     "missing-rect", "contradictory-provenance"):
            with self.subTest(case=case):
                pred, coords = fixture()
                if case == "no-display":
                    pred["state"] = "no_match"
                    coords["display"] = None
                elif case == "w4-applied":
                    pred["w4From"] = "w2"
                elif case == "w5-applied":
                    coords["w5Reason"] = "two_bands"
                elif case == "wrong-kind":
                    coords["w5Kind"] = "two_bands"
                elif case == "wrong-page":
                    pred["width"] += 1
                elif case == "wrong-w4":
                    coords["w4"]["height"] -= 1
                elif case == "wrong-w1":
                    coords["w1"]["top"] -= 1
                elif case == "wrong-source":
                    coords["pieces"][0]["sourceRect"][1] -= 1
                elif case == "wrong-destination":
                    coords["pieces"][0]["displayRect"][1] += 1
                elif case == "extra-piece":
                    coords["pieces"].append(deepcopy(coords["pieces"][0]))
                elif case == "wrong-size":
                    coords["display"]["height"] += 1
                elif case == "bool-coordinate":
                    coords["pieces"][0]["displayRect"][0] = False
                elif case == "missing-rect":
                    del coords["w4"]
                else:
                    pred["w4Reason"] = "applied"
                self.assert_declines(pred, coords, [2, 0, 32, 16])

    def test_composition_preserves_header_separator_body_and_inputs(self):
        pred, coords = fixture()
        source = Image.new("L", (34, 30))
        source.putdata([(x + y * 3) % 256 for y in range(30) for x in range(34)])
        baseline = Image.new("L", (30, 11))
        baseline.putdata([(n * 31) % 256 for n in range(330)])
        source_bytes, baseline_bytes = source.tobytes(), baseline.tobytes()
        output = compose(source, baseline, decide(pred, coords))
        self.assertEqual((output.mode, output.size), ("L", (30, 35)))
        self.assertEqual(output.crop((0, 0, 30, 16)).tobytes(),
                         source.crop((2, 0, 32, 16)).tobytes())
        self.assertEqual(output.crop((0, 16, 30, 24)).tobytes(),
                         b"".join(bytes([x]) * 30 for x in (224, 224, 224, 128, 128, 224, 224, 224)))
        self.assertEqual(output.crop((0, 24, 30, 35)).tobytes(), baseline_bytes)
        self.assertEqual((source.tobytes(), baseline.tobytes()), (source_bytes, baseline_bytes))

    def test_abstention_returns_baseline_object(self):
        pred, coords = fixture()
        pred["w4Diag"]["qualified"] = []
        baseline = Image.new("L", (30, 11), 93)
        self.assertIs(compose(Image.new("L", (34, 30)), baseline, decide(pred, coords)), baseline)

    def test_applied_composition_rejects_alpha_and_inconsistent_geometry(self):
        pred, coords = fixture()
        result = decide(pred, coords)
        transparent_luma = Image.new("L", (34, 30))
        transparent_luma.info["transparency"] = 0
        for source, baseline in (
            (transparent_luma, Image.new("L", (30, 11))),
            (Image.new("LA", (34, 30)), Image.new("L", (30, 11))),
            (Image.new("L", (34, 30)), Image.new("RGBA", (30, 11))),
            (Image.new("L", (31, 30)), Image.new("L", (30, 11))),
            (Image.new("L", (34, 30)), Image.new("L", (29, 11))),
        ):
            with self.subTest(source=(source.mode, source.size), baseline=(baseline.mode, baseline.size)):
                with self.assertRaises(ValueError):
                    compose(source, baseline, result)
