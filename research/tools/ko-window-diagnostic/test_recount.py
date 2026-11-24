"""Unit tests of the independent recount (protocol research/plans/2026-11-24-ko-window-diagnostic-protocol.md, section 8).

Run from research/: python -m unittest tools/ko-window-diagnostic/test_recount.py
"""
import copy
import os
import sys
import unittest
from fractions import Fraction as F

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recount as rc  # noqa: E402

ITEMS = [
    {"id": "hdr", "role": "header", "text": "코드 / 제목", "cell": [0, 20, 400, 60]},
    {"id": "lab", "role": "label", "text": "과수원 지도첩", "cell": [0, 100, 400, 150]},
    {"id": "val", "role": "value", "text": "2027-02-26", "cell": [500, 100, 800, 150]},
]
LAB_INK = [10, 110, 200, 130]


class Geometry(unittest.TestCase):
    def test_box_is_exact_half_open_rectangle(self):
        self.assertEqual(rc.to_xyxy([553.125, 100, 112.1875, 22.1875]), (F(553125, 1000), F(100), F(665.3125), F(122.1875)))
        for bad in ([1, 2, 3], [0, 0, float("nan"), 1], [0, 0, float("inf"), 1], [0, 0, -1, 1], [0, 0, True, 1], None):
            with self.assertRaises(rc.RecountError):
                rc.to_xyxy(bad)

    def test_centre_edges(self):
        cells = [("a", (0, 0, 10, 10)), ("b", (10, 0, 20, 10))]
        self.assertEqual(rc.items_at_centre([0, 0, 0, 0], cells), ["a"])
        self.assertEqual(rc.items_at_centre([8, 2, 4, 2], cells), ["b"])
        self.assertEqual(rc.items_at_centre([18, 8, 4, 4], cells), [])
        self.assertEqual(rc.items_at_centre([2, 8, 2, 4], cells), [])
        self.assertEqual(rc.items_at_centre([2, 8, 2, 3.999], cells), ["a"])
        self.assertEqual(rc.items_at_centre([5, 5, 0, 0], [("a", (0, 0, 10, 10)), ("c", (4, 4, 6, 6))]), ["a", "c"])

    def test_positive_area(self):
        self.assertFalse(rc.overlaps((0, 0, 10, 10), (10, 0, 20, 10)))
        self.assertFalse(rc.overlaps((0, 0, 10, 10), (10, 10, 20, 20)))
        self.assertTrue(rc.overlaps((0, 0, F(21, 2), 10), (10, 0, 20, 10)))

    def test_shortfall(self):
        band = (10, 20, 110, 220)
        self.assertEqual(rc.shortfall((10, 20, 110, 220), band), (0, 0, 0, 0))
        self.assertEqual(rc.shortfall((9, 19, 111, 221), band), (1, 1, 1, 1))

    def test_band(self):
        self.assertEqual(rc.band_edges({"left": 0, "top": 25, "width": 1280, "height": 248}, 1280, 960), (0, 25, 1280, 273))
        for bad in ({"left": 0, "top": 0, "width": 0, "height": 1}, {"left": 0, "top": 0, "width": 11, "height": 1}, {"left": -1, "top": 0, "width": 1, "height": 1}):
            with self.assertRaises(rc.RecountError):
                rc.band_edges(bad, 10, 10)

    def test_blank(self):
        for t in ("", " ", "　 ", "﻿"):
            self.assertTrue(rc.is_blank(t))
        for t in ("​", "가", "-"):
            self.assertFalse(rc.is_blank(t))


class K1(unittest.TestCase):
    def test_bigrams_per_word_and_tie_on_confidence(self):
        self.assertEqual(rc.syllable_pairs("과수원의 지도"), {"과수", "수원", "원의", "지도"})
        q = "과수원 지도첩 예정일"
        lines = [
            {"text": "x", "confidence": 50, "words": [{"text": "과수원", "box": [0, 0, 1, 1]}, {"text": "예정일", "box": [0, 0, 1, 1]}]},
            {"text": "y", "confidence": 80, "words": [{"text": "지도첩", "box": [0, 0, 1, 1]}, {"text": "abc", "box": [0, 0, 1, 1]}]},
            {"text": "z", "confidence": 90, "words": [{"text": "수원", "box": [0, 0, 1, 1]}, {"text": "정일", "box": [0, 0, 1, 1]}]},
        ]
        # line 0: {과수, 수원, 예정, 정일} = 4; line 1: {지도, 도첩} = 2; line 2: {수원, 정일} = 2
        self.assertEqual(rc.k1_pick(lines, q), (0, 4, [0, 1]))
        lines[2]["words"].append({"text": "예정과수", "box": [0, 0, 1, 1]})
        self.assertEqual(rc.k1_pick(lines, q), (2, 4, [0, 1, 2]))  # tie on 4, higher confidence wins
        self.assertEqual(rc.line_score(lines[1], rc.syllable_pairs(q)), 2)


