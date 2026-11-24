"""Independent recount of the ko-window-diagnostic (protocol research/plans/2026-11-24-ko-window-diagnostic-protocol.md).

Reads the pinned #148 Git objects itself, recomputes every per-page fact and every cross-tab with exact rational
coordinates, and compares the result with the JS output in both directions (every page key and value, then the summary).
Imports nothing from the JS side or from #148. No OCR, no network.

Usage (from research/):
  python tools/ko-window-diagnostic/recount.py --run a --pages <dir>/pages.jsonl --summary <dir>/summary.json --out <file>
Exit code 0 only when every check passes.
"""
import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import unicodedata
from collections import OrderedDict
from fractions import Fraction

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.normpath(os.path.join(HERE, "..", ".."))
RESULT_DIR = os.path.join(RESEARCH, "results", "ko-window-diagnostic")
PAGES, COHORT, PRIMARY = 96, 24, 20
REGISTERED = {"anchorOnly": 15, "valueOnly": 3, "neither": 2, "both": 4}
CONTAINMENTS = ("both", "anchorOnly", "valueOnly", "neither")
LINE_CLASSES = ("anchorCue", "otherItemOnly", "undetermined")
TRIGGERS = ("anchorOnly", "otherOnly", "both", "neither")
SIDES = ("left", "top", "right", "bottom")
WHITESPACE = set(chr(c) for c in list(range(0x09, 0x0E)) + [0x20, 0x85, 0xA0, 0x1680] + list(range(0x2000, 0x200B))
                 + [0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF])
HANGUL = re.compile("[가-힣]+")


class RecountError(Exception):
    pass


# ---------------------------------------------------------------- Git objects and pins
def sha256(data):
    return hashlib.sha256(data).hexdigest()


def git_blob_id(data):
    return hashlib.sha1(b"blob %d\x00" % len(data) + data).hexdigest()


def check_pin(name, data, pin):
    if git_blob_id(data) != pin["blob"] or sha256(data) != pin["sha256"] or len(data) != pin["bytes"]:
        raise RecountError(f"{name}: bytes differ from the pin")
    return data


def git(*args):
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)  # no visible console window on Windows
    return subprocess.run(["git", *args], cwd=RESEARCH, check=True, capture_output=True, creationflags=flags).stdout


def pinned(commit, path, pin):
    if git("cat-file", "-t", commit).strip() != b"commit":
        raise RecountError(f"commit {commit} missing")
    if git("rev-parse", f"{commit}:{path}").decode().strip() != pin["blob"]:
        raise RecountError(f"{path} does not resolve to the pinned blob")
    return check_pin(path, git("cat-file", "blob", pin["blob"]), pin)


# ---------------------------------------------------------------- geometry (exact rationals)
def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def to_xyxy(box):
    if not isinstance(box, list) or len(box) != 4 or not all(is_num(v) for v in box):
        raise RecountError(f"bad box {box!r}")
    x, y, w, h = (Fraction(v) for v in box)
    if w < 0 or h < 0:
        raise RecountError(f"negative size {box!r}")
    return (x, y, x + w, y + h)


def items_at_centre(box, cells):
    x0, y0, x1, y1 = to_xyxy(box)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return [name for name, (l, t, r, b) in cells if l <= cx < r and t <= cy < b]


def overlaps(a, b):
    return min(a[2], b[2]) > max(a[0], b[0]) and min(a[3], b[3]) > max(a[1], b[1])


def shortfall(rect, band):
    l, t, r, b = rect
    L, T, R, B = band
    return (max(0, L - l), max(0, T - t), max(0, r - R), max(0, b - B))


def band_edges(band, width, height):
    vals = [band.get(k) for k in ("left", "top", "width", "height")] if isinstance(band, dict) else [None]
    if len(vals) != 4 or not all(is_num(v) for v in vals):
        raise RecountError("band not finite")
    left, top, w, h = (Fraction(v) for v in vals)
    if w <= 0 or h <= 0 or left < 0 or top < 0 or left + w > width or top + h > height:
        raise RecountError(f"band out of range {band!r}")
    return (left, top, left + w, top + h)


