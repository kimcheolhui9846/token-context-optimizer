"""Edition provenance and builder refusal at the normal entry points."""
import hashlib
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import d03_repro as reader

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
LEGACY = "33d68436621b3db90fbed4b4cc6385e76b4961d3"
REVISED = "5270a65a0eaa8263aaa1e041d5f3a1ec7b7fbe78"
MANUSCRIPT = "docs/research/image-first-paper-draft.ko.md"
PACKAGED = "expected/manuscript/image-first-paper-draft.ko.md"


class Editions(unittest.TestCase):
    def test_legacy_cannot_mix_tools(self):
        self.refused(LEGACY, REVISED, "legacy")

    def test_revised_rejects_legacy_reader_before_writing(self):
        self.refused(REVISED, LEGACY, "reader")

    def refused(self, source, tools, message):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "package"
            result = subprocess.run(
                [sys.executable, "-B", str(HERE / "build_package.py"), "--repo", str(REPO),
                 "--commit", source, "--tools-commit", tools, "--out", str(output)],
                capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn(message, result.stdout)
            self.assertFalse(output.exists())

    def test_reader_cli_rejects_unidentified_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            pkg = Path(tmp)
            (pkg / "MANIFEST.json").write_text('{"files": []}', encoding="utf-8")
            result = subprocess.run([sys.executable, "-B", str(HERE / "d03_repro.py"),
                                     "verify-manifest", "--package", str(pkg)], capture_output=True, text=True)
            self.assertEqual(result.returncode, 2)
            self.assertIn("MANIFEST.json", json.loads(result.stdout)["corrupt"])

    def test_revised_content_cannot_be_labeled_as_legacy(self):
        with tempfile.TemporaryDirectory() as tmp:
            pkg = Path(tmp)
            data = subprocess.check_output(["git", "show", f"{REVISED}:{MANUSCRIPT}"], cwd=REPO)
            path = pkg / PACKAGED
            path.parent.mkdir(parents=True)
            path.write_bytes(data)
            legacy_blob = subprocess.check_output(["git", "rev-parse", f"{LEGACY}:{MANUSCRIPT}"], cwd=REPO, text=True).strip()
            entry = {"path": PACKAGED, "gitBlob": legacy_blob, "bytes": len(data),
                     "sha256": hashlib.sha256(data).hexdigest()}
            meta = {"format": "d03-manifest-1", "baseCommit": LEGACY, "manuscriptBlob": legacy_blob, "files": [entry]}
            (pkg / "MANIFEST.json").write_text(json.dumps(meta), encoding="utf-8")
            self.assertFalse(reader.verify_manifest(pkg)["ok"])
