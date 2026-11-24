#!/usr/bin/env python3
"""crop-padding-replay 독립 검산기 (표준 라이브러리만).

사용법(cwd = research/):
  python tools/crop-padding-replay-recount.py --run <run dir> --score <score.json> --out <recount.json>
"""
import argparse
import hashlib
import json
import subprocess
import sys
from collections import Counter
from fractions import Fraction
from pathlib import Path

BASE = "41fc769dd5879aa10acb59153d98865b6a026200"
PRODUCT = "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1"
R09 = "research/results/r09-bilingual/heldout"
GOLD_BLOB = "5d6c277d4c9cd55e4a101252fce8032294a21ae9"
R09_RAW_BLOB = "876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318"
M141_RAW = "research/results/mcp-view-comparison/run-a/raw.jsonl"
M141_RAW_BLOB = "29729138f6344f8a869bfee1954c882fbfc6756b"
M141_SCORE = "research/results/mcp-view-comparison/score-a/score.json"
M141_SCORE_BLOB = "18502c11ef8c40579074919c0c1c77cb936f82ae"
PADS = [0, 4, 8, 16]
TOL = 1e-12
KINDS = ["crop_jpeg", "original_verified", "original_unverified", "none"]
JUDG = ["complete", "incomplete", "not_evaluable"]

checks = Counter()
mismatches = []


def blob_bytes(commit, path):
    bid = subprocess.run(["git", "rev-parse", f"{commit}:{path}"], check=True,
                         capture_output=True, text=True).stdout.strip()
    data = subprocess.run(["git", "cat-file", "blob", bid], check=True,
                          capture_output=True).stdout
    return bid, data


def jload(data):
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    return json.loads(data.decode("utf-8"))


def jlines(data):
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    return [json.loads(l) for l in data.decode("utf-8").splitlines() if l.strip()]


def read_file_bytes(p):
    return Path(p).read_bytes()


def fnum(v):
    return float(v) if isinstance(v, Fraction) else v


def cmp(what, ident, rec, sc, tol=False):
    """검사 1건 기록. ident는 key 또는 p 등 식별자 dict."""
    checks[what] += 1
    rec = fnum(rec)
    ok = False
    if tol and isinstance(rec, (int, float)) and isinstance(sc, (int, float)) \
            and not isinstance(rec, bool) and not isinstance(sc, bool):
        ok = abs(rec - sc) <= TOL
    else:
        ok = (rec == sc) and (type(rec) is type(sc) or
                              (isinstance(rec, (int, float)) and isinstance(sc, (int, float))
                               and not isinstance(rec, bool) and not isinstance(sc, bool)))
    if not ok:
        m = {"what": what, "recount": rec, "score": sc}
        m.update(ident)
        mismatches.append(m)
    return ok


def need(what, ident, cond, recount, score):
    checks[what] += 1
    if not cond:
        m = {"what": what, "recount": recount, "score": score}
        m.update(ident)
        mismatches.append(m)


