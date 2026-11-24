"""Tests of the independent recount (RECOUNT_SPEC.md). Written before recount.py (RED). Standard library only.

Run from research/: python -m unittest tools/ko-row-height/test_recount.py
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

W2_KEYS = ["reason", "w0", "w1", "w2Reason", "hitTop", "hitBottom", "pad", "w2", "cutPixels"]
ROW_KEYS = ["stage", "reason", "w2Reason", "w0", "w1", "w2", "t01", "t12", "fullPageToPartial", "lostParts", "cutPixels", "others", "jOpportunity", "jEvent", "error"]


def pick(d, keys):
    return {k: d[k] for k in keys}


def rows():
    return [recount.score_page(p["pred"], p["page"]) for p in EX["scoring"]["pages"]]


class W2Rule(unittest.TestCase):
    def test_examples(self):
        for c in EX["w2"]:
            with self.subTest(c["name"]):
                got = recount.w2_rule(c["lines"], c["k1"], c["width"], c["height"])
                self.assertEqual(pick(got, W2_KEYS), c["expect"])

    def test_invalid(self):
        for c in EX["w2Invalid"]:
            with self.subTest(c["name"]):
                with self.assertRaises(recount.ValidationError):
                    recount.w2_rule(c["lines"], c["k1"], c["width"], c["height"])

    def test_exposure(self):
        for c in EX["exposure"]:
            with self.subTest(c["name"]):
                self.assertEqual(recount.exposure(c["ink"], c["band"]), c["expect"])


class Predictions(unittest.TestCase):
    def test_valid_and_invalid(self):
        for p in EX["scoring"]["pages"]:
            recount.validate_prediction(p["pred"])
        for c in EX["predictionInvalid"]:
            with self.subTest(c["name"]):
                with self.assertRaises(recount.ValidationError):
                    recount.validate_prediction(c["pred"])


class Scoring(unittest.TestCase):
    def test_rows(self):
        for p, r in zip(EX["scoring"]["pages"], rows()):
            with self.subTest(p["page"]["id"]):
                self.assertEqual(pick(r, ROW_KEYS), p["expect"])

    def test_summary(self):
        sc = EX["scoring"]
        s = recount.summarize_scores(rows(), sc["pageArea"])
        self.assertEqual(s["stages"], sc["expectStages"])
        self.assertEqual(s["groups"]["total"], sc["expectTotal"])
        for g in (sc["expectLayoutGroup"], sc["expectEmptyGroup"]):
            axis, key = g["key"]
            self.assertEqual(s["groups"][axis][key], g["value"])
        self.assertEqual(s["lists"], sc["expectLists"])
        self.assertEqual(s["sourceTable"], sc["expectSourceTable"])

    def test_tables(self):
        s = recount.summarize_scores(rows(), EX["scoring"]["pageArea"])
        tables = recount.render_tables(s)
        self.assertEqual(tables["sources"], EX["scoring"]["expectSourcesTable"])
        md = "\n\ntext\n\n".join("<!-- krh:table %s -->\n%s\n<!-- /krh:table -->" % (n, "\n".join(lines)) for n, lines in tables.items())
        self.assertEqual(recount.check_tables(md, s), [])
        bad = md.replace("| 전체 | 6 |", "| 전체 | 7 |", 1)
        found = recount.check_tables(bad, s)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["table"], "groups")

    def test_marginal_preserving_tampers_are_found(self):
        r = rows()
        t = copy.deepcopy(r)
        t[1]["t12"], t[2]["t12"] = t[2]["t12"], t[1]["t12"]
        self.assertEqual(recount.diff_rows(r, r), [])
        self.assertEqual([d["id"] for d in recount.diff_rows(r, t)], ["S2", "S3"])
        u = copy.deepcopy(r)
        u[0]["others"]["items"][1]["w2"] = "none"
        u[1]["others"]["items"][0]["w2"] = "partial"
        self.assertEqual([d["id"] for d in recount.diff_rows(r, u)], ["S1", "S2"])


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