def squeeze(text):
    return "".join(ch for ch in unicodedata.normalize("NFC", text) if ch not in WHITESPACE)


def is_blank(text):
    return squeeze(text) == ""


# ---------------------------------------------------------------- K1 (Hangul syllable pairs), written from the protocol text
def syllable_pairs(text):
    out = set()
    for run in HANGUL.findall(unicodedata.normalize("NFC", str(text))):
        out.update(run[i:i + 2] for i in range(len(run) - 1))
    return out


def line_score(line, qpairs):
    found = set()
    for w in line["words"]:
        found |= syllable_pairs(w["text"]) & qpairs
    return len(found)


def k1_pick(lines, question):
    """(line index, score, hit word indexes): highest distinct-pair score, ties to strictly higher confidence."""
    q = syllable_pairs(question)
    best = None
    for i, line in enumerate(lines):
        s = line_score(line, q)
        if s > 0 and (best is None or s > best[1] or (s == best[1] and line["confidence"] > lines[best[0]]["confidence"])):
            best = (i, s)
    if best is None:
        return None
    hits = [j for j, w in enumerate(lines[best[0]]["words"]) if syllable_pairs(w["text"]) & q]
    return (best[0], best[1], hits)


# ---------------------------------------------------------------- word, line and trigger facts
def word_facts(word, cells, anchor_id, anchor_cell, anchor_ink):
    if not isinstance(word, dict) or not isinstance(word.get("text"), str):
        raise RecountError("word text")
    box = to_xyxy(word["box"])
    blank = is_blank(word["text"])
    at = [] if blank else items_at_centre(word["box"], cells)
    owner = at[0] if len(at) == 1 else None
    in_cell = (not blank) and overlaps(box, anchor_cell)
    in_ink = (not blank) and overlaps(box, anchor_ink)
    cue = owner == anchor_id and in_ink
    return {"text": word["text"], "xyxy": box, "blank": blank, "cellItems": at, "assigned": owner,
            "anchorCellOverlap": in_cell, "anchorInkOverlap": in_ink, "strictAnchorCue": cue,
            "anchorBoundary": (not cue) and (in_cell or in_ink)}


def line_class(recs, anchor_id):
    live = [r for r in recs if not r["blank"]]
    if any(r["strictAnchorCue"] for r in live):
        return "anchorCue"
    if not any(r["anchorCellOverlap"] for r in live) and any(r["assigned"] not in (None, anchor_id) for r in live):
        return "otherItemOnly"
    return "undetermined"


def line_items(recs):
    order = []
    for r in recs:
        if not r["blank"] and r["assigned"] is not None and r["assigned"] not in order:
            order.append(r["assigned"])
    return order


def is_mixed(recs):
    return len(line_items(recs)) >= 2


def trigger_source(recs, hits, anchor_id):
    live = [recs[j] for j in hits if not recs[j]["blank"]]
    a = any(r["strictAnchorCue"] for r in live)
    o = any(r["assigned"] not in (None, anchor_id) for r in live)
    return {(True, True): "both", (True, False): "anchorOnly", (False, True): "otherOnly", (False, False): "neither"}[(a, o)]


# ---------------------------------------------------------------- one page, from raw records
def rect_ok(r):
    return isinstance(r, list) and len(r) == 4 and all(isinstance(v, int) and not isinstance(v, bool) for v in r) and r[0] < r[2] and r[1] < r[3]


