"""Hand-built tests for recount.py (spec section 7).

Run from research/:  python -m unittest tools/ko-ocr-factorial/test_recount.py
Tamper tests work on temporary copies of a synthetic run, never on real results.
"""
import copy
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unicodedata
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recount as rc  # noqa: E402

W, H = 1280, 960


def word(text, x=0, y=0, w=40, h=20):
    return {"text": text, "box": [x, y, w, h]}


def line(words, conf=90.0, box=None, text=None):
    ws = [word(t, 100 + 50 * i, 100, 40, 20) for i, t in enumerate(words)]
    return {"text": text if text is not None else " ".join(words),
            "confidence": conf, "box": box or [100, 100, 300, 20], "words": ws}


def k0_unmatched(keys=()):
    return {"status": "ok", "matched": False, "keys": list(keys)}


class JsSemantics(unittest.TestCase):
    def test_round_half_up(self):
        self.assertEqual(rc.js_round(2.5), 3)
        self.assertEqual(rc.js_round(-2.5), -2)
        self.assertEqual(rc.js_round(-0.5), 0)
        self.assertEqual(rc.js_round(0.49999999999999994), 0)
        self.assertEqual(rc.js_round(94.5), 95)

    def test_number_serialization(self):
        for v, s in [(1.0, "1"), (95.18988800048828, "95.18988800048828"), (1e-7, "1e-7"),
                     (0.000001, "0.000001"), (1e21, "1e+21"), (1.5e300, "1.5e+300"),
                     (123456789012345680000.0, "123456789012345680000"), (-0.0, "0"), (-2.5, "-2.5"), (7, "7")]:
            self.assertEqual(rc.js_num(v), s, v)
        self.assertEqual(rc.js_stringify({"a": [1.0, None, True, "한\n"]}), '{"a":[1,null,true,"한\\n"]}')

    def test_pct(self):
        self.assertEqual(rc.pct(1, 3), 33.33)
        self.assertEqual(rc.pct(1, 16), 6.25)
        self.assertIsNone(rc.pct(0, 0))
        self.assertIsNone(rc.pct(3, None))
        self.assertEqual(rc.pct(0, 5), 0)

    def test_utf16_length(self):
        self.assertEqual(rc.len16("ab"), 2)
        self.assertEqual(rc.len16("\U0001F600"), 2)


class SelectorPort(unittest.TestCase):
    def test_keywords_and_tokens(self):
        self.assertEqual(rc.keywords("When is SX-5134? What time, Yes"), ["sx-5134", "time", "yes"])
        self.assertEqual(rc.tokens("A\U0001F600b 한c"), ["a", "b", "c"])

    def test_latin_match_prefix_rule(self):
        ln = line(["Invoices", "total"])
        self.assertEqual(rc.line_score(ln, ["invoice"]), 1)  # k.length>=4 and w startswith k
        self.assertEqual(rc.line_score(ln, ["inv"]), 0)

    def test_row_window(self):
        ln = line(["abc", "def", "ghi"], box=[100, 200, 300, 20])
        ln["words"][0]["box"] = [100, 200, 50, 20]
        r = rc.select_window([ln], "where is abc", W, H)
        self.assertTrue(r["matched"])
        self.assertEqual(r["band"], {"left": 20, "top": 140, "width": 540, "height": 200})
        self.assertFalse(r["axisRow"])

    def test_axis_column_window(self):
        ws = [word("kkk", 100, 300, 40, 20)] + [word("ab", 200 + 50 * i, 300, 30, 20) for i in range(7)]
        ln = {"text": "kkk ab ab ab ab ab ab ab", "confidence": 80, "box": [100, 300, 800, 20], "words": ws}
        r = rc.select_window([ln], "show kkk", W, H)
        self.assertTrue(r["axisRow"])
        self.assertEqual(r["band"], {"left": 0, "top": 0, "width": 248, "height": 440})

    def test_min_size_grow_and_clip(self):
        ln = line(["abc"], box=[10, 10, 20, 8])
        ln["words"][0]["box"] = [10, 10, 20, 8]
        r = rc.select_window([ln], "abc", 300, 200)
        b = r["band"]
        self.assertGreaterEqual(b["width"], 1)
        self.assertTrue(rc.window_ok(b, 300, 200))

    def test_anchor_union_of_hit_words(self):
        ln = line(["abc", "zzz", "abc"])
        ln["words"][0]["box"] = [100, 100, 40, 20]
        ln["words"][1]["box"] = [150, 90, 40, 20]
        ln["words"][2]["box"] = [300, 105, 50, 30]
        r = rc.select_window([ln], "abc", W, H)
        # anchor union = [100,100,250,35]; compare against the same geometry via window_for
        axis, band = rc.window_for(ln, [100, 100, 250, 35], W, H)
        self.assertEqual(r["band"], band)

    def test_best_line_tie_uses_strict_confidence(self):
        a = line(["abc"], conf=80)
        b = line(["abc"], conf=80)
        b["text"] = "abc second"
        c = rc.select_window([a, b], "abc", W, H)
        self.assertEqual(c["lineText"], "abc")
        b["confidence"] = 81
        self.assertEqual(rc.select_window([a, b], "abc", W, H)["lineText"], "abc second")


