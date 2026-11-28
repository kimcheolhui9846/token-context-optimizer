"""D03 reproduction runner. Runs from inside an unpacked package (d03-repro/).

  python tools/d03_repro.py verify-manifest --package <pkg>
  python tools/d03_repro.py guard-check     --package <pkg> --out <new dir>
  python tools/d03_repro.py regenerate      --package <pkg> --out <new dir>
  python tools/d03_repro.py compare         --package <pkg> --out <dir from regenerate>
  python tools/d03_repro.py all             --package <pkg> --out <new dir>

Exit codes: 0 all seven items MATCH or MATCH-WITHIN-TOLERANCE and the run stayed offline,
1 a verdict failed or a command failed, 2 manifest or input error (checked before any regeneration),
3 the offline guard negative control failed (before regeneration),
4 the regeneration itself broke the offline condition (a step without guard evidence, or a blocked network call),
reported separately from the scientific verdicts.
The package is only read. Outputs go to --out, which must not exist before regenerate/all.
"""
from __future__ import annotations

import argparse
import errno
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
import tempfile
from uuid import uuid4
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # the package is read-only: no __pycache__ inside it
sys.path.insert(0, str(HERE))
import d03_checks as checks  # noqa: E402
from d03_editions import CAPTION_BLOBS, MANUSCRIPT_PATH, valid_identity  # noqa: E402

SECRET_ENV = re.compile(r"(API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|_KEY$|^OPENAI|^ANTHROPIC|^BAZE|^GEMINI|^GOOGLE_API)", re.I)
MODELS = ["gpt4o", "haiku"]


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def snapshot(pkg: Path) -> dict[str, str]:
    return {p.relative_to(pkg).as_posix(): sha256(p) for p in sorted(pkg.rglob("*")) if p.is_file()}


# ---------------------------------------------------------------- manifest

def verify_manifest(pkg: Path, *, require_edition: bool = False) -> dict:
    mpath = pkg / "MANIFEST.json"
    if not mpath.is_file():
        return {"ok": False, "missing": ["MANIFEST.json"], "corrupt": [], "extra": [], "files": 0}
    try:
        manifest = checks.read_json(mpath)
        entries = manifest.get("files")
    except checks.InvalidJSON:
        return {"ok": False, "missing": [], "corrupt": ["MANIFEST.json"], "extra": [], "files": 0}
    if not isinstance(entries, list) or any(
        not isinstance(row, dict) or not isinstance(row.get("path"), str)
        or not isinstance(row.get("bytes"), int) or not isinstance(row.get("sha256"), str) for row in entries
    ):
        return {"ok": False, "missing": [], "corrupt": ["MANIFEST.json"], "extra": [], "files": 0}
    listed = {row["path"]: row for row in entries}
    missing, corrupt = [], []
    for path, f in listed.items():
        p = pkg / path
        if not p.is_file():
            missing.append(path)
        elif p.stat().st_size != f["bytes"] or sha256(p) != f["sha256"]:
            corrupt.append(path)
    has_edition = "format" in manifest or "manuscriptBlob" in manifest or MANUSCRIPT_PATH in listed
    if (require_edition or has_edition) and not valid_identity(pkg, manifest, listed):
        corrupt.append("MANIFEST.json")
    present = {p.relative_to(pkg).as_posix() for p in pkg.rglob("*") if p.is_file()}
    extra = sorted(present - set(listed) - {"MANIFEST.json"})
    return {"ok": not (missing or corrupt or extra), "files": len(listed), "missing": missing, "corrupt": corrupt, "extra": extra}


# ---------------------------------------------------------------- guarded execution

def guarded_env(out: Path, log: str = "network.jsonl") -> dict:
    env = {k: v for k, v in os.environ.items() if not SECRET_ENV.search(k)}
    for k in ["NODE_OPTIONS", "PYTHONPATH", "PYTHONHOME", "PYTHONSTARTUP", "NODE_PATH"]:
        env.pop(k, None)
    guard_js = (HERE / "guard" / "node-netguard.cjs").as_posix()
    env["NODE_OPTIONS"] = f'--require="{guard_js}"'
    env["PYTHONPATH"] = str(HERE / "guard" / "py")
    env["D03_NET_LOG"] = str(out / "logs" / log)
    env["HTTP_PROXY"] = env["HTTPS_PROXY"] = env["http_proxy"] = env["https_proxy"] = "http://127.0.0.1:9"
    env["MPLBACKEND"] = "Agg"
    env["MPLCONFIGDIR"] = str(out / "mplconfig")
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def rel_arg(x: str, out: Path) -> str:
    """Record arguments relative to the output or package so the run record carries no local paths."""
    if not Path(x).is_absolute():
        return x
    for base, tag in [(out, "<out>"), (HERE.parent, "<package>")]:
        try:
            return tag + "/" + Path(x).resolve().relative_to(base.resolve()).as_posix()
        except (ValueError, OSError):
            pass
    return x


