"""Supported manuscript editions and their offline package identities."""
import ast
import hashlib
import re
from pathlib import Path

LEGACY_BLOB = "c22a37b89b083c445f7ba483868aabe7041ddc02"
REVISED_BLOB = "08a8474b9105c0ef351dd7f638176bf59e5a158e"
MANUSCRIPT_SOURCE = "docs/research/image-first-paper-draft.ko.md"
MANUSCRIPT_PATH = "expected/manuscript/image-first-paper-draft.ko.md"
EDITION_MODULE = "research/tools/d03/d03_editions.py"
# Older reader commits have only the 11/26 edition module. Newer ones ship
# this declaration alongside the reader so the builder can check either tree.
CAPABILITY_NAME = "interpretation-manuscript.txt"
CAPABILITY_SOURCE = "research/tools/d03/" + CAPABILITY_NAME
CAPABILITY_PATH = "tools/" + CAPABILITY_NAME
CAPABILITY_FILE = Path(__file__).with_name(CAPABILITY_NAME)
CAPTION_BLOBS = {REVISED_BLOB}
if CAPABILITY_FILE.is_file():
    declaration = CAPABILITY_FILE.read_bytes().strip()
    if re.fullmatch(rb"[0-9a-f]{40}", declaration):
        CAPTION_BLOBS.add(declaration.decode("ascii"))

FROZEN_NOV26_READER = "f62808a26f47e2de61b664bb26e7598937745538"
FROZEN_NOV27_READER = "2ccaaa7aa454ce2a9e41343ce333721eb91a9067"
FROZEN_READERS = frozenset({FROZEN_NOV26_READER, FROZEN_NOV27_READER})
REPRO_PATH = "tools/d03_repro.py"
READER_PATHS = frozenset({CAPABILITY_PATH, "README.ko.md", "RULES.ko.md", REPRO_PATH, "tools/d03_checks.py",
                          "tools/d03_editions.py"})

D03_DELIVERY_VERSION = 1
DELIVERY_FORMAT = "d03-manifest-3"
READER_VIEW_PATH = "READER.ko.md"
TRANSFORM_PATH = "tools/d03_reader_view.py"
DELIVERY_MODULE_PATH = "tools/d03_delivery.py"
DELIVERY_TOOL_PATHS = READER_PATHS | {TRANSFORM_PATH, DELIVERY_MODULE_PATH,
                                    "requirements.txt", "requirements-win-cp312.lock"}
DELIVERY_REQUIRED_PATHS = DELIVERY_TOOL_PATHS | {READER_VIEW_PATH, "tools/d03_figprobe.py",
                                                "tools/guard/node-netguard.cjs", "tools/guard/py/sitecustomize.py"}
_COMMIT = re.compile(r"[0-9a-f]{40}")


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def declares_delivery(data: bytes) -> bool:
    """Read the pinned literal capability without running tool-commit code."""
    try:
        tree = ast.parse(data)
    except (SyntaxError, ValueError):
        return False
    name = "D03_DELIVERY_VERSION"
    stores = [node for node in ast.walk(tree)
              if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store) and node.id == name]
    return len(stores) == 1 and any(
        isinstance(stmt, ast.Assign) and stmt.targets == stores and isinstance(stmt.value, ast.Constant)
        and type(stmt.value.value) is int and stmt.value.value == D03_DELIVERY_VERSION
        for stmt in tree.body
    )


def tool_provenance(manifest, entries, required, tool_paths):
    return required <= entries.keys() and all(
        (item.get("sourceCommit") == manifest["toolsCommit"] if path in tool_paths else "sourceCommit" not in item)
        for path, item in entries.items()
    )


def valid_delivery(pkg, manifest, entries, actual, reader_blob):
    if (type(manifest.get("deliveryVersion")) is not int or manifest["deliveryVersion"] != D03_DELIVERY_VERSION
            or reader_blob in FROZEN_READERS
            or not tool_provenance(manifest, entries, DELIVERY_REQUIRED_PATHS, DELIVERY_TOOL_PATHS)
            or not all((pkg / path).is_file() for path in DELIVERY_REQUIRED_PATHS)):
        return False
    for path in DELIVERY_TOOL_PATHS:
        if git_blob((pkg / path).read_bytes()) != entries[path].get("gitBlob"):
            return False
    if not declares_delivery((pkg / "tools/d03_editions.py").read_bytes()):
        return False
    capability = (pkg / CAPABILITY_PATH).read_bytes().strip()
    if not re.fullmatch(rb"[0-9a-f]{40}", capability) or (
        actual != REVISED_BLOB and capability != actual.encode("ascii")
    ):
        return False

    view = entries[READER_VIEW_PATH]
    return (entries[MANUSCRIPT_PATH].get("source") == MANUSCRIPT_SOURCE
            and view.get("source") == MANUSCRIPT_SOURCE and view.get("gitBlob") == actual
            and view.get("role") == "manuscript-derived" and view.get("distribution") == "restricted"
            and view.get("rights") == "text taken from the manuscript"
            and view.get("transform") == {"path": TRANSFORM_PATH, "sourceCommit": manifest["toolsCommit"],
                                          "gitBlob": entries[TRANSFORM_PATH]["gitBlob"]})


def valid_identity(pkg, manifest, entries):
    """Bind archive format to the manuscript and shipped tools without Git."""
    entry = entries.get(MANUSCRIPT_PATH)
    if entry is None or not (pkg / MANUSCRIPT_PATH).is_file():
        return False
    actual = git_blob((pkg / MANUSCRIPT_PATH).read_bytes())
    if actual != manifest.get("manuscriptBlob") or actual != entry.get("gitBlob"):
        return False
    if actual == LEGACY_BLOB:
        return (manifest.get("format") == "d03-manifest-1"
                and "toolsCommit" not in manifest and "deliveryVersion" not in manifest)
    if actual not in CAPTION_BLOBS:
        return False
    for field in ("toolsCommit", "baseCommit"):
        value = manifest.get(field)
        if not isinstance(value, str) or not _COMMIT.fullmatch(value):
            return False

    reader = pkg / REPRO_PATH
    if REPRO_PATH not in entries or not reader.is_file():
        return False
    reader_blob = git_blob(reader.read_bytes())
    if reader_blob != entries[REPRO_PATH].get("gitBlob"):
        return False
    if manifest.get("format") == DELIVERY_FORMAT:
        return valid_delivery(pkg, manifest, entries, actual, reader_blob)
    if manifest.get("format") != "d03-manifest-2" or "deliveryVersion" in manifest or reader_blob not in FROZEN_READERS:
        return False
    required = READER_PATHS
    if reader_blob == FROZEN_NOV26_READER:
        if actual != REVISED_BLOB:
            return False
        if CAPABILITY_PATH not in entries:
            required = READER_PATHS - {CAPABILITY_PATH}
    return tool_provenance(manifest, entries, required, READER_PATHS)
