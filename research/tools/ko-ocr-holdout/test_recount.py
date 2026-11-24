import json
import os
import shutil
import sys
import tempfile
import unicodedata
import unittest
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import recount as R  # noqa: E402

RESULTS = os.path.normpath(os.path.join(HERE, "..", "..", "results", "ko-ocr-holdout"))
DATA, RUN_A, SCORE_A = (os.path.join(RESULTS, p) for p in ("data", "run-a", "score-a"))
HAVE_REAL = all(os.path.isdir(p) for p in (DATA, RUN_A, SCORE_A))


def W(text, box):
    return {"text": text, "box": box}


def L(text, conf=90.0, box=(100, 100, 400, 20), words=None):
    box = list(box)
    if words is None:
        n = max(1, len(text.split()))
        wd = box[2] / n
        words = [W(t, [box[0] + i * wd, box[1], wd, box[3]]) for i, t in enumerate(text.split())]
    return {"text": text, "confidence": conf, "box": box, "words": words}


class JsHelpers(unittest.TestCase):
    def test_round_half_up(self):
        self.assertEqual(R.js_round(2.5), 3)
        self.assertEqual(R.js_round(-0.5), 0)
        self.assertEqual(R.js_round(-1.5), -1)
        self.assertEqual(R.js_round(2.4999), 2)

    def test_pct(self):
        self.assertIsNone(R.pct(0, 0))
        self.assertEqual(R.pct(15, 96), 15.63)
        self.assertEqual(R.pct(0, 24), 0)
        self.assertEqual(R.pct(1, 3), 33.33)

    def test_number_notation(self):
        cases = {12.0: "12", 0.5: "0.5", -3.25: "-3.25", 1e21: "1e+21", 1e-7: "1e-7", 1.5e-7: "1.5e-7",
                 0.000001: "0.000001", 123456789012345680000.0: "123456789012345680000", 100.0: "100",
                 -0.0: "0", 55: "55", 1.2345e25: "1.2345e+25"}
        for x, s in cases.items():
            self.assertEqual(R.js_number(x), s, x)

    def test_stringify(self):
        v = {"a": [1.0, "한글\u0001\"", None, True], "b": {"c": 0.1}}
        self.assertEqual(R.js_stringify(v), '{"a":[1,"한글\\u0001\\"",null,true],"b":{"c":0.1}}')


class Selector(unittest.TestCase):
    def test_tokens_keywords(self):
        self.assertEqual(R.tokens("What is RP-3224's due?"), ["what", "is", "rp-3224", "s", "due"])
        self.assertEqual(R.keywords("What is the due date for RP-3224? due"), ["due", "date", "rp-3224"])
        self.assertEqual(R.tokens("한글 only"), ["only"])

    def test_score_prefix_rule(self):
        line = {"text": "Delivery dates", "words": []}
        self.assertEqual(R.line_score(line, ["date"]), 0 + (1 if "dates".startswith("date") else 0))
        self.assertEqual(R.line_score({"text": "ab due"}, ["abc"]), 0)  # short word
        self.assertEqual(R.line_score({"text": "due"}, ["due", "due"]), 2)

    def test_yesno_excluded(self):
        r = R.select_window([L("yes off")], "is it yes off", 1280, 960)
        self.assertFalse(r["matched"])

    def test_tie_prefers_strictly_higher_confidence_then_first(self):
        a, b, c = L("code due", 80), L("code due", 90), L("code due", 90)
        e = R.expected_k0([a, b, c], "due code")
        self.assertEqual(e["lineIndex"], 1)
        e = R.expected_k0([L("code due", 90), L("code due", 90)], "due code")
        self.assertEqual(e["lineIndex"], 0)
        e = R.expected_k0([L("due", 99), L("code due", 10)], "due code")
        self.assertEqual(e["lineIndex"], 1)  # score beats confidence

    def test_window_row(self):
        line = L("alpha due beta", 90, box=(100, 200, 300, 20))
        e = R.expected_k0([line], "due")
        self.assertTrue(e["matched"])
        self.assertEqual(e["confidence"], 90)
        self.assertFalse(e["axisRow"])
        # lh=20: x0=100-80? anchor x = 100+100=200 ; min(200,100)-80=20 ; x1=100+300+160=560
        self.assertEqual(e["band"], {"left": 20, "top": 140, "width": 540, "height": 200})
        self.assertIsNone(e["error"])

    def test_confidence_round_half_up(self):
        e = R.expected_k0([L("due", 90.5)], "due")
        self.assertEqual(e["confidence"], 91)

    def test_axis_row(self):
        words = [W("w%d" % i, [100 + 50 * i, 100, 30, 20]) for i in range(9)]
        words[3] = W("due", [250, 100, 30, 20])
        line = {"text": " ".join(w["text"] for w in words), "confidence": 90, "box": [100, 100, 430, 20], "words": words}
        e = R.expected_k0([line], "due")
        self.assertTrue(e["axisRow"])

    def test_invalid_window(self):
        # line at far edge produces a window still clipped to page: valid; force invalid via helper
        self.assertFalse(R.window_valid({"left": 0, "top": 0, "width": 0, "height": 5}))
        self.assertFalse(R.window_valid({"left": 0, "top": 0, "width": 1281, "height": 5}))
        self.assertFalse(R.window_valid({"left": 0.5, "top": 0, "width": 5, "height": 5}))
        self.assertTrue(R.window_valid({"left": 0, "top": 0, "width": 1280, "height": 960}))

    def test_unmatched_nulls(self):
        e = R.expected_k0([L("nothing here")], "due date")
        self.assertFalse(e["matched"])
        self.assertEqual(e["score"], 0)
        self.assertIsNone(e["lineIndex"])
        self.assertIsNone(e["band"])