def run(name: str, cmd: list[str], cwd: Path, env: dict, out: Path, runs: list) -> int:
    t0 = time.perf_counter()
    proc = subprocess.Popen(cmd, cwd=cwd, env={**env, "D03_STEP": name}, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    stdout, stderr = proc.communicate()
    p = subprocess.CompletedProcess(cmd, proc.returncode, stdout, stderr)
    dt = time.perf_counter() - t0
    log = out / "logs" / f"{len(runs) + 1:02d}-{name}.log"
    log.write_bytes(b"$ " + " ".join(cmd[1:]).encode() + b"\n--- stdout\n" + p.stdout + b"\n--- stderr\n" + p.stderr)
    runs.append({"step": name, "command": [Path(cmd[0]).name] + [rel_arg(x, out) for x in cmd[1:]], "exit": p.returncode,
                 "seconds": round(dt, 3), "pid": proc.pid, "log": log.relative_to(out).as_posix()})
    return p.returncode


GUARD_NODE = r"""
const out = [];
const tryit = async (name, f) => { try { await f(); out.push([name, 'allowed']); } catch (e) { out.push([name, e.code === 'D03_OFFLINE' ? 'blocked' : 'error:' + e.code]); } };
(async () => {
  await tryit('fetch', () => fetch('https://example.invalid/'));
  await tryit('net.connect', () => new Promise((res, rej) => { try { require('node:net').connect(9, '127.0.0.1').on('error', rej).on('connect', res); } catch (e) { rej(e); } }));
  await tryit('dns.lookup', () => new Promise((res, rej) => { try { require('node:dns').lookup('example.invalid', (e) => e ? rej(e) : res()); } catch (e) { rej(e); } }));
  await tryit('child.fetch', () => new Promise((res, rej) => {
    const r = require('node:child_process').spawnSync(process.execPath, ['-e', "fetch('https://example.invalid/').then(()=>process.exit(0),(e)=>process.exit(e.code==='D03_OFFLINE'?7:1))"]);
    if (r.status === 7) { const e = new Error('child blocked'); e.code = 'D03_OFFLINE'; rej(e); } else res();
  }));
  console.log(JSON.stringify(out));
})();
"""

GUARD_PY = r"""
import json, socket, subprocess, sys
out = []
def tryit(name, f):
    try:
        f(); out.append([name, 'allowed'])
    except OSError as e:
        out.append([name, 'blocked' if 'D03 offline guard' in str(e) else 'error'])
tryit('create_connection', lambda: socket.create_connection(('127.0.0.1', 9), timeout=1))
tryit('getaddrinfo', lambda: socket.getaddrinfo('example.invalid', 443))
tryit('socket.connect', lambda: socket.socket().connect(('127.0.0.1', 9)))
r = subprocess.run([sys.executable, '-c', "import socket\ntry:\n socket.create_connection(('127.0.0.1',9),timeout=1)\nexcept OSError as e:\n raise SystemExit(7 if 'D03 offline guard' in str(e) else 1)"])
out.append(['child.create_connection', 'blocked' if r.returncode == 7 else 'allowed'])
print(json.dumps(out))
"""

POSITIVE_PY = r"""
import socket
try:
    socket.create_connection(('127.0.0.1', 9), timeout=1)
    print('connected')
except OSError as e:
    print('guard' if 'D03 offline guard' in str(e) else 'refused-by-os')
"""


def guard_check(out: Path) -> dict:
    (out / "logs").mkdir(parents=True, exist_ok=True)
    env = guarded_env(out, "network-guard-check.jsonl")
    runs: list = []
    run("guard-node", ["node", "-e", GUARD_NODE], out, env, out, runs)
    run("guard-python", [sys.executable, "-c", GUARD_PY], out, env, out, runs)
    plain = {k: v for k, v in env.items() if k not in ("NODE_OPTIONS", "PYTHONPATH")}
    run("guard-positive-python", [sys.executable, "-c", POSITIVE_PY], out, plain, out, runs)

    def parsed(i):
        text = (out / runs[i]["log"]).read_text(encoding="utf-8", errors="replace")
        body = text.split("--- stdout\n", 1)[1].split("\n--- stderr", 1)[0].strip()
        return body

    node = json.loads(parsed(0) or "[]")
    py = json.loads(parsed(1) or "[]")
    positive = parsed(2)
    ok = bool(node) and bool(py) and all(s == "blocked" for _, s in node + py) and positive != "guard"
    return {"ok": ok, "node": node, "python": py, "unguardedLocalControl": positive, "runs": runs,
            "scope": "Node and Python processes started by this runner and their children; no system firewall change"}


# ---------------------------------------------------------------- regeneration

def stage(pkg: Path, work: Path) -> None:
    """Copy generator code and raw inputs into the layout the original scripts expect. No expected/ file is copied."""
    r = pkg / "research"
    w = work / "research"
    shutil.copytree(r / "src", w / "src")
    (w / "figures").mkdir(parents=True)
    for f in ["make_figures.py", "exp2_figures.py"]:
        shutil.copy2(r / "figures" / f, w / "figures" / f)
    shutil.copy2(r / "package.json", w / "package.json")
    shutil.copytree(r / "results", w / "results")
    o = w / "out"
    (o / "rq1-runs" / "rq1-sweep-001").mkdir(parents=True)
    shutil.copy2(r / "results/rq1-sweep-001/rows.jsonl", o / "rq1-runs/rq1-sweep-001/rows.jsonl")
    e2 = o / "exp2-heldout"
    for m in MODELS:
        d = e2 / "runs" / f"exp2-held-{m}"
        d.mkdir(parents=True)
        for f in ["config.json", "responses.jsonl"]:
            shutil.copy2(r / "results/exp2-heldout" / m / f, d / f)
    shutil.copy2(r / "results/exp2-heldout/families-exp2-heldout.json", e2 / "families.json")
    shutil.copy2(r / "results/exp2-heldout/slots-exp2-heldout.json", e2 / "slots.json")
    (o / "sessions" / "heldout").mkdir(parents=True)
    shutil.copy2(r / "results/s3-heldout/sessions-heldout.json", o / "sessions/heldout/sessions.json")
    for m in MODELS:
        d = o / "session-runs" / f"s3-heldout-{m}"
        d.mkdir(parents=True)
        src = r / "results/s3-heldout" / m
        for f in sorted(src.iterdir()):
            if f.name in ("config.json", "calls.jsonl") or re.search(r"\.S\d\.json$", f.name):
                shutil.copy2(f, d / f.name)


def collect(work: Path, gen: Path) -> None:
    w = work / "research"
    pairs = [(w / "out/rq1-runs/rq1-sweep-001", gen / "rq1-sweep-001", ["summary.json", "summary.md"])]
    for m in MODELS:
        pairs.append((w / f"out/exp2-heldout/runs/exp2-held-{m}", gen / "exp2-heldout" / m,
                      ["graded.jsonl", "summary.json", "summary.md", "exp2-analysis.json", "exp2-analysis.md"]))
        pairs.append((w / f"out/session-runs/s3-heldout-{m}", gen / "s3-heldout" / m,
                      ["summary.json", "summary.md", "analysis.json", "analysis.md"]))
    pairs.append((w / "figures/data", gen / "figures/data", ["heldout-sessions.json"]))
    pairs.append((w / "figures", gen / "figures", [f"fig{i}_{n}.{e}" for i, n in [(1, "rq1_billed_tokens"), (2, "heldout_accuracy_vs_tokens"),
                                                                                  (3, "heldout_late_recall"), (4, "heldout_cost_list_vs_cache")] for e in ("png", "pdf")]))
    pairs.append((w / "figures/exp2/heldout", gen / "figures/exp2/heldout",
                  [f"{n}.{e}" for n in ["fig5_exp2_accuracy_vs_tokens", "fig6_exp2_accuracy_by_condition"] for e in ("png", "pdf")]))
    for src, dst, names in pairs:
        dst.mkdir(parents=True, exist_ok=True)
        for n in names:
            source = src / n
            if (dst / n).relative_to(gen).as_posix() in REQUIRED_PDFS and not source.is_file():
                # Let the delivery check identify the missing PDF alongside the scientific verdicts.
                continue
            shutil.copy2(source, dst / n)


def regenerate(pkg: Path, out: Path) -> dict:
    work = out / "work"
    stage(pkg, work)
    env = guarded_env(out)
    research = work / "research"
    tools = HERE
    runs: list = []
    node = shutil.which("node") or "node"
    steps = [("rq1-summarize", [node, "src/rq1-summarize.mjs", "--run-id", "rq1-sweep-001"])]
    for m in MODELS:
        steps += [(f"summarize-{m}", [node, "src/summarize.mjs", "--set", "exp2-heldout", "--run-id", f"exp2-held-{m}"]),
                  (f"exp2-analyze-{m}", [node, "src/exp2-analyze.mjs", "--set", "exp2-heldout", "--run-id", f"exp2-held-{m}"])]
    for m in MODELS:
        steps += [(f"session-summarize-{m}", [node, "src/session-summarize.mjs", "--run-id", f"s3-heldout-{m}"]),
                  (f"session-analyze-{m}", [node, "src/session-analyze.mjs", "--run-id", f"s3-heldout-{m}"])]
    steps += [("figure-data", [node, "src/figure-data.mjs"]),
              ("make-figures", [sys.executable, str(tools / "d03_figprobe.py"), str(out / "probe-make_figures.json"), "figures/make_figures.py"]),
              ("exp2-figures", [sys.executable, str(tools / "d03_figprobe.py"), str(out / "probe-exp2_figures.json"), "figures/exp2_figures.py",
                                "--gpt4o", "out/exp2-heldout/runs/exp2-held-gpt4o", "--haiku", "out/exp2-heldout/runs/exp2-held-haiku", "--tag", "heldout"])]
    failed = None
    for name, cmd in steps:
        if run(name, cmd, research, env, out, runs) != 0:
            failed = name
            break
    tables = {}
    if failed is None:
        collect(work, out / "generated")
        tables = {k: v.relative_to(out).as_posix() for k, v in checks.write_tables(pkg / "expected/table1-spec.json", out / "generated").items()}
    return {"ok": failed is None, "failed": failed, "runs": runs, "tables": tables, "offline": offline_evidence(out, runs)}


def offline_evidence(out: Path, runs: list) -> dict:
    """Offline condition of the regeneration itself (separate from the deliberate guard-check negative control,
    which logs to network-guard-check.jsonl): for every step, an interpreter of the step's own kind (Node or Python)
    started the guard under that step's name (D03_STEP), and that interpreter is either the process the runner started
    or its direct child, and nothing was blocked. The direct-child case admits launchers (a Windows venv python.exe
    starts the real interpreter as a child) without accepting a guard from some deeper process."""
    netlog = out / "logs" / "network.jsonl"
    events = [json.loads(x) for x in netlog.read_text(encoding="utf-8").splitlines() if x] if netlog.is_file() else []
    guards = [e for e in events if e["event"] == "guard"]
    unguarded = [r["step"] for r in runs
                 if not any(e.get("step") == r["step"] and e.get("lang") == step_lang(r) and r["pid"] in (e.get("pid"), e.get("ppid"))
                            for e in guards)]
    blocked = [e for e in events if e["event"] == "blocked"]
    return {"ok": bool(runs) and not unguarded and not blocked, "steps": len(runs),
            "guardStarts": sum(1 for e in events if e["event"] == "guard"), "stepsWithoutGuard": unguarded,
            "blockedEvents": len(blocked), "blockedKinds": sorted({e.get("kind", "") for e in blocked}),
            "blockedSteps": sorted({e.get("step", "") for e in blocked})}


def step_lang(run_record: dict) -> str:
    return "node" if Path(run_record["command"][0]).name.lower().startswith("node") else "python"


# ---------------------------------------------------------------- compare

def compare(pkg: Path, out: Path) -> dict:
    from d03_delivery import check_figure_pdf

    exp = pkg / "expected"
    gen = out / "generated"
    ms = pkg / MANUSCRIPT_PATH
    meta = json.loads((pkg / "MANIFEST.json").read_text(encoding="utf-8"))
    caption_source = ms if meta["manuscriptBlob"] in CAPTION_BLOBS else None
    items = []

    def guarded(item, fn):
        try:
            items.append(fn())
            return
        except (checks.InvalidJSON, FileNotFoundError) as exc:
            if isinstance(exc, checks.InvalidJSON):
                path, reason = exc.path, str(exc)
            else:
                path = Path(exc.filename) if exc.filename else None
                reason = "missing file"
            row = {"item": item, "verdict": "NOT-REPRODUCIBLE", "error": reason}
            if path is not None:
                for root in (out, pkg):
                    if path.is_relative_to(root):
                        row["path"] = path.relative_to(root).as_posix()
                        break
        except KeyError as exc:
            row = {"item": item, "verdict": "NOT-REPRODUCIBLE", "error": f"KeyError: {exc}"}
        except (TypeError, AttributeError, IndexError) as exc:
            # The evaluator cannot distinguish a bad field from a checker defect.
            # Keep that failure visible without attributing it to an unverified file.
            row = {"item": item, "verdict": "NOT-REPRODUCIBLE",
                   "error": f"{type(exc).__name__}: check could not evaluate its inputs"}
        items.append(row)

    guarded("T1", lambda: checks.check_t1(ms, exp / "table1-spec.json", exp / "provenance/table1-abdaade.md", exp / "provenance/ieee-references.md", gen))
    guarded("T2", lambda: checks.check_t2(ms, gen))
    guarded("T3", lambda: checks.check_t3(ms, gen))
    def s3_analysis():
        return {m: checks.read_json(gen / f"s3-heldout/{m}/analysis.json") for m in MODELS}

    sessions = gen / "figures/data/heldout-sessions.json"
    figs = [("F1", "fig1_rq1_billed_tokens", "probe-make_figures.json", lambda p: checks.check_f1(p, pkg / "research/results/rq1-sweep-001/rows.jsonl"), "figures"),
            ("F2", "fig5_exp2_accuracy_vs_tokens", "probe-exp2_figures.json", lambda p: checks.check_f2(p, {m: gen / f"exp2-heldout/{m}/graded.jsonl" for m in MODELS}, manuscript=caption_source, question_manifest=pkg / checks.F2_QUESTION_MANIFEST), "figures/exp2/heldout"),
            ("F3", "fig2_heldout_accuracy_vs_tokens", "probe-make_figures.json", lambda p: checks.check_f3(p, sessions, s3_analysis()), "figures"),
            ("F4", "fig3_heldout_late_recall", "probe-make_figures.json", lambda p: checks.check_f4(p, sessions, s3_analysis()), "figures")]
    pdfs = []
    for item, stem, probe, fn, sub in figs:
        relative = Path(sub) / f"{stem}.pdf"
        pdfs.append({"item": item, "path": "generated/" + relative.as_posix(),
                     **check_figure_pdf(gen / relative, exp / relative.with_suffix(".png"))})
        guarded(item, lambda: checks.figure_verdict(item, fn(checks.read_json(out / probe)[stem]), checks.render_compare(gen / sub / f"{stem}.png", exp / sub / f"{stem}.png", f2_tiles=item == "F2")))
    secondary = []
    for p in sorted((exp / "results").rglob("*")):
        if p.is_file():
            rel = p.relative_to(exp / "results").as_posix()
            g = gen / rel
            secondary.append({"path": rel, "bytesEqual": g.is_file() and g.read_bytes() == p.read_bytes()})
    passed = sum(1 for i in items if i["verdict"] in ("MATCH", "MATCH-WITHIN-TOLERANCE"))
    delivered = {row["path"] for row in pdfs if row["pass"]}
    required = {"generated/" + path for path in REQUIRED_PDFS}
    return {"items": items, "passed": passed, "total": len(items), "scientificPass": passed == 7,
            "deliveryPass": len(required) == 4 and delivered == required, "requiredPDFs": pdfs, "secondaryBlobEqual": secondary,
            "secondaryEqualCount": sum(s["bytesEqual"] for s in secondary)}


ITEM_OUTPUTS = {
    "T1": (["tables/table1.md"], ["render-tables"]),
    "T2": (["tables/table2.md"] + [f"exp2-heldout/{m}/exp2-analysis.json" for m in MODELS],
           [s for m in MODELS for s in (f"summarize-{m}", f"exp2-analyze-{m}")] + ["render-tables"]),
    "T3": (["tables/table3.md"] + [f"s3-heldout/{m}/{f}" for m in MODELS for f in ("analysis.json", "summary.json")],
           [s for m in MODELS for s in (f"session-summarize-{m}", f"session-analyze-{m}")] + ["render-tables"]),
    "F1": (["figures/fig1_rq1_billed_tokens.png", "figures/fig1_rq1_billed_tokens.pdf", "rq1-sweep-001/summary.json"],
           ["rq1-summarize", "make-figures"]),
    "F2": (["figures/exp2/heldout/fig5_exp2_accuracy_vs_tokens.png", "figures/exp2/heldout/fig5_exp2_accuracy_vs_tokens.pdf"]
           + [f"exp2-heldout/{m}/graded.jsonl" for m in MODELS],
           [s for m in MODELS for s in (f"summarize-{m}", f"exp2-analyze-{m}")] + ["exp2-figures"]),
    "F3": (["figures/fig2_heldout_accuracy_vs_tokens.png", "figures/fig2_heldout_accuracy_vs_tokens.pdf", "figures/data/heldout-sessions.json"],
           [s for m in MODELS for s in (f"session-summarize-{m}", f"session-analyze-{m}")] + ["figure-data", "make-figures"]),
    "F4": (["figures/fig3_heldout_late_recall.png", "figures/fig3_heldout_late_recall.pdf", "figures/data/heldout-sessions.json"],
           [s for m in MODELS for s in (f"session-summarize-{m}", f"session-analyze-{m}")] + ["figure-data", "make-figures"]),
}
REQUIRED_PDFS = {path for item, (paths, _) in ITEM_OUTPUTS.items() if item.startswith("F")
                 for path in paths if path.endswith(".pdf")}
PROBES = {"F1": "probe-make_figures.json", "F2": "probe-exp2_figures.json", "F3": "probe-make_figures.json", "F4": "probe-make_figures.json"}


def output_manifest(pkg: Path, out: Path, regen: dict, comp: dict) -> dict:
    """Local output record: links the input MANIFEST to each of the seven targets, its generated files
    (relative path, bytes, SHA-256), the regeneration steps and commands that made them, and the verdict."""
    gen = out / "generated"
    steps = {r["step"]: r for r in regen["runs"]}
    verdicts = {i["item"]: i["verdict"] for i in comp["items"]}
    def rec(rel_to_out: str) -> dict:
        p = out / rel_to_out
        return {"path": rel_to_out, "bytes": p.stat().st_size if p.is_file() else None, "sha256": sha256(p) if p.is_file() else None}
    items = []
    for item, (files, step_names) in ITEM_OUTPUTS.items():
        fs = [rec("generated/" + f) for f in files] + ([rec(PROBES[item])] if item in PROBES else [])
        items.append({"item": item, "verdict": verdicts.get(item), "files": fs,
                      "regenerate": [{"step": n, "command": steps[n]["command"], "exit": steps[n]["exit"]} if n in steps
                                     else {"step": n, "command": ["d03_repro.py", "regenerate (in-process write_tables)"]} for n in step_names],
                      "compare": ["d03_repro.py", "compare", "--package", "<package>", "--out", "<out>"]})
    all_files = [rec(p.relative_to(out).as_posix()) for p in sorted(gen.rglob("*")) if p.is_file()]
    meta = json.loads((pkg / "MANIFEST.json").read_text(encoding="utf-8"))
    return {"inputManifest": {"path": "MANIFEST.json", "sha256": sha256(pkg / "MANIFEST.json")},
            "package": {k: meta[k] for k in ("baseCommit", "manuscriptBlob", "toolsCommit") if k in meta},
            "command": comp["command"], "scientificPass": comp["scientificPass"],
            "deliveryPass": comp["deliveryPass"], "requiredPDFs": comp["requiredPDFs"],
            "items": items, "generatedFiles": all_files, "generatedFileCount": len(all_files)}


# ---------------------------------------------------------------- environment

def environment() -> dict:
    from importlib import metadata

    node = subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip()
    pkgs = {}
    for name in ["matplotlib", "numpy", "pillow", "pypdfium2", "contourpy", "cycler", "fonttools", "kiwisolver", "packaging",
                 "pyparsing", "python-dateutil", "six"]:
        try:
            pkgs[name] = metadata.version(name)
        except metadata.PackageNotFoundError:
            pkgs[name] = None
    import matplotlib
    from matplotlib import font_manager

    font = Path(font_manager.findfont("DejaVu Sans", fallback_to_default=False))
    mpl_root = Path(matplotlib.__file__).parent
    try:
        font_rel = "matplotlib/" + font.relative_to(mpl_root).as_posix()
    except ValueError:
        font_rel = "outside-matplotlib:" + font.name
    return {"node": node, "python": platform.python_version(), "pythonExecutable": Path(sys.executable).name,
            "virtualEnv": sys.prefix != sys.base_prefix, "implementation": platform.python_implementation(),
            "os": f"{platform.system()} {platform.release()}", "machine": platform.machine(), "packages": pkgs,
            "font": {"family": "DejaVu Sans", "file": font_rel, "sha256": sha256(font)}}


def delivery_lines(comp: dict) -> list[str]:
    pdfs = comp["requiredPDFs"]
    return ["## 필수 그림 PDF", "",
            f"표·그림 과학 판정 {comp['passed']}/{comp['total']} · PDF 인도 판정 {sum(p['pass'] for p in pdfs)}/4",
            "", "| 그림 | 파일 | PDF 판정 |", "|---|---|---|",
            *[f"| {p['item']} | `{p['path']}` | {p['reason']} |" for p in pdfs]]


def report_md(rep: dict) -> str:
    lines = ["# D03 원래 all 실행 결과", "", *attempt_lines(rep), "", f"자동 판정 합격(규칙 1–3단계): {rep.get('pass')}  (판정 통과 {rep['compare']['passed']}/{rep['compare']['total']}, "
             f"오프라인 조건 {rep['offline']['ok']})", "",
             "| 항목 | 판정 | 비고 |", "|---|---|---|"]
    for it in rep["compare"]["items"]:
        note = ""
        if "render" in it:
            r = it["render"]
            note = f"bytes {'=' if r.get('bytesEqual') else '≠'}, pixels {'=' if r.get('pixelsEqual') else '≠'}, 수치 {it['data']['values']}개, 문제 {len(it['data']['problems'])}"
            if caption := it["data"].get("caption"):
                note += f", 교정본 캡션 수치 {caption['matchedValues']}/{caption['totalValues']} 일치"
        elif "cells" in it:
            note = f"셀 {it['cells']}개, 차이 {len(it.get('cellDiffs', []))}"
        if "error" in it:
            note = " ".join(part for part in (it.get("path"), it["error"]) if part)
        lines.append(f"| {it['item']} | {it['verdict']} | {note} |")
    c = rep["compare"]
    lines.extend(["", *delivery_lines(c)])
    lines += ["", *secondary_lines(c),
              f"매니페스트: {rep['manifest']['files']}개, 누락 {len(rep['manifest']['missing'])}, 손상 {len(rep['manifest']['corrupt'])}, 추가 {len(rep['manifest']['extra'])}",
              f"오프라인 차단 사전 대조(의도적 차단): {rep['guard']['ok']}",
              f"재생성 오프라인 조건: {rep['offline']['ok']} (단계 {rep['offline']['steps']}개, 가드 시작 {rep['offline']['guardStarts']}건, "
              f"가드 없는 단계 {len(rep['offline']['stepsWithoutGuard'])}개, 차단 기록 {rep['offline']['blockedEvents']}건)",
              f"재생성 표: {', '.join(rep['regenerate'].get('tables', {}).values())}",
              f"출력 기록: outputs-manifest.json (생성 파일 {rep.get('outputsManifest', {}).get('generatedFileCount')}개)",
              f"실행 전후 패키지 불변: {rep.get('packageUnchanged')}", "육안 대조(규칙 4단계)는 독립 검토자가 따로 기록한다."]
    return "\n".join(lines) + "\n"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def new_attempt(command: str) -> dict:
    return {"command": command, "runId": str(uuid4()), "startedAt": utc_now(),
            "finishedAt": None, "status": "running"}


def atomic_text(path: Path, text: str) -> None:
    with tempfile.NamedTemporaryFile(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp",
                                     mode="w", encoding="utf-8", delete=False) as tmp:
        temp = Path(tmp.name)
        try:
            tmp.write(text)
        except BaseException:
            tmp.close()
            temp.unlink(missing_ok=True)
            raise
    try:
        for attempt in range(3):
            try:
                temp.replace(path)
                return
            except PermissionError:
                if attempt == 2:
                    raise
                time.sleep(0.05)
    finally:
        temp.unlink(missing_ok=True)


def atomic_json(path: Path, record: dict) -> None:
    atomic_text(path, json.dumps(record, ensure_ascii=False, indent=1) + "\n")


@contextmanager
def compare_lock(out: Path):
    """The OS releases this lock on exit. Keep the file to avoid inode races."""
    with (out / ".compare.lock").open("a+b") as lock:
        if os.name == "nt":
            import msvcrt
            lock.seek(0)
            try:
                msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
            except OSError as exc:
                if exc.errno not in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
                    raise
                yield False
                return
        else:
            import fcntl
            try:
                fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                yield False
                return
        yield True


def previous_success(out: Path) -> dict | None:
    for command, filename in (("compare", "compare.json"), ("all", "report.json")):
        try:
            rep = checks.read_json(out / filename)
        except (FileNotFoundError, checks.InvalidJSON):
            continue
        if rep.get("pass") is True and rep.get("status") in (None, "passed"):
            return {"command": command, "runId": rep.get("runId"), "startedAt": rep.get("startedAt"),
                    "finishedAt": rep.get("finishedAt"), "status": "passed",
                    "passed": rep.get("compare", rep).get("passed")}
        if isinstance(rep.get("lastSuccess"), dict):
            return rep["lastSuccess"]
    return None


def secondary_summary(comp: dict) -> dict:
    rows = comp["secondaryBlobEqual"]
    return {"secondaryTotal": len(rows),
            "secondaryWarnings": [row["path"] for row in rows if not row["bytesEqual"]]}


def attempt_lines(rep: dict) -> list[str]:
    end = rep["finishedAt"] or "—"
    return [f"실행 ID `{rep['runId']}` · 상태 `{rep['status']}`",
            f"시작 {rep['startedAt']} · 종료 {end} (UTC)"]


def secondary_lines(comp: dict) -> list[str]:
    if comp["secondaryTotal"] is None:
        return ["보조 파일 검사 미실행"]
    lines = [f"보조 파일 바이트 일치 {comp['secondaryEqualCount']}/{comp['secondaryTotal']}"]
    lines.extend(f"- 보조 파일 차이 경고 · `{path}`" for path in comp["secondaryWarnings"])
    return lines


def compare_markdown(rep: dict) -> str:
    lines = ["# D03 최근 재대조", "", *attempt_lines(rep)]
    last = rep.get("lastSuccess")
    if last:
        lines.append(f"직전 성공 · {last['command']} · 실행 ID {last.get('runId') or '기존 기록에 없음'}"
                     f" · 종료 {last.get('finishedAt') or '기존 기록에 없음'}")
    if rep.get("reason"):
        lines.append(f"사유 · {rep['reason']}")
    if rep.get("scientificPass") is None:
        lines.append("과학·필수 PDF·보조 파일 검사 결과 미확정")
    else:
        lines.extend(["", *delivery_lines(rep), "", *secondary_lines(rep)])
        for item in rep["items"]:
            if item["verdict"] not in ("MATCH", "MATCH-WITHIN-TOLERANCE"):
                lines.append(f"- {item['item']} · {item['verdict']} · {item.get('path', '')} {item.get('error', '')}".rstrip())
    return "\n".join(lines) + "\n"


def compare_attempt(pkg: Path, out: Path) -> int:
    if not out.is_dir() or not any((out / name).is_file() for name in ("runs.json", "report.json", "compare.json")):
        print("refuse: no runs.json, report.json or compare.json in the output directory")
        return 2
    with compare_lock(out) as acquired:
        if not acquired:
            print(json.dumps({"refuse": "another command is writing this output directory"}))
            return 2
        rep = {**new_attempt("compare"), "lastSuccess": previous_success(out), "pass": None,
               "scientificPass": None, "deliveryPass": None, "passed": None, "total": None,
               "requiredPDFs": [], "items": [], "secondaryBlobEqual": [],
               "secondaryTotal": None, "secondaryEqualCount": None, "secondaryWarnings": []}
        atomic_json(out / "compare.json", rep)
        atomic_text(out / "compare.md", compare_markdown(rep))
        code, manifest = evaluate_attempt(pkg, out, rep)
        rep["pass"] = code == 0
        rep["status"] = {0: "passed", 1: "failed", 2: "refused", 4: "refused"}[code]
        rep["finishedAt"] = utc_now()
        manifest.update({k: rep[k] for k in ("command", "runId", "startedAt", "finishedAt", "status",
                                             "pass", "scientificPass", "deliveryPass", "secondaryTotal",
                                             "secondaryEqualCount", "secondaryWarnings")})
        if "reason" in rep:
            manifest["reason"] = rep["reason"]
        atomic_json(out / "outputs-manifest.json", manifest)
        atomic_text(out / "compare.md", compare_markdown(rep))
        atomic_json(out / "compare.json", rep)
        keys = ("command", "runId", "startedAt", "finishedAt", "status", "lastSuccess", "pass", "passed", "total",
                "scientificPass", "deliveryPass", "requiredPDFs", "secondaryEqualCount", "secondaryTotal",
                "secondaryWarnings", "reason")
        public = {k: rep[k] for k in keys if k in rep}
        public["unavailable"] = [row for row in rep["items"] if row["verdict"] == "NOT-REPRODUCIBLE"]
        print(json.dumps(public, ensure_ascii=False))
        return code


def evaluate_attempt(pkg: Path, out: Path, rep: dict) -> tuple[int, dict]:
    try:
        runs = checks.read_json(out / "runs.json")
        if runs.get("ok") is not True:
            rep["reason"] = "runs.json: compare requires a successful regeneration"
            return 2, {}
        offline = runs.get("offline")
        if not isinstance(offline, dict) or offline.get("ok") is not True:
            rep["reason"] = "runs.json: regeneration did not establish offline execution"
            return 4, {}
        steps = runs.get("runs")
        if not isinstance(steps, list) or any(
            not isinstance(step, dict) or not isinstance(step.get("step"), str)
            or not isinstance(step.get("command"), list) or not isinstance(step.get("exit"), int) for step in steps
        ):
            rep["reason"] = "runs.json: invalid regeneration step records"
            return 2, {}
        manifest = verify_manifest(pkg, require_edition=True)
        if not manifest["ok"]:
            rep.update(reason="MANIFEST.json: package verification failed", manifest=manifest)
            return 2, {}
    except checks.InvalidJSON as exc:
        rep["reason"] = f"{exc.path.name}: {exc}"
        return 2, {}
    except FileNotFoundError as exc:
        rep["reason"] = f"{Path(exc.filename).name}: file missing"
        return 2, {}
    comp = compare(pkg, out)
    rep.update(comp)
    rep.update(secondary_summary(comp))
    manifest = output_manifest(pkg, out, runs, rep)
    return (0 if rep["scientificPass"] and rep["deliveryPass"] else 1), manifest


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["verify-manifest", "guard-check", "regenerate", "compare", "all"])
    ap.add_argument("--package", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    pkg = Path(a.package).resolve()
    if a.cmd == "verify-manifest":
        m = verify_manifest(pkg, require_edition=True)
        print(json.dumps(m, ensure_ascii=False))
        return 0 if m["ok"] else 2
    if not a.out:
        ap.error("--out is required")
    out = Path(a.out).resolve()
    if out == pkg or pkg in out.parents:
        print("refuse: --out must be outside the package")
        return 2
    if a.cmd == "compare":
        try:
            return compare_attempt(pkg, out)
        except OSError as exc:
            print(f"compare could not read or publish {Path(exc.filename).name if exc.filename else 'output'}: {type(exc).__name__}", file=sys.stderr)
            return 1
    if out.exists():
        print("refuse: --out already exists; use a new path")
        return 2
    if a.cmd == "regenerate":
        m = verify_manifest(pkg, require_edition=True)
        if not m["ok"]:
            print(json.dumps({"refuse": "damaged or incomplete package; nothing regenerated", **m}, ensure_ascii=False))
            return 2
    out.mkdir(parents=True)
    (out / "logs").mkdir()
    if a.cmd == "guard-check":
        g = guard_check(out)
        print(json.dumps(g, ensure_ascii=False))
        return 0 if g["ok"] else 3
    if a.cmd == "regenerate":
        r = regenerate(pkg, out)
        (out / "runs.json").write_text(json.dumps(r, indent=1), encoding="utf-8")
        print(json.dumps({"ok": r["ok"], "offline": r["offline"]["ok"]}))
        return 1 if not r["ok"] else (0 if r["offline"]["ok"] else 4)
    with compare_lock(out) as acquired:
        if not acquired:
            print(json.dumps({"refuse": "another command is writing this output directory"}))
            return 2
        return run_all(pkg, out)


def early_all_result(out: Path, rep: dict, reason: str, code: int) -> int:
    rep.update(status="failed", finishedAt=utc_now(), reason=reason)
    rep["pass"] = False
    atomic_text(out / "report.md", "\n".join(["# D03 원래 all 실행", "", *attempt_lines(rep), reason]) + "\n")
    atomic_json(out / "report.json", rep)
    print(json.dumps(rep, ensure_ascii=False))
    return code


def run_all(pkg: Path, out: Path) -> int:
    t0 = time.perf_counter()
    rep: dict = {**new_attempt("all"), "package": {}}
    atomic_json(out / "report.json", rep)
    m = verify_manifest(pkg, require_edition=True)
    rep["manifest"] = m
    if not m["ok"]:
        return early_all_result(out, rep, "MANIFEST.json: package verification failed", 2)
    before = snapshot(pkg)
    meta = json.loads((pkg / "MANIFEST.json").read_text(encoding="utf-8"))
    rep["package"] = {k: meta[k] for k in ("baseCommit", "manuscriptBlob", "toolsCommit", "createdFor") if k in meta}
    rep["guard"] = guard_check(out)
    if not rep["guard"]["ok"]:
        return early_all_result(out, rep, "offline guard check failed", 3)
    try:
        rep["regenerate"] = regenerate(pkg, out)
    except checks.InvalidJSON as exc:
        rel = exc.path.relative_to(out if exc.path.is_relative_to(out) else pkg)
        return early_all_result(out, rep, f"{rel.as_posix()}: {exc}", 1)
    (out / "runs.json").write_text(json.dumps(rep["regenerate"], indent=1), encoding="utf-8")
    rep["compare"] = compare(pkg, out) if rep["regenerate"]["ok"] else {"items": [], "passed": 0, "total": 7, "secondaryBlobEqual": [], "secondaryEqualCount": 0}
    comp = rep["compare"]
    if not rep["regenerate"]["ok"]:
        comp.update(scientificPass=False, deliveryPass=False, requiredPDFs=[])
    comp.update(command="all", runId=rep["runId"], **secondary_summary(comp))
    if not rep["regenerate"]["ok"]:
        comp.update(secondaryTotal=None, secondaryEqualCount=None)
    rep["packageUnchanged"] = snapshot(pkg) == before
    rep["offline"] = rep["regenerate"]["offline"]
    rep["networkGuardStarts"] = rep["offline"]["guardStarts"]
    rep["networkBlocked"] = rep["offline"]["blockedEvents"]
    rep["environment"] = environment()
    rep["seconds"] = round(time.perf_counter() - t0, 1)
    rep["scientificPass"] = comp["scientificPass"]
    rep["deliveryPass"] = comp["deliveryPass"]
    rep["pass"] = rep["scientificPass"] and rep["deliveryPass"] and rep["packageUnchanged"] and rep["guard"]["ok"] and rep["offline"]["ok"]
    rep["passScope"] = "automated scientific, offline and PDF delivery checks; reviewer records the human visual check separately"
    rep.update(status="passed" if rep["pass"] else "failed", finishedAt=utc_now())
    if rep["regenerate"]["ok"]:
        rep["outputsManifest"] = output_manifest(pkg, out, rep["regenerate"], comp)
        rep["outputsManifest"].update({key: rep[key] for key in ("runId", "startedAt", "finishedAt", "status")})
        atomic_json(out / "outputs-manifest.json", rep["outputsManifest"])
    atomic_json(out / "env.json", rep["environment"])
    atomic_text(out / "report.md", report_md(rep))
    atomic_json(out / "report.json", rep)
    summary = {key: rep[key] for key in ("command", "runId", "startedAt", "finishedAt", "status", "pass",
                                         "scientificPass", "deliveryPass", "seconds")}
    summary.update({key: comp[key] for key in ("passed", "total", "requiredPDFs", "secondaryEqualCount",
                                               "secondaryTotal", "secondaryWarnings")})
    summary["offline"] = rep["offline"]["ok"]
    print(json.dumps(summary, ensure_ascii=False))
    if rep["pass"]:
        return 0
    if rep["regenerate"]["ok"] and not rep["offline"]["ok"]:
        return 4
    return 1


if __name__ == "__main__":
    sys.exit(main())