class Bigrams(unittest.TestCase):
    def test_nfc_nfd_same(self):
        s = "한글"
        self.assertEqual(rc.bigrams(unicodedata.normalize("NFD", s)), {"한글"})
        self.assertEqual(rc.bigrams(s), {"한글"})

    def test_repeat_and_duplicates(self):
        self.assertEqual(rc.bigrams("하하"), {"하하"})
        self.assertEqual(rc.bigrams("하하하 하하하"), {"하하"})

    def test_boundaries(self):
        self.assertEqual(rc.bigrams("가a나다"), {"나다"})
        self.assertEqual(rc.bigrams("가1나, 다라"), {"다라"})
        self.assertEqual(rc.bigrams("가 나"), set())
        self.assertEqual(rc.bigrams("SX-5134"), set())
        self.assertEqual(rc.bigrams("가"), set())


class K1Rules(unittest.TestCase):
    def k1(self, lines, question):
        k0 = rc.k0_result(lines, question, W, H)
        return k0, rc.k1_result(lines, question, W, H, k0)

    def test_k0_match_preserved_latin_key(self):
        ln = line(["SX-5134", "일정"], box=[100, 100, 300, 20])
        k0, k1 = self.k1([ln], "SX-5134 일정은 언제인가요?")
        self.assertTrue(k0["matched"])
        self.assertEqual(k1["branch"], "k0")
        for f in rc.KR_FIELDS:
            if f != "hangulKeys":
                self.assertEqual(k1[f], k0[f], f)
        self.assertEqual(k1["hangulKeys"], sorted(rc.bigrams("SX-5134 일정은 언제인가요?")))

    def test_none_when_q_empty_or_no_positive(self):
        _, k1 = self.k1([line(["가나다"])], "no hangul here")
        self.assertEqual(k1["branch"], "none")
        self.assertEqual(k1["hangulKeys"], [])
        self.assertEqual(k1["score"], 0)
        _, k1 = self.k1([line(["xyz"])], "가나다 일정")
        self.assertEqual(k1["branch"], "none")
        self.assertIsNone(k1["band"])

    def test_tie_order_score_then_confidence_then_line(self):
        q = "가나다 라마"  # Q = {가나, 나다, 라마}
        a = line(["가나다"], conf=99)  # score 2
        b = line(["가나", "라마"], conf=70)  # score 2
        c = line(["가나"], conf=100)  # score 1
        _, k1 = self.k1([a, b, c], q)
        self.assertEqual((k1["score"], k1["lineIndex"]), (2, 0))  # equal score, higher conf wins
        b["confidence"] = 99
        _, k1 = self.k1([a, b, c], q)
        self.assertEqual(k1["lineIndex"], 0)  # equal conf -> earlier line
        b["confidence"] = 99.5
        _, k1 = self.k1([a, b, c], q)
        self.assertEqual(k1["lineIndex"], 1)
        _, k1 = self.k1([c, b], q)  # higher score beats higher confidence
        self.assertEqual(k1["lineIndex"], 1)

    def test_duplicate_bigram_counted_once(self):
        _, k1 = self.k1([line(["하하하하"])], "하하 하하 하하")
        self.assertEqual(k1["score"], 1)
        self.assertEqual(k1["hangulKeys"], ["하하"])

    def test_no_cross_word_bigram(self):
        _, k1 = self.k1([line(["가", "나"])], "가나")
        self.assertEqual(k1["branch"], "none")

    def test_anchor_union_and_hit_words(self):
        ln = line(["가나", "xx", "나다"])
        ln["words"][0]["box"] = [100, 100, 40, 20]
        ln["words"][1]["box"] = [50, 60, 10, 10]
        ln["words"][2]["box"] = [300, 105, 50, 30]
        _, k1 = self.k1([ln], "가나다")
        self.assertEqual(k1["hitWords"], [0, 2])
        self.assertEqual(k1["anchor"], [100, 100, 250, 35])
        self.assertEqual(k1["lineBox"], ln["box"])
        self.assertEqual(k1["confidence"], 90)
        self.assertEqual(k1["band"], rc.window_for(ln, k1["anchor"], W, H)[1])

    def test_k0_error_propagates(self):
        e = {"status": "error", "errorPrefix": "invalid_output: x", "exact": False}
        k1 = rc.k1_result([], "가나", W, H, e)
        self.assertEqual(k1["status"], "error")
        self.assertEqual(k1["branch"], "k0")
        self.assertTrue(k1["errorPrefix"].startswith("k0: "))

    def test_k0_line_index(self):
        a = line(["abc"], conf=70)
        b = line(["abc"], conf=71)
        k0 = rc.k0_result([a, b], "abc", W, H)
        self.assertEqual(k0["lineIndex"], 1)
        self.assertEqual(k0["lineBox"], b["box"])

    def test_input_validation(self):
        bad = line(["abc"])
        bad["confidence"] = float("nan")
        kind, k0, k1 = rc.expected_keyresults([bad], "abc", W, H)
        self.assertTrue(kind.startswith("input_validation"))
        self.assertTrue(k0["exact"] and k0["errorPrefix"] == "input_validation" and k1["errorPrefix"] == "input_validation")
        for mutate in (lambda l: l.pop("words"), lambda l: l.__setitem__("box", [1, 2, 3]),
                       lambda l: l["words"][0].__setitem__("text", 5), lambda l: l.__setitem__("text", None)):
            ln = line(["abc"])
            mutate(ln)
            self.assertIsNotNone(rc.validate_lines([ln]))
        self.assertIsNone(rc.validate_lines([line(["abc"])]))
        self.assertIsNotNone(rc.validate_lines(None))

    def test_window_output_validation(self):
        self.assertTrue(rc.window_ok({"left": 0, "top": 0, "width": 10, "height": 10}, 10, 10))
        self.assertFalse(rc.window_ok({"left": 0, "top": 0, "width": 0, "height": 10}, 10, 10))
        self.assertFalse(rc.window_ok({"left": 5, "top": 0, "width": 10, "height": 10}, 10, 10))
        self.assertFalse(rc.window_ok({"left": 0, "top": 0, "width": 10.5, "height": 10}, 20, 20))