def page_fixture():
    words = [{"text": "과수원", "box": [12, 112, 60, 16]}, {"text": "2027", "box": [510, 112, 40, 16]}]
    return {
        "items": ITEMS,
        "anchor": "lab",
        "ink": LAB_INK,
        "words": words,
    }


class Classes(unittest.TestCase):
    def test_line_and_trigger(self):
        f = page_fixture()
        cells = [(it["id"], tuple(it["cell"])) for it in ITEMS]
        recs = [rc.word_facts(w, cells, "lab", tuple(ITEMS[1]["cell"]), tuple(LAB_INK)) for w in f["words"]]
        self.assertEqual(rc.line_class(recs, "lab"), "anchorCue")
        self.assertTrue(rc.is_mixed(recs))
        self.assertEqual(rc.trigger_source(recs, [1], "lab"), "otherOnly")
        self.assertEqual(rc.trigger_source(recs, [0], "lab"), "anchorOnly")
        hdr_only = [rc.word_facts({"text": "코드", "box": [10, 25, 40, 20]}, cells, "lab", tuple(ITEMS[1]["cell"]), tuple(LAB_INK))]
        self.assertEqual(rc.line_class(hdr_only, "lab"), "otherItemOnly")
        straddle = rc.word_facts({"text": "첩2", "box": [380, 112, 260, 16]}, cells, "lab", tuple(ITEMS[1]["cell"]), tuple(LAB_INK))
        self.assertEqual(rc.line_class(hdr_only + [straddle], "lab"), "undetermined")
        self.assertTrue(straddle["anchorBoundary"])


class Compare(unittest.TestCase):
    ROWS = [
        {"id": "x", "lineClass": "anchorCue", "containment": "anchorOnly"},
        {"id": "y", "lineClass": "otherItemOnly", "containment": "neither"},
    ]

    def test_identical(self):
        self.assertEqual(rc.compare_rows(self.ROWS, copy.deepcopy(self.ROWS)), [])

    def test_swapped_classes_with_equal_marginals_are_rejected(self):
        swapped = copy.deepcopy(self.ROWS)
        swapped[0]["lineClass"], swapped[1]["lineClass"] = swapped[1]["lineClass"], swapped[0]["lineClass"]
        problems = rc.compare_rows(self.ROWS, swapped)
        self.assertEqual(sorted({p["id"] for p in problems}), ["x", "y"])
        self.assertTrue(all(p["field"] == "lineClass" for p in problems))

    def test_missing_extra_duplicate_and_field_sets(self):
        self.assertTrue(rc.compare_rows(self.ROWS, self.ROWS[:1]))
        self.assertTrue(rc.compare_rows(self.ROWS[:1], self.ROWS))
        self.assertTrue(rc.compare_rows(self.ROWS, self.ROWS + [self.ROWS[0]]))
        extra = copy.deepcopy(self.ROWS)
        extra[1]["more"] = 1
        self.assertTrue(rc.compare_rows(self.ROWS, extra))
        self.assertTrue(rc.compare_rows(self.ROWS, list(reversed(self.ROWS))))  # order is part of the record

    def test_number_forms_compare_by_value(self):
        self.assertEqual(rc.compare_rows([{"id": "x", "v": 1}], [{"id": "x", "v": 1.0}]), [])
        self.assertTrue(rc.compare_rows([{"id": "x", "v": True}], [{"id": "x", "v": 1}]))


class Pins(unittest.TestCase):
    def test_blob_and_sha_checked(self):
        data = "가\n".encode("utf-8")
        pin = {"blob": rc.git_blob_id(data), "sha256": rc.sha256(data), "bytes": len(data)}
        self.assertEqual(rc.check_pin("f", data, pin), data)
        for k in ("blob", "sha256"):
            bad = dict(pin, **{k: "0" * len(pin[k])})
            with self.assertRaises(rc.RecountError):
                rc.check_pin("f", data, bad)
        with self.assertRaises(rc.RecountError):
            rc.check_pin("f", data, dict(pin, bytes=1))


if __name__ == "__main__":
    unittest.main()
