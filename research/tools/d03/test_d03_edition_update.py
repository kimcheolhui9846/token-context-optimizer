"""Reader capabilities, frozen combinations, and F2 render regressions."""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

import d03_checks as checks
import d03_editions as editions

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
NOV26 = "5270a65a0eaa8263aaa1e041d5f3a1ec7b7fbe78"
NOV27 = "a768783cd894f9ab2b715de7d28707b59da279bf"
OLD_READER = "79db78e6c7c7b56658be0f10e45bd4c1f5752d3c"
PAPER = "docs/research/image-first-paper-draft.ko.md"


class EditionUpdate(unittest.TestCase):
    def test_current_reader_recognizes_both_caption_editions(self):
        for revision in (NOV26, NOV27):
            with self.subTest(revision=revision), tempfile.TemporaryDirectory() as tmp:
                pkg = Path(tmp)
                text = subprocess.check_output(["git", "show", f"{revision}:{PAPER}"], cwd=ROOT)
                blob = hashlib.sha1(b"blob %d\0" % len(text) + text).hexdigest()
                dst = pkg / editions.MANUSCRIPT_PATH
                dst.parent.mkdir(parents=True)
                dst.write_bytes(text)
                reader_commit = "1" * 40  # Git-free manifest fixture for a modern reader
                paths = set(editions.READER_PATHS)
                entries = {path: {"sourceCommit": reader_commit} for path in paths}
                entries[editions.MANUSCRIPT_PATH] = {"gitBlob": blob}
                meta = {"format": "d03-manifest-2", "baseCommit": revision,
                        "manuscriptBlob": blob, "toolsCommit": reader_commit}
                self.assertTrue(editions.valid_identity(pkg, meta, entries))
                del entries[editions.CAPABILITY_PATH]
                self.assertEqual(editions.valid_identity(pkg, meta, entries), revision == NOV26)
                meta["manuscriptBlob"] = "f" * 40
                self.assertFalse(editions.valid_identity(pkg, meta, entries))

    def test_corrupt_reader_declaration_rejects_without_a_traceback(self):
        with tempfile.TemporaryDirectory() as tmp:
            pkg = Path(tmp)
            for name in ("d03_editions.py", "d03_repro.py", "d03_checks.py"):
                shutil.copyfile(HERE / name, pkg / name)
            (pkg / editions.CAPABILITY_NAME).write_bytes(bytes([255]))
            (pkg / "MANIFEST.json").write_text('{"files": []}', encoding="utf-8")
            run = subprocess.run([sys.executable, "-B", str(pkg / "d03_repro.py"),
                                  "verify-manifest", "--package", str(pkg)], capture_output=True, text=True)
            self.assertEqual(run.returncode, 2, run.stderr)
            self.assertIn("MANIFEST.json", json.loads(run.stdout)["corrupt"])

    def test_new_manuscript_with_frozen_reader_leaves_no_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = subprocess.run([sys.executable, "-B", str(HERE / "build_package.py"),
                                     "--repo", str(ROOT), "--commit", NOV27, "--tools-commit",
                                     OLD_READER, "--out", str(Path(tmp) / "package")],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn("reader", result.stdout)
            self.assertEqual(list(Path(tmp).iterdir()), [])


class LocalRender(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.base = Path(self.tmp.name) / "base.png"
        self.changed = Path(self.tmp.name) / "output.png"

    def compare(self, result, local=True):
        result.save(self.changed)
        return checks.render_compare(self.changed, self.base, f2_tiles=local)

    def test_visible_label_disappears(self):
        self.base = ROOT / "research/figures/exp2/heldout/fig5_exp2_accuracy_vs_tokens.png"
        with Image.open(self.base) as original:
            altered = original.convert("RGBA")
        altered.paste("white", (1033, 241, 1075, 285))
        self.assertTrue(self.compare(altered, local=False)["within"])
        result = self.compare(altered)
        self.assertFalse(result["within"])
        self.assertGreaterEqual(result["worstTile"]["changedPixels"], 52)

    def test_boundary_and_visible_alpha(self):
        base = np.full((256, 256, 4), 255, dtype=np.uint8)
        base[:, :, :3] = 0
        Image.fromarray(base).save(self.base)
        for n, delta, channel, expected in ((1, 255, 0, True), (51, 32, 0, True),
                                            (52, 31, 0, True), (52, 32, 0, False),
                                            (52, 32, 3, False)):
            with self.subTest(n=n, delta=delta, channel=channel):
                array = base.copy()
                i = np.arange(n)
                array[i // 32 + 32, i % 32 + 32, channel] = 255 - delta if channel == 3 else delta
                result = self.compare(Image.fromarray(array))
                self.assertEqual(result["within"], expected)
                if not expected:
                    self.assertEqual(result["worstTile"], {"x": 32, "y": 32, "changedPixels": 52})

    def test_reencoded_equivalent_and_channel_mismatch(self):
        im = Image.new("RGB", (64, 64), "navy")
        im.save(self.base, compress_level=0)
        self.assertTrue(self.compare(im)["pixelsEqual"])
        self.assertFalse(self.compare(im.convert("RGBA"))["within"])
        self.assertFalse(self.compare(im.resize((32, 32)))["within"])

    def test_grayscale_visible_difference(self):
        im = Image.new("L", (256, 256), 255)
        im.save(self.base)
        im.paste(0, (2, 2, 12, 12))
        self.assertFalse(self.compare(im)["within"])

    def test_partial_tiles_and_16_bit_gray(self):
        image = np.zeros((259, 273), dtype=np.uint16)
        Image.fromarray(image).save(self.base)
        image[255:, 256:] = 65535
        # The bottom-right tile has 3 x 17 pixels, below the fixed 52-pixel cutoff.
        result = self.compare(Image.fromarray(image))
        self.assertTrue(result["within"])
        self.assertEqual(result["worstTile"], {"x": 256, "y": 256, "changedPixels": 51})

    def test_palette_transparency_counts_visible_change(self):
        indexed = Image.new("P", (256, 256), 0)
        indexed.putpalette([0, 0, 0, 0, 0, 0] + [0] * 762)
        indexed.info["transparency"] = 1
        indexed.save(self.base)
        indexed.paste(1, (1, 1, 11, 11))
        self.assertFalse(self.compare(indexed)["within"])
