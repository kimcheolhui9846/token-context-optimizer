"""Run 18 matched images through the unchanged, offline Korean OCR pipeline."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

from PIL import ImageChops

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parents[1]
ROOT = RESEARCH.parent
BASE = "e1e75b79b080e615867ab8fd4089f4f419758e84"
PROTOCOL = "research/plans/2026-11-26-ko-header-rule-pairs.md"
PREVIOUS = RESEARCH / "results/ko-header-window-safety"
sys.path.insert(0, str(HERE.parent / "ko-header-window-safety"))

from scoring import compare, geometry, read_image
from assess import indexed, read
from run import phase
from outcomes import summarize
from stimuli import ORIGINAL, MOVED, make_pair


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=1) + "\n",
                    encoding="utf-8", newline="\n")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT, encoding="utf-8").strip()


def verify_lock(revision):
    target = HERE.relative_to(ROOT).as_posix()
    if len(revision) != 40 or git("rev-parse", revision + "^") != BASE:
        raise ValueError("Expected the registration commit immediately after #160")
    paths = [target, PROTOCOL, "research/experiments/ko-header-window-safety",
             "research/experiments/ko-fallback-header-holdout", "research/src",
             "research/tools/ko-blind-reader", "research/tools/d03/guard", "research/tools/r09",
             "research/results/ko-blind-reader/mock/practice/design.json", "research/package-lock.json",
             PREVIOUS.relative_to(ROOT).as_posix()]
    for path in paths:
        git("cat-file", "-e", revision + ":" + path)
    if git("diff", "--name-only", revision, "--", *paths):
        raise ValueError("Registered inputs or study code changed")
    if git("ls-files", "--others", "--exclude-standard", "--", *paths):
        raise ValueError("Untracked files among the registered inputs")
    for p in HERE.glob("*.py"):
        if git("hash-object", str(p)) != git("rev-parse", revision + ":" + p.relative_to(ROOT).as_posix()):
            raise ValueError("Unregistered program")


def prior_inputs():
    data = PREVIOUS / "set"
    prior = read(PREVIOUS / "results.json")["rows"]
    rows = [r for r in prior if r["condition"] in ("control", "gap-offset", "outer-offset")]
    bare = {r["donor"]: r["id"] for r in rows if r["condition"] == "control"}
    return data, rows, bare


def intersects(a, b):
    return max(a[0], b[0]) < min(a[2], b[2]) and max(a[1], b[1]) < min(a[3], b[3])


def prepare(out):
    data, references, controls = prior_inputs()
    design = {s["id"]: s for s in read(data / "design.json")["images"]}
    questions = {s["id"]: s["question"] for s in read(data / "selector/questions.json")["questions"]}
    meta = read(data / "render/render.json")["images"]
    coord = indexed(PREVIOUS / "build/coords.jsonl")
    pred = indexed(PREVIOUS / "pred/predictions.jsonl")
    prior_rows = {r["id"]: r for r in references}
    roster, prompts = [], []
    images = out / "input/render/images"
    images.mkdir(parents=True)
    for ref in references:
        parent, donor = ref["id"], ref["donor"]
        cid = controls[donor]
        plant = ref["condition"].split("-")[0] if ref["condition"] != "control" else "none"
        source = data / "render/images" / (parent + ".png")
        if sha(source) != meta[parent]["sha256"]:
            raise ValueError("Historical source hash mismatch")
        original = read_image(source)
        blank = read_image(data / "render/images" / (cid + ".png"))
        layer = read_image(data / "layers" / (parent + ".png"))
        marks = meta[parent]["items"]
        control_crops = [p["sourceRect"] for p in coord[cid]["pieces"] if p["kind"] == "source"]
        control_display = prior_rows[cid]["natural"]
        crops = control_crops + [control_display["band"]] + control_display["windows"]
        if any(intersects(line, rect) for line in (ORIGINAL, MOVED) for rect in crops):
            raise ValueError("Reference display intersects rule")
        moved_blank, moved = make_pair(blank, layer, original)
        for rule, base, image in (("original", blank, original), ("moved", moved_blank, moved)):
            sid = "q" + hashlib.sha256(f"ko-rule-pairs/{parent}/{rule}".encode()).hexdigest()[:8]
            path = images / (sid + ".png")
            if rule == "original":
                shutil.copyfile(source, path)
            else:
                image.save(path, compress_level=9)
            placement = geometry(image, base, design[parent], marks, layer, plant != "none", pred[cid], coord[cid])
            if rule == "original" and placement != ref["placement"]:
                raise ValueError("Historical geometry mismatch")
            if rule == "moved" and not placement["valid"]:
                raise ValueError("Invalid moved placement")
            roster.append(dict(id=sid, donor=donor, parent=parent, control=cid, rule=rule, plant=plant,
                               sha256=sha(path), validPlacement=placement["valid"], geometry=placement))
            prompts.append(dict(id=sid, file=path.name, question=questions[parent]))
    if len(roster) != 18 or any(len({r[k] for r in roster}) != 18 for k in ("id", "sha256")):
        raise ValueError("Expected 18 distinct public images")
    write(out / "input/selector/questions.json", {"questions": prompts})
    write(out / "roster.json", roster)
    return roster


def run_ocr(out, font):
    env = dict(os.environ, PYTHONUTF8="1", PYTHONDONTWRITEBYTECODE="1", OMP_THREAD_LIMIT="1")
    guard = (RESEARCH / "tools/d03/guard/node-netguard.cjs").as_posix()
    offline = dict(env, NODE_OPTIONS=f'--require="{guard}"', D03_NET_LOG=str(out / "log/network.jsonl"),
                   D03_STEP="header-rule-pairs-ocr")
    pipe = [shutil.which("node"), str(RESEARCH / "src/ko-blind-reader-pipeline.mjs")]
    source = out / "input"
    phase("ocr", [*pipe, "ocr", "--set", source, "--out", out / "ocr"], out, offline)
    phase("predict", [*pipe, "predict", "--set", source, "--ocr", out / "ocr", "--out", out / "pred"], out,
          dict(offline, D03_STEP="header-rule-pairs-predict"))
    practice = out / "practice"
    practice.mkdir()
    shutil.copyfile(RESEARCH / "results/ko-blind-reader/mock/practice/design.json", practice / "design.json")
    phase("practice-render", [*pipe, "render", "--set", practice, "--font", font.resolve()], out,
          dict(offline, D03_STEP="header-rule-pairs-practice"))
    phase("build", [*pipe, "build", "--set", source, "--pred", out / "pred", "--practice", practice,
                    "--out", out / "build"], out, dict(offline, D03_STEP="header-rule-pairs-build"))
    events = [json.loads(s) for s in (out / "log/network.jsonl").read_bytes().splitlines()]
    expected = {"header-rule-pairs-" + label for label in ("ocr", "predict", "practice", "build")}
    if {r["step"] for r in events} != expected or any(r["event"] != "guard" for r in events):
        raise ValueError("Missing offline guard or blocked network access")
    pins = read(RESEARCH / "tools/ko-blind-reader/registered.json")["fixed"]["ocr"]
    audit = read(out / "ocr/guard-summary.json")
    if not audit["offlineGuard"] or audit["blocked"] != 0 or any(
            audit[key] != pins[key] for key in ("engine", "engineCoreFiles", "langFiles")):
        raise ValueError("Pinned OCR configuration did not verify")
    return {"offlineStages": sorted(expected), "blockedAttempts": 0, "guardSummarySha256": sha(out / "ocr/guard-summary.json")}


def evaluate(out, roster):
    data, existing, _ = prior_inputs()
    prior = {r["id"]: r for r in existing}
    pages = {s["id"]: s for s in read(data / "design.json")["images"]}
    marks = read(data / "render/render.json")["images"]
    pred = indexed(out / "pred/predictions.jsonl")
    coords = indexed(out / "build/coords.jsonl")
    ocr = indexed(out / "ocr/ocr.jsonl")
    if any(set(t) != {r["id"] for r in roster} for t in (pred, coords, ocr)):
        raise ValueError("Incomplete OCR or selector output")
    rows = []
    for r in roster:
        sid, parent = r["id"], r["parent"]
        source_path = out / "input/render/images" / (sid + ".png")
        if ocr[sid]["status"] != "ok" or {t[sid]["pngSha256"] for t in (pred, coords, ocr)} != {sha(source_path)}:
            raise ValueError("OCR input provenance failed")
        layer = read_image(data / "layers" / (parent + ".png"))
        bare = read_image(data / "render/images" / (r["control"] + ".png"))
        historical = read_image(data / "render/images" / (parent + ".png"))
        if r["rule"] == "moved":
            bare, _ = make_pair(bare, layer, historical)
        where = out / "displays" / sid
        result = compare(read_image(source_path), bare, layer, pages[parent], marks[parent]["items"],
                         pred[sid], coords[sid], where, out / "build/w5" / (sid + ".png"))
        if r["rule"] == "original":
            if result != prior[parent]["natural"]:
                raise ValueError("Historical decision or marks changed")
            for arm in ("w5", "full", "two"):
                before = read_image(PREVIOUS / "displays/natural" / parent / (arm + ".png"))
                after = read_image(where / (arm + ".png"))
                if before.size != after.size or ImageChops.difference(before, after).getbbox():
                    raise ValueError("Historical display changed")
        rows.append(dict(r, natural=result))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock", required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--font", type=Path, required=True)
    args = parser.parse_args()
    verify_lock(args.lock)
    pin = read(RESEARCH / "tools/ko-blind-reader/registered.json")["fixed"]["font"]["sha256"]
    if sha(args.font) != pin:
        raise ValueError("Expected the registered Korean font")
    out = args.out.resolve()
    out.mkdir(parents=True, exist_ok=False)
    (out / "log").mkdir()
    rows = prepare(out)
    offline = run_ocr(out, args.font)
    rows = evaluate(out, rows)
    summary = summarize(rows)
    write(out / "results.json", dict(lock=args.lock, offline=offline, rows=rows, summary=summary))
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