class Hangul(unittest.TestCase):
    def test_bigrams(self):
        self.assertEqual(R.bigrams("완료 예정일"), {"완료", "예정", "정일"})
        self.assertEqual(R.bigrams("가"), set())
        self.assertEqual(R.bigrams("가A나다"), {"나다"})
        self.assertEqual(R.bigrams("ABC"), set())

    def test_nfc(self):
        nfd = unicodedata.normalize("NFD", "완료")
        self.assertNotEqual(nfd, "완료")
        self.assertEqual(R.bigrams(nfd), {"완료"})

    def test_k1_copies_k0_on_match(self):
        k0 = R.expected_k0([L("due")], "due 완료")
        k1 = R.expected_k1([L("due")], "due 완료", k0)
        self.assertEqual(k1["branch"], "k0")
        self.assertEqual(k1["lineIndex"], k0["lineIndex"])
        self.assertIsNone(k1["anchor"])

    def _k1(self, lines, q):
        return R.expected_k1(lines, q, R.expected_k0(lines, q))

    def test_hangul_branch_and_anchor(self):
        words = [W("코드", [50, 100, 40, 20]), W("완료", [200, 102, 60, 20]), W("예정일", [270, 100, 80, 24])]
        line = {"text": "코드 완료 예정일", "confidence": 88.4, "box": [50, 100, 300, 24], "words": words}
        k1 = self._k1([line], "완료 예정일은")
        self.assertEqual(k1["branch"], "hangul")
        self.assertEqual(k1["hitWords"], [1, 2])
        self.assertEqual(k1["anchor"], [200, 100, 150, 24])
        self.assertEqual(k1["score"], 3)  # 완료, 예정, 정일
        self.assertEqual(k1["confidence"], 88)
        self.assertEqual(k1["lineIndex"], 0)

    def test_line_text_not_used_only_words(self):
        line = {"text": "완료 예정", "confidence": 90, "box": [10, 10, 100, 20], "words": [W("완", [10, 10, 10, 20])]}
        k1 = self._k1([line], "완료 예정")
        self.assertFalse(k1["matched"])
        self.assertEqual(k1["branch"], "none")

    def test_none_when_q_empty(self):
        k1 = self._k1([L("due")], "no hangul")
        self.assertEqual((k1["matched"], k1["branch"]), (False, "none"))

    def test_tie_confidence(self):
        mk = lambda c: {"text": "x", "confidence": c, "box": [10, 10, 100, 20], "words": [W("완료", [10, 10, 40, 20])]}  # noqa: E731
        self.assertEqual(self._k1([mk(80), mk(90), mk(90)], "완료")["lineIndex"], 1)
        self.assertEqual(self._k1([mk(90), mk(90)], "완료")["lineIndex"], 0)