def page_row(pid, c, d, render, gold, pred, ocr, score):
    def bad(msg):
        raise RecountError(f"{pid}: {msg}")

    if d["lang"] != "ko" or d["anchor"] != "nl":
        bad("not ko/nl")
    W, H = d["page"]["width"], d["page"]["height"]
    items = d["items"]
    ids = [it["id"] for it in items]
    if len(set(ids)) != len(ids) or not all(rect_ok(it["cell"]) for it in items):
        bad("design items")
    roles = {it["id"]: it["role"] for it in items}
    texts = {it["id"]: it["text"] for it in items}
    cells = [(it["id"], tuple(Fraction(v) for v in it["cell"])) for it in items]
    A, V = d["anchorItem"], d["valueItem"]
    if A not in roles or V not in roles or A == V:
        bad("anchor/value items")
    parts = {g["item"]: g for g in gold["parts"]}
    if len(gold["parts"]) != 2 or set(parts) != {A, V}:
        bad("gold items")
    for name, g in parts.items():
        if not rect_ok(g["rect"]) or [g["rect"][2] - g["rect"][0], g["rect"][3] - g["rect"][1]] != g["size"] or render["items"][name]["ink"] != g["rect"]:
            bad(f"gold rect {name}")
    a_ink, v_ink = parts[A]["rect"], parts[V]["rect"]

    if pred["status"] != "ok" or pred["width"] != W or pred["height"] != H:
        bad("prediction")
    k0, k1 = pred["k0"], pred["k1"]
    if k0["status"] != "ok" or k0["matched"] is not False:
        bad("K0 is not an ok non-match")
    if k1["status"] != "ok" or k1["branch"] != "hangul" or k1["matched"] is not True:
        bad("K1 not an ok Hangul match")
    lines = ocr["ocrLines"]
    for ln in lines:
        to_xyxy(ln["box"])
        if not isinstance(ln["text"], str) or not is_num(ln["confidence"]):
            bad("OCR line")
        for w in ln["words"]:
            to_xyxy(w["box"])
    pick = k1_pick(lines, d["question"])
    if pick is None:
        bad("no Hangul line recomputed")
    li, sc, hits = pick
    if (k1["lineIndex"], k1["score"], k1["hitWords"]) != (li, sc, hits):
        bad(f"stored K1 ({k1['lineIndex']}, {k1['score']}, {k1['hitWords']}) != recount ({li}, {sc}, {hits})")
    line = lines[li]
    if k1["lineText"] != line["text"] or k1["lineBox"] != line["box"]:
        bad("lineText/lineBox")

    band = band_edges(k1["band"], W, H)
    a_short, v_short = shortfall(tuple(a_ink), band), shortfall(tuple(v_ink), band)
    a_in, v_in = not any(a_short), not any(v_short)
    containment = {(True, True): "both", (True, False): "anchorOnly", (False, True): "valueOnly", (False, False): "neither"}[(a_in, v_in)]
    evidence = {"both": "all", "neither": "none"}.get(containment, "partial")
    strict = containment == "both" and Fraction(k1["band"]["width"]) * Fraction(k1["band"]["height"]) < W * H
    if (score["evidence"], score["strict"], score["state"]) != (evidence, strict, "matched_strict" if strict else "matched_not_strict"):
        bad("score row differs from the recount")
    role = "control" if strict else "primary"
    want_c = {"id": pid, "doctype": d["doctype"], "layout": d["layout"], "role": role, "strict": strict, "evidence": evidence, "branch": "hangul", "state": score["state"]}
    if c != want_c:
        bad("cohort row differs")

    anchor_cell = dict(cells)[A]
    facts = [[word_facts(w, cells, A, anchor_cell, tuple(a_ink)) for w in ln["words"]] for ln in lines]
    recs = facts[li]
    q = syllable_pairs(d["question"])
    cue_lines = [{"lineIndex": i, "k1Score": line_score(lines[i], q)} for i, fs in enumerate(facts) if any(f["strictAnchorCue"] for f in fs)]
    live = [r for r in recs if not r["blank"]]
    hit_recs = [(j, recs[j]) for j in hits]
    hit_live = [(j, r) for j, r in hit_recs if not r["blank"]]
    flat_anchor = squeeze(texts[A])

    row = OrderedDict()
    row["id"] = pid
    row["doctype"], row["layout"], row["role"], row["strict"], row["evidence"] = d["doctype"], d["layout"], role, strict, evidence
    row["containment"], row["anchorContained"], row["valueContained"] = containment, a_in, v_in
    row["anchorDeficit"] = dict(zip(SIDES, a_short))
    row["valueDeficit"] = dict(zip(SIDES, v_short))
    row["requiredExpansion"] = {s: max(x, y) for s, x, y in zip(SIDES, a_short, v_short)}
    row["band"], row["bandXyxy"] = k1["band"], list(band)
    row["anchorInk"], row["valueInk"], row["anchorItem"], row["valueItem"] = a_ink, v_ink, A, V
    row["lineIndex"], row["lineText"] = li, line["text"]
    row["lineClass"] = line_class(recs, A)
    row["lineMixed"] = is_mixed(recs)
    row["lineItems"] = [{"item": i, "role": roles[i]} for i in line_items(recs)]
    row["lineWordCount"] = len(recs)
    row["lineBlankWords"] = len(recs) - len(live)
    row["lineAnchorBoundaryWords"] = sum(r["anchorBoundary"] for r in live)
    row["lineUnassignedWords"] = sum(not r["cellItems"] for r in live)
    row["lineAmbiguousWords"] = sum(len(r["cellItems"]) > 1 for r in live)
    row["hitWords"] = hits
    row["hitAnchorCue"] = any(r["strictAnchorCue"] for _, r in hit_live)
    row["hitOtherItem"] = any(r["assigned"] not in (None, A) for _, r in hit_live)
    row["triggerSource"] = trigger_source(recs, hits, A)
    row["hitItems"] = [{"word": j, "item": r["assigned"], "role": roles[r["assigned"]]} for j, r in hit_live if r["assigned"] is not None]
    row["hitUnassigned"] = sum(not r["cellItems"] for _, r in hit_live)
    row["hitAmbiguous"] = sum(len(r["cellItems"]) > 1 for _, r in hit_live)
    row["hitAnchorBoundary"] = sum(r["anchorBoundary"] for _, r in hit_live)
    row["hitBlank"] = len(hit_recs) - len(hit_live)
    row["hitTextInAnchorText"] = any(squeeze(r["text"]) in flat_anchor for _, r in hit_live)
    row["k1Score"] = sc
    row["cueLines"] = cue_lines
    row["otherLineCue"] = any(x["lineIndex"] != li for x in cue_lines)
    row["words"] = [dict(index=j, **{k: (list(v) if k == "xyxy" else v) for k, v in r.items()}) for j, r in enumerate(recs)]
    return row