PARTS = [{"rect": [10, 10, 20, 20]}, {"rect": [60, 10, 70, 20]}]


class Judging(unittest.TestCase):
    def band(self, l, t, w, h):
        return {"left": l, "top": t, "width": w, "height": h}

    def test_half_open_zero_slack(self):
        ev, strict, full = rc.judge_band(self.band(10, 10, 60, 10), PARTS, 200, 200)
        self.assertEqual((ev, strict, full), ("all", True, False))  # r == left+width, b == top+height
        ev, strict, _ = rc.judge_band(self.band(10, 10, 59, 10), PARTS, 200, 200)
        self.assertEqual((ev, strict), ("partial", False))
        ev, _, _ = rc.judge_band(self.band(11, 10, 59, 10), PARTS, 200, 200)
        self.assertEqual(ev, "partial")  # only the second box fits
        ev, _, _ = rc.judge_band(self.band(11, 11, 58, 9), PARTS, 200, 200)
        self.assertEqual(ev, "none")
        ev, _, _ = rc.judge_band(self.band(10, 11, 60, 9), PARTS, 200, 200)
        self.assertEqual(ev, "none")

    def test_full_page_window_not_strict(self):
        ev, strict, full = rc.judge_band(self.band(0, 0, 200, 200), PARTS, 200, 200)
        self.assertEqual((ev, strict, full), ("all", False, True))

    def test_wrong_match_and_evidence_missing(self):
        row = {"status": "ok"}
        kr = {"status": "ok", "matched": True, "band": self.band(100, 100, 50, 50)}
        j = rc.judge_row(row, kr, PARTS, 200, 200)
        self.assertEqual((j["state"], j["evidence"], j["strict"], j["matched"]), ("matched_not_strict", "none", False, True))
        self.assertFalse(j["fallback"])

    def test_unmatched_and_error(self):
        j = rc.judge_row({"status": "ok"}, {"status": "ok", "matched": False}, PARTS, 200, 200)
        self.assertEqual((j["state"], j["matched"], j["fallback"], j["strict"]), ("unmatched", False, True, False))
        j = rc.judge_row({"status": "ok"}, {"status": "error"}, PARTS, 200, 200)
        self.assertEqual(j["state"], "technical_error")
        self.assertIsNone(j["matched"])
        self.assertFalse(j["strict"])
        j = rc.judge_row({"status": "error"}, {"status": "ok", "matched": True}, PARTS, 200, 200)
        self.assertEqual(j["state"], "technical_error")

    def test_baseline_judge(self):
        past = {"status": "ok", "matched": True, "band": self.band(10, 10, 60, 10)}
        self.assertEqual(rc.judge_baseline(past, PARTS, 200, 200), (True, "all"))
        past["matched"] = False
        self.assertEqual(rc.judge_baseline(past, PARTS, 200, 200), (False, None))
        self.assertEqual(rc.judge_baseline({"status": "error"}, PARTS, 200, 200), (False, None))


