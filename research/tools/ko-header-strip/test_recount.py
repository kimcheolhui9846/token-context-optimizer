"""ko-header-strip: registered tests of the independent recount (RECOUNT_SPEC.md section 8).

Written before recount.py exists (RED). Run: python -m unittest discover -s research/tools/ko-header-strip -p test_recount.py
"""
import copy
import json
import os
import sys
import unittest
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import recount  # noqa: E402  (RED until recount.py exists)

with open(os.path.join(HERE, "example", "example.json"), encoding="utf-8") as f:
    EX = json.load(f)
with open(os.path.join(HERE, "registered.json"), encoding="utf-8") as f:
    REG = json.load(f)


def merge(a, b):
    if not isinstance(b, dict):
        return copy.deepcopy(b)
    out = copy.deepcopy(a) if isinstance(a, dict) else {}
    for k, v in b.items():
        out[k] = merge(out[k], v) if k in out else copy.deepcopy(v)
    return out


def row_for(c):
    r = copy.deepcopy(EX["base"])
    if c.get("override"):
        r = merge(r, c["override"])
    if c.get("groups"):
        for i, box in enumerate(c["groups"]):
            r["w4Diag"]["lines"][1]["groups"][i]["box"] = box
    return r


def patch(r, name):
    g = r["w4Diag"]["lines"][1]
    if name == "duplicate_line_1":
        r["w4Diag"]["lines"].append(copy.deepcopy(g))
    elif name == "drop_group_3":
        del g["groups"][2]
    elif name == "header_why_below_anchor":
        g["why"], g["groups"] = "below_anchor", None
    elif name == "header_failure_x_overlap":
        g["failure"] = "x_overlap"
    elif name == "box_nan":
        g["groups"][0]["box"][0] = "NaN"
    elif name == "box_zero_width":
        g["groups"][0]["box"] = ["3", "4.25", "3", "7.75"]
    elif name == "box_x1_41":
        g["groups"][2]["box"][2] = "41"
    else:
        raise KeyError(name)


def plan_of(name):
    c = next(c for c in EX["plans"] if c["name"] == name)
    return recount.plan(recount.project(row_for(c)))


KEYS = ["reason", "kind", "B", "H", "t", "b", "p", "pieces", "display"]


class Plans(unittest.TestCase):
    def test_plans(self):
        for c in EX["plans"]:
            p = recount.plan(recount.project(row_for(c)))
            self.assertEqual({k: p[k] for k in KEYS}, c["expect"], c["name"])

    def test_invariance(self):
        base = plan_of(EX["invariance"]["sameAs"])
        changed = recount.plan(recount.project(merge(row_for(EX["plans"][0]), EX["invariance"]["override"])))
        self.assertEqual(changed, base)

    def test_contracts(self):
        for c in EX["contracts"]:
            r = copy.deepcopy(EX["base"])
            if c.get("override"):
                r = merge(r, c["override"])
            if c.get("patch"):
                patch(r, c["patch"])
            with self.assertRaises(recount.ContractError, msg=c["name"]) as cm:
                recount.plan(recount.project(r))
            self.assertEqual(cm.exception.code, c["code"], c["name"])

    def test_projection_keys(self):
        p = recount.project(row_for(EX["plans"][0]))
        self.assertEqual(sorted(p), sorted(REG["projectionKeys"]["row"]))
        self.assertEqual(sorted(p["header"]), sorted(REG["projectionKeys"]["header"]))
        self.assertNotIn("마바", json.dumps(p, ensure_ascii=False))


class Scoring(unittest.TestCase):
    def test_exposure(self):
        for c in EX["exposures"]:
            self.assertEqual(recount.exposure(c["ink"], plan_of(c["plan"])), c["expect"], c["why"])

    def test_area(self):
        for c in EX["areas"]:
            a = recount.area(plan_of(c["plan"]))
            e = c["expect"]
            self.assertEqual((a["source"], a["separator"], a["display"]), (e["source"], e["separator"], e["display"]))
            pp = lambda x: Fraction(100 * x, c["pageArea"])  # noqa: E731
            self.assertEqual(pp(c["w1Area"] - a["source"]), Fraction(e["w5SourceVsW1"]))
            self.assertEqual(pp(c["w1Area"] - a["display"]), Fraction(e["w5DisplayVsW1"]))
            self.assertEqual(pp(a["source"] - c["w4Area"]), Fraction(e["w5SourceVsW4"]))

    def test_pp(self):
        for c in EX["pp"]:
            self.assertEqual(recount.pp_text(Fraction(int(c["num"]), int(c["den"]))), c["expect"])
        m = sum(Fraction(v) for v in EX["meanExample"]["values"]) / len(EX["meanExample"]["values"])
        self.assertEqual((str(m.numerator), str(m.denominator)), (EX["meanExample"]["expect"]["num"], EX["meanExample"]["expect"]["den"]))


class Pixels(unittest.TestCase):
    def test_compose(self):
        W, H = 40, 30
        src = [bytes((7 * x + 13 * y) % 256 for x in range(W)) for y in range(H)]
        for c in EX["pixels"]["cases"]:
            rows = recount.compose(plan_of(c["plan"]), src)
            x0, x1 = c["x"]
            self.assertEqual(len(rows), len(c["rows"]))
            for r, (kind, v) in enumerate(c["rows"]):
                want = src[v][x0:x1] if kind == "src" else bytes([v]) * (x1 - x0)
                self.assertEqual(rows[r], want, f"{c['plan']} row {r}")


if __name__ == "__main__":
    unittest.main()