# ---------------------------------------------------------------- summary recount
def count(rows, key, values):
    return {v: sum(1 for r in rows if key(r) == v) for v in values}


def table(rows, rkey, rvals, ckey, cvals):
    return {rv: count([r for r in rows if rkey(r) == rv], ckey, cvals) for rv in rvals}


def other_cue(rows):
    o = dict(selectedWithoutCue=0, cueOnOtherLine=0, noCueAnywhere=0, otherCueScoreLower=0, otherCueScoreEqual=0, otherCueScoreHigher=0)
    for r in rows:
        if r["lineClass"] == "anchorCue":
            continue
        o["selectedWithoutCue"] += 1
        scores = [c["k1Score"] for c in r["cueLines"] if c["lineIndex"] != r["lineIndex"]]
        if not scores:
            o["noCueAnywhere"] += 1
            continue
        o["cueOnOtherLine"] += 1
        m = max(scores)
        o["otherCueScoreLower" if m < r["k1Score"] else "otherCueScoreEqual" if m == r["k1Score"] else "otherCueScoreHigher"] += 1
    return o


def block(rows):
    return {"n": len(rows), "primary": sum(r["role"] == "primary" for r in rows), "control": sum(r["role"] == "control" for r in rows),
            "containment": count(rows, lambda r: r["containment"], CONTAINMENTS),
            "lineClass": count(rows, lambda r: r["lineClass"], LINE_CLASSES),
            "triggerSource": count(rows, lambda r: r["triggerSource"], TRIGGERS)}


