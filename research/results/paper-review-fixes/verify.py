"""Re-verification for the paper-review-fixes task (2026-11-13). Reads committed results only; no model calls.

What it checks
  1. Experiment 3 (s3-heldout): output-token caps from config.json, stop reasons of the active attempt, stored compact
     summaries, condition order per session, session-mean costs. Recount of review P1/P3 numbers.
  2. Experiment 2 (exp2-heldout): arm D promptTokens per query (the figure 2 x value) versus per API call.
  3. Figures: runs the figure generator at the base commit and in the working tree with the same data, captures every
     error-bar point (x, y, lower, upper) and asserts they are identical; reports the x label and label overlaps
     (label-label, label-marker, label-error bar, label-legend) in display coordinates. Images go to a temp folder.
  4. Manuscript: relative links resolve, table rows have the header's column count, figure 2 unit wording.

Usage (from research/): python results/paper-review-fixes/verify.py [--base <commit>] [--out <json>]
Exit code 1 when any required check fails (RED before the fix, GREEN after).
"""
import argparse
import collections
import glob
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

sys.dont_write_bytecode = True  # do not leave __pycache__ next to the figure scripts

RESEARCH = Path(__file__).resolve().parents[2]
REPO = RESEARCH.parent
PAPER = REPO / "docs/research/image-first-paper-draft.ko.md"
EXP2_README = RESEARCH / "figures/exp2/README.md"
UNIT_EN = "Mean total input tokens per query (including re-requests)"
UNIT_KO = "재요청을 포함한 질의당 평균 총 입력 토큰"
EXP2_RUNS = {"heldout": ("results/exp2-heldout/gpt4o", "results/exp2-heldout/haiku"),
             "calibration-v2": ("results/exp2-cal-gpt4o-v2", "results/exp2-cal-haiku-v2")}


def jsonl(path):
    return [json.loads(line) for line in Path(path).read_text(encoding="utf-8").splitlines() if line.strip()]


# ---------------------------------------------------------------- 1. experiment 3
def exp3():
    out = {}
    for p in ["gpt4o", "haiku"]:
        d = RESEARCH / "results/s3-heldout" / p
        cfg = json.loads((d / "config.json").read_text(encoding="utf-8"))
        results = [json.loads(Path(f).read_text(encoding="utf-8")) for f in sorted(glob.glob(str(d / "*.S?.json")))]
        calls = jsonl(d / "calls.jsonl")
        active = {(r["session"], r["condition"]): r.get("attemptId") for r in results}
        # Same selection as session-summarize.mjs: results with an attemptId count only that attempt's calls.
        act = [c for c in calls if (c["session"], c["condition"]) in active
               and (not active[(c["session"], c["condition"])] or c["attemptId"] == active[(c["session"], c["condition"])])]
        has_stop = sum(1 for c in act if "stopReason" in c or "finishReason" in c)

        def cap(c):
            if c["kind"] == "compact":
                return 400
            if p == "haiku" and c["condition"] in ("S2", "S3"):
                return cfg.get("toolMaxTokens")
            return cfg["maxTokens"]

        stops = collections.Counter(f'{c["condition"]}/{c["kind"]}/{c.get("stopReason")}' for c in act)
        denom = collections.Counter(f'{c["condition"]}/{c["kind"]}' for c in act)
        max_tokens_by_turn = collections.Counter(f'{c["condition"]}/{c["kind"]}/turn{c["turn"]}' for c in act if c.get("stopReason") == "max_tokens")
        at_cap = collections.Counter(f'{c["condition"]}/{c["kind"]}' for c in act if c["usage"]["completion"] >= cap(c))
        compact_completion = [c["usage"]["completion"] for c in act if c["kind"] == "compact"]
        summaries = collections.Counter()
        for r in results:
            for t in r["turns"]:
                if t.get("compactedAfter"):
                    summaries[f'{r["condition"]}/{"stored" if (t.get("summary") or "").strip() else "empty"}'] += 1
        order = collections.Counter()
        for s in sorted({c["session"] for c in act}):
            seq = []
            for c in act:
                if c["session"] == s and (not seq or seq[-1] != c["condition"]):
                    seq.append(c["condition"])
            order["->".join(seq)] += 1
        table = json.loads((d / "summary.json").read_text(encoding="utf-8"))["table"]
        s0 = table["S0"]
        cost = {c: {"accuracy": t["accuracy"], "lateRecall": t["byGroup"]["late"], "meanPromptTokens": t["meanPromptTokens"],
                    "listUsd": t["meanListCostUsd"], "cacheUsd": t["meanCacheViewCostUsd"],
                    "listSavingVsS0": 1 - t["meanListCostUsd"] / s0["meanListCostUsd"],
                    "cacheSavingVsS0": 1 - t["meanCacheViewCostUsd"] / s0["meanCacheViewCostUsd"]} for c, t in table.items()}
        out[p] = {
            "config": {k: cfg.get(k) for k in ["model", "maxTokens", "toolRounds", "toolMaxTokens", "compactAfterTurns"]},
            "resultFiles": len(results), "callsInFile": len(calls), "activeCalls": len(act),
            "activeCallsWithStopReasonField": has_stop, "models": dict(collections.Counter(c["model"] for c in act)),
            "callsByConditionKind": dict(sorted(denom.items())), "stopReasons": dict(sorted(stops.items())),
            "maxTokensStopsByTurn": dict(sorted(max_tokens_by_turn.items())),
            "completionAtCap": dict(sorted(at_cap.items())), "compactCompletionMax": max(compact_completion),
            "compactSummaries": dict(sorted(summaries.items())), "conditionOrderPerSession": dict(order),
            "sessionMeans": cost,
        }
    return out