def srow(cond, ds, pid, state, cohort="primary", bs=False, ev=None):
    strict = state == "matched_strict"
    matched = None if state == "technical_error" else state.startswith("matched")
    return {"cond": cond, "dataset": ds, "id": pid, "cell": "ko/nl", "cohort": cohort, "baselineMatched": cohort == "control",
            "baselineStrict": bs, "baselineEvidence": None, "branch": "k0", "state": state, "matched": matched,
            "fallback": None if matched is None else not matched, "strict": strict, "evidence": ev, "fullPage": None,
            "error": None}


class Aggregates(unittest.TestCase):
    def test_empty_denominators_give_null_pct(self):
        b = rc.blk_primary([])
        self.assertIsNone(b["matchedPct"])
        self.assertIsNone(b["strictPct"])
        c = rc.blk_control([])
        self.assertIsNone(c["strictToFailPct"])
        self.assertIsNone(c["matchedToUnmatchedPct"])
        self.assertEqual(rc.blk_top([])["n"], 0)

    def test_error_rows_kept_separate(self):
        rows = [srow("O0K0", "r09", "a", "technical_error", "control", bs=True),
                srow("O0K0", "r09", "b", "unmatched", "control", bs=True),
                srow("O0K0", "r09", "c", "matched_not_strict", "control", bs=True),
                srow("O0K0", "r09", "d", "matched_strict", "control", bs=True),
                srow("O0K0", "r09", "e", "matched_strict", "control", bs=False)]
        c = rc.blk_control(rows)
        self.assertEqual((c["n"], c["technicalError"], c["matchedToUnmatched"], c["stillMatched"]), (5, 1, 1, 3))
        self.assertEqual((c["baselineStrict"], c["strictToFail"], c["strictToFailUnmatched"],
                          c["matchedKeptLostEvidence"], c["strictTechnicalError"]), (4, 2, 1, 1, 1))
        self.assertEqual((c["baselineNotStrict"], c["newStrict"], c["strict"]), (1, 1, 2))
        self.assertEqual(c["strictToFailPct"], 50)

    def test_same_id_in_two_datasets_distinct(self):
        rows = []
        for cond in ("O0K0", "O0K1"):
            rows.append(srow(cond, "r09", "same", "matched_strict" if cond == "O0K1" else "unmatched"))
            rows.append(srow(cond, "fcp", "same", "unmatched"))
        pairs = rc.compute_pairs(rows)["O0K0->O0K1"]["total"]["strict"]
        self.assertEqual((pairs["n"], pairs["toOnly"], pairs["neither"]), (2, 1, 1))

    def test_pairs_error_either_side(self):
        rows = [srow("O0K0", "r09", "a", "technical_error"), srow("O0K1", "r09", "a", "matched_strict"),
                srow("O0K0", "r09", "b", "matched_strict"), srow("O0K1", "r09", "b", "matched_strict")]
        p = rc.compute_pairs(rows)["O0K0->O0K1"]["primary"]["matched"]
        self.assertEqual((p["n"], p["technicalError"], p["both"]), (2, 1, 1))

    def conds(self, success, loss):
        out = {}
        for c in rc.CONDS:
            out[c] = {"n": 96, "strict": 0, "technicalError": 0,
                      "primary": {"n": 24, "matched": success[c], "strict": success[c], "technicalError": 0},
                      "control": {"n": 72, "matchedToUnmatched": loss[c], "strictToFail": loss[c],
                                  "baselineStrict": 70, "technicalError": 0, "strictTechnicalError": 0}}
        return out

    def test_interaction_sign(self):
        succ = {"O0K0": 0, "O0K1": 4, "O1K0": 2, "O1K1": 10}
        loss = {"O0K0": 5, "O0K1": 5, "O1K0": 3, "O1K1": 1}
        it = rc.compute_interaction(self.conds(succ, loss))
        m = it["matchRecovery"]
        self.assertEqual((m["kAtO0"]["count"], m["kAtO1"]["count"], m["oAtK0"]["count"], m["oAtK1"]["count"],
                          m["interaction"]["count"]), (4, 8, 2, 6, 4))
        self.assertEqual(m["interaction"]["pp"], 16.67)
        self.assertEqual(m["direction"], rc.DIR_SUCCESS)
        l = it["matchedToUnmatched"]
        self.assertEqual(l["direction"], rc.DIR_LOSS)
        self.assertEqual((l["kAtO0"]["count"], l["kAtO1"]["count"], l["oAtK0"]["count"], l["oAtK1"]["count"],
                          l["interaction"]["count"]), (0, 2, 2, 4, 2))
        self.assertEqual(l["interaction"]["pp"], 2.78)
        self.assertEqual(l["raw"]["O1K1"], {"count": 1, "denom": 72, "pct": 1.39})
        self.assertEqual(l["denom"], 72)
        self.assertEqual(it["strictToFail"]["interaction"]["pp"], 2.86)  # 2/70
        self.assertFalse(l["qualified"])

    def test_interaction_qualified_and_null_denominator(self):
        succ = dict.fromkeys(rc.CONDS, 1)
        cs = self.conds(succ, succ)
        cs["O1K1"]["primary"]["technicalError"] = 2
        cs["O0K0"]["primary"]["n"] = 23
        it = rc.compute_interaction(cs)
        self.assertTrue(it["matchRecovery"]["qualified"])
        self.assertEqual(it["matchRecovery"]["technicalErrors"], 2)
        self.assertEqual(it["matchRecovery"]["raw"]["O0K0"]["denom"], 23)
        self.assertIsNone(it["matchRecovery"]["denom"])
        self.assertIsNone(it["matchRecovery"]["interaction"]["pp"])


