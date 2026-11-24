"""recount.py 시험. python -m unittest 또는 이 파일을 직접 실행."""
import copy
import json
import os
import shutil
import sys
import tempfile
import unicodedata
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import recount as rc  # noqa: E402

REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
RESULTS = os.path.join(REPO, "research", "results", "ko-anchor-diagnostic")

_CACHE = {}


def real():
    if not _CACHE:
        raws, parsed, sources, errs = rc.load_datasets(REPO)
        assert not errs, errs
        _CACHE.update(raws=raws, parsed=parsed, sources=sources)
    return _CACHE


def first_ko_nl(name):
    p = real()["parsed"][name]
    for r in p["ocr"]:
        im = next(i for i in p["design"]["images"] if i["id"] == r["id"])
        if im["lang"] == "ko" and im["anchor"] == "nl":
            return r, im
    raise AssertionError


def target_of(im):
    return next(t for t in im["items"] if t["id"] == im["anchorItem"])


def score_with(name, ocr_lines, question=None, status="ok"):
    """원본 KO/nl 한 행의 OCR 줄을 교체해 채점 행을 재계산."""
    r, im = first_ko_nl(name)
    q = question if question is not None else next(x for x in real()["parsed"][name]["questions"] if x["id"] == r["id"])["question"]
    c = rc.collect_row(name, r["id"], q, r["width"], r["height"], status, ocr_lines)
    rep = rc.expected_replay_row(name, r)
    return rc.score_row(name, r["id"], im, q, status, c, rep)


def mk_im(text, cell=(100, 100, 200, 150), extra_items=()):
    return {"id": "x", "anchorItem": "t", "lang": "ko", "anchor": "nl",
            "items": [{"id": "t", "role": "label", "text": text, "cell": list(cell)}] + list(extra_items)}


def classify_case(question, target_text, words, cell=(100, 100, 200, 150), status="ok"):
    """words: [(text, box)] 한 줄. 반환 category."""
    lines = [{"text": " ".join(w for w, _ in words), "words": [{"text": w, "box": b} for w, b in words]}]
    c = rc.collect_row("r09", "x", question, 1280, 960, status, lines)
    T = rc.bigrams(target_text)
    S = [x for x in c["Q"] if x in set(T)]
    return rc.classify(status, T, S, c["signalWords"] or [], list(cell))


class Representation(unittest.TestCase):
    def test_bigrams_basic_and_overlap(self):
        self.assertEqual(rc.bigrams("검토 예산"), ["검토", "예산"])
        self.assertEqual(rc.bigrams("일정은"), ["일정", "정은"])

    def test_single_syllable_no_contribution(self):
        self.assertEqual(rc.bigrams("가 나 abc 다"), [])

    def test_repeat_syllable(self):
        self.assertEqual(rc.bigrams("하하"), ["하하"])
        self.assertEqual(rc.bigrams("하하하"), ["하하"])

    def test_no_cross_boundary(self):
        self.assertEqual(rc.bigrams("가 나"), [])
        self.assertEqual(rc.bigrams("가-나"), [])
        self.assertEqual(rc.bigrams("가A나"), [])

    def test_nfd_equals_nfc(self):
        s = "검토 예산"
        self.assertEqual(rc.bigrams(unicodedata.normalize("NFD", s)), rc.bigrams(s))

    def test_empty_and_non_hangul(self):
        self.assertEqual(rc.bigrams(""), [])
        self.assertEqual(rc.bigrams("SX-5134 abc"), [])

    def test_sorted_codepoint(self):
        self.assertEqual(rc.bigrams("나다 가나"), ["가나", "나다"])


class RealResults(unittest.TestCase):
    def test_real_results_pass(self):
        rep = rc.run(RESULTS, REPO)
        self.assertEqual(rep["sourceErrors"], [])
        self.assertTrue(rep["ok"], rep)
        self.assertEqual(rc.main(["--results", RESULTS, "--repo", REPO]), 0)


