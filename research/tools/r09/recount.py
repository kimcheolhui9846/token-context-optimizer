"""R09 independent recount. Recomputes the outcome classes and the paired KO-EN tables from raw.jsonl, gold.json and
design.json without the Node scorer, then compares them with score.json.

Usage: python recount.py --design <design.json> --gold <gold.json> --raw <raw.jsonl> --score <score.json> [--out <json>]
Exits 1 on any mismatch.
"""
import argparse
import json
import sys
from pathlib import Path


def category(rec, parts, page):
    if rec.get("status") != "ok":
        return "tech_error", False
    if not rec.get("matched"):
        return "no_match_full", False
    b = rec.get("band") or {}
    vals = [b.get("left"), b.get("top"), b.get("width"), b.get("height")]
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in vals):
        return "tech_error", False
    left, top, w, h = vals
    if w <= 0 or h <= 0 or left < 0 or top < 0 or left + w > page["width"] or top + h > page["height"]:
        return "tech_error", False
    win = (left, top, left + w, top + h)
    inside = all(r[0] >= win[0] and r[1] >= win[1] and r[2] <= win[2] and r[3] <= win[3] for r in (p["rect"] for p in parts))
    if w * h >= page["width"] * page["height"]:
        return "matched_full", False
    return ("window_complete", True) if inside else ("window_partial", False)


def main():
    ap = argparse.ArgumentParser()
    for k in ("--design", "--gold", "--raw", "--score"):
        ap.add_argument(k, required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    design = json.loads(Path(a.design).read_text(encoding="utf-8"))
    gold = json.loads(Path(a.gold).read_text(encoding="utf-8"))["gold"]
    raw = [json.loads(line) for line in Path(a.raw).read_text(encoding="utf-8").splitlines() if line.strip()]
    score = json.loads(Path(a.score).read_text(encoding="utf-8"))
    by_id = {}
    for r in raw:
        if r["id"] in by_id:
            print(f"duplicate {r['id']}", file=sys.stderr)
            return 1
        by_id[r["id"]] = r
    ids = [im["id"] for im in design["images"]]
    if sorted(ids) != sorted(by_id):
        print("raw ids differ from design ids", file=sys.stderr)
        return 1
    cats = {im["id"]: category(by_id[im["id"]], gold[im["id"]]["parts"], im["page"]) for im in design["images"]}
    sets = {"code": [p["pairId"] for p in design["pairs"] if p["anchor"] == "code"], "nl": [p["pairId"] for p in design["pairs"] if p["anchor"] == "nl"], "all": [p["pairId"] for p in design["pairs"]]}
    mine = {}
    for name, pids in sets.items():
        t = {"both": 0, "enOnly": 0, "koOnly": 0, "neither": 0}
        for p in pids:
            e, k = cats[f"{p}-en"][1], cats[f"{p}-ko"][1]
            t["both" if e and k else "enOnly" if e else "koOnly" if k else "neither"] += 1
        mine[name] = {"n": len(pids), "table": t, "diff": (t["koOnly"] - t["enOnly"]) / len(pids), "en": sum(cats[f"{p}-en"][1] for p in pids), "ko": sum(cats[f"{p}-ko"][1] for p in pids)}
    problems = []
    for im in score["images"]:
        if im["category"] != cats[im["id"]][0]:
            problems.append(f"{im['id']}: scorer {im['category']} vs recount {cats[im['id']][0]}")
    for name, m in mine.items():
        s = score["sets"][name]
        if s["table"] != m["table"] or s["n"] != m["n"] or abs(s["diff"] - m["diff"]) > 1e-12 or s["en"]["success"] != m["en"] or s["ko"]["success"] != m["ko"]:
            problems.append(f"set {name}: scorer {s['table']} vs recount {m['table']}")
    counts = {c: sum(1 for v in cats.values() if v[0] == c) for c in ("window_complete", "window_partial", "matched_full", "no_match_full", "tech_error")}
    result = {"images": len(ids), "categories": counts, "sets": mine, "problems": problems}
    if a.out:
        Path(a.out).write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"images": len(ids), "categories": counts, "problems": len(problems)}))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
