"""ko-header-column: tests of the independent recount (RECOUNT_SPEC.md 11). Registered before the implementation (RED).

Run from research/tools/ko-header-column:  python -m unittest test_recount -v
"""
import copy
import json
import unittest
from pathlib import Path

import recount as rc

HERE = Path(__file__).resolve().parent
TEXT = (HERE / "example" / "example.json").read_text(encoding="utf-8")
EX = json.loads(TEXT)
EXACT = rc.load_exact(TEXT)
for i, c in enumerate(EX["w4"]):
    c["linesExact"] = EXACT["w4"][i]["lines"]


def pick(o, keys):
    return {k: o[k] for k in keys}


class Parser(unittest.TestCase):
    def test_parser_and_types(self):
        for p in EX["parser"]:
            self.assertEqual(rc.parse_question(p["q"]), p["expect"], p["q"])
            self.assertEqual(rc.question_types(p["q"]), p["qtypes"], p["q"])

    def test_registered_questions(self):
        design = json.loads((HERE / "registered" / "design.json").read_text(encoding="utf-8"))
        for s in design["sources"]:
            self.assertEqual(rc.question_types(s["question"]), [s["qtype"]])
            self.assertEqual(rc.parse_question(s["question"]), {"record": s["labels"][s["slot"]], "field": s["field"], "qtype": s["qtype"]})


class W4(unittest.TestCase):
    def test_cases(self):
        for c in EX["w4"]:
            w3 = rc.w3_rule(c["question"], c["linesExact"], c["k1"], c["r"])
            e = c["expect"]
            if "w3Reason" in e:
                self.assertEqual(w3["w3Reason"], e["w3Reason"], c["name"])
            if "scan" in e:
                self.assertEqual(w3["scan"], e["scan"], c["name"])
            w4 = rc.w4_rule(c["question"], c["linesExact"], c["k1"], c["r"], w3)
            self.assertEqual(w4["w4Reason"], e["w4Reason"], c["name"])
            for k in ("w4From", "w4CutPixels", "w4"):
                if k in e:
                    self.assertEqual(w4[k], e[k], c["name"])
            d = w4["w4Diag"]
            if "anchorY" in e:
                self.assertEqual(d["anchorY"], e["anchorY"], c["name"])
            if "question" in e:
                self.assertEqual(d["question"] if d else None, e["question"], c["name"])
            if "qualified" in e:
                self.assertEqual(d["qualified"], e["qualified"], c["name"])
            if "lineWhy" in e:
                self.assertEqual([x["why"] for x in d["lines"]], e["lineWhy"], c["name"])
            if "line0Failure" in e:
                self.assertEqual(d["lines"][0]["failure"], e["line0Failure"], c["name"])
            if "groups0" in e:
                self.assertEqual([pick(g, ["words", "text", "box"]) for g in d["lines"][0]["groups"]], e["groups0"], c["name"])
            if "header" in e:
                self.assertEqual(d["header"], e["header"], c["name"])
            if "assign" in e:
                self.assertEqual([pick(a, ["unit", "column", "why", "dTarget", "dComp"]) for a in d["assign"]], e["assign"], c["name"])
            if "counts" in e:
                self.assertEqual(d["counts"], e["counts"], c["name"])
            if "chosen" in e:
                self.assertEqual(d["chosen"], e["chosen"], c["name"])


class Geometry(unittest.TestCase):
    def test_exposure(self):
        for c in EX["exposure"]:
            self.assertEqual(rc.exposure(c["ink"], c["band"]), c["expect"], c["why"])

    def test_attribute(self):
        for c in EX["attribute"]:
            page = copy.deepcopy(EX["attributePage"])
            if c.get("pageWithoutTargetHeader"):
                del page["items"]["h-target"]
                page["targetHeaderItem"] = None
            item = rc.attribute([[str(v) for v in b] for b in c["boxes"]], page)
            self.assertEqual(item, c["expect"], c["why"])
            if "header" in c:
                self.assertEqual(rc.header_class(item, page), c["header"], c["why"])
            if "candidate" in c:
                self.assertEqual(rc.candidate_class(item, page), c["candidate"], c["why"])

    def test_pp(self):
        from fractions import Fraction
        for c in EX["pp"]:
            self.assertEqual(rc.pp_text(Fraction(c["num"], c["den"])), c["expect"])


