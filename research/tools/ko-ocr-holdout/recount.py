#!/usr/bin/env python3
"""Independent recount for ko-ocr-holdout (Python 3.12, standard library only).

Implements tools/ko-ocr-holdout/RECOUNT_SPEC.md. It re-derives hashes, gold-box
checks, K0/K1 key results, row verdicts and every aggregate from raw data and
compares them with the recorded run and score files.
"""
import argparse
import hashlib
import json
import math
import os
import re
import struct
import sys
import unicodedata
import zlib
from decimal import Decimal

PAGE_W, PAGE_H = 1280, 960
CONDS = ["O0K0", "O0K1", "O1K0", "O1K1"]
DOCTYPES = ["repair", "greenhouse", "rental"]
LAYOUTS = ["slip", "intake"]
CELLS = ["en/code", "en/nl", "ko/code", "ko/nl"]
PAIRS = [("O0K0", "O0K1"), ("O1K0", "O1K1"), ("O0K0", "O1K0"), ("O0K1", "O1K1"), ("O0K0", "O1K1")]
MAX_MISMATCH = 50

STOP = set(
    "what which when where who how much many the and for are was were with from that this into onto "
    "shown show written according answer number value label labeled labelled noted under screen image "
    "chart line card item bottom top next turned does there their your have has".split(" ")
)
YESNO = {"off", "yes"}


# ---------------------------------------------------------------- JS helpers
def js_round(x):
    """JS Math.round: nearest integer, ties toward +infinity."""
    f = math.floor(x)
    return f + 1 if x - f >= 0.5 else f


def pct(c, n):
    if n == 0:
        return None
    return js_round(c * 10000 / n) / 100


def u16len(s):
    return len(s.encode("utf-16-le")) // 2


def js_number(x):
    """Number -> string following ECMAScript Number::toString."""
    if isinstance(x, bool):
        raise TypeError("bool is not a number")
    if isinstance(x, int):
        return str(x)
    if x != x or x in (math.inf, -math.inf):
        return "null"  # JSON.stringify prints null for non-finite numbers
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    d = Decimal(repr(abs(x)))
    t = d.as_tuple()
    n = len(t.digits) + t.exponent  # value = 0.DIGITS * 10^n
    stripped = "".join(map(str, t.digits))
    lead = len(stripped) - len(stripped.lstrip("0"))
    stripped = stripped.lstrip("0")
    n -= lead
    digits = stripped.rstrip("0")
    k = len(digits)
    if k <= n <= 21:
        s = digits + "0" * (n - k)
    elif 0 < n <= 21:
        s = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        s = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        es = ("+" if e >= 0 else "-") + str(abs(e))
        s = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + es
    return sign + s