def recount_summary(rows):
    groups = {"primary": [r for r in rows if r["role"] == "primary"], "control": [r for r in rows if r["role"] == "control"], "all": rows}

    def per(f):
        return {g: f(rs) for g, rs in groups.items()}

    def sides(rs, field):
        return {s: sum(1 for r in rs if r[field][s] > 0) for s in SIDES}

    def by(key):
        return {k: block([r for r in rows if key(r) == k]) for k in sorted({key(r) for r in rows})}

    return {
        "denominators": {"all": len(rows), "primary": len(groups["primary"]), "control": len(groups["control"])},
        "containment": per(lambda rs: count(rs, lambda r: r["containment"], CONTAINMENTS)),
        "containmentByLineClass": per(lambda rs: table(rs, lambda r: r["containment"], CONTAINMENTS, lambda r: r["lineClass"], LINE_CLASSES)),
        "containmentByTrigger": per(lambda rs: table(rs, lambda r: r["containment"], CONTAINMENTS, lambda r: r["triggerSource"], TRIGGERS)),
        "lineClassByTrigger": per(lambda rs: table(rs, lambda r: r["lineClass"], LINE_CLASSES, lambda r: r["triggerSource"], TRIGGERS)),
        "lineClassByMixed": per(lambda rs: table(rs, lambda r: r["lineClass"], LINE_CLASSES, lambda r: "mixed" if r["lineMixed"] else "notMixed", ("mixed", "notMixed"))),
        "hitTextInAnchorTextByTrigger": per(lambda rs: table(rs, lambda r: r["triggerSource"], TRIGGERS, lambda r: "true" if r["hitTextInAnchorText"] else "false", ("true", "false"))),
        "otherLineCue": per(other_cue),
        "deficitSides": per(lambda rs: sides(rs, "requiredExpansion")),
        "anchorDeficitSides": per(lambda rs: sides(rs, "anchorDeficit")),
        "valueDeficitSides": per(lambda rs: sides(rs, "valueDeficit")),
        "byLayout": by(lambda r: r["layout"]),
        "byDoctype": by(lambda r: r["doctype"]),
        "byDoctypeLayout": by(lambda r: f"{r['doctype']}/{r['layout']}"),
    }


# ---------------------------------------------------------------- comparison by value, both directions
def same(a, b):
    if isinstance(a, bool) or isinstance(b, bool):
        return isinstance(a, bool) and isinstance(b, bool) and a == b
    if isinstance(a, (int, float, Fraction)) and isinstance(b, (int, float, Fraction)):
        return Fraction(a) == Fraction(b)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(same(a[k], b[k]) for k in a)
    return type(a) is type(b) and a == b


def compare_rows(js_rows, py_rows, key="id"):
    problems = []

    def index(rows, side):
        m = {}
        for r in rows:
            m.setdefault(r[key], []).append(r)
        for k, v in m.items():
            if len(v) > 1:
                problems.append({"id": k, "field": None, "problem": f"duplicate in {side}"})
        return m

    a, b = index(js_rows, "js"), index(py_rows, "recount")
    for k in a:
        if k not in b:
            problems.append({"id": k, "field": None, "problem": "only in js"})
    for k in b:
        if k not in a:
            problems.append({"id": k, "field": None, "problem": "only in recount"})
    for k in a:
        if k in b and len(a[k]) == 1 and len(b[k]) == 1:
            x, y = a[k][0], b[k][0]
            for f in sorted(set(x) | set(y)):
                if f not in x or f not in y:
                    problems.append({"id": k, "field": f, "problem": "field only in " + ("recount" if f not in x else "js")})
                elif not same(x[f], y[f]):
                    problems.append({"id": k, "field": f, "problem": "value", "js": x[f], "recount": jsonable(y[f])})
    if [r[key] for r in js_rows] != [r[key] for r in py_rows]:
        problems.append({"id": None, "field": None, "problem": "row order differs"})
    return problems


