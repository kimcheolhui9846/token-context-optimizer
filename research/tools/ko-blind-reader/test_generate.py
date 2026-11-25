"""ko-blind-reader: registered Python tests (protocol section 9). Mock seed and test seeds only.

Run from research/: python -m unittest discover -s tools/ko-blind-reader -p test_generate.py
The font tests run only when KBR_FONT points at the registered NotoSansKR-VF.ttf.
"""
import hashlib
import hmac
import json
import os
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import generate as G  # noqa: E402
import recount as R  # noqa: E402

REG = json.loads((HERE / "registered.json").read_text(encoding="utf-8"))
MOCK = bytes.fromhex(REG["drbg"]["mockSeedHex"])
FONT = os.environ.get("KBR_FONT")


class Drbg(unittest.TestCase):
    def test_hmac_counter_mode(self):
        seed = bytes(range(32))
        want = hmac.new(seed, b"assign\x00" + (0).to_bytes(8, "big"), hashlib.sha256).digest() + hmac.new(seed, b"assign\x00" + (1).to_bytes(8, "big"), hashlib.sha256).digest()
        self.assertEqual(G.Drbg(seed, "assign").read(64), want)

    def test_randbelow_and_shuffle(self):
        d = G.Drbg(bytes(range(32)), "x")
        vals = [d.randbelow(7) for _ in range(500)]
        self.assertTrue(all(0 <= v < 7 for v in vals))
        self.assertEqual(sorted(G.Drbg(bytes(range(32)), "y").shuffle(range(18))), list(range(18)))
        self.assertEqual(G.Drbg(bytes(range(32)), "y").shuffle(range(18)), G.Drbg(bytes(range(32)), "y").shuffle(range(18)))

    def test_short_seed_refused(self):
        with self.assertRaises(G.GenerationError):
            G.Drbg(b"short", "assign")


class Structure(unittest.TestCase):
    def test_mock_and_test_seeds_meet_the_registered_constraints(self):
        for i in range(25):
            seed = MOCK if i == 0 else hashlib.sha256(b"kbr-test-seed-%d" % i).digest()
            src = G.assign_structure(seed)
            self.assertEqual(G.structure_problems(src), [])
            order, _ = G.draw_order(seed, src)
            self.assertEqual(G.order_problems(src, order), [])
            kinds = [s["kind"] for s in src]
            self.assertTrue(all(kinds.count(k) == 3 for k in set(kinds)))

    def test_order_checker_catches_a_run_of_three(self):
        src = G.assign_structure(MOCK)
        by_method = sorted(range(18), key=lambda i: src[i]["method"])
        self.assertTrue(G.order_problems(src, by_method))

    def test_structure_checker_catches_imbalance(self):
        src = G.assign_structure(MOCK)
        src[0]["larger"] = not src[0]["larger"]
        self.assertTrue(G.structure_problems(src))


class Rules(unittest.TestCase):
    def test_near_reuse_rule(self):
        corpus = ["고서 영인본 열람", "도자기 물레 기초", "어르신 걷기 동호회"]
        self.assertTrue(G.label_reused("고서 영인본 열람", corpus))  # exact
        self.assertTrue(G.label_reused("도자기 물레 체험", corpus))  # 3/4 bigrams
        self.assertFalse(G.label_reused("어르신 장수 사진 촬영", corpus))  # 2/5 bigrams
        self.assertTrue(G.label_reused("물레", ["도자기 물레 기초"]))  # substring
        self.assertTrue(G.field_reused("입장 시각", ["한여름 재즈 콘서트의 입장 시각은 언제인가요?"]))
        self.assertFalse(G.field_reused("출항 시각", ["입장 시각"]))

    def test_bigrams_and_parser(self):
        self.assertEqual(G.bigrams("도자기 물레"), {"도자", "자기", "물레"})
        p = G.parse_question("토마토 모종 심기의 출발 시각은 몇 시인가요?")
        self.assertEqual((p["record"], p["field"], p["qtype"]), ("토마토 모종 심기", "출발 시각", "time"))
        self.assertIsNone(G.parse_question("가의 나의 출발 시각은 몇 시인가요?"))
        self.assertIsNone(G.parse_question("가나다의 출발 시각은 몇 명인가요?"))

    def test_page_rules_flag_shared_bigrams(self):
        g = G.generate(MOCK, None, None, G.pool_report(None), "mock")
        src, page = g["sources"][0]
        self.assertEqual(G.page_problems(src, page), [])
        bad = json.loads(json.dumps(page))
        other = next(it for it in bad["items"] if it["id"] == f"r{(src['slot'] + 1) % 3}-label")
        other["text"] = src["labels"][src["slot"]] + " 추가"
        self.assertTrue(G.page_problems(src, bad))
        bad2 = json.loads(json.dumps(page))
        next(it for it in bad2["items"] if it["id"] == "r0-note")["text"] = "출입 시각 안내"
        self.assertTrue(G.page_problems(src, bad2))

    def test_mock_generation_is_deterministic_and_balanced(self):
        pools = G.pool_report(None)
        a = G.generate(MOCK, None, None, pools, "mock")
        b = G.generate(MOCK, None, None, pools, "mock")
        self.assertEqual(G.plan_json(a), G.plan_json(b))
        plan = G.plan_json(a)
        self.assertEqual(len(plan["sources"]), 18)
        self.assertEqual(len({s["question"] for s in plan["sources"]}), 18)
        self.assertEqual(len({x for s in plan["sources"] for x in s["labels"]}), 54)
        for s in plan["sources"]:
            tv = G.value_key(s["qtype"], s["targetValues"][s["slot"]])
            cv = G.value_key(s["qtype"], s["compValues"][s["slot"]])
            self.assertEqual(tv > cv, s["larger"])
            self.assertEqual(len(s["targetValues"][s["slot"]]), len(s["compValues"][s["slot"]]))

    def test_mock_exclusion_keeps_real_content_disjoint(self):
        pools = G.pool_report(None)
        ex = G.mock_exclusion(None, pools)
        g = G.generate(hashlib.sha256(b"kbr-test-seed-real-like").digest(), None, ex, pools, "test")
        labels = {x for s, _ in g["sources"] for x in s["labels"]}
        self.assertFalse(labels & set(ex["labels"]))
        self.assertFalse({tuple(s["pair"]) for s, _ in g["sources"]} & {tuple(p) for p in ex["pairs"]})

    @unittest.skipUnless(FONT, "KBR_FONT not set")
    def test_widths_with_the_registered_font(self):
        font = G.load_font(FONT)
        pools, removed = G.pool_report(font)
        self.assertEqual(removed["labelWidth"] + removed["fieldWidth"] + removed["auxWidth"] + removed["noteWidth"], [])
        self.assertTrue(all(len(k["labels"]) >= 18 for k in pools["kinds"]))
        self.assertTrue(all(len(v) >= 12 for v in pools["fieldPairs"].values()))


