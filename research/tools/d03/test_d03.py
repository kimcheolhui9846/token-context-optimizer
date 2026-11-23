"""Unit tests for the D03 tools. Synthetic inputs only; no experiment data is read.

Run: python -m unittest research/tools/d03/test_d03.py
"""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import d03_checks as c  # noqa: E402
import d03_repro as r  # noqa: E402

M = c.MINUS
TIES = [-0.0, 6.25, -6.25, 0.125, 1.005, 2.675, -0.05, 0.05, 12.5, -13.95, 266.35, 0.0, 28.45, 1e-12, -1e-12]


class Formatting(unittest.TestCase):
    def test_to_fixed_matches_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not found")
        js = "const v=" + json.dumps(TIES) + ";console.log(JSON.stringify(v.flatMap(x=>[x.toFixed(1),x.toFixed(4)])))"
        want = json.loads(subprocess.run([node, "-e", js], capture_output=True, text=True, check=True).stdout)
        got = [s for x in TIES for s in (c.js_to_fixed(x, 1), c.js_to_fixed(x, 4))]
        self.assertEqual(got, want)

    def test_math_round_matches_node(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node not found")
        vals = [2.5, -2.5, 634.9861111111111, 824.4722222222222, 0.49999999999999994, -0.5, 1360.5, 23294.833333333332]
        want = json.loads(subprocess.run([node, "-e", "console.log(JSON.stringify(" + json.dumps(vals) + ".map(Math.round)))"],
                                         capture_output=True, text=True, check=True).stdout)
        self.assertEqual([c.js_math_round(v) for v in vals], want)

    def test_tok_and_minus(self):
        self.assertEqual(c.tok(1360.6), "1,361")
        self.assertEqual(c.pct1(-0.0625), f"{M}6.3")
        self.assertEqual(c.signed_pct1(0.0625), "+6.3")
        self.assertEqual(c.signed_pct1(-0.0625), f"{M}6.3")


class T1Normalisation(unittest.TestCase):
    def test_only_nfc_and_line_endings(self):
        decomposed = "가"  # Hangul jamo -> NFC syllable
        self.assertEqual(c.normalize_t1("A, b\r\n" + decomposed + "\r"), "A, b\n가\n")
        self.assertEqual(c.normalize_t1("Case  Kept."), "Case  Kept.")

    def test_cells_trimmed_inside_kept(self):
        self.assertEqual(c.parse_row("|  a  b | c |"), ["a  b", "c"])


SYN = """intro
표 9. caption
| h1 | h2 |
|---|---|
| a | b |

next
| x | y |
|---|---|
| 1 | 2 |
"""


class Tables(unittest.TestCase):
    def test_table_after(self):
        lines = SYN.split("\n")
        t0 = c.table_after(lines, "표 9.", 0)
        t1 = c.table_after(lines, "표 9.", 1)
        self.assertEqual(t0["header"], ["h1", "h2"])
        self.assertEqual(t0["rows"], [["a", "b"]])
        self.assertEqual(t1["rows"], [["1", "2"]])

    def test_cell_diff(self):
        self.assertEqual(c.cell_diff([["a", "b"]], [["a", "b"]]), [])
        self.assertEqual(c.cell_diff([["a", "b"]], [["a", "B"]])[0]["where"], "r0c1")

    def test_build_t2_synthetic(self):
        h1 = {"diff": -0.0694, "lo": -0.15, "hi": 0.007, "tokensD": 600.4, "tokensA": 800.6, "pass": False}
        h = {"diff": 0.0625, "lo": 0.0139, "hi": 0.125, "pass": None}
        a = {"verdicts": {"H1": h1, "H2": h, "H3": h}}
        rows = c.build_t2({"gpt4o": a, "haiku": a})
        self.assertEqual(rows[1][1], f"{M}6.9%p [{M}15.0, 0.7], 600 < 801")
        self.assertEqual(rows[1][3], "지지 안 됨")
        self.assertEqual(rows[2][1], "+6.3%p [1.4, 12.5]")
        self.assertEqual(rows[2][3], "기술 통계")

    def test_verdict_mixed(self):
        self.assertEqual(c.verdict_text([True, False]), "GPT-4o 지지, Haiku 지지 안 됨")

    def test_match_points(self):
        self.assertEqual(c.match_points([(1, 2)], [(1 + 1e-12, 2)]), [])
        self.assertTrue(c.match_points([(1, 2)], [(1.1, 2)]))
        self.assertTrue(c.match_points([(1, 2)], [(1, 2), (3, 4)]))


class Manifest(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())
        (self.d / "a.txt").write_bytes(b"alpha")
        (self.d / "sub").mkdir()
        (self.d / "sub/b.txt").write_bytes(b"beta")
        files = [{"path": p, "bytes": len(b), "sha256": hashlib.sha256(b).hexdigest()} for p, b in [("a.txt", b"alpha"), ("sub/b.txt", b"beta")]]
        (self.d / "MANIFEST.json").write_text(json.dumps({"files": files}), encoding="utf-8")

    def tearDown(self):
        shutil.rmtree(self.d)

    def test_ok(self):
        self.assertTrue(r.verify_manifest(self.d)["ok"])

    def test_corrupt_missing_extra(self):
        (self.d / "a.txt").write_bytes(b"alphA")
        (self.d / "sub/b.txt").unlink()
        (self.d / "c.txt").write_bytes(b"x")
        m = r.verify_manifest(self.d)
        self.assertFalse(m["ok"])
        self.assertEqual((m["corrupt"], m["missing"], m["extra"]), (["a.txt"], ["sub/b.txt"], ["c.txt"]))


class Guard(unittest.TestCase):
    def test_guard_blocks_node_and_python(self):
        if not shutil.which("node"):
            self.skipTest("node not found")
        out = Path(tempfile.mkdtemp()) / "g"
        try:
            g = r.guard_check(out)
            self.assertTrue(g["ok"], g)
            self.assertEqual({s for _, s in g["node"] + g["python"]}, {"blocked"})
            self.assertNotEqual(g["unguardedLocalControl"], "guard")
        finally:
            shutil.rmtree(out.parent)

    def test_secret_env_removed(self):
        import os

        os.environ["OPENAI_API_KEY"] = "x"
        try:
            env = r.guarded_env(Path(tempfile.gettempdir()))
            self.assertNotIn("OPENAI_API_KEY", env)
            self.assertIn("--require=", env["NODE_OPTIONS"])
        finally:
            del os.environ["OPENAI_API_KEY"]


if __name__ == "__main__":
    unittest.main()