class Judge(unittest.TestCase):
    PARTS = [{"rect": [100, 100, 200, 120]}, {"rect": [300, 100, 400, 120]}]

    def key(self, left, top, w, h):
        return {"status": "ok", "matched": True, "band": {"left": left, "top": top, "width": w, "height": h}}

    def test_half_open_boundary(self):
        self.assertEqual(R.judge(self.key(100, 100, 300, 20), True, self.PARTS)["state"], "matched_strict")
        self.assertEqual(R.judge(self.key(100, 100, 299, 20), True, self.PARTS)["evidence"], "partial")
        self.assertEqual(R.judge(self.key(101, 100, 300, 20), True, self.PARTS)["evidence"], "partial")
        self.assertEqual(R.judge(self.key(100, 101, 300, 20), True, self.PARTS)["state"], "matched_not_strict")
        self.assertEqual(R.judge(self.key(100, 100, 300, 19), True, self.PARTS)["evidence"], "none")

    def test_full_page_not_strict(self):
        v = R.judge(self.key(0, 0, 1280, 960), True, self.PARTS)
        self.assertEqual((v["state"], v["evidence"], v["fullPage"]), ("matched_not_strict", "all", True))

    def test_unmatched_and_error(self):
        v = R.judge({"status": "ok", "matched": False}, True, self.PARTS)
        self.assertEqual((v["state"], v["matched"], v["evidence"], v["fullPage"]), ("unmatched", False, None, None))
        for pred_ok, status in ((False, "ok"), (True, "error")):
            v = R.judge({"status": status, "matched": True}, pred_ok, self.PARTS)
            self.assertEqual((v["state"], v["matched"], v["strict"]), ("technical_error", None, False))


def make_png(rows, w, h, ftypes=None):
    out = bytearray()
    prev = bytearray(w)
    for y in range(h):
        ft = (ftypes or [0] * h)[y]
        cur = rows[y]
        out.append(ft)
        for x in range(w):
            a = cur[x - 1] if x else 0
            b = prev[x]
            c = prev[x - 1] if x else 0
            if ft == 0:
                pred = 0
            elif ft == 1:
                pred = a
            elif ft == 2:
                pred = b
            elif ft == 3:
                pred = (a + b) >> 1
            else:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            out.append((cur[x] - pred) & 255)
        prev = cur
    import struct

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d))

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(out))) + chunk(b"IEND", b""))


class Png(unittest.TestCase):
    def test_all_filters_roundtrip(self):
        w, h = 17, 10
        rows = [bytearray((x * 7 + y * 31 + (x * y) % 13) & 255 for x in range(w)) for y in range(h)]
        ftypes = [0, 1, 2, 3, 4, 4, 3, 2, 1, 0]
        rw, rh, got = R.decode_png(make_png(rows, w, h, ftypes))
        self.assertEqual((rw, rh), (w, h))
        self.assertEqual([bytes(r) for r in got], [bytes(r) for r in rows])

    def test_rejects_rgb(self):
        import struct
        bad = bytearray(make_png([bytearray(2)], 2, 1))
        bad[25] = 2  # colour type
        with self.assertRaises(ValueError):
            R.decode_png(bytes(bad))

    def test_edge_ink(self):
        rows = [bytearray([255] * 20) for _ in range(20)]
        for x in range(5, 9):
            rows[5][x] = 0  # top edge only
        ink = R.edge_ink(rows, [5, 5, 10, 10])
        self.assertEqual(ink, {"top": True, "bottom": False, "left": True, "right": False})
        rows[9][7] = 254
        rows[7][9] = 0
        ink = R.edge_ink(rows, [5, 5, 10, 10])
        self.assertTrue(ink["bottom"] and ink["right"])
        # pixel just outside the box does not count
        rows2 = [bytearray([255] * 20) for _ in range(20)]
        rows2[10][7] = 0
        rows2[7][10] = 0
        ink = R.edge_ink(rows2, [5, 5, 10, 10])
        self.assertFalse(ink["bottom"] or ink["right"])