class Recount(unittest.TestCase):
    def test_normalization_matches_the_registered_table(self):
        self.assertEqual(R.normalize_value("time", "１４：３０"), "14:30")
        self.assertEqual(R.normalize_value("time", "09:30"), "9:30")
        self.assertEqual(R.normalize_value("time", "14시"), "14:00")
        self.assertEqual(R.normalize_value("count", "50 명"), "50")
        for t, raw in [("time", "14:3"), ("time", "24:00"), ("time", "오후 2시"), ("count", "3O명"), ("count", "50쪽"), ("pages", "1,200쪽"), ("pages", "0")]:
            self.assertIsNone(R.normalize_value(t, raw), raw)

    def test_score_table(self):
        key = {"format": "kbr-key-1", "packetId": "kbr-00", "packetHash": "0" * 64,
               "items": [{"pos": i + 1, "method": ["W1", "W4", "W5"][i % 3], "side": "L" if i % 2 == 0 else "R", "qtype": "count", "answer": "50", "displayed": i != 3} for i in range(18)]}
        items = [{"pos": i + 1, "displayed": i != 3, "reached": True, "skipped": False, "column": ("L" if i % 2 == 0 else "R") if i != 3 else "unknown",
                  "value": "50명" if i != 3 else None, "valueUnknown": i == 3} for i in range(18)]
        resp = {"format": "kbr-response-1", "kind": "final", "packetId": "kbr-00", "packetHash": "0" * 64, "status": "completed", "adminMaterialSeen": "no", "position": 19, "items": items}
        t = R.score(resp, key)
        self.assertEqual(t["methods"]["W1"]["both"], 5)
        self.assertEqual(t["methods"]["W1"]["noDisplay"], 1)
        self.assertEqual(t["methods"]["W4"]["both"], 6)

    def test_consistency_mirrors_the_reader_states(self):
        # added after the Opus milestone review (m1): only states the reader UI can produce
        def item(i, **kw):
            base = {"pos": i + 1, "displayed": True, "reached": True, "skipped": False, "column": "L", "value": "50", "valueUnknown": False}
            base.update(kw)
            return base
        resp = {"status": "completed", "position": 19, "items": [item(i) for i in range(18)]}
        self.assertEqual(R.consistency(resp), [])
        resp["items"][0] = item(0, column=None, value=None)
        self.assertNotEqual(R.consistency(resp), [])
        resp["items"][0] = item(0, value="1", valueUnknown=True)
        self.assertNotEqual(R.consistency(resp), [])
        resp["items"][0] = item(0, reached=False, skipped=True, column=None, value=None)
        self.assertNotEqual(R.consistency(resp), [])
        ab = {"status": "aborted", "position": 3, "items": [item(0), item(1, skipped=True, column=None, value=None)]
              + [item(i, reached=False, column=None, value=None) for i in range(2, 18)]}
        self.assertEqual(R.consistency(ab), [])
        nd = {"status": "completed", "position": 19, "items": [item(i) for i in range(18)]}
        nd["items"][3] = item(3, displayed=False, column="unknown", value=None, valueUnknown=True)
        self.assertEqual(R.consistency(nd), [])


if __name__ == "__main__":
    unittest.main()