def js_stringify(v):
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return js_number(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ",".join(js_stringify(i) for i in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + js_stringify(x) for k, x in v.items()) + "}"
    raise TypeError(type(v))


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


def sha_text(s):
    return sha_bytes(s.encode("utf-8"))


# ------------------------------------------------------------------ file I/O
def read_json(path):
    with open(path, "rb") as f:
        return json.loads(f.read().decode("utf-8"))


def read_jsonl(path):
    with open(path, "rb") as f:
        raw = f.read()
    if b"\r" in raw:
        raise ValueError("CR found in " + path)
    text = raw.decode("utf-8")
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    rows = []
    for i, ln in enumerate(lines):
        if ln == "":
            raise ValueError("empty line %d in %s" % (i + 1, path))
        rows.append(json.loads(ln))
    return rows


# -------------------------------------------------------------- fixed selector
def tokens(s):
    return [t for t in re.sub(r"[^a-z0-9\- ]", " ", s.lower()).split(" ") if t]


def keywords(question):
    seen = []
    for t in tokens(question):
        if len(t) >= 3 and t not in STOP and t not in seen:
            seen.append(t)
    return seen


def line_score(line, keys):
    words = tokens(line["text"])
    n = 0
    for k in keys:
        for w in words:
            if w == k or (len(k) >= 4 and (w.startswith(k) or k.startswith(w)) and len(w) >= 4):
                n += 1
                break
    return n


def window_for(line, anchor, width, height):
    box = line["box"]
    lh = max(8, box[3])
    words = line["words"]
    mean_len = sum(u16len(w["text"]) for w in words) / max(1, len(words))
    axis_row = len(words) >= 8 and mean_len <= 4 and anchor[2] < 0.25 * box[2]
    if axis_row:
        half = max(1.5 * anchor[2], 3 * lh)
        cx = anchor[0] + anchor[2] / 2
        x0, x1 = cx - half, cx + half
        y0, y1 = anchor[1] - 0.75 * height, anchor[1] + anchor[3] + 6 * lh
    else:
        x0, x1 = min(anchor[0], box[0]) - 4 * lh, box[0] + box[2] + 8 * lh
        y0, y1 = box[1] - 3 * lh, box[1] + box[3] + 6 * lh

    def grow(a, b, mn):
        need = mn - (b - a)
        return (a - need / 2, b + need / 2) if need > 0 else (a, b)

    x0, x1 = grow(x0, x1, 256)
    y0, y1 = grow(y0, y1, 128)
    left, top = max(0, math.floor(x0)), max(0, math.floor(y0))
    right, bottom = min(width, math.ceil(x1)), min(height, math.ceil(y1))
    return axis_row, {"left": left, "top": top, "width": right - left, "height": bottom - top}


def union_box(boxes):
    a = boxes[0]
    for b in boxes[1:]:
        a = [
            min(a[0], b[0]),
            min(a[1], b[1]),
            max(a[0] + a[2], b[0] + b[2]) - min(a[0], b[0]),
            max(a[1] + a[3], b[1] + b[3]) - min(a[1], b[1]),
        ]
    return a


def select_window(lines, question, width, height):
    keys = [k for k in keywords(question) if k not in YESNO]

    def match_word(w):
        toks = tokens(w)
        t = toks[0] if toks else ""
        return any(t == k or (len(k) >= 4 and len(t) >= 4 and (t.startswith(k) or k.startswith(t))) for k in keys)

    best = None
    for line in lines:
        sc = line_score(line, keys)
        if sc > 0 and (best is None or sc > best[0] or (sc == best[0] and line["confidence"] > best[1]["confidence"])):
            best = (sc, line)
    if best is None:
        return {"matched": False, "keys": keys}
    sc, line = best
    hits = [w for w in line["words"] if match_word(w["text"])]
    anchor = union_box([w["box"] for w in hits]) if hits else line["box"]
    axis_row, band = window_for(line, anchor, width, height)
    return {
        "matched": True, "keys": keys, "score": sc, "lineText": line["text"],
        "confidence": js_round(line["confidence"]), "axisRow": axis_row, "band": band,
    }


def window_valid(band):
    vals = [band["left"], band["top"], band["width"], band["height"]]
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in vals):
        return False
    return (band["width"] > 0 and band["height"] > 0 and band["left"] >= 0 and band["top"] >= 0
            and band["left"] + band["width"] <= PAGE_W and band["top"] + band["height"] <= PAGE_H)


def expected_k0(lines, question):
    """Returns dict with 'error' (None or 'invalid_output') and result fields."""
    r = select_window(lines, question, PAGE_W, PAGE_H)
    if not r["matched"]:
        return {"error": None, "matched": False, "score": 0, "lineIndex": None, "lineText": None,
                "confidence": None, "axisRow": None, "band": None, "lineBox": None}
    best_i = None
    best_s = 0
    for i, line in enumerate(lines):
        one = select_window([line], question, PAGE_W, PAGE_H)
        s = one["score"] if one["matched"] else 0
        if s > 0 and (best_i is None or s > best_s or (s == best_s and line["confidence"] > lines[best_i]["confidence"])):
            best_i, best_s = i, s
    err = None if window_valid(r["band"]) else "invalid_output"
    return {"error": err, "matched": True, "score": r["score"], "lineIndex": best_i, "lineText": r["lineText"],
            "confidence": r["confidence"], "axisRow": r["axisRow"], "band": r["band"],
            "lineBox": lines[best_i]["box"]}


def bigrams(s):
    s = unicodedata.normalize("NFC", s)
    out = set()
    for m in re.finditer("[가-힣]+", s):
        run = m.group(0)
        for i in range(len(run) - 1):
            out.add(run[i:i + 2])
    return out


