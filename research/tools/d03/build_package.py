"""Build the D03 local review package from committed Git objects (not from the working tree).

  python research/tools/d03/build_package.py --commit <sha> --out <new dir> [--tools-commit <revised reader sha>] [--private-patterns <file>]

Writes <out>/d03-repro/ (unpacked), <out>/d03-repro.zip (deterministic), <out>/build.json and <out>/scan.json.
The sensitivity scan prints and stores counts only, never the matched text. Extra patterns (for example account
names) are read from a local file that is not committed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

from d03_editions import (CAPABILITY_PATH, CAPABILITY_SOURCE, CAPTION_BLOBS, DELIVERY_FORMAT, DELIVERY_MODULE_PATH,
                          DELIVERY_TOOL_PATHS, D03_DELIVERY_VERSION, EDITION_MODULE, FROZEN_NOV26_READER,
                          FROZEN_READERS, LEGACY_BLOB, MANUSCRIPT_SOURCE as MANUSCRIPT, READER_PATHS, READER_VIEW_PATH, REVISED_BLOB,
                          TRANSFORM_PATH, declares_delivery)
TABLE1_FIRST = "abdaade"
ENTRY_SCRIPTS = ["rq1-summarize.mjs", "summarize.mjs", "exp2-analyze.mjs", "session-summarize.mjs", "session-analyze.mjs", "figure-data.mjs"]
MODELS = ["gpt4o", "haiku"]
ZIP_TIME = (2026, 11, 23, 0, 0, 0)

RIGHTS = {
    "code": ("MIT (repository LICENSE; the file is left out of this anonymous review copy because it names the author)", "public"),
    "doc": ("MIT (repository LICENSE; the file is left out of this anonymous review copy because it names the author)", "public"),
    "raw-input": ("committed in the public repository; contains provider model outputs", "undecided"),
    "expected-result": ("committed in the public repository", "public; bundling with the manuscript deferred"),
    "expected-figure": ("committed in the public repository", "public; bundling with the manuscript deferred"),
    "manuscript": ("author manuscript under anonymous review", "restricted"),
    "manuscript-derived": ("text taken from the manuscript", "restricted"),
    "reference-log": ("committed in the public repository", "public"),
}

GENERIC_PATTERNS = {
    "windows-user-path": r"[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]",
    "drive-path": r"\b[C-Zc-z]:[\\/][A-Za-z0-9_.-]+[\\/]",
    "posix-home": r"/(?:home|Users)/[A-Za-z0-9_.-]+/",
    "email": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
    "openai-key": r"sk-[A-Za-z0-9_-]{20,}",
    "anthropic-key": r"sk-ant-[A-Za-z0-9_-]{10,}",
    "github-token": r"\b(?:ghp|gho|ghs|github_pat)_[A-Za-z0-9_]{20,}",
    "key-assignment": r"(?:API_KEY|SECRET|TOKEN)\s*=\s*\S{8,}",
    "bearer": r"Bearer\s+[A-Za-z0-9._-]{20,}",
}


def git(repo: Path, *args: str) -> bytes:
    return subprocess.run(["git", *args], cwd=repo, capture_output=True, check=True).stdout


def blob_id(repo: Path, commit: str, path: str) -> str:
    return git(repo, "rev-parse", f"{commit}:{path}").decode().strip()


def ls(repo: Path, commit: str, prefix: str) -> list[str]:
    return git(repo, "ls-tree", "-r", "--name-only", commit, "--", prefix).decode().splitlines()


def tree_files(repo: Path, revision: str) -> set[str]:
    records = git(repo, "ls-tree", "-r", "-z", "--full-tree", revision).split(b"\0")
    return {record.split(b"\t", 1)[1].decode("utf-8") for record in records
            if record.startswith((b"100644 blob ", b"100755 blob "))}


def delivery_view(repo: Path, commit: str, manuscript: str, sources) -> bytes:
    """Run the local transform only after verifying it matches the pinned source."""
    tool_blobs = {path: blob for path, _, _, blob in sources if path in DELIVERY_TOOL_PATHS}
    transform = git(repo, "cat-file", "blob", tool_blobs[TRANSFORM_PATH])
    local = Path(__file__).with_name("d03_reader_view.py").read_bytes()
    if local.replace(b"\r\n", b"\n") != transform:
        raise ValueError("reader transform differs from pinned tooling")
    from d03_reader_view import make_reader_view

    source_to_package = {repo_path: path for path, repo_path, _, _ in sources}
    original = git(repo, "cat-file", "blob", manuscript)
    return make_reader_view(original, source_to_package, tree_files(repo, commit))


def src_closure(repo: Path, commit: str) -> list[str]:
    seen, todo = set(), list(ENTRY_SCRIPTS)
    while todo:
        name = todo.pop()
        if name in seen:
            continue
        seen.add(name)
        text = git(repo, "show", f"{commit}:research/src/{name}").decode("utf-8")
        todo += re.findall(r"""from\s+["']\./([^"']+\.mjs)["']""", text)
        todo += re.findall(r"""import\(\s*["']\./([^"']+\.mjs)["']""", text)
    return sorted(seen)


def plan(repo: Path, commit: str) -> list[tuple[str, str, str]]:
    """(package path, repository path, role)."""
    files = [("README.ko.md", "docs/research/d03-reproduction-guide.md", "doc"),
             ("METHODS.ko.md", "docs/research/d03-methods-supplement.md", "doc"),
             ("RULES.ko.md", "docs/research/d03-reproduction-rules.md", "doc"),
             ("requirements.txt", "research/tools/d03/requirements.txt", "code"),
             ("requirements-win-cp312.lock", "research/tools/d03/requirements-win-cp312.lock", "code")]
    for f in ["d03_repro.py", "d03_checks.py", "d03_figprobe.py", "guard/node-netguard.cjs", "guard/py/sitecustomize.py"]:
        files.append((f"tools/{f}", f"research/tools/d03/{f}", "code"))
    files.append(("research/package.json", "research/package.json", "code"))
    files += [(f"research/src/{n}", f"research/src/{n}", "code") for n in src_closure(repo, commit)]
    files += [(f"research/figures/{n}", f"research/figures/{n}", "code") for n in ["make_figures.py", "exp2_figures.py"]]
    raw = ["research/results/rq1-sweep-001/rows.jsonl",
           "research/results/exp2-heldout/families-exp2-heldout.json", "research/results/exp2-heldout/slots-exp2-heldout.json",
           "research/results/s3-heldout/sessions-heldout.json"]
    for m in MODELS:
        raw += [f"research/results/exp2-heldout/{m}/config.json", f"research/results/exp2-heldout/{m}/responses.jsonl"]
        raw += [p for p in ls(repo, commit, f"research/results/s3-heldout/{m}/")
                if p.endswith(("/config.json", "/calls.jsonl")) or re.search(r"\.S\d\.json$", p)]
    files += [(p, p, "raw-input") for p in raw]
    exp = [("expected/results/rq1-sweep-001/" + n, "research/results/rq1-sweep-001/" + n) for n in ["summary.json", "summary.md"]]
    for m in MODELS:
        exp += [(f"expected/results/exp2-heldout/{m}/{n}", f"research/results/exp2-heldout/{m}/{n}")
                for n in ["graded.jsonl", "summary.json", "summary.md", "exp2-analysis.json", "exp2-analysis.md"]]
        exp += [(f"expected/results/s3-heldout/{m}/{n}", f"research/results/s3-heldout/{m}/{n}")
                for n in ["summary.json", "summary.md", "analysis.json", "analysis.md"]]
    exp.append(("expected/results/figures/data/heldout-sessions.json", "research/figures/data/heldout-sessions.json"))
    files += [(a, b, "expected-result") for a, b in exp]
    figs = ["research/figures/fig1_rq1_billed_tokens.png", "research/figures/fig2_heldout_accuracy_vs_tokens.png",
            "research/figures/fig3_heldout_late_recall.png", "research/figures/exp2/heldout/fig5_exp2_accuracy_vs_tokens.png"]
    files += [("expected/" + p[len("research/"):], p, "expected-figure") for p in figs]
    files.append(("expected/manuscript/image-first-paper-draft.ko.md", MANUSCRIPT, "manuscript"))
    files.append(("expected/table1-spec.json", "research/tools/d03/table1-spec.json", "manuscript-derived"))
    files.append(("expected/provenance/ieee-references.md", "research/plans/2026-10-18-ieee-references.md", "reference-log"))
    return files


def table1_first(repo: Path) -> bytes:
    text = git(repo, "show", f"{TABLE1_FIRST}:{MANUSCRIPT}").decode("utf-8").replace("\r\n", "\n")
    lines = text.split("\n")
    start = next(i for i, x in enumerate(lines) if x.startswith("| 연구 | 매체"))
    end = start
    while end < len(lines) and lines[end].startswith("|"):
        end += 1
    return ("\n".join(lines[start:end]) + "\n").encode("utf-8")


def scan(root: Path, extra: list[str]) -> dict:
    pats = {k: re.compile(v) for k, v in GENERIC_PATTERNS.items()}
    for i, p in enumerate(extra):
        pats[f"private-{i + 1}"] = re.compile(re.escape(p), re.I)
    counts = {k: {"matches": 0, "files": 0} for k in pats}
    names = 0
    for f in sorted(root.rglob("*")):
        if not f.is_file():
            continue
        rel = f.relative_to(root).as_posix()
        for k, rx in pats.items():
            if rx.search(rel):
                names += 1
        text = f.read_bytes().decode("utf-8", errors="replace")
        for k, rx in pats.items():
            n = len(rx.findall(text))
            if n:
                counts[k]["matches"] += n
                counts[k]["files"] += 1
    return {"patterns": len(pats), "privatePatterns": len(extra), "fileNameHits": names, "content": counts}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--commit", default="HEAD")
    ap.add_argument("--tools-commit", help="revised edition reader and guide revision (default: HEAD)")
    ap.add_argument("--repo", default=".")
    ap.add_argument("--out", required=True)
    ap.add_argument("--private-patterns")
    a = ap.parse_args()
    repo = Path(a.repo).resolve()
    out = Path(a.out).resolve()
    if out.exists():
        print("refuse: --out exists")
        return 2
    try:
        commit = git(repo, "rev-parse", "--verify", f"{a.commit}^{{commit}}").decode().strip()
        manuscript = blob_id(repo, commit, MANUSCRIPT)
        if manuscript != LEGACY_BLOB and manuscript not in CAPTION_BLOBS:
            print("refuse: unsupported manuscript blob")
            return 2
        revised = manuscript in CAPTION_BLOBS
        if not revised and a.tools_commit is not None:
            print("refuse: the legacy edition takes all files from its source commit")
            return 2
        tools = git(repo, "rev-parse", "--verify", f"{a.tools_commit or 'HEAD'}^{{commit}}").decode().strip() if revised else commit
        has_reader = bool(ls(repo, tools, EDITION_MODULE))
        if revised and not has_reader:
            print("refuse: tools commit predates the revised reader")
            return 2
        delivery = False
        has_capability = revised and bool(ls(repo, tools, CAPABILITY_SOURCE))
        if revised:
            reader_blob = blob_id(repo, tools, "research/tools/d03/d03_repro.py")
            delivery = reader_blob not in FROZEN_READERS
            if delivery and not declares_delivery(git(repo, "show", f"{tools}:{EDITION_MODULE}")):
                raise ValueError("pinned reader does not declare the supported delivery contract")
            supported = git(repo, "show", f"{tools}:{CAPABILITY_SOURCE}").strip() if has_capability else b""
            if delivery and (not has_capability or supported.decode("ascii") not in CAPTION_BLOBS - {REVISED_BLOB}):
                raise ValueError("pinned reader lacks a recognized manuscript declaration")
            if manuscript != REVISED_BLOB and (reader_blob == FROZEN_NOV26_READER
                                               or supported != manuscript.encode("ascii")):
                raise ValueError("reader does not support this manuscript edition")

        files = plan(repo, commit)
        if has_capability:
            files.append((CAPABILITY_PATH, CAPABILITY_SOURCE, "code"))
        if has_reader:
            files.append(("tools/d03_editions.py", EDITION_MODULE, "code"))
        tool_paths = READER_PATHS
        if delivery:
            files.extend((path, "research/tools/d03/" + path.removeprefix("tools/"), "code")
                         for path in (DELIVERY_MODULE_PATH, TRANSFORM_PATH))
            tool_paths = DELIVERY_TOOL_PATHS
            pinned = tree_files(repo, tools)
            if any(source not in pinned for path, source, _ in files if path in tool_paths):
                raise ValueError("pinned reader is missing a required delivery file")

        # Resolve sources and generate the derivative before creating the output directory.
        sources = []
        for path, repo_path, role in files:
            revision = tools if revised and path in tool_paths else commit
            sources.append((path, repo_path, role, blob_id(repo, revision, repo_path)))
        view = delivery_view(repo, commit, manuscript, sources) if delivery else None
    except (subprocess.CalledProcessError, OSError):
        print("refuse: unavailable input commit or required file")
        return 2
    except ValueError as error:
        print("refuse: " + ("invalid UTF-8 or ASCII in reader inputs"
                            if isinstance(error, UnicodeError) else str(error)))
        return 2
    root = out / "d03-repro"
    entries = []
    for pkg_path, repo_path, role, blob in sources:
        data = git(repo, "cat-file", "blob", blob)
        dst = root / pkg_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
        rights, dist = RIGHTS[role]
        entries.append({"path": pkg_path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                        "source": repo_path, "gitBlob": blob, "role": role,
                        "rights": rights, "distribution": dist})
        if revised and pkg_path in tool_paths:
            entries[-1]["sourceCommit"] = tools
    prov = table1_first(repo)
    (root / "expected/provenance/table1-abdaade.md").write_bytes(prov)
    rights, dist = RIGHTS["manuscript-derived"]
    entries.append({"path": "expected/provenance/table1-abdaade.md", "bytes": len(prov), "sha256": hashlib.sha256(prov).hexdigest(),
                    "source": f"{MANUSCRIPT} table 1 at {TABLE1_FIRST}", "gitBlob": blob_id(repo, TABLE1_FIRST, MANUSCRIPT),
                    "role": "manuscript-derived", "rights": rights, "distribution": dist})
    if view is not None:
        (root / READER_VIEW_PATH).write_bytes(view)
        transform = next(entry for entry in entries if entry["path"] == TRANSFORM_PATH)
        entries.append({"path": READER_VIEW_PATH, "bytes": len(view), "sha256": hashlib.sha256(view).hexdigest(),
                        "source": MANUSCRIPT, "gitBlob": manuscript, "role": "manuscript-derived",
                        "rights": rights, "distribution": dist, "transform": {
                            "path": transform["path"], "sourceCommit": tools, "gitBlob": transform["gitBlob"]}})
    entries.sort(key=lambda e: e["path"])
    manifest_format = DELIVERY_FORMAT if delivery else "d03-manifest-2" if revised else "d03-manifest-1"
    manifest = {"format": manifest_format, "baseCommit": commit, "manuscriptBlob": manuscript,
                "createdFor": "local review only; external distribution needs separate approval",
                "roles": {k: {"rights": v[0], "distribution": v[1]} for k, v in RIGHTS.items()}, "files": entries}
    if revised:
        manifest["toolsCommit"] = tools
    if delivery:
        manifest["deliveryVersion"] = D03_DELIVERY_VERSION
    (root / "MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    zpath = out / "d03-repro.zip"
    with zipfile.ZipFile(zpath, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(root.rglob("*")):
            if f.is_file():
                info = zipfile.ZipInfo("d03-repro/" + f.relative_to(root).as_posix(), ZIP_TIME)
                info.external_attr = 0o644 << 16
                info.compress_type = zipfile.ZIP_DEFLATED
                info.create_system = 3
                z.writestr(info, f.read_bytes())
    extra = []
    if a.private_patterns:
        extra = [x.strip() for x in Path(a.private_patterns).read_text(encoding="utf-8").splitlines() if x.strip()]
    sc = scan(root, extra)
    (out / "scan.json").write_text(json.dumps(sc, indent=1), encoding="utf-8")
    build = {"commit": commit, "files": len(entries) + 1, "zipSha256": hashlib.sha256(zpath.read_bytes()).hexdigest(),
             "zipBytes": zpath.stat().st_size,
             "manifestSha256": hashlib.sha256((root / "MANIFEST.json").read_bytes()).hexdigest(),
             "byRole": {r: sum(1 for e in entries if e["role"] == r) for r in RIGHTS}}
    if revised:
        build.update(toolsCommit=tools, manuscriptBlob=manuscript)
    (out / "build.json").write_text(json.dumps(build, indent=1), encoding="utf-8")
    print(json.dumps({**build, "scanTotals": {k: v["matches"] for k, v in sc["content"].items()}, "fileNameHits": sc["fileNameHits"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