# ---------------------------------------------------------------- 2. experiment 2
def exp2():
    out = {}
    for p in ["gpt4o", "haiku"]:
        rows = [r for r in jsonl(RESEARCH / "results/exp2-heldout" / p / "graded.jsonl") if r["outcome"] != "not_started"]
        d = [r for r in rows if r["arm"] == "D"]
        total = sum(r["promptTokens"] for r in d)
        rq = sum(1 for r in d if r.get("requeried"))
        out[p] = {"Dqueries": len(d), "DpromptTokensTotal": total, "Drequeries": rq, "Dcalls": len(d) + rq,
                  "perQuery": total / len(d), "perCall": total / (len(d) + rq),
                  "promptTokensMissing": sum(1 for r in rows if r.get("promptTokens") is None)}
    return out


# ---------------------------------------------------------------- 3. figures
def load_module(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def capture(fig, label):
    from matplotlib.container import ErrorbarContainer
    fig.canvas.draw()
    r = fig.canvas.get_renderer()
    panels = []
    for ax in fig.axes:
        points, boxes = [], []
        for cont in ax.containers:
            if isinstance(cont, ErrorbarContainer):
                data_line, _caps, cols = cont.lines
                (x, y), = data_line.get_xydata().tolist()
                seg = cols[0].get_segments()[0] if cols else [[x, y], [x, y]]
                points.append({"x": x, "y": y, "lo": float(min(seg[0][1], seg[1][1])), "hi": float(max(seg[0][1], seg[1][1]))})
                ms = data_line.get_markersize() * fig.dpi / 72
                px, py = ax.transData.transform((x, y))
                boxes.append(("marker", px - ms / 2, py - ms / 2, px + ms / 2, py + ms / 2))
                lo = ax.transData.transform((x, points[-1]["lo"]))
                hi = ax.transData.transform((x, points[-1]["hi"]))
                boxes.append(("errorbar", lo[0] - 0.5, lo[1], lo[0] + 0.5, hi[1]))
        texts = []
        for t in ax.texts:
            b = t.get_window_extent(r)
            texts.append((t.get_text(), t.get_color(), b.x0, b.y0, b.x1, b.y1))
        leg = ax.get_legend()
        if leg is not None:
            b = leg.get_window_extent(r)
            boxes.append(("legend", b.x0, b.y0, b.x1, b.y1))
        fw, fh = fig.get_size_inches() * fig.dpi

        def hit(a, b):
            return min(a[2], b[2]) - max(a[0], b[0]) > 0.5 and min(a[3], b[3]) - max(a[1], b[1]) > 0.5

        overlaps = []
        for i, a in enumerate(texts):
            for b in texts[i + 1:]:
                if hit(a[2:], b[2:]):
                    overlaps.append(f"label {a[0]}({a[1]}) x label {b[0]}({b[1]})")
            for b in boxes:
                if hit(a[2:], b[1:]):
                    overlaps.append(f"label {a[0]}({a[1]}) x {b[0]}")
            # Labels may sit past the axes frame (annotations are not clipped); they must stay on the canvas.
            if a[2] < 0 or a[4] > fw or a[3] < 0 or a[5] > fh:
                overlaps.append(f"label {a[0]}({a[1]}) outside canvas")
        xl = ax.xaxis.label.get_window_extent(r)
        panels.append({"xlabel": ax.get_xlabel(), "xlabelInsideFigure": bool(xl.x0 >= 0 and xl.x1 <= fw),
                       "points": points, "overlaps": sorted(overlaps)})
    return {"figure": label, "sizeCm": [round(v * 2.54, 3) for v in fig.get_size_inches()], "panels": panels}


def run_generators(script_dir, tag, outdir):
    """Import exp2_figures.py and make_figures.py from script_dir; run them on the committed data; capture figures."""
    import matplotlib.pyplot as plt
    captured = []
    mod = load_module(script_dir / "exp2_figures.py", f"exp2_figures_{tag}")
    mod.ROOT = RESEARCH

    def save(fig, out, name):
        captured.append(capture(fig, f"exp2/{out.name}/{name}"))
        fig.savefig(outdir / f"{tag}-{out.name}-{name}.png", dpi=200)
        plt.close(fig)
    mod.save = save
    for run_tag, (g, h) in EXP2_RUNS.items():
        data = {"gpt4o": mod.load(g), "haiku": mod.load(h)}
        mod.fig5_accuracy_tokens(data, Path(run_tag))
    mk = load_module(script_dir / "make_figures.py", f"make_figures_{tag}")
    mk.ROOT = RESEARCH

    def save2(fig, name):
        captured.append(capture(fig, name))
        fig.savefig(outdir / f"{tag}-{name}.png", dpi=200)
        plt.close(fig)
    mk.save = save2
    mk.fig2_accuracy_tokens(mk.load_sessions())
    return captured


def figures(base):
    tmp = Path(tempfile.mkdtemp(prefix="paper-fixes-figs-"))
    old_dir = tmp / "base"
    old_dir.mkdir()
    for f in ["exp2_figures.py", "make_figures.py"]:
        src = subprocess.run(["git", "show", f"{base}:research/figures/{f}"], cwd=REPO, capture_output=True, check=True).stdout
        (old_dir / f).write_bytes(src)
    old = run_generators(old_dir, "base", tmp)
    new = run_generators(RESEARCH / "figures", "work", tmp)
    same = all(o["figure"] == n["figure"] and [p["points"] for p in o["panels"]] == [p["points"] for p in n["panels"]]
               and o["sizeCm"] == n["sizeCm"] for o, n in zip(old, new)) and len(old) == len(new)
    return {"tempDir": str(tmp), "coordinatesIdentical": same, "base": old, "work": new}


# ---------------------------------------------------------------- 4. manuscript
def manuscript():
    text = PAPER.read_text(encoding="utf-8")
    broken = []
    for m in re.finditer(r"\]\(([^)#\s]+)(#[^)]*)?\)", text):
        target = m.group(1)
        if target.startswith("http"):
            continue
        if not (PAPER.parent / target).resolve().exists():
            broken.append(target)
    tables, bad_rows = 0, []
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if line.startswith("|") and i + 1 < len(lines) and re.match(r"^\|[-:| ]+\|$", lines[i + 1]):
            tables += 1
            n = line.count("|")
            j = i + 1
            while j < len(lines) and lines[j].startswith("|"):
                if lines[j].replace("\\|", "").count("|") != n:
                    bad_rows.append(j + 1)
                j += 1
    fig2 = [l for l in lines if "그림 2" in l]
    readme = EXP2_README.read_text(encoding="utf-8")
    control = sum(1 for ch in text if ord(ch) < 32 and ch not in "\n\t\r")
    return {"brokenLinks": broken, "tables": tables, "badTableRows": bad_rows, "controlChars": control,
            # Alt text names the axis unit only; the caption may contrast it with the per-call value on purpose.
            "fig2AltTextPerCall": any("호출당" in l for l in fig2 if l.startswith("![")),
            "fig2AltTextQueryUnit": any(UNIT_KO in l for l in fig2 if l.startswith("![")),
            "fig2CaptionQueryUnit": any(UNIT_KO in l and UNIT_EN in l for l in fig2 if l.startswith("그림 2.")),
            "readmePerCall": "per call" in readme.lower() or "호출당" in readme,
            "readmeQueryUnit": UNIT_EN.lower() in readme.lower() and UNIT_KO in readme}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="5d668f9af672ad70d29d7e4093a14fe4cd6b0eb3")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    res = {"base": args.base, "exp3": exp3(), "exp2": exp2(), "figures": figures(args.base), "manuscript": manuscript()}
    e3, e2, fg, ms = res["exp3"], res["exp2"], res["figures"], res["manuscript"]
    h, g = e3["haiku"], e3["gpt4o"]
    checks = {
        # recount of the review numbers (data unchanged, so these hold before and after the fix)
        "P1 haiku S1 compact max_tokens 24/48": h["stopReasons"].get("S1/compact/max_tokens") == 24 and h["callsByConditionKind"]["S1/compact"] == 48,
        "P1 haiku S3 compact max_tokens 1/48": h["stopReasons"].get("S3/compact/max_tokens") == 1 and h["callsByConditionKind"]["S3/compact"] == 48,
        "P1 haiku S1 turn max_tokens 2/192": h["stopReasons"].get("S1/turn/max_tokens") == 2 and h["callsByConditionKind"]["S1/turn"] == 192,
        "P1 gpt4o 1453 active calls without stop reason": g["activeCalls"] == 1453 and g["activeCallsWithStopReasonField"] == 0,
        "P1 caps 60/512/400, tool rounds 3": g["config"]["maxTokens"] == 60 and h["config"]["toolMaxTokens"] == 512 and g["config"]["toolRounds"] == 3 == h["config"]["toolRounds"],
        "P2 gpt4o D 91438/144": e2["gpt4o"]["DpromptTokensTotal"] == 91438 and e2["gpt4o"]["Dqueries"] == 144 and e2["gpt4o"]["Dcalls"] == 155,
        "P2 haiku D 110139/144": e2["haiku"]["DpromptTokensTotal"] == 110139 and e2["haiku"]["Dqueries"] == 144 and e2["haiku"]["Dcalls"] == 160,
        "P3 gpt4o S3 cache 0.0499388, 3.5% vs S0": round(g["sessionMeans"]["S3"]["cacheUsd"], 7) == 0.0499388 and round(g["sessionMeans"]["S3"]["cacheSavingVsS0"] * 100, 1) == 3.5,
        "order S0..S4 in all 24 sessions": all(e3[p]["conditionOrderPerSession"] == {"S0->S1->S2->S3->S4": 24} for p in e3),
        # fix checks (fail at the base commit)
        "P2 figure coordinates identical to base": fg["coordinatesIdentical"],
        "P2 exp2 fig5 x label is per query": all(p["xlabel"].replace("\n", " ") == UNIT_EN for f in fg["work"] if f["figure"].startswith("exp2/") for p in f["panels"]),
        "P2 x labels fit the canvas": all(p["xlabelInsideFigure"] for f in fg["work"] for p in f["panels"]),
        "P2 no label overlaps in fig5/fig2": all(not p["overlaps"] for f in fg["work"] for p in f["panels"]),
        "P2 manuscript figure 2 unit": ms["fig2AltTextQueryUnit"] and ms["fig2CaptionQueryUnit"] and not ms["fig2AltTextPerCall"],
        "P2 README unit": ms["readmeQueryUnit"] and not ms["readmePerCall"],
        "manuscript links resolve": not ms["brokenLinks"],
        "manuscript tables well formed": not ms["badTableRows"],
        "manuscript control chars 0": ms["controlChars"] == 0,
    }
    res["checks"] = checks
    if args.out:
        saved = dict(res, figures={k: v for k, v in fg.items() if k != "tempDir"})  # the temp path differs per run
        Path(args.out).write_text(json.dumps(saved, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    for k, v in checks.items():
        print(("PASS " if v else "FAIL ") + k)
    for f in fg["work"]:
        for p in f["panels"]:
            if p["overlaps"]:
                print("  overlaps", f["figure"], p["overlaps"])
    print("figures temp:", fg["tempDir"])
    sys.exit(0 if all(checks.values()) else 1)


if __name__ == "__main__":
    main()