def expected_k1(lines, question, k0):
    if k0["matched"]:
        out = dict(k0)
        out.update({"branch": "k0", "anchor": None, "hitWords": None})
        return out
    none = {"error": None, "matched": False, "score": 0, "lineIndex": None, "lineText": None,
            "confidence": None, "axisRow": None, "band": None, "lineBox": None,
            "branch": "none", "anchor": None, "hitWords": None}
    q = bigrams(question)
    if not q:
        return none
    word_bg = [[bigrams(w["text"]) for w in line["words"]] for line in lines]
    best_i, best_s = None, 0
    for i, line in enumerate(lines):
        u = set()
        for b in word_bg[i]:
            u |= b
        s = len(q & u)
        if s > 0 and (best_i is None or s > best_s or (s == best_s and line["confidence"] > lines[best_i]["confidence"])):
            best_i, best_s = i, s
    if best_i is None:
        return none
    line = lines[best_i]
    hit = [j for j, b in enumerate(word_bg[best_i]) if b & q]
    anchor = union_box([line["words"][j]["box"] for j in hit])
    axis_row, band = window_for(line, anchor, PAGE_W, PAGE_H)
    err = None if window_valid(band) else "invalid_output"
    return {"error": err, "matched": True, "score": best_s, "lineIndex": best_i, "lineText": line["text"],
            "confidence": js_round(line["confidence"]), "axisRow": axis_row, "band": band,
            "lineBox": line["box"], "branch": "hangul", "anchor": anchor, "hitWords": hit}


# ------------------------------------------------------------- input validity
def is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def valid_box(b):
    return isinstance(b, list) and len(b) == 4 and all(is_num(v) for v in b)


def valid_lines(lines):
    if not isinstance(lines, list):
        return False
    for ln in lines:
        if not isinstance(ln, dict):
            return False
        if not isinstance(ln.get("text"), str) or not is_num(ln.get("confidence")) or not valid_box(ln.get("box")):
            return False
        if not isinstance(ln.get("words"), list):
            return False
        for w in ln["words"]:
            if not isinstance(w, dict) or not isinstance(w.get("text"), str) or not valid_box(w.get("box")):
                return False
    return True


# ------------------------------------------------------------------ PNG decode
def decode_png(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat, ihdr = 8, b"", None
    while pos < len(data):
        ln, typ = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + ln]
        pos += 12 + ln
        if typ == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
    if ihdr is None:
        raise ValueError("no IHDR")
    w, h, depth, ctype, _comp, _filt, interlace = ihdr
    if depth != 8 or ctype != 0 or interlace != 0:
        raise ValueError("unsupported PNG (need 8-bit gray, non-interlaced): %r" % (ihdr,))
    raw = zlib.decompress(idat)
    if len(raw) != h * (w + 1):
        raise ValueError("bad decompressed length")
    rows, prev = [], bytearray(w)
    for y in range(h):
        base = y * (w + 1)
        ft = raw[base]
        cur = bytearray(raw[base + 1:base + 1 + w])
        if ft == 0:
            pass
        elif ft == 1:
            for x in range(1, w):
                cur[x] = (cur[x] + cur[x - 1]) & 255
        elif ft == 2:
            for x in range(w):
                cur[x] = (cur[x] + prev[x]) & 255
        elif ft == 3:
            for x in range(w):
                a = cur[x - 1] if x else 0
                cur[x] = (cur[x] + ((a + prev[x]) >> 1)) & 255
        elif ft == 4:
            for x in range(w):
                a = cur[x - 1] if x else 0
                b = prev[x]
                c = prev[x - 1] if x else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                cur[x] = (cur[x] + pr) & 255
        else:
            raise ValueError("bad filter %d" % ft)
        rows.append(cur)
        prev = cur
    return w, h, rows


def edge_ink(rows, rect):
    """Per-edge: True if any pixel < 255 on that edge line inside the box."""
    l, t, r, b = rect
    top = any(v < 255 for v in rows[t][l:r])
    bottom = any(v < 255 for v in rows[b - 1][l:r])
    left = any(rows[y][l] < 255 for y in range(t, b))
    right = any(rows[y][r - 1] < 255 for y in range(t, b))
    return {"top": top, "bottom": bottom, "left": left, "right": right}


# ------------------------------------------------------------------ reporting
class Check:
    def __init__(self, name):
        self.name = name
        self.mismatches = []
        self.total_mismatches = 0
        self.unverifiable = []
        self.notes = []

    def bad(self, key, a, b):
        self.total_mismatches += 1
        if len(self.mismatches) < MAX_MISMATCH:
            self.mismatches.append({"key": key, "recount": a, "recorded": b})

    def to_json(self):
        return {"ok": self.total_mismatches == 0 and not self.unverifiable, "mismatchCount": self.total_mismatches,
                "mismatches": self.mismatches, "unverifiable": self.unverifiable, "notes": self.notes}