class LangFiles(unittest.TestCase):
    good = {"langFiles": [{"name": "eng", "sha256": rc.LANG_FILES[0][1], "size": rc.LANG_FILES[0][2]},
                          {"name": "kor", "sha256": rc.LANG_FILES[1][1], "size": rc.LANG_FILES[1][2]}]}

    def test_ok(self):
        ck = rc.Check("x")
        rc.check_lang_files(self.good, ck)
        self.assertTrue(ck.ok)

    def test_missing_or_wrong(self):
        for bad in ({"langFiles": self.good["langFiles"][:1]}, {}, {"langFiles": []}):
            ck = rc.Check("x")
            rc.check_lang_files(bad, ck)
            self.assertFalse(ck.ok)
        g = copy.deepcopy(self.good)
        g["langFiles"][1]["size"] += 1
        ck = rc.Check("x")
        rc.check_lang_files(g, ck)
        self.assertFalse(ck.ok)
        g = copy.deepcopy(self.good)
        g["langFiles"][0]["sha256"] = "0" * 64
        ck = rc.Check("x")
        rc.check_lang_files(g, ck)
        self.assertFalse(ck.ok)


class DeepCompare(unittest.TestCase):
    def test_bool_is_not_number_and_int_equals_float(self):
        ck = rc.Check("x")
        rc.diff_values({"a": 1, "b": 2.0}, {"a": 1.0, "b": 2}, "", ck)
        self.assertTrue(ck.ok)
        for e, a in ((1, True), (0, False), (None, 0), ([1], [1, 2]), ({"a": 1}, {"a": 1, "b": 2})):
            ck = rc.Check("x")
            rc.diff_values(e, a, "", ck)
            self.assertFalse(ck.ok, (e, a))


