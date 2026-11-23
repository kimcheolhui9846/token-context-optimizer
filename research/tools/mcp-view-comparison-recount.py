"""Independent recount of the product MCP view comparison (protocol section 10).

Usage: python tools/mcp-view-comparison-recount.py --raw <raw.jsonl> --score <score.json> --out <recount.json>
(the folder of raw.jsonl must also hold input-check.json, the frozen list of the 48 ids)

Recomputes, without the Node scorer code, every row's geometry from raw.jsonl and the base-commit gold blob, then every
cell aggregate, and compares both with score.json. Writes the mismatch list (expected empty). Standard library only.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys

BASE = "41fc769dd5879aa10acb59153d98865b6a026200"
H = "research/results/r09-bilingual/heldout"
REPS, PROFILES, VIEWS = ["original", "rgb"], ["strict", "tolerant"], ["original", "overview", "region"]
EVIDENT = {"original_verified", "overview_jpeg", "crop_jpeg"}
COUNTS = ["toolCalls", "toolErrors", "fileReads", "plannedOriginalRequests", "fallbackOriginalRequests", "originalRefsRead"]
KINDS = ["original_verified", "original_unverified", "overview_jpeg", "crop_jpeg", "none"]


def blob(path):
    oid = subprocess.run(["git", "rev-parse", f"{BASE}:{path}"], check=True, capture_output=True, text=True).stdout.strip()
    return subprocess.run(["git", "cat-file", "blob", oid], check=True, capture_output=True).stdout


def geometry(row, parts, page):
    reg = row["returned"]["region"]
    if row["outcome"] != "ok" or row["returned"]["kind"] not in EVIDENT or not isinstance(reg, list) or len(reg) != 4:
        return "not_evaluable"
    x0, y0, x1, y1 = reg
    if not all(isinstance(v, int) for v in reg) or x0 < 0 or y0 < 0 or x1 <= x0 or y1 <= y0 or x1 > page["width"] or y1 > page["height"]:
        return "not_evaluable"
    inside = all(p["rect"][0] >= x0 and p["rect"][1] >= y0 and p["rect"][2] <= x1 and p["rect"][3] <= y1 for p in parts)
    return "complete" if inside else "partial"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", required=True)
    ap.add_argument("--score", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    if os.path.exists(a.out):
        sys.exit(f"--out must not exist yet: {a.out}")
    freeze = json.loads(blob(f"{H}/freeze-manifest.json"))
    gb = blob(f"{H}/gold.json")
    if hashlib.sha256(gb).hexdigest() != freeze["inputs"]["gold.json"]:
        sys.exit("gold differs from its freeze manifest")
    gold = json.loads(gb)["gold"]
    rows = [json.loads(l) for l in open(a.raw, encoding="utf-8") if l.strip()]
    score = json.load(open(a.score, encoding="utf-8"))
    mism = []

    input_check = json.load(open(os.path.join(os.path.dirname(a.raw), "input-check.json"), encoding="utf-8"))
    ids = list(input_check["images"])
    if len(ids) != 48 or len(set(ids)) != 48:
        mism.append({"what": "ids", "count": len(ids)})
    want = {f"{rep}|{pr}|{v}|{i}" for rep in REPS for pr in PROFILES for v in VIEWS for i in ids}
    keys = [r["key"] for r in rows]
    if len(keys) != len(set(keys)) or set(keys) != want:
        mism.append({"what": "keys", "rows": len(keys), "distinct": len(set(keys)), "expected": len(want)})

    geo = {}
    for r in rows:
        g = gold[r["id"]]
        geo[r["key"]] = geometry(r, g["parts"], g["page"])
    score_keys = [p["key"] for p in score["perRow"]]
    if len(score_keys) != len(set(score_keys)) or set(score_keys) != set(keys):
        mism.append({"what": "perRow keys", "score": len(score_keys), "distinct": len(set(score_keys)), "raw": len(set(keys))})
    for p in score["perRow"]:
        if geo.get(p["key"]) != p["geometry"]:
            mism.append({"what": "row geometry", "key": p["key"], "recount": geo.get(p["key"]), "score": p["geometry"]})

    cells = {}
    for r in rows:
        k = f"{r['rep']}|{r['profile']}|{r['view']}"
        c = cells.setdefault(k, {"n": 0, "ok": 0, "failed": 0, "indexAccepted": 0, "failCodes": {}, "failStages": {}, "returned": {x: 0 for x in KINDS},
                                 "geometry": {"complete": 0, "partial": 0, "not_evaluable": 0}, "counts": {x: 0 for x in COUNTS}, "byLangAnchor": {}, "pairs": {"both": 0, "enOnly": 0, "koOnly": 0, "neither": 0}, "_p": {}})
        c["n"] += 1
        if r["outcome"] == "ok":
            c["ok"] += 1
        else:
            c["failed"] += 1
            c["failCodes"][r["failCode"]] = c["failCodes"].get(r["failCode"], 0) + 1
            c["failStages"][r["failStage"]] = c["failStages"].get(r["failStage"], 0) + 1
        if r["index"]["status"] == "ok":
            c["indexAccepted"] += 1
        c["returned"][r["returned"]["kind"]] += 1
        g = geo[r["key"]]
        c["geometry"][g] += 1
        for x in COUNTS:
            c["counts"][x] += r["counts"][x]
        la = c["byLangAnchor"].setdefault(f"{r['lang']}|{r['anchor']}", {"n": 0, "failed": 0, "complete": 0, "partial": 0, "not_evaluable": 0})
        la["n"] += 1
        la["failed"] += 0 if r["outcome"] == "ok" else 1
        la[g] += 1
        c["_p"].setdefault(r["pairId"], {})[r["lang"]] = g == "complete"
    for c in cells.values():
        for p in c.pop("_p").values():
            e, k = p.get("en", False), p.get("ko", False)
            c["pairs"]["both" if e and k else "enOnly" if e else "koOnly" if k else "neither"] += 1

    agg = score["aggregate"]["cells"]
    if set(agg) != set(cells):
        mism.append({"what": "cells", "recount": sorted(cells), "score": sorted(agg)})
    for k in sorted(cells):
        if k in agg and json.dumps(cells[k], sort_keys=True) != json.dumps(agg[k], sort_keys=True):
            mism.append({"what": "cell", "cell": k, "recount": cells[k], "score": agg[k]})

    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"rows": len(rows), "cells": len(cells), "mismatches": mism}, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"recount rows={len(rows)} cells={len(cells)} mismatches={len(mism)}")
    sys.exit(1 if mism else 0)


if __name__ == "__main__":
    main()