class Tamper(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="recount-tamper-")
        self.dir = os.path.join(self.tmp, "r")
        shutil.copytree(RESULTS, self.dir)

    def tearDown(self):
        shutil.rmtree(self.tmp, ignore_errors=True)

    def edit_json(self, fn, f):
        p = os.path.join(self.dir, fn)
        with open(p, encoding="utf-8") as fh:
            d = json.load(fh)
        f(d)
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(d, fh, ensure_ascii=False, indent=1)

    def edit_jsonl(self, fn, f):
        p = os.path.join(self.dir, fn)
        with open(p, encoding="utf-8") as fh:
            rows = [json.loads(l) for l in fh if l.strip()]
        f(rows)
        with open(p, "w", encoding="utf-8", newline="\n") as fh:
            for r in rows:
                fh.write(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n")

    def code(self):
        return rc.main(["--results", self.dir, "--repo", REPO])

    def test_untouched_copy_passes(self):
        self.assertEqual(self.code(), 0)

    def test_a_summary_denominator(self):
        def f(d):
            d["r09"]["diagnostic"]["denominator"] += 1
        self.edit_json("summary.json", f)
        self.assertEqual(self.code(), 1)

    def test_b_score_category(self):
        def f(rows):
            rows[0]["category"] = "inside"
        self.edit_jsonl("score.jsonl", f)
        self.assertEqual(self.code(), 1)

    def test_c_collect_Q(self):
        def f(rows):
            rows[1]["Q"] = rows[1]["Q"][:-1]
        self.edit_jsonl("collect.jsonl", f)
        self.assertEqual(self.code(), 1)

    def test_d_score_row_deleted(self):
        def f(rows):
            del rows[5]
        self.edit_jsonl("score.jsonl", f)
        self.assertEqual(self.code(), 1)

    def test_e_pinned_hash(self):
        def f(d):
            d["replay.jsonl"] = "0" * 64
        self.edit_json("pinned.json", f)
        self.assertEqual(self.code(), 1)

    def test_replay_field_tamper(self):
        def f(rows):
            rows[0]["keys"] = ["zz"]
        self.edit_jsonl("replay.jsonl", f)
        self.assertEqual(self.code(), 1)

    def test_stop_json_abnormal(self):
        with open(os.path.join(self.dir, "stop.json"), "w") as fh:
            fh.write("{}")
        self.assertEqual(self.code(), 1)

    def test_sources_tamper(self):
        def f(d):
            d["datasets"]["fcp"]["files"]["ocr"]["bytes"] += 1
        self.edit_json("sources.json", f)
        self.assertEqual(self.code(), 1)


class Positive(unittest.TestCase):
    """원본 KO/nl 한 행: 대상 표지의 한글 단어를 셀 중심 box로 넣으면 inside, 셀 밖이면 outside_only."""

    def test_inside_and_outside(self):
        for name in rc.DATASETS:
            r, im = first_ko_nl(name)
            t = target_of(im)
            l, tp, rr, b = t["cell"]
            word = t["text"].split()[0]
            self.assertTrue(rc.bigrams(word), word)
            cx, cy = (l + rr) / 2, (tp + b) / 2
            w, h = 40, 20
            inside = [{"text": word, "words": [{"text": word, "box": [cx - w / 2, cy - h / 2, w, h]}]}]
            row = score_with(name, inside)
            self.assertEqual(row["category"], "inside", name)
            self.assertGreaterEqual(row["insideWords"], 1)
            self.assertIs(row["alsoOutside"], False)
            outside = [{"text": word, "words": [{"text": word, "box": [rr + 100, tp, w, h]}]}]
            row = score_with(name, outside)
            self.assertEqual(row["category"], "outside_only", name)
            self.assertIsNone(row["alsoOutside"])
            both = inside + outside
            row = score_with(name, both)
            self.assertEqual(row["category"], "inside")
            self.assertIs(row["alsoOutside"], True)

    def test_absent_when_no_hangul(self):
        r, im = first_ko_nl("r09")
        row = score_with("r09", r["ocrLines"])
        self.assertEqual(row["category"], "absent")

    def test_control_inside(self):
        r, im = first_ko_nl("r09")
        row = score_with("r09", r["ocrLines"])
        self.assertEqual(row["control"]["category"], "inside")


class NegativeAndBoundary(unittest.TestCase):
    def test_single_syllable_label_not_applicable(self):
        cat = classify_case("가 언제", "가", [("가", [100, 100, 10, 10])])[0]
        self.assertEqual(cat, "not_applicable")

    def test_no_question_signal(self):
        cat = classify_case("일정은 언제", "검토 예산", [("검토", [100, 100, 10, 10])])[0]
        self.assertEqual(cat, "no_question_signal")

    def test_technical_error(self):
        self.assertEqual(rc.classify("error", ["검토"], ["검토"], [], [0, 0, 1, 1])[0], "technical_error")

    def test_half_open_boundaries(self):
        # 셀 [100,100,200,150): 중심 x = box x + w/2
        def cat(cx, cy):
            return classify_case("검토 질문", "검토 예산", [("검토", [cx - 5, cy - 5, 10, 10])])[0]
        self.assertEqual(cat(100, 100), "inside")   # 왼쪽·위 = 안
        self.assertEqual(cat(200, 120), "outside_only")  # 오른쪽 = 밖
        self.assertEqual(cat(150, 150), "outside_only")  # 아래 = 밖
        self.assertEqual(cat(199.5, 149.5), "inside")
        self.assertEqual(cat(99.5, 120), "outside_only")
        self.assertEqual(cat(150, 99.5), "outside_only")

    def test_center_not_box_corner(self):
        # 모서리가 셀 안이어도 중심이 밖이면 밖
        self.assertEqual(classify_case("검토 질문", "검토 예산", [("검토", [190, 110, 40, 10])])[0], "outside_only")

    def test_generic_overlap_and_other_cells(self):
        extra = [{"id": "o1", "role": "label", "text": "예산 일정", "cell": [300, 100, 400, 150]},
                 {"id": "o2", "role": "label", "text": "", "cell": [0, 0, 5, 5]}]
        im = mk_im("검토 예산", extra_items=extra)
        q = "일정은 검토"
        lines = [{"text": "일정", "words": [{"text": "일정", "box": [0, 0, 10, 10]}]}]
        c = rc.collect_row("r09", "x", q, 100, 100, "ok", lines)
        row = rc.score_row("r09", "x", im, q, "ok", c, {"keys": [], "matched": False})
        self.assertEqual(row["S"], ["검토"])
        self.assertEqual(row["genericOverlap"], ["일정", "정은"][:1])
        self.assertEqual(row["control"]["textCells"], 2)
        self.assertEqual(row["control"]["otherCellsWithGeneric"], 1)
        self.assertEqual(row["control"]["otherCellsWithTargetSignal"], 0)
        self.assertEqual(row["control"]["category"], "inside")


class SourceValidation(unittest.TestCase):
    def test_real_sources_validate(self):
        for n in rc.DATASETS:
            self.assertEqual(rc.validate_dataset(n, real()["parsed"][n]), [])

    def test_delete_ocr_row(self):
        ds = copy.deepcopy(real()["parsed"]["r09"])
        del ds["ocr"][10]
        self.assertTrue(rc.validate_dataset("r09", ds))

    def test_change_dimension(self):
        ds = copy.deepcopy(real()["parsed"]["fcp"])
        ds["ocr"][3]["width"] += 1
        errs = rc.validate_dataset("fcp", ds)
        self.assertTrue(any("치수" in e for e in errs), errs)

    def test_bad_cell(self):
        ds = copy.deepcopy(real()["parsed"]["r09"])
        im = ds["design"]["images"][0]
        next(t for t in im["items"] if t["id"] == im["anchorItem"])["cell"] = [10, 10, 5, 20]
        self.assertTrue(rc.validate_dataset("r09", ds))

    def test_question_mismatch(self):
        ds = copy.deepcopy(real()["parsed"]["r09"])
        ds["questions"][0]["question"] += "?"
        self.assertTrue(rc.validate_dataset("r09", ds))

    def test_ko_nl_role(self):
        ds = copy.deepcopy(real()["parsed"]["r09"])
        _, im = None, next(i for i in ds["design"]["images"] if i["lang"] == "ko" and i["anchor"] == "nl")
        next(t for t in im["items"] if t["id"] == im["anchorItem"])["role"] = "value"
        self.assertTrue(rc.validate_dataset("r09", ds))

    def test_run_fails_on_source_error(self):
        # 원본 바이트 변조 검출: blob id 불일치
        data, errs = rc.read_pinned(REPO, rc.R09_COMMIT, rc.PINS["r09"]["files"]["questions"][0], rc.PINS["r09"]["files"]["questions"][1])
        self.assertEqual(errs, [])
        self.assertNotEqual(rc.blob_id(data + b" "), rc.PINS["r09"]["files"]["questions"][1])
        _, errs = rc.read_pinned(REPO, rc.R09_COMMIT, "research/results/r09-bilingual/heldout/design.json",
                                 rc.PINS["r09"]["files"]["questions"][1])
        self.assertTrue(errs)


if __name__ == "__main__":
    unittest.main()