def valid_region(r):
    return (isinstance(r, list) and len(r) == 4
            and all(isinstance(v, int) and not isinstance(v, bool) for v in r)
            and r[2] > r[0] and r[3] > r[1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--score", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()
    out = Path(a.out)
    if out.exists():
        print(f"출력 파일이 이미 있음: {out}", file=sys.stderr)
        return 2

    # ---- 원자료 ----
    gid, gbytes = blob_bytes(BASE, f"{R09}/gold.json")
    need("source.goldBlob", {}, gid == GOLD_BLOB, gid, GOLD_BLOB)
    _, mbytes = blob_bytes(BASE, f"{R09}/freeze-manifest.json")
    manifest = jload(mbytes)
    want = str(manifest["inputs"]["gold.json"])
    got = hashlib.sha256(gbytes).hexdigest()
    need("source.goldSha256", {}, want.lower() == got, got, want)
    gold = jload(gbytes)["gold"]

    rid, rbytes = blob_bytes(BASE, f"{R09}/run-a/raw.jsonl")
    need("source.r09RawBlob", {}, rid == R09_RAW_BLOB, rid, R09_RAW_BLOB)
    r09 = {r["id"]: r for r in jlines(rbytes)}

    _, dbytes = blob_bytes(BASE, f"{R09}/design.json")
    design = jload(dbytes)
    page = {im["id"]: (im["page"]["width"], im["page"]["height"]) for im in design["images"]}

    h_id, hbytes = blob_bytes(PRODUCT, M141_RAW)
    need("source.m141RawBlob", {}, h_id == M141_RAW_BLOB, h_id, M141_RAW_BLOB)
    m141 = {}
    for r in jlines(hbytes):
        k = r.get("key", "")
        parts = k.split("|")
        if len(parts) == 4 and parts[:3] == ["rgb", "tolerant", "region"]:
            m141[parts[3]] = r
    s_id, sbytes = blob_bytes(PRODUCT, M141_SCORE)
    need("source.m141ScoreBlob", {}, s_id == M141_SCORE_BLOB, s_id, M141_SCORE_BLOB)
    m141_judg = {r["key"].split("|")[3]: r["geometry"]
                 for r in jload(sbytes)["perRow"]
                 if r["key"].startswith("rgb|tolerant|region|")}
    need("source.m141Rows", {}, len(m141) == 48 and len(m141_judg) == 48, len(m141), 48)

    run_dir = Path(a.run)
    rows = jlines(read_file_bytes(run_dir / "raw.jsonl"))
    ic = jload(read_file_bytes(run_dir / "input-check.json"))
    ids = sorted(ic["images"].keys())
    need("source.inputCheckIds", {}, len(ids) == 48, len(ids), 48)
    score = jload(read_file_bytes(a.score))

    # ---- 키 집합 ----
    expected_keys = [f"p{p}|{i}" for p in PADS for i in ids]
    cnt = Counter(r.get("key") for r in rows)
    need("keys.count", {}, len(rows) == 192, len(rows), 192)
    for k in expected_keys:
        need("keys.exactlyOnce", {"key": k}, cnt.get(k, 0) == 1, cnt.get(k, 0), 1)
    for k in cnt:
        need("keys.unexpected", {"key": k}, k in set(expected_keys), k, None)
    need("keys.designIds", {}, sorted(page) == ids, len(page), len(ids))
    need("keys.goldIds", {}, all(i in gold for i in ids), None, None)
    cmp("score.keys", {}, len(expected_keys), score.get("keys"))
    cmp("score.paddings", {}, PADS, score.get("paddings"))
    byrow = {r["key"]: r for r in rows}
    sc_rows = {r["key"]: r for r in score["perRow"]}
    cmp("score.perRowCount", {}, 192, len(score["perRow"]))

    # ---- 행별 재계산 ----
    R = {}  # key -> 재계산 결과
    for p in PADS:
        for i in ids:
            key = f"p{p}|{i}"
            row = byrow.get(key)
            if row is None:
                continue
            W, H = page[i]
            rec09 = r09.get(i)
            matched = bool(rec09 and rec09.get("matched") is True)
            band = rec09.get("band") if matched else None
            if matched and band:
                x0, y0 = band["left"], band["top"]
                x1, y1 = x0 + band["width"], y0 + band["height"]
                rect = [max(0, x0 - p), max(0, y0 - p), min(W, x1 + p), min(H, y1 + p)]
                intent = "matched"
                exp_clip = {"left": p - (x0 - rect[0]), "top": p - (y0 - rect[1]),
                            "right": p - (rect[2] - x1), "bottom": p - (rect[3] - y1)}
            else:
                rect = [0, 0, W, H]
                intent = "unmatched"
                band = None
                exp_clip = None
            full = rect == [0, 0, W, H]
            req = {"x": rect[0], "y": rect[1], "width": rect[2] - rect[0], "height": rect[3] - rect[1]}
            id_ = {"key": key}
            cmp("row.intent", id_, intent, row.get("intent"))
            cmp("row.band", id_, band, row.get("band"))
            cmp("row.requestRect", id_, rect, row.get("requestRect"))
            cmp("row.request", id_, req, row.get("request"))
            cmp("row.requestFull", id_, full, row.get("requestFull"))
            cmp("row.page", id_, {"width": W, "height": H}, row.get("page"))
            if exp_clip is not None:
                cmp("row.clip", id_, exp_clip, row.get("clip"))

            outcome = row.get("outcome")
            ret = row.get("returned") or {}
            kind = ret.get("kind")
            region = ret.get("region")
            crop = row.get("crop") or {}
            orig = row.get("originalRead") or {}
            if outcome == "ok":
                cmp("row.kindExpected", id_, "original_verified" if full else "crop_jpeg", kind)
                cmp("row.regionEqualsRequest", id_, rect, region)
                if kind == "crop_jpeg":
                    cmp("row.crop.imageItems", id_, 1, crop.get("imageItems"))
                    cmp("row.crop.mime", id_, "image/jpeg", crop.get("mime"))
                    cmp("row.crop.byteLength", id_, "match", crop.get("byteLength"))
                    cmp("row.crop.imageSha", id_, "match", crop.get("imageSha"))
                    cmp("row.crop.decode", id_, "ok", crop.get("decode"))
                    cmp("row.crop.decodedWidth", id_, req["width"], crop.get("decodedWidth"))
                    cmp("row.crop.decodedHeight", id_, req["height"], crop.get("decodedHeight"))
                elif kind == "original_verified":
                    cmp("row.crop.imageItems", id_, 0, crop.get("imageItems"))
                    cmp("row.originalRead.status", id_, "ok", orig.get("status"))
                    cmp("row.originalRead.sha", id_, "match", orig.get("sha"))

            if outcome == "ok" and kind in ("crop_jpeg", "original_verified") and valid_region(region):
                parts = gold[i]["parts"]
                miss = [pt["item"] for pt in parts
                        if not (pt["rect"][0] >= region[0] and pt["rect"][1] >= region[1]
                                and pt["rect"][2] <= region[2] and pt["rect"][3] <= region[3])]
                judg = "incomplete" if miss else "complete"
                num = (region[2] - region[0]) * (region[3] - region[1])
                area = {"num": num, "den": W * H, "ratio": Fraction(num, W * H)}
                assumed = dict(area)
            else:
                miss = []
                judg = "not_evaluable"
                area = None
                assumed = None
                if row.get("failCode") == "limit_exceeded":
                    num = rect_area = (rect[2] - rect[0]) * (rect[3] - rect[1])
                    assumed = {"num": num, "den": W * H, "ratio": Fraction(num, W * H)}
            R[key] = dict(p=p, id=i, intent=intent, full=full, rect=rect, outcome=outcome,
                          failCode=row.get("failCode"), kind=kind or "none", region=region,
                          judg=judg, miss=miss, area=area, assumed=assumed,
                          lang=row.get("lang"), anchor=row.get("anchor"), pairId=row.get("pairId"),
                          page=(W, H))

    # ---- score.perRow 대조 ----
    def area_cmp(what, id_, rec, sc):
        if rec is None or sc is None:
            cmp(what, id_, rec, sc)
            return
        if not isinstance(sc, dict):
            cmp(what, id_, {"num": rec["num"], "den": rec["den"]}, sc)
            return
        cmp(what + ".num", id_, rec["num"], sc.get("num"))
        cmp(what + ".den", id_, rec["den"], sc.get("den"))
        cmp(what + ".ratio", id_, rec["ratio"], sc.get("ratio"), tol=True)

    for key, r in R.items():
        s = sc_rows.get(key)
        id_ = {"key": key}
        if s is None:
            need("perRow.present", id_, False, "present", "absent")
            continue
        row = byrow[key]
        cmp("perRow.p", id_, r["p"], s.get("p"))
        cmp("perRow.id", id_, r["id"], s.get("id"))
        cmp("perRow.intent", id_, r["intent"], s.get("intent"))
        cmp("perRow.requestFull", id_, r["full"], s.get("requestFull"))
        cmp("perRow.requestRect", id_, r["rect"], s.get("requestRect"))
        cmp("perRow.clip", id_, row.get("clip"), s.get("clip"))
        cmp("perRow.outcome", id_, r["outcome"], s.get("outcome"))
        cmp("perRow.failCode", id_, r["failCode"], s.get("failCode"))
        cmp("perRow.returnedKind", id_, r["kind"], s.get("returnedKind"))
        cmp("perRow.returnedRegion", id_, r["region"], s.get("returnedRegion"))
        cmp("perRow.judgement", id_, r["judg"], s.get("judgement"))
        cmp("perRow.missing", id_, None if r["judg"] == "not_evaluable" else len(r["miss"]), s.get("missing"))
        cmp("perRow.missingItems", id_, r["miss"], s.get("missingItems"))
        area_cmp("perRow.area", id_, r["area"], s.get("area"))
        area_cmp("perRow.assumedArea", id_, r["assumed"], s.get("assumedArea"))

    # ---- 집계 ----
    def mean_block(rs, field):
        vals = [r[field] for r in rs if r[field] is not None]
        miss = len(rs) - len(vals)
        sum_num = sum(v["num"] for v in vals)
        mean = (sum(v["ratio"] for v in vals) / len(vals)) if vals else None
        return {"valid": len(vals), "missing": miss, "sumNum": sum_num, "mean": mean}

    def cmp_mean(what, id_, rec, sc):
        if not isinstance(sc, dict):
            cmp(what, id_, rec, sc)
            return
        for f in ("valid", "missing", "sumNum"):
            cmp(f"{what}.{f}", id_, rec[f], sc.get(f))
        cmp(f"{what}.mean", id_, rec["mean"], sc.get("mean"), tol=True)

    def jcounts(rs):
        c = Counter(r["judg"] for r in rs)
        return {j: c.get(j, 0) for j in JUDG}

    def kcounts(rs):
        c = Counter(r["kind"] if r["kind"] in KINDS else "none" for r in rs)
        return {k: c.get(k, 0) for k in KINDS}

    byP = score.get("aggregate", {}).get("byP", {})
    for p in PADS:
        rs = [R[f"p{p}|{i}"] for i in ids if f"p{p}|{i}" in R]
        sa = byP.get(str(p))
        id_ = {"p": p}
        if sa is None:
            need("agg.present", id_, False, "present", "absent")
            continue
        cmp("agg.n", id_, len(rs), sa.get("n"))
        oc = Counter(r["outcome"] for r in rs)
        cmp("agg.outcomes.ok", id_, oc.get("ok", 0), (sa.get("outcomes") or {}).get("ok"))
        cmp("agg.outcomes.failed", id_, len(rs) - oc.get("ok", 0), (sa.get("outcomes") or {}).get("failed"))
        fc = dict(Counter(r["failCode"] for r in rs if r["failCode"] is not None))
        cmp("agg.failCodes", id_, fc, sa.get("failCodes"))
        cmp("agg.limitExceeded", id_, sum(1 for r in rs if r["failCode"] == "limit_exceeded"),
            sa.get("limitExceeded"))
        cmp("agg.judgement", id_, jcounts(rs), sa.get("judgement"))
        cmp("agg.returned", id_, kcounts(rs), sa.get("returned"))
        cmp("agg.matchedFullPage", id_,
            sum(1 for r in rs if r["intent"] == "matched" and r["full"]), sa.get("matchedFullPage"))
        for it in ("matched", "unmatched"):
            sub = [r for r in rs if r["intent"] == it]
            sb = (sa.get("byIntent") or {}).get(it) or {}
            cmp(f"agg.byIntent.{it}.n", id_, len(sub), sb.get("n"))
            cmp(f"agg.byIntent.{it}.judgement", id_, jcounts(sub), sb.get("judgement"))
            cmp(f"agg.byIntent.{it}.returned", id_, kcounts(sub), sb.get("returned"))
        matched = [r for r in rs if r["intent"] == "matched"]
        for fld, name in (("area", "area"), ("assumed", "assumedArea")):
            for scope, sub in (("all", rs), ("matched", matched)):
                cmp_mean(f"agg.{name}.{scope}", id_, mean_block(sub, fld),
                         ((sa.get(name) or {}).get(scope)))
        # p0 대비
        pv = sa.get("pairedVsP0") or {}
        chg = {"recovered": 0, "worsened": 0, "keptComplete": 0, "keptIncomplete": 0,
               "notEvaluablePairs": 0}
        for i in ids:
            a0, ap_ = R.get(f"p0|{i}"), R.get(f"p{p}|{i}")
            if a0 is None or ap_ is None:
                continue
            j0, jp = a0["judg"], ap_["judg"]
            if j0 == "not_evaluable" or jp == "not_evaluable":
                chg["notEvaluablePairs"] += 1
            elif j0 == "incomplete" and jp == "complete":
                chg["recovered"] += 1
            elif j0 == "complete" and jp == "incomplete":
                chg["worsened"] += 1
            elif j0 == "complete":
                chg["keptComplete"] += 1
            else:
                chg["keptIncomplete"] += 1
        cmp("agg.changeVsP0", id_, chg, sa.get("changeVsP0"))
        for scope, sub in (("all", rs), ("matched", matched)):
            diffs = []
            miss_pairs = 0
            for r in sub:
                a0 = R.get(f"p0|{r['id']}")
                if a0 is not None and a0["area"] is not None and r["area"] is not None:
                    diffs.append(r["area"]["ratio"] - a0["area"]["ratio"])
                else:
                    miss_pairs += 1
            blk = pv.get(scope) or {}
            cmp(f"agg.pairedVsP0.{scope}.validPairs", id_, len(diffs), blk.get("validPairs"))
            cmp(f"agg.pairedVsP0.{scope}.missingPairs", id_, miss_pairs, blk.get("missingPairs"))
            mp = (100 * sum(diffs) / len(diffs)) if diffs else None
            cmp(f"agg.pairedVsP0.{scope}.meanPp", id_, mp, blk.get("meanPp"), tol=True)
        cmp("agg.missingItemsTotal", id_, sum(len(r["miss"]) for r in rs), sa.get("missingItemsTotal"))
        # lang|anchor
        la = {}
        for r in rs:
            k = f"{r['lang']}|{r['anchor']}"
            d = la.setdefault(k, {"n": 0, "complete": 0, "incomplete": 0, "not_evaluable": 0})
            d["n"] += 1
            d[r["judg"]] += 1
        cmp("agg.byLangAnchor", id_, la, sa.get("byLangAnchor"))
        # 쌍
        pairs = {}
        for r in rs:
            pairs.setdefault(r["pairId"], {})[r["lang"]] = (r["judg"] == "complete")
        pc = {"both": 0, "enOnly": 0, "koOnly": 0, "neither": 0}
        for d in pairs.values():
            en, ko = d.get("en", False), d.get("ko", False)
            pc["both" if en and ko else "enOnly" if en else "koOnly" if ko else "neither"] += 1
        cmp("agg.pairs.numPairs", id_, 24, len(pairs))
        cmp("agg.pairs", id_, pc, sa.get("pairs"))

    # ---- #141 재생 (p=0) ----
    rep_mm = []
    for i in ids:
        h = m141.get(i)
        n = R.get(f"p0|{i}")
        row = byrow.get(f"p0|{i}")
        if h is None or n is None or row is None:
            rep_mm.append({"id": i, "what": "missing"})
            continue
        W, H = page[i]

        def chk(name, rec, old):
            checks["replay141." + name] += 1
            if rec != old:
                rep_mm.append({"id": i, "what": name, "recount": rec, "m141": old})

        rq = n["rect"]
        chk("request", {"x": rq[0], "y": rq[1], "width": rq[2] - rq[0], "height": rq[3] - rq[1]},
            (h.get("crop") or {}).get("requested"))
        hret = h.get("returned") or {}
        chk("kind", n["kind"], hret.get("kind"))
        chk("region", n["region"], hret.get("region"))
        chk("judgement", n["judg"], {"complete": "complete", "partial": "incomplete"}.get(m141_judg[i]))
        hi = h.get("index") or {}
        chk("indexVsDesign", [W, H], [hi.get("width"), hi.get("height")])
        ni = row.get("index") or {}
        chk("newIndexVsDesign", [W, H], [ni.get("width"), ni.get("height")])
        if n["intent"] == "unmatched":
            chk("unmatchedRequest", [0, 0, W, H], (h.get("crop") or {}).get("requested") and
                [h["crop"]["requested"]["x"], h["crop"]["requested"]["y"],
                 h["crop"]["requested"]["x"] + h["crop"]["requested"]["width"],
                 h["crop"]["requested"]["y"] + h["crop"]["requested"]["height"]])
            chk("unmatchedReturned", [0, 0, W, H], hret.get("region"))
    rep_pass = len(rep_mm) == 0
    sr = score.get("replay141") or {}
    cmp("score.replay141.pass", {}, rep_pass, sr.get("pass"))
    cmp("score.replay141.rows", {}, 48, sr.get("rows"))
    cmp("score.replay141.mismatches", {}, len(rep_mm), len(sr.get("mismatches") or []))
    for m in rep_mm:
        mismatches.append(dict(m, what="replay141." + m["what"]))

    result = {"rows": len(rows), "checks": dict(checks), "mismatches": mismatches}
    text = json.dumps(result, indent=1, sort_keys=True, ensure_ascii=False) + "\n"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "x", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main())