# ---------------------------------------------------------------------------
# Synthetic end-to-end run (real Git inputs, hand-made OCR text) and tamper tests
# ---------------------------------------------------------------------------
def dumps_lines(rows):
    return "".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows).encode("utf-8")


def synth_ocr(inp):
    rows = []
    for oc in ("O0", "O1"):
        for c in inp["cohort"]:
            ds, pid = c["dataset"], c["id"]
            q = inp["qtext"][(ds, pid)]
            toks = q.replace("?", "").split()
            if oc == "O0":
                toks = [t for t in toks if re.fullmatch(r"[A-Za-z0-9\-]+", t)] or ["filler"]
            ws = [{"text": t, "box": [100 + 90 * i, 300, 80.5, 20]} for i, t in enumerate(toks)]
            lines = [
                {"text": "Weekly Program", "confidence": 96.25, "box": [100, 60, 300, 30],
                 "words": [{"text": "Weekly", "box": [100, 60, 100, 30]}, {"text": "Program", "box": [210, 60, 120, 30]}]},
                {"text": " ".join(toks), "confidence": 90.5, "box": [100, 300, 90.0 * len(toks), 20], "words": ws}]
            rows.append({"ocr": oc, "dataset": ds, "id": pid, "status": "ok", "ocrLines": lines})
    rows[3]["ocrLines"][1]["confidence"] = "bad"  # input_validation row
    rows[100] = {"ocr": "O1", "dataset": rows[100]["dataset"], "id": rows[100]["id"], "status": "error", "ocrLines": None}
    return rows


