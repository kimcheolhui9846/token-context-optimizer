"""Builder delivery contract and byte-for-byte historical archive regressions."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

import d03_editions as editions

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
LEGACY = "33d68436621b3db90fbed4b4cc6385e76b4961d3"
NOV26 = "5270a65a0eaa8263aaa1e041d5f3a1ec7b7fbe78"
NOV27 = "a768783cd894f9ab2b715de7d28707b59da279bf"
OLD_NOV26 = "79db78e6c7c7b56658be0f10e45bd4c1f5752d3c"
OLD_NOV27 = "45473e113bfa27cbe49d0e07c32bac0ed2145c88"
TOOLS = "research/tools/d03/"
PAPER = "docs/research/image-first-paper-draft.ko.md"
GUIDE = "docs/research/d03-reproduction-guide.md"
RULES = "docs/research/d03-reproduction-rules.md"
DELIVERY = TOOLS + "d03_delivery.py"
TRANSFORM = TOOLS + "d03_reader_view.py"
FROZEN = (
    (LEGACY, None, "e7d3cdfce2b91398957450f01e1eba679d6d5203cf6c9c4289eb4136ed0ad607"),
    (NOV26, OLD_NOV26, "cdeba5e8814923822c6c9c7ed526be286a03e832a316f74f48b8d655090a144c"),
    (NOV27, OLD_NOV27, "d19c1d2ea4186a45cd6b3b63c84ef1322f5f3b9b9e3081c63d881cf60dc8270f"),
)
PINNED = {
    "README.ko.md": GUIDE,
    "RULES.ko.md": RULES,
    "requirements.txt": TOOLS + "requirements.txt",
    "requirements-win-cp312.lock": TOOLS + "requirements-win-cp312.lock",
    "tools/d03_delivery.py": DELIVERY,
    "tools/d03_reader_view.py": TRANSFORM,
}


def git(repo, *args, data=None):
    return subprocess.run(["git", *args], cwd=repo, input=data, capture_output=True, check=True).stdout


def manifest(pkg):
    value = json.loads((pkg / "MANIFEST.json").read_bytes())
    return value, {entry["path"]: entry for entry in value["files"]}


class DeliveryBuilder(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(self.enterContext(tempfile.TemporaryDirectory()))

    def build(self, source, tools, repo=ROOT, name="build", private_patterns=None):
        out = self.tmp / name
        args = ["--repo", str(repo), "--commit", source, "--out", str(out)]
        if tools is not None:
            args.extend(["--tools-commit", tools])
        if private_patterns is not None:
            args.extend(["--private-patterns", str(private_patterns)])
        run = subprocess.run([sys.executable, "-B", str(HERE / "build_package.py"), *args],
                             capture_output=True, text=True)
        return out, run

    def tooling_fixture(self):
        repo = self.tmp / "fixture"
        repo.mkdir()
        git(repo, "init", "-q")
        # Reuse existing input objects read-only. Only the disposable fixture's
        # index and object database are written.
        alternate = git(ROOT, "rev-parse", "--path-format=absolute", "--git-path", "objects").strip()
        (repo / ".git" / "objects" / "info" / "alternates").write_bytes(alternate + b"\n")
        return repo

    def pin(self, repo, changes=None):
        git(repo, "read-tree", OLD_NOV27)
        declaration = (HERE / "d03_editions.py").read_bytes().replace(b"\r\n", b"\n")
        if b"D03_DELIVERY_VERSION = 1\n" not in declaration:
            declaration += b"\nD03_DELIVERY_VERSION = 1\n"
        updates = {
            TOOLS + "d03_editions.py": declaration,
            TOOLS + "d03_repro.py": git(ROOT, "show", f"{OLD_NOV27}:{TOOLS}d03_repro.py") + b"\n# fixture\n",
            DELIVERY: b"# delivery module fixture\n",
            TRANSFORM: (HERE / "d03_reader_view.py").read_bytes().replace(b"\r\n", b"\n"),
            GUIDE: b"[Reader](READER.ko.md)\n",
            RULES: b"# Pinned rules\n",
            TOOLS + "requirements.txt": b"pypdfium2==5.15.1\n",
            TOOLS + "requirements-win-cp312.lock": b"# Pinned lock fixture\n",
        }
        updates.update(changes or {})
        for source, data in updates.items():
            if data is None:
                git(repo, "update-index", "--force-remove", "--", source)
            else:
                blob = git(repo, "hash-object", "-w", "--stdin", data=data).decode().strip()
                git(repo, "update-index", "--add", "--cacheinfo", "100644", blob, source)
        tree = git(repo, "write-tree").decode().strip()
        return git(repo, "-c", "user.name=D03 Fixture", "-c", "user.email=d03@example.invalid",
                   "commit-tree", tree, "-p", OLD_NOV27, data=b"local D03 fixture\n").decode().strip()

    def test_requires_delivery_modules_and_pinned_requirements_before_output(self):
        repo = self.tooling_fixture()
        for i, path in enumerate((DELIVERY, TRANSFORM, TOOLS + "requirements.txt",
                                  TOOLS + "requirements-win-cp312.lock", GUIDE, RULES)):
            with self.subTest(member=path):
                pin = self.pin(repo, {path: None})
                out, result = self.build(NOV27, pin, repo, f"missing-{i}")
                self.assertEqual(result.returncode, 2, "missing requirement must refuse")
                self.assertFalse(out.exists())

    def test_refuses_undeclared_or_mismatched_tooling_before_output(self):
        repo = self.tooling_fixture()
        cases = (
            {TOOLS + "d03_editions.py": b"# no declaration\n"},
            {TOOLS + "d03_editions.py": b"D03_DELIVERY_VERSION = True\n"},
            {TOOLS + "d03_editions.py": b"D03_DELIVERY_VERSION = 1\nD03_DELIVERY_VERSION = 2\n"},
            {TRANSFORM: b"raise RuntimeError('untrusted transform ran')\n"},
        )
        for i, changes in enumerate(cases):
            with self.subTest(case=i):
                pin = self.pin(repo, changes)
                out, result = self.build(NOV27, pin, repo, f"refused-{i}")
                self.assertEqual(result.returncode, 2, "unsupported tooling must refuse")
                self.assertFalse(out.exists())

    def test_delivery_builds_both_frozen_sources_with_pinned_provenance(self):
        repo = self.tooling_fixture()
        pin = self.pin(repo)
        patterns = self.tmp / "patterns.txt"
        patterns.write_text("(`docs/research/image-token-cost-models.md`, 패키지 미수록)\n", encoding="utf-8")
        for revision in (NOV26, NOV27):
            with self.subTest(revision=revision):
                builds = []
                for repeat in range(2):
                    out, result = self.build(revision, pin, repo, f"{revision}-{repeat}", patterns)
                    self.assertEqual(result.returncode, 0, "modern build failed")
                    builds.append(hashlib.sha256((out / "d03-repro.zip").read_bytes()).digest())
                self.assertEqual(builds[0], builds[1])
                pkg = out / "d03-repro"
                meta, entries = manifest(pkg)
                self.assertEqual((meta["format"], meta["deliveryVersion"], meta["toolsCommit"]),
                                 ("d03-manifest-3", 1, pin))
                original = entries[editions.MANUSCRIPT_PATH]
                original_data = git(ROOT, "show", f"{revision}:{PAPER}")
                self.assertTrue((pkg / editions.MANUSCRIPT_PATH).read_bytes() == original_data)
                derivative = entries["READER.ko.md"]
                self.assertEqual((derivative["source"], derivative["gitBlob"], derivative["role"],
                                  derivative["distribution"]),
                                 (PAPER, original["gitBlob"], "manuscript-derived", "restricted"))
                self.assertEqual(derivative["transform"], {"path": "tools/d03_reader_view.py",
                                 "sourceCommit": pin, "gitBlob": entries["tools/d03_reader_view.py"]["gitBlob"]})
                self.assertEqual(sum(entry["role"] == "raw-input" for entry in entries.values()), 252)
                for path, source in PINNED.items():
                    self.assertEqual((entries[path]["source"], entries[path]["sourceCommit"]), (source, pin))
                    self.assertTrue((pkg / path).read_bytes() == git(repo, "show", f"{pin}:{source}"))
                scan = json.loads((out / "scan.json").read_bytes())
                self.assertEqual(scan["content"]["private-1"], {"matches": 1, "files": 1})
                self.assertTrue(editions.valid_identity(pkg, meta, entries))
                for missing in ("READER.ko.md", "tools/d03_delivery.py", "tools/d03_reader_view.py",
                                "tools/interpretation-manuscript.txt", "requirements.txt"):
                    with self.subTest(missing=missing):
                        reduced = {k: v for k, v in entries.items() if k != missing}
                        self.assertFalse(editions.valid_identity(pkg, meta, reduced))
                        member = pkg / missing
                        saved = member.read_bytes()
                        member.unlink()
                        try:
                            self.assertFalse(editions.valid_identity(pkg, meta, entries))
                        finally:
                            member.write_bytes(saved)
                bad_derivative = {**derivative, "transform": {**derivative["transform"], "gitBlob": "0" * 40}}
                self.assertFalse(editions.valid_identity(pkg, meta, {**entries, "READER.ko.md": bad_derivative}))
                downgraded = {k: v for k, v in meta.items() if k != "deliveryVersion"}
                self.assertFalse(editions.valid_identity(pkg, {**downgraded, "format": "d03-manifest-2"}, entries))

    def test_frozen_archives_rebuild_without_byte_changes(self):
        for i, (source, tools, expected) in enumerate(FROZEN):
            with self.subTest(edition=i):
                out, result = self.build(source, tools, name=f"frozen-{i}")
                self.assertEqual(result.returncode, 0, "frozen archive build failed")
                self.assertEqual(hashlib.sha256((out / "d03-repro.zip").read_bytes()).hexdigest(), expected)
                pkg = out / "d03-repro"
                meta, entries = manifest(pkg)
                self.assertTrue(editions.valid_identity(pkg, meta, entries))
                result = subprocess.run(
                    [sys.executable, "-B", str(pkg / "tools/d03_repro.py"), "verify-manifest", "--package", str(pkg)],
                    capture_output=True,
                )
                self.assertEqual(result.returncode, 0, "frozen reader CLI rejected its archive")
