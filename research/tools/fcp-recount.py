#!/usr/bin/env python3
"""FCP independent recount (stdlib only). Spec: protocol sections 6.2, 8, 9, 10.

python research/tools/fcp-recount.py --run <run dir> --frozen <frozen dir> --score <score dir> --out <recount.json>
Exit 1 if any mismatch, 0 otherwise.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

PS = (0, 4)
EVIDENCE_FILES = ["caller.jsonl", "raw.jsonl", "conditions.jsonl",
                  "input-check.json", "guard-summary.json"]


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def jl(path):
    out = []
    for line in Path(path).read_text(encoding="utf-8").splitlines():
        if line.strip():
            out.append(json.loads(line))
    return out


class Checker:
    def __init__(self):
        self.checks = 0
        self.mismatches = []

    def cmp(self, scope, field, rec, sc):
        self.checks += 1
        if isinstance(rec, float) or isinstance(sc, float):
            ok = (rec is not None and sc is not None
                  and not isinstance(rec, (str, list, dict, bool))
                  and not isinstance(sc, (str, list, dict, bool))
                  and abs(rec - sc) <= 1e-12)
            if rec is None and sc is None:
                ok = True
        else:
            ok = rec == sc and isinstance(rec, bool) == isinstance(sc, bool)
        if not ok:
            self.mismatches.append({"key": scope, "field": field,
                                    "recount": rec, "score": sc})

    def cmp_tree(self, scope, field, rec, sc):
        """Recursive comparison: every leaf counts as one check."""
        if isinstance(rec, dict):
            if not isinstance(sc, dict):
                self.cmp(scope, field, rec, sc)
                return
            for k in rec:
                if k not in sc:
                    self.cmp(scope, field + "." + k, rec[k], None)
                else:
                    self.cmp_tree(scope, field + "." + k, rec[k], sc[k])
            for k in sc:
                if k not in rec:
                    self.cmp(scope, field + "." + k, None, sc[k])
        else:
            self.cmp(scope, field, rec, sc)


def contained(R, g):
    return R[0] <= g[0] and R[1] <= g[1] and R[2] >= g[2] and R[3] >= g[3]


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def valid_region(R, W, H):
    return (isinstance(R, list) and len(R) == 4 and all(is_int(v) for v in R)
            and 0 <= R[0] < R[2] <= W and 0 <= R[1] < R[3] <= H)


def mean(xs):
    return sum(xs) / len(xs) if xs else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--frozen", required=True)
    ap.add_argument("--score", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        print("refuse: --out exists: " + str(out), file=sys.stderr)
        return 2
    run, frozen, score = Path(a.run), Path(a.frozen), Path(a.score)

    # hash verification
    manifest = json.loads((frozen / "freeze-manifest.json").read_text("utf-8"))
    for rel in ("oracle/gold.json", "selector-input/index.json"):
        if sha(frozen / rel) != manifest["files"][rel]:
            print("hash mismatch: " + rel, file=sys.stderr)
            return 2
    ev = json.loads((run / "evidence.json").read_text("utf-8"))["files"]
    for f in EVIDENCE_FILES:
        if sha(run / f) != ev[f]:
            print("hash mismatch: " + f, file=sys.stderr)
            return 2

    index = json.loads((frozen / "selector-input/index.json").read_text("utf-8"))["images"]
    gold = json.loads((frozen / "oracle/gold.json").read_text("utf-8"))["gold"]
    caller = {r["id"]: r for r in jl(run / "caller.jsonl")}
    raw = jl(run / "raw.jsonl")
    sj = json.loads((score / "score.json").read_text("utf-8"))

    if len(index) != 48 or len(caller) != 48 or len(gold) != 48:
        print("expected 48 ids", file=sys.stderr)
        return 2
    rawk = {r["key"]: r for r in raw}
    scorek = {r["key"]: r for r in sj["perRow"]}
    expected_keys = ["p%d|%s" % (p, im["id"]) for p in PS for im in index]
    if (len(raw) != 96 or len(rawk) != 96 or set(rawk) != set(expected_keys)
            or len(sj["perRow"]) != 96 or set(scorek) != set(expected_keys)):
        print("key set is not exactly the 96 expected keys", file=sys.stderr)
        return 2

    C = Checker()
    rows = {}  # key -> recomputed row

    for p in PS:
        for im in index:
            id_ = im["id"]
            key = "p%d|%s" % (p, id_)
            W, H = im["page"]["width"], im["page"]["height"]
            gp = gold[id_]
            C.cmp(key, "gold.page", [gp["page"]["width"], gp["page"]["height"]], [W, H])
            cr = caller[id_]
            full = [0, 0, W, H]
            if cr["status"] != "ok":
                # No request is made for a selector technical error: requestFull is null, not false
                # (protocol 6.2; PR #145 PM review, fixed by the main author after the independent write).
                intent, rr, rfull = "caller_error", None, None
            elif not cr["matched"]:
                intent, rr, rfull = "unmatched", full, True
            else:
                b = cr["band"]
                x0, y0 = b["left"], b["top"]
                x1, y1 = x0 + b["width"], y0 + b["height"]
                rr = [max(0, x0 - p), max(0, y0 - p), min(W, x1 + p), min(H, y1 + p)]
                intent, rfull = "matched", rr == full
            rw = rawk[key]
            sr = scorek[key]
            for src, nm in ((rw, "raw"), (sr, "score")):
                C.cmp(key, nm + ".intent", intent, src["intent"])
                C.cmp(key, nm + ".requestRect", rr, src["requestRect"])
                C.cmp(key, nm + ".requestFull", rfull, src["requestFull"])
            C.cmp(key, "raw.p", p, rw["p"])
            C.cmp(key, "raw.id", id_, rw["id"])

            ret = rw.get("returned") or {"kind": "none", "region": None}
            kind, region = ret["kind"], ret["region"]
            valid = (rw["outcome"] == "ok" and kind in ("crop_jpeg", "original_verified")
                     and valid_region(region, W, H))
            if valid:
                if kind == "crop_jpeg":
                    C.cmp(key, "crop region == requestRect", region, rr)
                else:
                    C.cmp(key, "original_verified region == full page", region, full)
            row = {"key": key, "p": p, "id": id_, "intent": intent, "kind": kind,
                   "failStage": rw["failStage"], "failCode": rw["failCode"],
                   "valid": valid, "requestFull": rfull, "im": im}
            if not valid:
                row.update(state="NE", small=None, preserved=None,
                           missingItems=None, area=None)
            else:
                num = (region[2] - region[0]) * (region[3] - region[1])
                area = {"num": num, "den": W * H, "ratio": num / (W * H)}
                small = kind == "crop_jpeg" and num < W * H
                missing = [pt["item"] for pt in gp["parts"]
                           if not contained(region, pt["rect"])]
                pres = len(missing) == 0
                row.update(state=1 if (small and pres) else 0, small=small,
                           preserved=pres, missingItems=missing, area=area)
            rows[key] = row
            # per-row score comparison
            C.cmp(key, "returnedKind", kind, sr["returnedKind"])
            C.cmp(key, "returnedRegion", region, sr["returnedRegion"])
            C.cmp(key, "state", row["state"], sr["state"])
            C.cmp(key, "small", row["small"], sr["small"])
            C.cmp(key, "preserved", row["preserved"], sr["preserved"])
            C.cmp(key, "missingItems", row["missingItems"], sr["missingItems"])
            C.cmp_tree(key, "area", row["area"], sr["area"]) if row["area"] is not None \
                else C.cmp(key, "area", None, sr["area"])

    # aggregates
    def rate(n, d):
        return n / d if d else None

    byP = {}
    for p in PS:
        R = [rows["p%d|%s" % (p, im["id"])] for im in index]
        M = [r for r in R if r["intent"] == "matched"]

        def prim(rs, den):
            st = {"1": 0, "0": 0, "NE": 0}
            for r in rs:
                st[str(r["state"])] += 1
            return {"success": st["1"], "denominator": den,
                    "rate": rate(st["1"], den), "states": st}

        def pres(rs):
            y = sum(1 for r in rs if r["preserved"] is True)
            n = sum(1 for r in rs if r["preserved"] is False)
            ne = sum(1 for r in rs if r["preserved"] is None)
            return {"yes": y, "no": n, "NE": ne, "denominator": len(rs),
                    "rate": rate(y, len(rs))}

        def area(rs):
            v = [r["area"] for r in rs if r["area"] is not None]
            return {"valid": len(v), "missing": len(rs) - len(v),
                    "sumNum": sum(x["num"] for x in v),
                    "mean": mean([x["ratio"] for x in v])}

        fails = {}
        for r in R:
            if r["failStage"] is not None or r["failCode"] is not None:
                k = "%s|%s" % (r["failStage"], r["failCode"])
                fails[k] = fails.get(k, 0) + 1

        def stratum(keyfn):
            d = {}
            for r in R:
                s = d.setdefault(keyfn(r["im"]), {"n": 0, "matched": 0, "s1": 0,
                                                   "s0": 0, "NE": 0, "preserved": 0})
                s["n"] += 1
                s["matched"] += r["intent"] == "matched"
                s["s1" if r["state"] == 1 else "s0" if r["state"] == 0 else "NE"] += 1
                s["preserved"] += r["preserved"] is True
            return d

        pairs = {}
        for r in R:
            pairs.setdefault(r["im"]["pairId"], {})[r["im"]["lang"]] = r
        pc = {"both": 0, "enOnly": 0, "koOnly": 0, "neither": 0, "withNE": 0, "n": len(pairs)}
        for pr in pairs.values():
            e, k = pr["en"]["state"], pr["ko"]["state"]
            if e == 1 and k == 1:
                pc["both"] += 1
            elif e == 1:
                pc["enOnly"] += 1
            elif k == 1:
                pc["koOnly"] += 1
            else:
                pc["neither"] += 1
            if e == "NE" or k == "NE":
                pc["withNE"] += 1

        byP[str(p)] = {
            "n": len(R),
            "matchedDenominator": len(M),
            "unmatched": sum(1 for r in R if r["intent"] == "unmatched"),
            "callerErrors": sum(1 for r in R if r["intent"] == "caller_error"),
            "primary": prim(M, len(M)),
            "all": prim(R, len(R)),
            "preserved": {"all": pres(R), "matched": pres(M)},
            "area": {"all": area(R), "matched": area(M)},
            "returned": {k: sum(1 for r in R if r["kind"] == k)
                         for k in ("crop_jpeg", "original_verified", "none")},
            "matchedFull": sum(1 for r in M if r["requestFull"]),
            "unmatchedOriginal": sum(1 for r in R if r["intent"] == "unmatched"
                                     and r["kind"] == "original_verified"),
            "limitExceeded": sum(1 for r in R if r["failCode"] == "limit_exceeded"),
            "failures": fails,
            "strata": {
                "langAnchor": stratum(lambda im: "%s|%s" % (im["lang"], im["anchor"])),
                "doctype": stratum(lambda im: im["doctype"]),
                "layout": stratum(lambda im: im["layout"]),
            },
            "pairs": pc,
        }

    def change(ids):
        c = {"improved": 0, "worsened": 0, "kept1": 0, "kept0": 0,
             "notEvaluable": 0, "n": len(ids)}
        pp = []
        miss = 0
        for i in ids:
            s0, s4 = rows["p0|" + i]["state"], rows["p4|" + i]["state"]
            if s0 == "NE" or s4 == "NE":
                c["notEvaluable"] += 1
            elif s0 == 0 and s4 == 1:
                c["improved"] += 1
            elif s0 == 1 and s4 == 0:
                c["worsened"] += 1
            elif s0 == 1:
                c["kept1"] += 1
            else:
                c["kept0"] += 1
        return c

    def area_change(ids):
        d, miss = [], 0
        for i in ids:
            a0, a4 = rows["p0|" + i]["area"], rows["p4|" + i]["area"]
            if a0 is None or a4 is None:
                miss += 1
            else:
                d.append(a4["ratio"] - a0["ratio"])
        m = mean(d)
        return {"validPairs": len(d), "missingPairs": miss,
                "meanPp": None if m is None else m * 100}

    all_ids = [im["id"] for im in index]
    m_ids = [i for i in all_ids if rows["p0|" + i]["intent"] == "matched"]
    chg = {"matched": change(m_ids), "all": change(all_ids),
           "areaMatched": area_change(m_ids), "areaAll": area_change(all_ids)}

    for p in PS:
        C.cmp_tree("aggregate.byP." + str(p), "byP", byP[str(p)],
                   sj["aggregate"]["byP"][str(p)])
    for k, v in chg.items():
        C.cmp_tree("aggregate.change", k, v, sj["aggregate"]["change"][k])

    summary = {
        str(p): {"primary": byP[str(p)]["primary"], "all": byP[str(p)]["all"]}
        for p in PS}
    result = {
        "run": str(run), "score": str(score), "keys": 96,
        "checks": C.checks, "mismatches": C.mismatches,
        "perP": summary, "change": chg,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"keys": 96, "checks": C.checks,
                      "mismatches": len(C.mismatches), "out": str(out)}))
    return 1 if C.mismatches else 0


if __name__ == "__main__":
    sys.exit(main())
