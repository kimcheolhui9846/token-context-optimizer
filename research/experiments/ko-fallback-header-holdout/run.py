"""Run fresh held-out OCR and paired display comparison in a new local directory."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from dataset import BASE, HERE, PRIOR, RESEARCH, git, prepare, write_json
from assess import measure, summarize

PROTOCOL = "research/plans/2026-11-26-ko-fallback-header-holdout.md"
LOCK_DIR = HERE.relative_to(RESEARCH.parent).as_posix()
SCIENCE_LOCK = "59b3c6b18459f220cb2ab479358eb0416ae12348"


def verify_lock(commit):
    import re
    if not re.fullmatch(r"[0-9a-f]{40}", commit) or git("rev-parse", commit + "^").decode().strip() != SCIENCE_LOCK:
        raise ValueError("expected the full launcher-fix commit immediately after the original study lock")
    if git("rev-parse", SCIENCE_LOCK + "^").decode().strip() != BASE:
        raise ValueError("original science lock is not rooted at the registered base")
    changed = git("diff", "--name-only", SCIENCE_LOCK, commit).decode().splitlines()
    if changed != [LOCK_DIR + "/run.py"]:
        raise ValueError("only the Windows launcher may differ from the science lock")
    rel = [p for p in git("ls-tree", "-r", "--name-only", commit, "--", ":(top)" + LOCK_DIR,
                            ":(top)" + PROTOCOL).decode().splitlines()]
    if not rel:
        raise ValueError("registration paths unavailable")
    # ls-tree paths relative to research/ in some Git versions. Compare both index and working tree at repo root.
    root = RESEARCH.parent
    for path in [LOCK_DIR, PROTOCOL]:
        subprocess.run(["git", "diff", "--quiet", commit, "--", path], cwd=root, check=True)
    for req in ["candidate.py", "corpus.json", "assess.py", "run.py", "dataset.py", "test_candidate.py"]:
        subprocess.run(["git", "cat-file", "-e", f"{commit}:{LOCK_DIR}/{req}"], cwd=root, check=True)
    subprocess.run(["git","cat-file","-e",f"{commit}:{PROTOCOL}"],cwd=root,check=True)


def check_new_pixels(data):
    from dataset import corpus_text
    previous = set()
    for revision, design_path in PRIOR.items():
        render_path = (design_path.replace("gen/plan.json", "gen/render/render.json")
                       if revision == BASE else design_path.replace("design.json", "render.json"))
        previous.update(corpus_text(json.loads(git("show", f"{revision}:{render_path}"))))
    hashes = [r["sha256"] for r in json.loads((data/"render/render.json").read_bytes())["images"].values()]
    if len(hashes) != 18 or len(set(hashes)) != 18 or previous.intersection(hashes):
        raise ValueError("rendered public sources are duplicated")


def phase(label, args, output, env):
    proc = subprocess.run(args, cwd=RESEARCH, env=env, capture_output=True,
                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    (output / "log" / (label + ".log")).write_bytes(proc.stdout + proc.stderr)
    if proc.returncode:
        raise RuntimeError(f"{label} exited {proc.returncode}; see log/{label}.log")
    if label != "practice-design":
        record = json.loads(proc.stdout.decode("utf-8").splitlines()[-1])
        if not record.get("ok"):
            raise RuntimeError(f"{label}: stage did not verify")


def main():
    arg = argparse.ArgumentParser(description=__doc__)
    arg.add_argument("--lock", required=True)
    arg.add_argument("--font", required=True, type=Path)
    arg.add_argument("--out", required=True, type=Path)
    args = arg.parse_args()
    verify_lock(args.lock)
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    (out / "log").mkdir()
    data = out / "set"
    prepare(data)
    env = dict(os.environ, PYTHONUTF8="1", PYTHONDONTWRITEBYTECODE="1")
    node = shutil.which("node")
    pipe = [node, str(RESEARCH / "src/ko-blind-reader-pipeline.mjs")]
    font = str(args.font.resolve())
    practice = out / "practice"
    practice.mkdir()
    shutil.copyfile(RESEARCH / "results/ko-blind-reader/mock/practice/design.json", practice / "design.json")
    phase("render", [*pipe, "render", "--set", data, "--font", font], out, env)
    check_new_pixels(data)
    phase("render-practice", [*pipe, "render", "--set", practice, "--font", font], out, env)
    # Give the unchanged OCR and selector only the public queries and rendered PNG bytes.
    inputs = out / "selector-input"
    shutil.copytree(data / "selector", inputs / "selector")
    shutil.copytree(data / "render/images", inputs / "render/images")
    guard = RESEARCH / "tools/d03/guard/node-netguard.cjs"
    offline = dict(env, NODE_OPTIONS=f'--require="{guard.as_posix()}"', D03_NET_LOG=str(out/"log/net.jsonl"), D03_STEP="fallback-ocr")
    phase("ocr", [*pipe, "ocr", "--set", inputs, "--out", out/"ocr"], out, offline)
    phase("predict", [*pipe, "predict", "--set", inputs, "--ocr", out/"ocr", "--out", out/"pred"], out, env)
    phase("build", [*pipe, "build", "--set", inputs, "--pred", out/"pred", "--practice", practice,
                   "--out", out/"build"], out, env)
    rows = measure(out)
    summary = summarize(rows)
    write_json(out/"measures.json", {"lockCommit": args.lock, "rows": rows, "summary": summary})
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