class Validation(unittest.TestCase):
    def test_valid_lines(self):
        self.assertTrue(R.valid_lines([L("a b")]))
        self.assertFalse(R.valid_lines([{"text": 1, "confidence": 1, "box": [1, 2, 3, 4], "words": []}]))
        self.assertFalse(R.valid_lines([{"text": "a", "confidence": float("nan"), "box": [1, 2, 3, 4], "words": []}]))
        self.assertFalse(R.valid_lines([{"text": "a", "confidence": 1, "box": [1, 2, 3], "words": []}]))
        self.assertFalse(R.valid_lines([{"text": "a", "confidence": 1, "box": [1, 2, 3, 4], "words": [{"text": "a", "box": [1, 2, 3, float("inf")]}]}]))
        self.assertFalse(R.valid_lines([{"text": "a", "confidence": True, "box": [1, 2, 3, 4], "words": []}]))
        self.assertFalse(R.valid_lines("x"))


@unittest.skipUnless(HAVE_REAL, "real run A data not present")
class EndToEnd(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def go(self, data=DATA, run=RUN_A, score=SCORE_A):
        out = os.path.join(self.tmp, "o.json")
        code = R.main(["--data", data, "--run", run, "--baseline-run", RUN_A, "--score", score, "--out", out])
        with open(out, "rb") as f:
            raw = f.read()
        self.assertNotIn(b"\r", raw)
        return code, json.loads(raw.decode("utf-8"))

    def test_run_a_passes(self):
        code, out = self.go()
        self.assertEqual(code, 0)
        self.assertTrue(out["ok"])
        self.assertEqual(out["recount"]["baseline"]["M"] + out["recount"]["baseline"]["C"] + out["recount"]["baseline"]["E"], 96)

    def _copy_score(self):
        d = os.path.join(self.tmp, "score")
        shutil.copytree(SCORE_A, d)
        return d

    def test_tampered_score_row_detected(self):
        d = self._copy_score()
        p = os.path.join(d, "score.jsonl")
        with open(p, "rb") as f:
            lines = f.read().decode("utf-8").split("\n")
        r = json.loads(lines[0])
        r["strict"] = not r["strict"]
        lines[0] = json.dumps(r, ensure_ascii=False, separators=(",", ":"))
        with open(p, "wb") as f:
            f.write("\n".join(lines).encode("utf-8"))
        code, out = self.go(score=d)
        self.assertEqual(code, 1)
        self.assertFalse(out["check3_rows"]["ok"])

    def test_tampered_summary_detected(self):
        d = self._copy_score()
        p = os.path.join(d, "summary.json")
        with open(p, "rb") as f:
            s = json.loads(f.read().decode("utf-8"))
        s["conditions"]["O1K1"]["total"]["strict"] += 1
        with open(p, "wb") as f:
            f.write(json.dumps(s).encode("utf-8"))
        code, out = self.go(score=d)
        self.assertEqual(code, 1)
        self.assertFalse(out["check4_aggregates"]["ok"])
        self.assertTrue(out["check1_hash"]["ok"])

    def test_tampered_prediction_detected(self):
        d = os.path.join(self.tmp, "run")
        shutil.copytree(RUN_A, d)
        p = os.path.join(d, "predictions.jsonl")
        with open(p, "rb") as f:
            raw = f.read()
        with open(p, "wb") as f:
            f.write(raw.replace(b'"confidence":79', b'"confidence":78', 1))
        out = os.path.join(self.tmp, "o2.json")
        code = R.main(["--data", DATA, "--run", d, "--baseline-run", RUN_A, "--score", SCORE_A, "--out", out])
        self.assertEqual(code, 1)
        with open(out, encoding="utf-8") as f:
            res = json.load(f)
        self.assertFalse(res["check1_hash"]["ok"])  # freeze hash no longer matches
        self.assertFalse(res["check2_keys"]["ok"])

    def test_tampered_data_png_detected(self):
        d = os.path.join(self.tmp, "data")
        shutil.copytree(DATA, d)
        img = sorted(os.listdir(os.path.join(d, "images")))[0]
        with open(os.path.join(d, "images", img), "ab") as f:
            f.write(b"x")
        code, out = self.go(data=d)
        self.assertEqual(code, 1)
        self.assertFalse(out["check1_hash"]["ok"])


if __name__ == "__main__":
    unittest.main()
