"""Supported manuscript editions and the files supplied by revised reader tooling."""
import hashlib
import re

LEGACY_BLOB = "c22a37b89b083c445f7ba483868aabe7041ddc02"
REVISED_BLOB = "08a8474b9105c0ef351dd7f638176bf59e5a158e"
MANUSCRIPT_PATH = "expected/manuscript/image-first-paper-draft.ko.md"
EDITION_MODULE = "research/tools/d03/d03_editions.py"
READER_PATHS = frozenset({"README.ko.md", "RULES.ko.md", "tools/d03_repro.py", "tools/d03_checks.py",
                          "tools/d03_editions.py"})


def valid_identity(pkg, manifest, entries):
    """Bind edition selection to manuscript bytes, also when Git is unavailable."""
    entry = entries.get(MANUSCRIPT_PATH)
    if entry is None or not (pkg / MANUSCRIPT_PATH).is_file():
        return False
    data = (pkg / MANUSCRIPT_PATH).read_bytes()
    actual = hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()
    if actual != manifest.get("manuscriptBlob") or actual != entry.get("gitBlob"):
        return False
    if actual == LEGACY_BLOB:
        return manifest.get("format") == "d03-manifest-1" and "toolsCommit" not in manifest
    if (actual != REVISED_BLOB or manifest.get("format") != "d03-manifest-2"
            or not re.fullmatch(r"[0-9a-f]{40}", manifest.get("toolsCommit") or "")
            or not re.fullmatch(r"[0-9a-f]{40}", manifest.get("baseCommit") or "")):
        return False
    return READER_PATHS <= entries.keys() and all(
        (item.get("sourceCommit") == manifest["toolsCommit"] if path in READER_PATHS else "sourceCommit" not in item)
        for path, item in entries.items())