def jsonable(v):
    if isinstance(v, Fraction):
        return float(v) if Fraction(float(v)) == v else str(v)
    if isinstance(v, (list, tuple)):
        return [jsonable(x) for x in v]
    if isinstance(v, dict):
        return {k: jsonable(x) for k, x in v.items()}
    return v


# ---------------------------------------------------------------- driver
def jsonl(data):
    return [json.loads(l) for l in data.decode("utf-8").split("\n") if l.strip()]


def unique(rows, key, label, expected):
    keys = [key(r) for r in rows]
    if len(set(keys)) != len(keys) or set(keys) != expected:
        raise RecountError(f"{label}: keys are not unique or not the full set")
    return len(keys)


def recount(run, pages_file, summary_file):
    pins = json.load(open(os.path.join(RESULT_DIR, "source-pins.json"), encoding="utf-8"))
    src = pins["source"]

    def read(rel):
        return pinned(src["commit"], f"{src['basePath']}/{rel}", src["files"][rel])

    raw = {rel: read(rel) for rel in ("data/design.json", "data/render.json", "data/gold.json", "data/manifest.json",
                                       f"run-{run}/predictions.jsonl", f"run-{run}/ocr.jsonl", f"run-{run}/freeze.json", f"score-{run}/score.jsonl")}
    freeze = json.loads(raw[f"run-{run}/freeze.json"])
    for f in ("predictions.jsonl", "ocr.jsonl"):
        if freeze["files"][f] != sha256(raw[f"run-{run}/{f}"]):
            raise RecountError(f"{f} differs from freeze.json")
    manifest = json.loads(raw["data/manifest.json"])
    for f in ("design.json", "render.json", "gold.json"):
        if manifest["files"][f]["sha256"] != sha256(raw[f"data/{f}"]):
            raise RecountError(f"{f} differs from manifest.json")

    design = json.loads(raw["data/design.json"])["images"]
    render = json.loads(raw["data/render.json"])["images"]
    gold = json.loads(raw["data/gold.json"])["gold"]
    preds, ocr, score = jsonl(raw[f"run-{run}/predictions.jsonl"]), jsonl(raw[f"run-{run}/ocr.jsonl"]), jsonl(raw[f"score-{run}/score.jsonl"])
    ids = [d["id"] for d in design]
    if len(set(ids)) != PAGES or len(ids) != PAGES:
        raise RecountError("design is not 96 unique pages")
    den = {
        "pages": PAGES,
        "predictions": unique(preds, lambda r: (r["ocr"], r["id"]), "predictions", {(o, i) for o in ("O0", "O1") for i in ids}),
        "ocr": unique(ocr, lambda r: (r["ocr"], r["id"]), "ocr", {(o, i) for o in ("O0", "O1") for i in ids}),
        "score": unique(score, lambda r: (r["cond"], r["id"]), "score", {(c, i) for c in ("O0K0", "O0K1", "O1K0", "O1K1") for i in ids}),
    }

    # cohort rebuilt from raw rows, then compared with the registered file
    S = {(r["cond"], r["id"]): r for r in score}
    D = {d["id"]: d for d in design}
    ko_nl = [d["id"] for d in design if d["lang"] == "ko" and d["anchor"] == "nl"]
    cohort_bytes = open(os.path.join(RESULT_DIR, "cohort.json"), "rb").read()
    cohort = json.loads(cohort_bytes)
    rebuilt = [{"id": i, "doctype": D[i]["doctype"], "layout": D[i]["layout"], "role": "control" if S[("O1K1", i)]["strict"] else "primary",
                "strict": S[("O1K1", i)]["strict"], "evidence": S[("O1K1", i)]["evidence"], "branch": S[("O1K1", i)]["branch"], "state": S[("O1K1", i)]["state"]} for i in ko_nl]
    if cohort["pages"] != rebuilt or len(rebuilt) != COHORT or sum(c["role"] == "primary" for c in rebuilt) != PRIMARY:
        raise RecountError("cohort.json differs from the raw score rows")
    combos = {}
    for c in rebuilt:
        combos[(c["doctype"], c["layout"])] = combos.get((c["doctype"], c["layout"]), 0) + 1
    if len(combos) != 6 or set(combos.values()) != {4}:
        raise RecountError("cohort is not 6 x 4")

    P = {(r["ocr"], r["id"]): r for r in preds}
    O = {(r["ocr"], r["id"]): r for r in ocr}
    rows = [page_row(c["id"], c, D[c["id"]], render[c["id"]], gold[c["id"]], P[("O1", c["id"])], O[("O1", c["id"])], S[("O1K1", c["id"])]) for c in cohort["pages"]]
    split = count(rows, lambda r: r["containment"], CONTAINMENTS)
    if split != {k: REGISTERED[k] for k in CONTAINMENTS}:
        raise RecountError(f"containment split {split} differs from the registered {REGISTERED}")

    summary = recount_summary(rows)
    summary["registeredSplit"] = split
    summary["sourceDenominators"] = dict(den, cohort=COHORT, primary=PRIMARY, control=COHORT - PRIMARY)
    summary["protocol"] = "research/plans/2026-11-24-ko-window-diagnostic-protocol.md"
    summary["inputs"] = {"sourceCommit": src["commit"], "k1LibraryBlob": pins["k1Definition"]["blob"], "cohortSha256": sha256(cohort_bytes),
                         "sha256": {"design": sha256(raw["data/design.json"]), "render": sha256(raw["data/render.json"]), "gold": sha256(raw["data/gold.json"]),
                                    "predictions": sha256(raw[f"run-{run}/predictions.jsonl"]), "ocr": sha256(raw[f"run-{run}/ocr.jsonl"]), "score": sha256(raw[f"score-{run}/score.jsonl"])}}

    js_rows = [json.loads(l) for l in open(pages_file, encoding="utf-8").read().split("\n") if l.strip()]
    js_summary = json.load(open(summary_file, encoding="utf-8"))
    page_problems = compare_rows(js_rows, rows)
    summary_problems = [{"key": k, "js": js_summary.get(k), "recount": summary.get(k)} for k in sorted(set(js_summary) | set(summary)) if not same(js_summary.get(k), summary.get(k))]
    return {
        "run": run,
        "ok": not page_problems and not summary_problems,
        "sourceCommit": src["commit"],
        "inputsChecked": "15 pinned blobs read from Git (blob id, SHA-256, size); freeze.json and manifest.json cross-checked",
        "denominators": summary["sourceDenominators"],
        "pagesCompared": {"js": len(js_rows), "recount": len(rows)},
        "fieldsComparedPerPage": sorted(rows[0].keys()),
        "pageProblems": page_problems,
        "summaryKeysCompared": sorted(set(js_summary) | set(summary)),
        "summaryProblems": jsonable(summary_problems),
        "recount": {"registeredSplit": split, "containmentByLineClass": summary["containmentByLineClass"], "otherLineCue": summary["otherLineCue"]},
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True, choices=("a", "b"))
    ap.add_argument("--pages", required=True)
    ap.add_argument("--summary", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    if os.path.exists(a.out):
        raise SystemExit(f"--out must not exist yet: {a.out}")
    try:
        res = recount(a.run, a.pages, a.summary)
    except RecountError as e:
        res = {"run": a.run, "ok": False, "error": str(e)}
    with open(a.out, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(json.dumps(res, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"run": a.run, "ok": res["ok"], "pageProblems": len(res.get("pageProblems", [])), "summaryProblems": len(res.get("summaryProblems", [])), "error": res.get("error")}))
    return 0 if res["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