def deep_compare(chk, path, mine, recorded):
    if isinstance(mine, dict):
        if not isinstance(recorded, dict):
            chk.bad(path, mine, recorded)
            return
        for k in mine:
            if k not in recorded:
                chk.bad(path + "." + k, mine[k], "<missing>")
            else:
                deep_compare(chk, path + "." + k, mine[k], recorded[k])
        return
    if isinstance(mine, list):
        if not isinstance(recorded, list) or len(mine) != len(recorded):
            chk.bad(path, mine, recorded)
            return
        for i, (a, b) in enumerate(zip(mine, recorded)):
            deep_compare(chk, "%s[%d]" % (path, i), a, b)
        return
    if isinstance(mine, bool) or isinstance(recorded, bool) or mine is None or recorded is None:
        if mine is not recorded:
            chk.bad(path, mine, recorded)
        return
    if mine != recorded:
        chk.bad(path, mine, recorded)


# --------------------------------------------------------------------- loading
def load_design(data_dir):
    questions = read_json(os.path.join(data_dir, "questions.json"))["questions"]
    design = read_json(os.path.join(data_dir, "design.json"))["images"]
    gold = read_json(os.path.join(data_dir, "gold.json"))["gold"]
    return questions, design, gold


def judge(key, pred_ok, parts):
    """Row verdict dict from a recorded key result and gold parts."""
    if not pred_ok or key.get("status") != "ok":
        return {"state": "technical_error", "matched": None, "strict": False, "evidence": None, "fullPage": None}
    if not key.get("matched"):
        return {"state": "unmatched", "matched": False, "strict": False, "evidence": None, "fullPage": None}
    b = key["band"]
    left, top, w, h = b["left"], b["top"], b["width"], b["height"]
    inside = 0
    for p in parts:
        l, t, r, bb = p["rect"]
        if l >= left and t >= top and r <= left + w and bb <= top + h:
            inside += 1
    area = w * h
    strict = inside == 2 and 0 < area < PAGE_W * PAGE_H
    return {"state": "matched_strict" if strict else "matched_not_strict", "matched": True, "strict": strict,
            "evidence": {2: "all", 1: "partial", 0: "none"}[inside], "fullPage": area >= PAGE_W * PAGE_H}


def same_scalar(a, b):
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None:
        return a is b
    return a == b


def cond_key(row, cond):
    return row["k0"] if cond.endswith("K0") else row["k1"]


def cond_ocr(cond):
    return cond[:2]


