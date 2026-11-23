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
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # the package is read-only: no __pycache__ inside it
sys.path.insert(0, str(HERE))
import d03_checks as checks  # noqa: E402

SECRET_ENV = re.compile(r"(API_KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|_KEY$|^OPENAI|^ANTHROPIC|^BAZE|^GEMINI|^GOOGLE_API)", re.I)
MODELS = ["gpt4o", "haiku"]


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def snapshot(pkg: Path) -> dict[str, str]:
    return {p.relative_to(pkg).as_posix(): sha256(p) for p in sorted(pkg.rglob("*")) if p.is_file()}


# ---------------------------------------------------------------- manifest

def verify_manifest(pkg: Path) -> dict:
    mpath = pkg / "MANIFEST.json"
    if not mpath.is_file():
        return {"ok": False, "missing": ["MANIFEST.json"], "corrupt": [], "extra": [], "files": 0}
    manifest = json.loads(mpath.read_text(encoding="utf-8"))
    listed = {f["path"]: f for f in manifest["files"]}
    missing, corrupt = [], []
    for path, f in listed.items():
        p = pkg / path
        if not p.is_file():
            missing.append(path)
        elif p.stat().st_size != f["bytes"] or sha256(p) != f["sha256"]:
            corrupt.append(path)
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
            shutil.copy2(src / n, dst / n)


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
    started the guard under that step's name (D03_STEP), and nothing was blocked. Matching by step name rather than
    process id keeps launchers (a Windows venv python.exe starts the real interpreter as a child) from failing a run
    that stayed offline."""
    netlog = out / "logs" / "network.jsonl"
    events = [json.loads(x) for x in netlog.read_text(encoding="utf-8").splitlines() if x] if netlog.is_file() else []
    started = {(e.get("step"), e.get("lang")) for e in events if e["event"] == "guard"}
    unguarded = [r["step"] for r in runs if (r["step"], step_lang(r)) not in started]
    blocked = [e for e in events if e["event"] == "blocked"]
    return {"ok": bool(runs) and not unguarded and not blocked, "steps": len(runs),
            "guardStarts": sum(1 for e in events if e["event"] == "guard"), "stepsWithoutGuard": unguarded,
            "blockedEvents": len(blocked), "blockedKinds": sorted({e.get("kind", "") for e in blocked}),
            "blockedSteps": sorted({e.get("step", "") for e in blocked})}


def step_lang(run_record: dict) -> str:
    return "node" if Path(run_record["command"][0]).name.lower().startswith("node") else "python"


# ---------------------------------------------------------------- compare

def compare(pkg: Path, out: Path) -> dict:
    exp = pkg / "expected"
    gen = out / "generated"
    ms = exp / "manuscript" / "image-first-paper-draft.ko.md"
    items = []

    def guarded(item, fn):
        try:
            items.append(fn())
        except (FileNotFoundError, KeyError) as e:
            items.append({"item": item, "verdict": "NOT-REPRODUCIBLE", "error": f"{type(e).__name__}: {e}"})

    guarded("T1", lambda: checks.check_t1(ms, exp / "table1-spec.json", exp / "provenance/table1-abdaade.md", exp / "provenance/ieee-references.md", gen))
    guarded("T2", lambda: checks.check_t2(ms, gen))
    guarded("T3", lambda: checks.check_t3(ms, gen))
    probe_mf = json.loads((out / "probe-make_figures.json").read_text(encoding="utf-8")) if (out / "probe-make_figures.json").is_file() else {}
    probe_e2 = json.loads((out / "probe-exp2_figures.json").read_text(encoding="utf-8")) if (out / "probe-exp2_figures.json").is_file() else {}
    s3 = {}
    if all((gen / f"s3-heldout/{m}/analysis.json").is_file() for m in MODELS):
        s3 = {m: json.loads((gen / f"s3-heldout/{m}/analysis.json").read_text(encoding="utf-8")) for m in MODELS}
    sessions = gen / "figures/data/heldout-sessions.json"
    figs = [("F1", "fig1_rq1_billed_tokens", probe_mf, lambda p: checks.check_f1(p, pkg / "research/results/rq1-sweep-001/rows.jsonl"), "figures"),
            ("F2", "fig5_exp2_accuracy_vs_tokens", probe_e2, lambda p: checks.check_f2(p, {m: gen / f"exp2-heldout/{m}/graded.jsonl" for m in MODELS}), "figures/exp2/heldout"),
            ("F3", "fig2_heldout_accuracy_vs_tokens", probe_mf, lambda p: checks.check_f3(p, sessions, s3), "figures"),
            ("F4", "fig3_heldout_late_recall", probe_mf, lambda p: checks.check_f4(p, sessions, s3), "figures")]
    for item, stem, probe, fn, sub in figs:
        guarded(item, lambda: checks.figure_verdict(item, fn(probe[stem]), checks.render_compare(gen / sub / f"{stem}.png", exp / sub / f"{stem}.png")))
    secondary = []
    for p in sorted((exp / "results").rglob("*")):
        if p.is_file():
            rel = p.relative_to(exp / "results").as_posix()
            g = gen / rel
            secondary.append({"path": rel, "bytesEqual": g.is_file() and g.read_bytes() == p.read_bytes()})
    passed = sum(1 for i in items if i["verdict"] in ("MATCH", "MATCH-WITHIN-TOLERANCE"))
    return {"items": items, "passed": passed, "total": len(items), "secondaryBlobEqual": secondary,
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
    return {"inputManifest": {"path": "MANIFEST.json", "sha256": sha256(pkg / "MANIFEST.json")},
            "package": {k: json.loads((pkg / "MANIFEST.json").read_text(encoding="utf-8")).get(k) for k in ["baseCommit", "manuscriptBlob"]},
            "items": items, "generatedFiles": all_files, "generatedFileCount": len(all_files)}


# ---------------------------------------------------------------- environment

def environment() -> dict:
    from importlib import metadata

    node = subprocess.run(["node", "-v"], capture_output=True, text=True).stdout.strip()
    pkgs = {}
    for name in ["matplotlib", "numpy", "pillow", "contourpy", "cycler", "fonttools", "kiwisolver", "packaging",
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


def report_md(rep: dict) -> str:
    lines = ["# D03 재현 결과", "", f"자동 판정 합격(규칙 1–3단계): {rep.get('pass')}  (판정 통과 {rep['compare']['passed']}/{rep['compare']['total']}, "
             f"오프라인 조건 {rep['offline']['ok']})", "",
             "| 항목 | 판정 | 비고 |", "|---|---|---|"]
    for it in rep["compare"]["items"]:
        note = ""
        if "render" in it:
            r = it["render"]
            note = f"bytes {'=' if r.get('bytesEqual') else '≠'}, pixels {'=' if r.get('pixelsEqual') else '≠'}, 수치 {it['data']['values']}개, 문제 {len(it['data']['problems'])}"
        elif "cells" in it:
            note = f"셀 {it['cells']}개, 차이 {len(it.get('cellDiffs', []))}"
        if "error" in it:
            note = it["error"]
        lines.append(f"| {it['item']} | {it['verdict']} | {note} |")
    c = rep["compare"]
    lines += ["", f"보조: 기준 산출물 바이트 일치 {c['secondaryEqualCount']}/{len(c['secondaryBlobEqual'])}",
              f"매니페스트: {rep['manifest']['files']}개, 누락 {len(rep['manifest']['missing'])}, 손상 {len(rep['manifest']['corrupt'])}, 추가 {len(rep['manifest']['extra'])}",
              f"오프라인 차단 사전 대조(의도적 차단): {rep['guard']['ok']}",
              f"재생성 오프라인 조건: {rep['offline']['ok']} (단계 {rep['offline']['steps']}개, 가드 시작 {rep['offline']['guardStarts']}건, "
              f"가드 없는 단계 {len(rep['offline']['stepsWithoutGuard'])}개, 차단 기록 {rep['offline']['blockedEvents']}건)",
              f"재생성 표: {', '.join(rep['regenerate'].get('tables', {}).values())}",
              f"출력 기록: outputs-manifest.json (생성 파일 {rep.get('outputsManifest', {}).get('generatedFileCount')}개)",
              f"실행 전후 패키지 불변: {rep.get('packageUnchanged')}", "육안 대조(규칙 4단계)는 독립 검토자가 따로 기록한다."]
    return "\n".join(lines) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["verify-manifest", "guard-check", "regenerate", "compare", "all"])
    ap.add_argument("--package", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    pkg = Path(a.package).resolve()
    if a.cmd == "verify-manifest":
        m = verify_manifest(pkg)
        print(json.dumps(m, ensure_ascii=False))
        return 0 if m["ok"] else 2
    if not a.out:
        ap.error("--out is required")
    out = Path(a.out).resolve()
    if out == pkg or pkg in out.parents:
        print("refuse: --out must be outside the package")
        return 2
    if a.cmd == "compare":
        runs = out / "runs.json"
        r = json.loads(runs.read_text(encoding="utf-8")) if runs.is_file() else {}
        if not r.get("ok"):
            print("refuse: compare needs an --out made by a successful regenerate (runs.json); the report of `all` is the evidence")
            return 2
        if not r.get("offline", {}).get("ok"):
            print(json.dumps({"refuse": "the regeneration in --out did not stay offline", "offline": r.get("offline")}))
            return 4
        rep = compare(pkg, out)
        (out / "compare.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
        (out / "outputs-manifest.json").write_text(json.dumps(output_manifest(pkg, out, r, rep), ensure_ascii=False, indent=1), encoding="utf-8")
        print(json.dumps({"passed": rep["passed"], "total": rep["total"]}))
        return 0 if rep["passed"] == 7 else 1
    if out.exists():
        print("refuse: --out already exists; use a new path")
        return 2
    if a.cmd == "regenerate":
        m = verify_manifest(pkg)
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
    t0 = time.perf_counter()
    rep: dict = {"package": {}}
    m = verify_manifest(pkg)
    rep["manifest"] = m
    if not m["ok"]:
        (out / "report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
        print(json.dumps(m, ensure_ascii=False))
        return 2
    before = snapshot(pkg)
    meta = json.loads((pkg / "MANIFEST.json").read_text(encoding="utf-8"))
    rep["package"] = {k: meta.get(k) for k in ["baseCommit", "manuscriptBlob", "createdFor"]}
    rep["guard"] = guard_check(out)
    if not rep["guard"]["ok"]:
        (out / "report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
        return 3
    rep["regenerate"] = regenerate(pkg, out)
    (out / "runs.json").write_text(json.dumps(rep["regenerate"], indent=1), encoding="utf-8")
    rep["compare"] = compare(pkg, out) if rep["regenerate"]["ok"] else {"items": [], "passed": 0, "total": 7, "secondaryBlobEqual": [], "secondaryEqualCount": 0}
    rep["packageUnchanged"] = snapshot(pkg) == before
    rep["offline"] = rep["regenerate"]["offline"]
    rep["networkGuardStarts"] = rep["offline"]["guardStarts"]
    rep["networkBlocked"] = rep["offline"]["blockedEvents"]
    if rep["regenerate"]["ok"]:
        rep["outputsManifest"] = output_manifest(pkg, out, rep["regenerate"], rep["compare"])
        (out / "outputs-manifest.json").write_text(json.dumps(rep["outputsManifest"], ensure_ascii=False, indent=1), encoding="utf-8")
    rep["environment"] = environment()
    rep["seconds"] = round(time.perf_counter() - t0, 1)
    rep["scientificPass"] = rep["compare"]["passed"] == 7
    rep["pass"] = rep["scientificPass"] and rep["packageUnchanged"] and rep["guard"]["ok"] and rep["offline"]["ok"]
    rep["passScope"] = "automated rules steps 1-3; the visual check (step 4) is recorded separately by the reviewer"
    (out / "env.json").write_text(json.dumps(rep["environment"], ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "report.json").write_text(json.dumps(rep, ensure_ascii=False, indent=1), encoding="utf-8")
    (out / "report.md").write_text(report_md(rep), encoding="utf-8")
    print(json.dumps({"pass": rep["pass"], "passed": rep["compare"]["passed"], "offline": rep["offline"]["ok"], "seconds": rep["seconds"]}))
    if rep["pass"]:
        return 0
    if rep["regenerate"]["ok"] and not rep["offline"]["ok"]:
        return 4
    return 1


if __name__ == "__main__":
    sys.exit(main())
