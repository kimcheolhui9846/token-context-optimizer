"""Tests of the independent recount (RECOUNT_SPEC.md). Written before recount.py (RED). Standard library only.

Run from research/: python -m unittest tools/ko-row-window/test_recount.py
"""
import copy
import json
import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import recount  # noqa: E402

with open(os.path.join(HERE, "example", "example.json"), "rb") as f:
    EX = json.loads(f.read().decode("utf-8"))

W1_KEYS = ["reason", "candidates", "maxRight", "clippedRight", "w0", "w1", "addedPixels"]


def pick(d, keys):
    return {k: d[k] for k in keys}


class W1Rule(unittest.TestCase):
    def test_examples(self):
        for c in EX["w1"]:
            with self.subTest(c["name"]):
                got = recount.w1_rule(c["lines"], c["k1"], c["width"], c["height"])
                self.assertEqual(pick(got, W1_KEYS), c["expect"])

    def test_invalid_records_fail_validation(self):
        for c in EX["w1Invalid"]:
            with self.subTest(c["name"]):
                with self.assertRaises(recount.ValidationError):
                    recount.w1_rule(c["lines"], c["k1"], c["width"], c["height"])

    def test_same_row(self):
        h = [10, 50, 50, 70]
        self.assertTrue(recount.same_row_right(h, [50, 50, 60, 70]))
        self.assertFalse(recount.same_row_right(h, [49.999, 50, 60, 70]))
        self.assertTrue(recount.same_row_right(h, [60, 60, 70, 80]))
        self.assertFalse(recount.same_row_right(h, [60, 60.001, 70, 80.001]))
        self.assertFalse(recount.same_row_right(h, [60, 70, 70, 90]))
        self.assertTrue(recount.same_row_right(h, [60, 55, 70, 60]))
        self.assertTrue(recount.is_blank(" \u3000\t"))
        self.assertFalse(recount.is_blank("가"))


class Scoring(unittest.TestCase):
    def rows(self):
        return [recount.score_page(p["pred"], p["page"]) for p in EX["scoring"]["pages"]]

    def test_rows(self):
        for p, r in zip(EX["scoring"]["pages"], self.rows()):
            with self.subTest(p["page"]["id"]):
                self.assertEqual(pick(r, ["stage", "w0", "w1", "transition", "error", "newInk"]), p["expect"])

    def test_summary(self):
        s = recount.summarize_scores(self.rows(), EX["scoring"]["pageArea"])
        self.assertEqual(s["stages"], EX["scoring"]["expectStages"])
        self.assertEqual(s["groups"]["total"], EX["scoring"]["expectTotal"])
        axis, key = EX["scoring"]["expectEmptyGroup"]["key"]
        self.assertEqual(s["groups"][axis][key], EX["scoring"]["expectEmptyGroup"]["value"])
        self.assertEqual(s["lists"], EX["scoring"]["expectLists"])

    def test_marginal_preserving_tamper_is_found(self):
        rows = self.rows()
        t = copy.deepcopy(rows)
        t[0]["transition"], t[2]["transition"] = t[2]["transition"], t[0]["transition"]
        self.assertEqual(recount.diff_rows(rows, rows), [])
        self.assertEqual([d["id"] for d in recount.diff_rows(rows, t)], ["S1", "S3"])


class Ids(unittest.TestCase):
    def test_id_set(self):
        ids = ["a", "b", "c"]
        recount.check_id_set([{"id": "a"}, {"id": "b"}, {"id": "c"}], ids)
        for bad in ([{"id": "a"}, {"id": "a"}, {"id": "c"}], [{"id": "a"}, {"id": "b"}],
                    [{"id": "a"}, {"id": "b"}, {"id": "c"}, {"id": "d"}], [{"id": "b"}, {"id": "a"}, {"id": "c"}]):
            with self.assertRaises(recount.ValidationError):
                recount.check_id_set(bad, ids)


if __name__ == "__main__":
    unittest.main()
