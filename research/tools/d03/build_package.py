"""Build the D03 local review package from committed Git objects (not from the working tree).

  python research/tools/d03/build_package.py --commit <sha> --out <new dir> [--private-patterns <file>]

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

MANUSCRIPT = "docs/research/image-first-paper-draft.ko.md"
MANUSCRIPT_BLOB = "c22a37b89b083c445f7ba483868aabe7041ddc02"
TABLE1_FIRST = "abdaade"
ENTRY_SCRIPTS = ["rq1-summarize.mjs", "summarize.mjs", "exp2-analyze.mjs", "session-summarize.mjs", "session-analyze.mjs", "figure-data.mjs"]
MODELS = ["gpt4o", "haiku"]
ZIP_TIME = (2026, 11, 23, 0, 0, 0)

RIGHTS = {
    "code": ("MIT (repository LICENSE)", "public"),
    "doc": ("MIT (repository LICENSE)", "public"),
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
             ("LICENSE", "LICENSE", "doc"),
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
    ap.add_argument("--repo", default=".")
    ap.add_argument("--out", required=True)
    ap.add_argument("--private-patterns")
    a = ap.parse_args()
    repo = Path(a.repo).resolve()
    commit = git(repo, "rev-parse", a.commit).decode().strip()
    out = Path(a.out).resolve()
    if out.exists():
        print("refuse: --out exists")
        return 2
    if blob_id(repo, commit, MANUSCRIPT) != MANUSCRIPT_BLOB:
        print("refuse: manuscript blob differs from the fixed baseline")
        return 2
    root = out / "d03-repro"
    entries = []
    for pkg_path, repo_path, role in plan(repo, commit):
        data = git(repo, "cat-file", "blob", f"{commit}:{repo_path}")
        dst = root / pkg_path
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_bytes(data)
        rights, dist = RIGHTS[role]
        entries.append({"path": pkg_path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                        "source": repo_path, "gitBlob": blob_id(repo, commit, repo_path), "role": role,
                        "rights": rights, "distribution": dist})
    prov = table1_first(repo)
    (root / "expected/provenance/table1-abdaade.md").write_bytes(prov)
    rights, dist = RIGHTS["manuscript-derived"]
    entries.append({"path": "expected/provenance/table1-abdaade.md", "bytes": len(prov), "sha256": hashlib.sha256(prov).hexdigest(),
                    "source": f"{MANUSCRIPT} table 1 at {TABLE1_FIRST}", "gitBlob": blob_id(repo, TABLE1_FIRST, MANUSCRIPT),
                    "role": "manuscript-derived", "rights": rights, "distribution": dist})
    entries.sort(key=lambda e: e["path"])
    manifest = {"format": "d03-manifest-1", "baseCommit": commit, "manuscriptBlob": MANUSCRIPT_BLOB,
                "createdFor": "local review only; external distribution needs separate approval",
                "roles": {k: {"rights": v[0], "distribution": v[1]} for k, v in RIGHTS.items()}, "files": entries}
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
    (out / "build.json").write_text(json.dumps(build, indent=1), encoding="utf-8")
    print(json.dumps({**build, "scanTotals": {k: v["matches"] for k, v in sc["content"].items()}, "fileNameHits": sc["fileNameHits"]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
