"""Tests of the independent recount (RECOUNT_SPEC.md). Written before recount.py (RED). Standard library only.

Run from research/: python -m unittest tools/ko-row-gate/test_recount.py
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
    EX_TEXT = f.read().decode("utf-8")
EX = json.loads(EX_TEXT)
EXX = recount.parse_exact(EX_TEXT)  # numbers kept as their JSON source text (RECOUNT_SPEC 4.0)

W3_KEYS = ["qtypes", "validHits", "scan", "w3Reason", "w3From", "w3", "w3CutPixels"]
DEF = {"reason": "widened", "w1": {"left": 0, "top": 0, "width": 400, "height": 200}, "w2": {"left": 0, "top": 0, "width": 400, "height": 60}, "w2Reason": "cut"}


def pick(d, keys):
    return {k: d[k] for k in keys}


def r_of(c):
    return copy.deepcopy(DEF if c["r"] == "DEF" else c["r"])


def pred_of(pid):
    return next(p["pred"] for p in EX["scoring"]["pages"] if p["pred"]["id"] == pid)


def project(row):
    o = row["others"]
    return {
        "stage": row["stage"], "strict": {"w1": row["w1"]["strict"], "w2": row["w2"]["strict"], "w3": row["w3"]["strict"]},
        "t12": row["t12"], "t13": row["t13"], "fullPageToPartial2": row["fullPageToPartial2"], "fullPageToPartial3": row["fullPageToPartial3"],
        "lostParts2": row["lostParts2"], "lostParts3": row["lostParts3"], "prevented": row["prevented"], "cutPixels2": row["cutPixels2"],
        "cutPixels3": row["cutPixels3"], "candidateCount": row["candidateCount"], "uniqueCandidate": row["uniqueCandidate"],
        "othersW1": o["w1"] if o else None, "fromW1Full2": o["fromW1Full2"] if o else None, "fromW1Full3": o["fromW1Full3"] if o else None,
        "opportunity": row["opportunity"], "event2": row["event2"], "event3": row["event3"], "error": row["error"],
    }


def rows():
    return [recount.score_page(p["pred"], p["page"]) for p in EX["scoring"]["pages"]]


class Text(unittest.TestCase):
    def test_squash_qtypes_grammar(self):
        for c in EX["squash"]:
            self.assertEqual(recount.squash(c["in"]), c["out"], c["why"])
        for c in EX["qtypes"]:
            self.assertEqual(recount.question_types(c["q"]), c["out"], c["q"])
        for t, s, ok in EX["grammar"]:
            self.assertEqual(recount.grammar_match(t, s), ok, (t, s))

    def test_exact_numbers(self):
        x = recount.parse_exact('{"a": [0.1, 1e2, -0, 3.50], "b": "0.1"}')
        self.assertEqual(x, {"a": ["0.1", "1e2", "-0", "3.50"], "b": "0.1"})
        for s, want in (("120", "120"), ("0.30", "0.3"), ("1e2", "100"), ("-0", "0"), ("38.4375", "38.4375"), ("3.50", "3.5")):
            self.assertEqual(recount.dec_str(s), want, s)


class W3Rule(unittest.TestCase):
    def test_examples(self):
        self.assertGreaterEqual(len(EX["w3"]), 30)
        for c, cx in zip(EX["w3"], EXX["w3"]):
            with self.subTest(c["name"]):
                got = recount.w3_rule(c["q"], cx["lines"], c["k1"], r_of(c))
                self.assertEqual(pick(got, W3_KEYS), c["expect"])

    def test_w3_is_w1_or_w2_and_nested(self):
        for c, cx in zip(EX["w3"], EXX["w3"]):
            if not c["lines"]:
                continue
            r = r_of(c)
            out = recount.w3_rule(c["q"], cx["lines"], c["k1"], r)
            with self.subTest(c["name"]):
                self.assertIn(out["w3"], (r["w1"], r["w2"]))
                w3, w1, w2 = out["w3"], r["w1"], r["w2"]
                self.assertTrue(w3["top"] <= w2["top"] and w3["top"] + w3["height"] >= w2["top"] + w2["height"])
                self.assertTrue(w3["top"] >= w1["top"] and w3["top"] + w3["height"] <= w1["top"] + w1["height"])

    def test_pipeline_with_ported_w1_w2(self):
        for c, cx in zip(EX["pipeline"], EXX["pipeline"]):
            with self.subTest(c["name"]):
                r = recount.w2_rule(c["lines"], c["k1"], c["width"], c["height"])
                keys = ["reason", "w1", "w2Reason", "w2", "cutPixels"]
                self.assertEqual(pick(r, keys), pick(c["expect"], keys))
                w3 = recount.w3_rule(c["q"], cx["lines"], c["k1"], r)
                keys = ["w3Reason", "w3From", "w3", "w3CutPixels"]
                self.assertEqual(pick(w3, keys), pick(c["expect"], keys))

    def test_exposure_and_classification(self):
        for c in EX["exposure"]:
            with self.subTest(c["name"]):
                self.assertEqual(recount.exposure(c["ink"], c["band"]), c["expect"])
        for c in EX["classify"]:
            with self.subTest(c["name"]):
                self.assertEqual(recount.classify_candidate(c["cand"], EX["classifyPage"]), c["expect"])


class Predictions(unittest.TestCase):
    def test_valid_and_invalid(self):
        for p in EX["scoring"]["pages"]:
            recount.validate_prediction(p["pred"])
        for c in EX["predictionInvalid"]:
            with self.subTest(c["name"]):
                bad = copy.deepcopy(pred_of(c["base"]))
                bad.update(copy.deepcopy(c["patch"]))
                with self.assertRaises(recount.ValidationError):
                    recount.validate_prediction(bad)


class Scoring(unittest.TestCase):
    def test_rows(self):
        for p, r in zip(EX["scoring"]["pages"], rows()):
            with self.subTest(p["page"]["id"]):
                self.assertEqual(project(r), p["expect"])

    def test_summary(self):
        sc = EX["scoring"]
        s = recount.summarize_scores(rows(), sc["pageArea"])
        for k, v in sc["total"].items():
            self.assertEqual(s["groups"]["total"][k], v, k)
        for layout, want in sc["layoutVerdicts"].items():
            for k, v in want.items():
                self.assertEqual(s["groups"]["layout"][layout][k], v, (layout, k))
        self.assertEqual(s["lists"], sc["lists"])
        inv = s["invariants"]
        self.assertTrue(inv["lost3SubsetLost2"])
        self.assertTrue(inv["events3SubsetEvents2"])
        self.assertEqual((inv["newlyFullW3"], inv["newEvidenceW3"], inv["recoveredNotFullPage"]), (0, 0, 0))

    def test_tables(self):
        s = recount.summarize_scores(rows(), EX["scoring"]["pageArea"])
        tables = recount.render_tables(s)
        self.assertEqual(tables["sources"], EX["scoring"]["sourcesTable"])
        self.assertEqual(tables["groups"][2], EX["scoring"]["groupsTotalRow"])
        md = "\n\ntext\n\n".join("<!-- krg:table %s -->\n%s\n<!-- /krg:table -->" % (n, "\n".join(lines)) for n, lines in tables.items())
        self.assertEqual(recount.check_tables(md, s), [])
        bad = md.replace("| 전체 | 8 |", "| 전체 | 9 |", 1)
        found = recount.check_tables(bad, s)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["table"], "groups")
        self.assertTrue(recount.check_tables(md.replace("SFF applied c1 D", "SFF applied c1 T"), s))

    def test_marginal_preserving_tampers_are_found(self):
        r = rows()
        self.assertEqual(recount.diff_rows(r, r), [])
        t = copy.deepcopy(r)
        t[0]["t13"], t[1]["t13"] = t[1]["t13"], t[0]["t13"]
        self.assertEqual([d["id"] for d in recount.diff_rows(r, t)], ["p1", "p2"])
        u = copy.deepcopy(r)
        u[0]["uniqueCandidate"]["class"] = "intended_decoy"
        u[1]["uniqueCandidate"]["class"] = "target_value"
        self.assertEqual([d["id"] for d in recount.diff_rows(r, u)], ["p1", "p2"])


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
