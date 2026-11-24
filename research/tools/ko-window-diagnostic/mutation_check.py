"""Mutation check of the independent recount on the real output (protocol section 8).

Each mutation alters per-page values of a JS pages.jsonl while keeping the 24-row count and the marginals of the
altered field; three of them also leave every summary cross-tab unchanged. The recount must reject every mutation and
name exactly the altered pages. The unmodified file must pass.

Usage (from research/): python tools/ko-window-diagnostic/mutation_check.py --run a --dir <run dir> --work <new folder> --out <file>
"""
import argparse
import copy
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import recount as rc  # noqa: E402


def swap(rows, i, j, fields):
    out = copy.deepcopy(rows)
    for f in fields:
        out[i][f], out[j][f] = out[j][f], out[i][f]
    return out


def find(rows, **want):
    return next(k for k, r in enumerate(rows) if all(r[f] == v for f, v in want.items()))


def mutations(rows):
    a = find(rows, role="primary", lineClass="anchorCue", containment="anchorOnly", layout="slip")
    o = find(rows, role="primary", lineClass="otherItemOnly", containment="valueOnly")
    n = find(rows, role="primary", containment="neither")
    s1 = find(rows, role="primary", layout="slip", lineClass="anchorCue", doctype="rental")
    s2 = next(k for k, r in enumerate(rows) if k != s1 and r["role"] == "primary" and r["layout"] == "slip" and r["lineClass"] == "anchorCue" and r["doctype"] == "rental" and r["k1Score"] != rows[s1]["k1Score"])
    return [
        ("lineClass swapped between two pages (lineClass marginals unchanged)", swap(rows, a, o, ["lineClass"]), {a, o}),
        ("containment, anchorContained, valueContained swapped (containment marginals unchanged)", swap(rows, o, n, ["containment", "anchorContained", "valueContained"]), {o, n}),
        ("k1Score swapped between two anchor-cue pages (every summary value unchanged)", swap(rows, s1, s2, ["k1Score"]), {s1, s2}),
        ("valueDeficit and requiredExpansion swapped between two slip pages (every summary value unchanged)", swap(rows, s1, s2, ["valueDeficit", "requiredExpansion"]), {s1, s2}),
        ("lineIndex swapped between two anchor-cue pages (every summary value unchanged)", swap(rows, s1, s2, ["lineIndex"]), {s1, s2}),
    ]


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, choices=("a", "b"))
    ap.add_argument("--dir", required=True)
    ap.add_argument("--work", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    for p in (a.work, a.out):
        if os.path.exists(p):
            raise SystemExit(f"must not exist yet: {p}")
    os.makedirs(a.work)
    summary = os.path.join(a.dir, "summary.json")
    rows = [json.loads(l) for l in open(os.path.join(a.dir, "pages.jsonl"), encoding="utf-8").read().split("\n") if l.strip()]
    base = rc.recount(a.run, os.path.join(a.dir, "pages.jsonl"), summary)
    results = [{"mutation": "none", "ok": base["ok"], "expectOk": True, "passed": base["ok"] is True}]
    for k, (name, mutated, idx) in enumerate(mutations(rows)):
        f = os.path.join(a.work, f"pages-m{k}.jsonl")
        with open(f, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in mutated))
        res = rc.recount(a.run, f, summary)
        flagged = sorted({p["id"] for p in res["pageProblems"] if p["id"] is not None})
        want = sorted(rows[i]["id"] for i in idx)
        results.append({"mutation": name, "pages": want, "ok": res["ok"], "flaggedPages": flagged,
                        "flaggedFields": sorted({p["field"] for p in res["pageProblems"] if p["field"]}),
                        "summaryProblems": len(res["summaryProblems"]), "expectOk": False,
                        "passed": res["ok"] is False and flagged == want})
    out = {"run": a.run, "allPassed": all(r["passed"] for r in results), "results": results}
    with open(a.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"run": a.run, "allPassed": out["allPassed"], "checks": len(results)}))
    return 0 if out["allPassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