# ----------------------------------------------------------------------- main
def run(args):
    data_dir, run_dir, base_dir, score_dir = args.data, args.run, args.baseline_run, args.score
    out = {"inputs": {"data": data_dir, "run": run_dir, "baselineRun": base_dir, "score": score_dir}}
    c1, c2, c3, c4 = Check("hash"), Check("keys"), Check("rows"), Check("aggregates")

    questions, design, gold = load_design(data_dir)
    qids = [q["id"] for q in questions]
    qtext = {q["id"]: q["question"] for q in questions}
    dmap = {d["id"]: d for d in design}

    # ------------------------------------------------------------- check 1
    manifest = read_json(os.path.join(data_dir, "manifest.json"))
    mfiles = manifest["files"]
    if manifest.get("count") != len(mfiles):
        c1.bad("manifest.count", len(mfiles), manifest.get("count"))
    present = set()
    for root, _dirs, files in os.walk(data_dir):
        for fn in files:
            rel = os.path.relpath(os.path.join(root, fn), data_dir).replace(os.sep, "/")
            if rel != "manifest.json":
                present.add(rel)
    for rel in sorted(set(mfiles) - present):
        c1.bad("manifest.missing:" + rel, "<absent>", "listed")
    for rel in sorted(present - set(mfiles)):
        c1.bad("manifest.extra:" + rel, "present", "<not listed>")
    for rel in sorted(set(mfiles) & present):
        with open(os.path.join(data_dir, rel), "rb") as f:
            b = f.read()
        if sha_bytes(b) != mfiles[rel]["sha256"]:
            c1.bad("manifest.sha256:" + rel, sha_bytes(b), mfiles[rel]["sha256"])
        if len(b) != mfiles[rel]["bytes"]:
            c1.bad("manifest.bytes:" + rel, len(b), mfiles[rel]["bytes"])

    for label, d in (("run", run_dir), ("baselineRun", base_dir)):
        if label == "baselineRun" and os.path.abspath(d) == os.path.abspath(run_dir):
            continue
        fz = read_json(os.path.join(d, "freeze.json"))["files"]
        for fn in ("predictions.jsonl", "ocr.jsonl"):
            with open(os.path.join(d, fn), "rb") as f:
                h = sha_bytes(f.read())
            if fz.get(fn) != h:
                c1.bad("freeze.%s:%s" % (label, fn), h, fz.get(fn))

    ids = [d["id"] for d in design]
    if len(design) != 96:
        c1.bad("design.count", len(design), 96)
    if len(set(ids)) != len(ids):
        c1.bad("design.uniqueIds", len(set(ids)), len(ids))
    if ids != qids:
        c1.bad("design.orderVsQuestions", "differs", "questions order")

    gold_parts = {}
    png_cache = {}
    for d in design:
        pid = d["id"]
        g = gold.get(pid)
        if g is None:
            c1.bad("gold.missing:" + pid, "<absent>", "")
            continue
        parts = g.get("parts")
        if not isinstance(parts, list) or len(parts) != 2:
            c1.bad("gold.partsCount:" + pid, 2, len(parts) if isinstance(parts, list) else parts)
            continue
        gold_parts[pid] = parts
        if parts[0].get("item") != d["anchorItem"]:
            c1.bad("gold.anchorItem:" + pid, d["anchorItem"], parts[0].get("item"))
        if parts[1].get("item") != d["valueItem"]:
            c1.bad("gold.valueItem:" + pid, d["valueItem"], parts[1].get("item"))
        for i, p in enumerate(parts):
            rect = p.get("rect")
            tag = "gold.rect:%s#%d" % (pid, i)
            if not (isinstance(rect, list) and len(rect) == 4
                    and all(isinstance(v, int) and not isinstance(v, bool) for v in rect)):
                c1.bad(tag + ".int", "int[4]", rect)
                continue
            l, t, r, b = rect
            if not (l < r and t < b and 0 <= l and r <= PAGE_W and 0 <= t and b <= PAGE_H):
                c1.bad(tag + ".range", "valid", rect)
            if p.get("size") != [r - l, b - t]:
                c1.bad(tag + ".size", [r - l, b - t], p.get("size"))
        # PNG
        path = os.path.join(data_dir, "images", d["file"])
        try:
            with open(path, "rb") as f:
                pb = f.read()
            png_cache[pid] = sha_bytes(pb)
            w, h, rows = decode_png(pb)
            if (w, h) != (PAGE_W, PAGE_H):
                c1.bad("png.size:" + pid, [PAGE_W, PAGE_H], [w, h])
                continue
            for i, p in enumerate(parts):
                rect = p.get("rect")
                if not (isinstance(rect, list) and len(rect) == 4 and all(isinstance(v, int) for v in rect)):
                    continue
                l, t, r, b = rect
                if not (0 <= l < r <= PAGE_W and 0 <= t < b <= PAGE_H):
                    continue
                ink = edge_ink(rows, rect)
                for edge, ok in ink.items():
                    if not ok:
                        c1.bad("png.edge:%s#%d.%s" % (pid, i, edge), "ink pixel <255", "all 255")
        except Exception as e:  # noqa: BLE001
            c1.bad("png.decode:" + pid, "decodable", repr(e))

    # --------------------------------------------------- load runs
    def load_run(d):
        return read_jsonl(os.path.join(d, "predictions.jsonl")), read_jsonl(os.path.join(d, "ocr.jsonl"))

    preds, ocrs = load_run(run_dir)
    if os.path.abspath(base_dir) == os.path.abspath(run_dir):
        bpreds = preds
    else:
        bpreds, _ = load_run(base_dir)

    expected_keys = [(o, i) for o in ("O0", "O1") for i in qids]
    for label, rows in (("predictions", preds), ("ocr", ocrs)):
        got = [(r.get("ocr"), r.get("id")) for r in rows]
        if got != expected_keys:
            c2.bad("rowOrder:" + label, "192 rows O0 then O1 in question order", "len=%d" % len(got))
    pmap = {(r["ocr"], r["id"]): r for r in preds}
    omap = {(r["ocr"], r["id"]): r for r in ocrs}

    for key in expected_keys:
        pr = pmap.get(key)
        if pr is not None and key[1] in png_cache and pr.get("pngSha256") != png_cache[key[1]]:
            c1.bad("predictions.pngSha256:%s/%s" % key, png_cache[key[1]], pr.get("pngSha256"))

    # ------------------------------------------------------------- check 2
    def key_expect_cmp(tag, expect, rec, fields):
        if expect["error"] is not None:
            if rec.get("status") != "error":
                c2.bad(tag + ".status", "error", rec.get("status"))
            elif rec.get("error") is None or expect["error"] not in js_stringify(rec.get("error")):
                c2.bad(tag + ".error", expect["error"], rec.get("error"))
            return
        if rec.get("status") != "ok":
            c2.bad(tag + ".status", "ok", rec.get("status"))
            return
        for f in fields:
            mine = expect[f]
            theirs = rec.get(f)
            if f == "band" and mine is not None and isinstance(theirs, dict):
                deep_compare(c2, tag + ".band", mine, theirs)
            elif isinstance(mine, (list, dict)) or isinstance(theirs, (list, dict)):
                deep_compare(c2, tag + "." + f, mine, theirs)
            elif isinstance(mine, bool) or mine is None or isinstance(theirs, bool) or theirs is None:
                if mine is not theirs:
                    c2.bad(tag + "." + f, mine, theirs)
            elif mine != theirs:
                c2.bad(tag + "." + f, mine, theirs)

    K0F = ["matched", "score", "lineIndex", "lineText", "confidence", "axisRow", "band"]
    K1F = K0F + ["branch", "anchor", "hitWords"]
    recount_keys = {}
    for key in expected_keys:
        tag = "%s/%s" % key
        pr, orow = pmap.get(key), omap.get(key)
        if pr is None or orow is None:
            c2.bad(tag, "row present", "missing")
            continue
        if orow.get("status") != "ok":
            if pr.get("status") != "error":
                c2.bad(tag + ".status", "error", pr.get("status"))
            for kk in ("k0", "k1"):
                if (pr.get(kk) or {}).get("status") != "error":
                    c2.bad("%s.%s.status" % (tag, kk), "error", (pr.get(kk) or {}).get("status"))
            continue
        lines = orow["ocrLines"]
        if not valid_lines(lines):
            if pr.get("status") != "error":
                c2.bad(tag + ".status", "error (invalid ocrLines)", pr.get("status"))
            for kk in ("k0", "k1"):
                if (pr.get(kk) or {}).get("status") != "error":
                    c2.bad("%s.%s.status" % (tag, kk), "error", (pr.get(kk) or {}).get("status"))
            continue
        if pr.get("status") != "ok":
            c2.bad(tag + ".status", "ok", pr.get("status"))
        # hash
        h = sha_text(js_stringify(lines))
        if pr.get("ocrSha256") != h:
            plain = sha_text(json.dumps(lines, ensure_ascii=False, separators=(",", ":")))
            c2.bad(tag + ".ocrSha256", h, pr.get("ocrSha256"))
            if pr.get("ocrSha256") == plain:
                c2.notes.append("%s: recorded ocrSha256 matches plain Python number notation, not JS (number notation issue)" % tag)
        q = qtext[key[1]]
        k0 = expected_k0(lines, q)
        k1 = expected_k1(lines, q, k0)
        recount_keys[key] = (k0, k1)
        key_expect_cmp(tag + ".k0", k0, pr.get("k0") or {}, K0F)
        key_expect_cmp(tag + ".k1", k1, pr.get("k1") or {}, K1F)

    # ------------------------------------------------------------- check 3
    page_info = {}
    for d in design:
        page_info[d["id"]] = {"doctype": d["doctype"], "layout": d["layout"],
                              "cell": "%s/%s" % (d["lang"], d["anchor"]),
                              "primary": d["lang"] == "ko" and d["anchor"] == "nl"}
        # spec: primary = ko/nl; cell = <lang>/<anchor>

    def verdicts(prows):
        pm = {(r["ocr"], r["id"]): r for r in prows}
        res = {}
        for cond in CONDS:
            for i in qids:
                pr = pm[(cond_ocr(cond), i)]
                parts = gold_parts.get(i, [])
                res[(cond, i)] = judge(cond_key(pr, cond), pr.get("status") == "ok", parts)
        return res

    verd = verdicts(preds)
    base_verd = verd if bpreds is preds else verdicts(bpreds)
    base_group, base_strict = {}, {}
    for i in qids:
        v = base_verd[("O0K0", i)]
        g = "E" if v["state"] == "technical_error" else ("M" if v["state"] == "unmatched" else "C")
        base_group[i] = g
        base_strict[i] = g == "C" and v["strict"]

    score_rows = read_jsonl(os.path.join(score_dir, "score.jsonl"))
    exp_rows = [(c, i) for c in CONDS for i in qids]
    if len(score_rows) != 384:
        c3.bad("score.rowCount", 384, len(score_rows))
    if [(r.get("cond"), r.get("id")) for r in score_rows] != exp_rows:
        c3.bad("score.rowOrder", "cond x question order", "differs")
    srow = {(r.get("cond"), r.get("id")): r for r in score_rows}
    for (cond, i) in exp_rows:
        r = srow.get((cond, i))
        tag = "%s/%s" % (cond, i)
        if r is None:
            c3.bad(tag, "row", "missing")
            continue
        v = verd[(cond, i)]
        pi = page_info[i]
        exp = {"state": v["state"], "matched": v["matched"], "strict": v["strict"], "evidence": v["evidence"],
               "fullPage": v["fullPage"], "doctype": pi["doctype"], "layout": pi["layout"], "cell": pi["cell"],
               "primary": pi["primary"], "baselineGroup": base_group[i], "baselineStrict": base_strict[i]}
        for f, mine in exp.items():
            theirs = r.get(f, "<missing>")
            if not same_scalar(mine, theirs):
                c3.bad("%s.%s" % (tag, f), mine, theirs)

    # ------------------------------------------------------------- check 4
    def block(items):
        b = {"n": len(items), "technicalError": 0, "matched": 0, "unmatched": 0, "strict": 0,
             "evidenceAll": 0, "evidencePartial": 0, "evidenceNone": 0, "fullPage": 0}
        for v in items:
            if v["state"] == "technical_error":
                b["technicalError"] += 1
            elif v["state"] == "unmatched":
                b["unmatched"] += 1
            else:
                b["matched"] += 1
                b[{"all": "evidenceAll", "partial": "evidencePartial", "none": "evidenceNone"}[v["evidence"]]] += 1
                if v["fullPage"]:
                    b["fullPage"] += 1
            if v["strict"]:
                b["strict"] += 1
        b["strictPct"] = pct(b["strict"], b["n"])
        return b

    M = [i for i in qids if base_group[i] == "M"]
    C = [i for i in qids if base_group[i] == "C"]
    E = [i for i in qids if base_group[i] == "E"]
    S = [i for i in qids if base_strict[i]]
    prim = [i for i in qids if page_info[i]["primary"]]
    pM = [i for i in prim if base_group[i] == "M"]
    pC = [i for i in prim if base_group[i] == "C"]
    pE = [i for i in prim if base_group[i] == "E"]
    pS = [i for i in prim if base_strict[i]]
    baseline = {"M": len(M), "C": len(C), "E": len(E), "S": len(S),
                "primary": {"M": len(pM), "C": len(pC), "E": len(pE), "S": len(pS)}}
    if len(M) + len(C) + len(E) != 96:
        c4.bad("baseline.sum", 96, len(M) + len(C) + len(E))
    if len(prim) != 24 or len(pM) + len(pC) + len(pE) != 24:
        c4.bad("baseline.primarySum", 24, [len(prim), len(pM) + len(pC) + len(pE)])

    conditions, primary, transitions = {}, {}, {}
    for cond in CONDS:
        v = lambda i, cond=cond: verd[(cond, i)]  # noqa: E731
        cb = {"total": block([v(i) for i in qids])}
        cb["byDoctype"] = {dt: block([v(i) for i in qids if page_info[i]["doctype"] == dt]) for dt in DOCTYPES}
        cb["byLayout"] = {ly: block([v(i) for i in qids if page_info[i]["layout"] == ly]) for ly in LAYOUTS}
        cb["byDoctypeLayout"] = {"%s/%s" % (dt, ly): block([v(i) for i in qids if page_info[i]["doctype"] == dt and page_info[i]["layout"] == ly])
                                 for dt in DOCTYPES for ly in LAYOUTS}
        cb["byCell"] = {ce: block([v(i) for i in qids if page_info[i]["cell"] == ce]) for ce in CELLS}
        conditions[cond] = cb

        rm = [i for i in pM if v(i)["state"] in ("matched_strict", "matched_not_strict")]
        rs = [i for i in pM if v(i)["strict"]]
        re_ = [i for i in pM if v(i)["state"] == "technical_error"]
        pb = block([v(i) for i in prim])
        primary[cond] = {
            "n": len(prim), "M": len(pM), "C": len(pC), "E": len(pE),
            "recoveredMatch": len(rm), "recoveredStrict": len(rs), "recoveredErrors": len(re_),
            "strict": pb["strict"], "matched": pb["matched"], "unmatched": pb["unmatched"],
            "technicalError": pb["technicalError"],
            "recoveredMatchPct": pct(len(rm), len(pM)), "recoveredStrictPct": pct(len(rs), len(pM)),
            "strictPct": pct(pb["strict"], len(prim)),
        }

        sset = set(S)
        notstrictC = [i for i in C if i not in sset]
        u2m = [i for i in M if v(i)["state"] in ("matched_strict", "matched_not_strict")]
        u2s = [i for i in M if v(i)["strict"]]
        uerr = [i for i in M if v(i)["state"] == "technical_error"]
        m2u = [i for i in C if v(i)["state"] == "unmatched"]
        merr = [i for i in C if v(i)["state"] == "technical_error"]
        s2f = [i for i in S if v(i)["state"] in ("unmatched", "matched_not_strict")]
        serr = [i for i in S if v(i)["state"] == "technical_error"]
        newS = [i for i in notstrictC if v(i)["strict"]]
        eS = [i for i in E if v(i)["strict"]]
        transitions[cond] = {
            "M": len(M), "unmatchedToMatched": len(u2m), "unmatchedToStrict": len(u2s), "unmatchedErrors": len(uerr),
            "C": len(C), "matchedToUnmatched": len(m2u), "matchedErrors": len(merr),
            "S": len(S), "strictToFail": len(s2f), "strictErrors": len(serr),
            "notStrictC": len(notstrictC), "newStrict": len(newS),
            "E": len(E), "baselineErrorNowStrict": len(eS),
            "lostStrictIds": sorted(s2f), "newStrictIds": sorted(newS), "recoveredStrictIds": sorted(u2s),
            "unmatchedToMatchedPct": pct(len(u2m), len(M)), "unmatchedToStrictPct": pct(len(u2s), len(M)),
            "matchedToUnmatchedPct": pct(len(m2u), len(C)), "strictToFailPct": pct(len(s2f), len(S)),
            "newStrictPct": pct(len(newS), len(notstrictC)),
        }

    pairs = {}
    for a, b in PAIRS:
        pe = {}
        for scope, sc_ids in (("primary", prim), ("total", qids)):
            sm = {}
            for metric in ("strict", "matched"):
                cnt = {"n": len(sc_ids), "both": 0, "fromOnly": 0, "toOnly": 0, "neither": 0, "technicalError": 0}
                for i in sc_ids:
                    va, vb = verd[(a, i)], verd[(b, i)]
                    if va["state"] == "technical_error" or vb["state"] == "technical_error":
                        cnt["technicalError"] += 1
                        continue
                    xa, xb = (va["strict"], vb["strict"]) if metric == "strict" else (va["matched"], vb["matched"])
                    cnt["both" if xa and xb else "fromOnly" if xa else "toOnly" if xb else "neither"] += 1
                sm[metric] = cnt
            pe[scope] = sm
        pairs["%s->%s" % (a, b)] = pe

    k1b = {}
    for o in ("O0", "O1"):
        cnt = {"k0": 0, "hangul": 0, "none": 0, "error": 0}
        for i in qids:
            pr = pmap[(o, i)]
            if pr.get("status") != "ok" or pr["k1"].get("status") != "ok":
                cnt["error"] += 1
            else:
                cnt[pr["k1"]["branch"]] += 1
        k1b[o] = cnt
    compared = differ = 0
    for i in qids:
        a, b = omap[("O0", i)], omap[("O1", i)]
        if (a.get("status") == "ok" and b.get("status") == "ok" and pmap[("O0", i)].get("status") == "ok"
                and pmap[("O1", i)].get("status") == "ok"):
            compared += 1
            if [l["text"] for l in a["ocrLines"]] != [l["text"] for l in b["ocrLines"]]:
                differ += 1

    mine_summary = {"baseline": baseline, "conditions": conditions, "primary": primary, "transitions": transitions,
                    "pairs": pairs, "k1Branches": k1b, "ocrLineTextDiff": {"compared": compared, "differ": differ}}
    rec_summary = read_json(os.path.join(score_dir, "summary.json"))
    for sec in mine_summary:
        if sec not in rec_summary:
            c4.bad("summary." + sec, "present", "<missing>")
        else:
            deep_compare(c4, "summary." + sec, mine_summary[sec], rec_summary[sec])

    checks = {"check1_hash": c1, "check2_keys": c2, "check3_rows": c3, "check4_aggregates": c4}
    out.update({n: c.to_json() for n, c in checks.items()})
    out["recount"] = {
        "baseline": baseline,
        "conditionsTotalStrict": {c: conditions[c]["total"]["strict"] for c in CONDS},
        "primary": primary,
        "transitions": {c: {k: transitions[c][k] for k in transitions[c] if not k.endswith("Ids")} for c in CONDS},
        "k1Branches": k1b, "ocrLineTextDiff": {"compared": compared, "differ": differ},
    }
    out["ok"] = all(c.to_json()["ok"] for c in checks.values())
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--run", required=True)
    ap.add_argument("--baseline-run", required=True)
    ap.add_argument("--score", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    out = run(args)
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(out, ensure_ascii=False, indent=1) + "\n")
    for n in ("check1_hash", "check2_keys", "check3_rows", "check4_aggregates"):
        print("%s: %s (mismatches=%d)" % (n, "ok" if out[n]["ok"] else "FAIL", out[n]["mismatchCount"]))
    return 0 if out["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