class Scoring(unittest.TestCase):
    def test_example(self):
        s = EX["scoring"]
        rows = [rc.score_page(s["predictions"][i], pg) for i, pg in enumerate(s["pages"])]
        for r in rows:
            e = s["expectRows"][r["id"]]
            self.assertEqual([r["w1"]["strict"], r["w2"]["strict"], r["w3"]["strict"], r["w4"]["strict"]], e["strict"], r["id"])
            for k in ("t12", "t13", "t14", "t34", "opportunity", "event2", "event3", "event4", "prevented34", "lostParts3", "stage"):
                if k in e:
                    self.assertEqual(r[k], e[k], f"{r['id']} {k}")
            if "exposureW4" in e:
                self.assertEqual(r["exposure"]["w4"], e["exposureW4"])
            if "exposureW1" in e:
                self.assertEqual(r["exposure"]["w1"], e["exposureW1"])
            if "reading" in e:
                self.assertEqual(r["reading"], e["reading"], r["id"])
            if "attribution" in e:
                self.assertEqual(r["attribution"], e["attribution"], r["id"])
        summ = rc.summarize_scores(rows, s["pageArea"])
        t, et = summ["groups"]["total"], s["expectTotal"]
        for k in ("n", "error", "matched", "strict", "L2", "L3", "L4", "prevented34", "newLoss34", "recovered34", "cut", "applied", "opportunity", "event2", "event3", "event4"):
            self.assertEqual(t[k], et[k], k)
        self.assertEqual(pick(t["attribution"], ["applied", "correct", "wrong", "undetermined"]), et["attribution"])
        self.assertEqual(t["reading"]["pages"], et["reading"]["pages"])
        self.assertEqual(pick(t["reading"]["change"]["e1"]["w4"], ["new", "newSources", "existing", "resolved"]), et["reading"]["e1W4"])
        self.assertEqual(t["reading"]["change"]["e1"]["w2"]["new"], et["reading"]["e1W2New"])
        self.assertEqual(t["reading"]["change"]["e1"]["w3"]["new"], et["reading"]["e1W3New"])
        self.assertEqual(t["reading"]["headerLost"]["w4"], et["reading"]["headerLostW4"])
        for k in ("w2", "w3", "w4", "w4Applied"):
            self.assertEqual(t["area"][k], et["area"][k], k)
        v, ev = summ["verdict"], s["expectVerdict"]
        self.assertEqual(v["G1"]["pass"], ev["G1"])
        self.assertEqual(v["G2"]["pass"], ev["G2"])
        self.assertEqual(pick(v["G3"], ["L", "R", "pass"]), ev["G3"])
        self.assertEqual(pick(v["G4"], ["denom", "correct", "status"]), ev["G4"])
        self.assertEqual(v["geometry"], ev["geometry"])
        self.assertEqual(pick(v["reading"], ["comparable", "newE1", "status"]), ev["reading"])
        self.assertEqual(v["final"], ev["final"])
        tables = rc.render_tables(summ)
        md = "\n\n".join(f"<!-- khc:table {k} -->\n" + "\n".join(ls) + "\n<!-- /khc:table -->" for k, ls in tables.items())
        self.assertEqual(rc.check_tables(md, summ), [])
        bad = md.replace("| 전체 | 4 |", "| 전체 | 5 |", 1)
        self.assertNotEqual(bad, md)
        self.assertTrue(rc.check_tables(bad, summ))

    def test_ids(self):
        ids = ["p000", "p001", "p002"]
        rc.check_id_set([{"id": i} for i in ids], ids)
        for rows, pat in (([{"id": "p000"}, {"id": "p000"}, {"id": "p002"}], "duplicate"), ([{"id": "p000"}, {"id": "p001"}], "missing"),
                          ([{"id": "p001"}, {"id": "p000"}, {"id": "p002"}], "order")):
            with self.assertRaisesRegex(rc.ValidationError, pat):
                rc.check_id_set(rows, ids)


if __name__ == "__main__":
    unittest.main()