def write_synthetic(run, score, inp, ocr_rows):
    os.makedirs(run)
    os.makedirs(score)
    preds, by_key = [], {}
    ocr_by_key = {}
    for o in ocr_rows:
        key = (o["ocr"], o["dataset"], o["id"])
        ocr_by_key[key] = o
        exp, _ = rc.expected_pred(*key[:1], key[1], key[2], inp, o)
        row = rc.materialize(exp)
        preds.append(row)
        by_key[key] = row
    pb, ob = dumps_lines(preds), dumps_lines(ocr_rows)
    with open(os.path.join(run, "predictions.jsonl"), "wb") as f:
        f.write(pb)
    with open(os.path.join(run, "ocr.jsonl"), "wb") as f:
        f.write(ob)
    freeze = {"hashBasis": "raw bytes", "files": {"predictions.jsonl": rc.sha256(pb), "ocr.jsonl": rc.sha256(ob)}}
    with open(os.path.join(run, "freeze.json"), "w") as f:
        json.dump(freeze, f)
    srows = rc.build_score(inp, by_key)
    hrows = rc.build_history(inp, by_key, ocr_by_key, srows)
    summ = rc.build_summary(inp, preds, ocr_by_key, srows, hrows, freeze["files"])
    with open(os.path.join(score, "score.jsonl"), "wb") as f:
        f.write(dumps_lines(srows))
    with open(os.path.join(score, "history.jsonl"), "wb") as f:
        f.write(dumps_lines(hrows))
    with open(os.path.join(score, "summary.json"), "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(summ, indent=1, ensure_ascii=False) + "\n")
    return preds, srows


def jload(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def jdump(obj, path):
    with open(path, "w", encoding="utf-8", newline=None) as f:
        json.dump(obj, f)


def wbytes(path, data):
    with open(path, "wb") as f:
        f.write(data)


def read_lines(path):
    with open(path, "rb") as f:
        return [json.loads(l) for l in f.read().decode("utf-8").split("\n") if l]


class EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.cohort = os.path.join(rc.RESEARCH, "results", "ko-ocr-factorial", "cohort.jsonl")
        checks = {n: rc.Check(n) for n in rc.CHECK_NAMES}
        cls.inp = rc.load_inputs(cls.cohort, checks)
        cls.base = tempfile.mkdtemp(prefix="recount-test-")
        cls.ocr_rows = synth_ocr(cls.inp)
        cls.run0 = os.path.join(cls.base, "orig", "run")
        cls.score0 = os.path.join(cls.base, "orig", "score")
        write_synthetic(cls.run0, cls.score0, cls.inp, cls.ocr_rows)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.base, ignore_errors=True)

    def copy_run(self):
        d = tempfile.mkdtemp(dir=self.base)
        run, score = os.path.join(d, "run"), os.path.join(d, "score")
        shutil.copytree(self.run0, run)
        shutil.copytree(self.score0, score)
        return run, score

    def failed(self, run, score, cohort=None):
        checks, _ = rc.verify(run, score, cohort or self.cohort)
        return sorted(k for k, c in checks.items() if not c.ok)

    def test_fixed_inputs_loaded(self):
        self.assertEqual(len(self.inp["cohort"]), 96)
        self.assertEqual(len(self.inp["png"]), 96)
        self.assertEqual(sum(1 for c in self.inp["cohort"] if not c["baselineMatched"]), 24)

    def test_clean_run_passes_with_all_row_kinds(self):
        checks, info = rc.verify(self.run0, self.score0, self.cohort)
        self.assertEqual([k for k, c in checks.items() if not c.ok], [], {k: c.mismatches for k, c in checks.items() if not c.ok})
        for kind in ("ok", "input_validation", "ocr_error"):
            self.assertIn(kind, info["rowKinds"])
        branches = rc.build_summary  # noqa: F841 (smoke: summary builder importable)

    def tamper_pred(self, run, mutate, refreeze):
        p = os.path.join(run, "predictions.jsonl")
        rows = read_lines(p)
        mutate(rows)
        data = dumps_lines(rows)
        with open(p, "wb") as f:
            f.write(data)
        if refreeze:
            fp = os.path.join(run, "freeze.json")
            fz = jload(fp)
            fz["files"]["predictions.jsonl"] = rc.sha256(data)
            jdump(fz, fp)

    def test_tamper_prediction_hash_only(self):
        run, score = self.copy_run()
        self.tamper_pred(run, lambda r: r[10]["k0"].__setitem__("score", 99), False)
        self.assertIn("freeze", self.failed(run, score))

    def test_tamper_prediction_with_refreeze(self):
        run, score = self.copy_run()

        def mut(rows):
            i = next(i for i, r in enumerate(rows) if r["k1"]["status"] == "ok" and r["k1"]["matched"])
            rows[i]["k1"]["band"]["left"] += 1
        self.tamper_pred(run, mut, True)
        f = self.failed(run, score)
        self.assertIn("predictions", f)
        self.assertNotIn("freeze", f)

    def test_tamper_png_hash(self):
        run, score = self.copy_run()
        self.tamper_pred(run, lambda r: r[0].__setitem__("pngSha256", "0" * 64), True)
        self.assertIn("predictions", self.failed(run, score))

    def test_tamper_ocr_lines(self):
        run, score = self.copy_run()
        p = os.path.join(run, "ocr.jsonl")
        rows = read_lines(p)
        rows[0]["ocrLines"][0]["confidence"] += 1
        data = dumps_lines(rows)
        wbytes(p, data)
        fp = os.path.join(run, "freeze.json")
        fz = jload(fp)
        fz["files"]["ocr.jsonl"] = rc.sha256(data)
        jdump(fz, fp)
        self.assertIn("predictions", self.failed(run, score))

    def test_tamper_score(self):
        run, score = self.copy_run()
        p = os.path.join(score, "score.jsonl")
        rows = read_lines(p)
        rows[5]["strict"] = not rows[5]["strict"]
        wbytes(p, dumps_lines(rows))
        self.assertEqual(self.failed(run, score), ["score"])

    def test_tamper_history(self):
        run, score = self.copy_run()
        p = os.path.join(score, "history.jsonl")
        rows = read_lines(p)
        rows[0]["ocrIdentical"] = not rows[0]["ocrIdentical"]
        wbytes(p, dumps_lines(rows))
        self.assertEqual(self.failed(run, score), ["history"])

    def test_tamper_summary(self):
        run, score = self.copy_run()
        p = os.path.join(score, "summary.json")
        s = jload(p)
        s["conditions"]["O1K1"]["total"]["strict"] += 1
        jdump(s, p)
        self.assertEqual(self.failed(run, score), ["summary"])
        s["conditions"]["O1K1"]["total"]["strict"] -= 1
        s["interaction"]["strictRecovery"]["interaction"]["pp"] = 1.23
        jdump(s, p)
        self.assertEqual(self.failed(run, score), ["summary"])

    def test_tamper_cohort_copy(self):
        run, score = self.copy_run()
        rows = read_lines(self.cohort)
        rows[0]["baselineMatched"] = not rows[0]["baselineMatched"]
        cp = os.path.join(self.base, "cohort-tampered.jsonl")
        wbytes(cp, dumps_lines(rows))
        self.assertIn("cohort", self.failed(run, score, cp))

    def test_guard_summary_missing_language_file(self):
        run, score = self.copy_run()
        good = dict(LangFiles.good)
        jdump(good, os.path.join(run, "guard-summary.json"))
        self.assertEqual(self.failed(run, score), [])
        jdump({"langFiles": good["langFiles"][:1]}, os.path.join(run, "guard-summary.json"))
        self.assertEqual(self.failed(run, score), ["guard_summary"])

    def cli(self, run, score, out):
        script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "recount.py")
        return subprocess.run([sys.executable, script, "--run", run, "--score", score, "--out", out],
                              capture_output=True, text=True)

    def test_cli_exit_codes_and_report(self):
        run, score = self.copy_run()
        out = os.path.join(self.base, "report-ok.json")
        p = self.cli(run, score, out)
        self.assertEqual(p.returncode, 0, p.stderr)
        rep = jload(out)
        self.assertTrue(rep["ok"])
        # tamper -> 1 with at most 20 listed mismatches
        sp = os.path.join(score, "score.jsonl")
        rows = read_lines(sp)
        for r in rows[:40]:
            r["strict"] = not r["strict"]
        wbytes(sp, dumps_lines(rows))
        out2 = os.path.join(self.base, "report-bad.json")
        p = self.cli(run, score, out2)
        self.assertEqual(p.returncode, 1)
        rep = jload(out2)
        self.assertFalse(rep["ok"])
        self.assertLessEqual(len(rep["checks"]["score"]["mismatches"]), 20)
        # unreadable input -> 2
        out3 = os.path.join(self.base, "report-missing.json")
        p = self.cli(os.path.join(self.base, "nope"), score, out3)
        self.assertEqual(p.returncode, 2)
        self.assertEqual(jload(out3)["exitCode"], 2)


if __name__ == "__main__":
    unittest.main()
