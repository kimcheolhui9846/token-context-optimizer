"""Independent recount of ko-row-window (RECOUNT_SPEC.md). Python 3.12 standard library only.

Recomputes K0/K1 from the raw OCR, the W1 rule, the row verdicts, the 2x2 transitions, the areas, the newly covered ink and
the summary from the frozen files, and compares them row by row with the recorded outputs. Imports no project JS.

  python recount.py --data <data dir> --ocr <ocr dir> --replay <replay dir> --score <score dir> --out <recount.json>
  python recount.py ... --mutate <mutation.json>     (tamper copies of the recorded rows; every tamper must be rejected)

Exit 0 = every check passed, 1 = a check failed, 2 = the input could not be read.
"""
import argparse
import copy
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

PAGES = 48
DOCTYPES = ["exhibit", "costume", "lostfound"]
FORMS = ["table", "cards"]
VERTS = ["inline", "stacked"]
GAPS = ["near", "far"]
AXES = [("vert", VERTS), ("form", FORMS), ("gap", GAPS), ("doctype", DOCTYPES)]
INK_KEYS = ["targetLabel", "targetValue", "otherValues", "otherLabels", "notes", "headers", "others"]
MAX_MISMATCH = 50


class ValidationError(Exception):
    pass


class InputError(Exception):
    pass


# ------------------------------------------------------------------ JS number semantics
def js_round(x):
    """Math.round: nearest integer, .5 toward +infinity."""
    f = math.floor(x)
    return f + 1 if x - f >= 0.5 else f


def pct(c, n):
    return None if n == 0 else js_round(c * 10000 / n) / 100


def r4(x):
    return js_round(x * 10000) / 10000


def u16len(s):
    return len(s.encode("utf-16-le")) // 2


def is_num(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)


def js_number(x):
    """ECMAScript Number::toString for finite numbers."""
    if isinstance(x, int):
        return str(x)
    if x == 0:
        return "0"
    if x == int(x) and abs(x) < 1e21:
        return str(int(x))
    sign = "-" if x < 0 else ""
    digits_t = Decimal(repr(abs(x))).as_tuple()
    digits = "".join(map(str, digits_t.digits)).lstrip("0")
    n = len(digits_t.digits) + digits_t.exponent - (len("".join(map(str, digits_t.digits))) - len(digits))
    digits = digits.rstrip("0")
    k = len(digits)
    if k <= n <= 21:
        s = digits + "0" * (n - k)
    elif 0 < n <= 21:
        s = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        s = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        s = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return sign + s


def js_stringify(v):
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return js_number(v) if math.isfinite(v) else "null"
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ",".join(js_stringify(i) for i in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + js_stringify(x) for k, x in v.items()) + "}"
    raise TypeError(type(v))


def same(a, b):
    """Deep equality with numbers compared by value and booleans kept apart from numbers."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if is_num(a) and is_num(b):
        return a == b
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) == set(b) and all(same(a[k], b[k]) for k in a)
    return type(a) is type(b) and a == b


def sha_bytes(b):
    return hashlib.sha256(b).hexdigest()


# ------------------------------------------------------------------ file reading
def read_bytes(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError as e:
        raise InputError("cannot read %s: %s" % (path, e))


def read_json(path):
    return json.loads(read_bytes(path).decode("utf-8"))


def read_jsonl(path):
    raw = read_bytes(path)
    if b"\r" in raw:
        raise InputError("CR in " + path)
    lines = raw.decode("utf-8").split("\n")
    if lines[-1] != "":
        raise InputError("no final newline in " + path)
    lines.pop()
    if any(ln == "" for ln in lines):
        raise InputError("empty line in " + path)
    return [json.loads(ln) for ln in lines]


# ------------------------------------------------------------------ PNG (8-bit grayscale, non-interlaced)
_PNG_CACHE = {}


def decode_png(data):
    key = hashlib.sha256(data).hexdigest()
    if key not in _PNG_CACHE:
        _PNG_CACHE[key] = _decode_png(data)
    return _PNG_CACHE[key]


def _decode_png(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValidationError("not a PNG")
    pos, idat, w = 8, [], None
    while pos < len(data):
        n = struct.unpack(">I", data[pos:pos + 4])[0]
        typ = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + n]
        if typ == b"IHDR":
            w, h, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", body)
            if depth != 8 or color != 0 or interlace != 0:
                raise ValidationError("PNG is not 8-bit grayscale non-interlaced")
        elif typ == b"IDAT":
            idat.append(body)
        elif typ == b"IEND":
            break
        pos += 12 + n
    raw = zlib.decompress(b"".join(idat))
    rows, prev, stride = [], bytearray(w), w + 1
    for y in range(h):
        ft, line = raw[y * stride], bytearray(raw[y * stride + 1:(y + 1) * stride])
        for x in range(w):
            a = line[x - 1] if x else 0
            b = prev[x]
            c = prev[x - 1] if x else 0
            if ft == 1:
                line[x] = (line[x] + a) & 255
            elif ft == 2:
                line[x] = (line[x] + b) & 255
            elif ft == 3:
                line[x] = (line[x] + (a + b) // 2) & 255
            elif ft == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if pa <= pb and pa <= pc else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 255
            elif ft != 0:
                raise ValidationError("PNG filter %d" % ft)
        rows.append(line)
        prev = line
    return w, h, rows


def png_size(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise ValidationError("not a PNG")
    return struct.unpack(">II", data[16:24])


def edges_have_ink(rows, rect):
    l, t, r, b = rect
    top = any(rows[t][x] < 255 for x in range(l, r))
    bottom = any(rows[b - 1][x] < 255 for x in range(l, r))
    left = any(rows[y][l] < 255 for y in range(t, b))
    right = any(rows[y][r - 1] < 255 for y in range(t, b))
    return top and bottom and left and right


# ------------------------------------------------------------------ fixed selector (K0), ported from selector.mjs
STOP = set(
    "what which when where who how much many the and for are was were with from that this into onto shown show written "
    "according answer number value label labeled labelled noted under screen image chart line card item bottom top next "
    "turned does there their your have has".split(" ")
)
YESNO = {"off", "yes"}


def tokens(s):
    return [t for t in re.sub(r"[^a-z0-9\- ]", " ", s.lower()).split(" ") if t]


def keywords(q):
    out = []
    for t in tokens(q):
        if len(t) >= 3 and t not in STOP and t not in out:
            out.append(t)
    return out


def line_score(line, keys):
    words = tokens(line["text"])
    return sum(1 for k in keys if any(w == k or (len(k) >= 4 and (w.startswith(k) or k.startswith(w)) and len(w) >= 4) for w in words))


def window_for(line, anchor, W, H):
    box = line["box"]
    lh = max(8, box[3])
    words = line["words"]
    mean_len = sum(u16len(w["text"]) for w in words) / max(1, len(words))
    axis = len(words) >= 8 and mean_len <= 4 and anchor[2] < 0.25 * box[2]
    if axis:
        half = max(1.5 * anchor[2], 3 * lh)
        cx = anchor[0] + anchor[2] / 2
        x0, x1 = cx - half, cx + half
        y0, y1 = anchor[1] - 0.75 * H, anchor[1] + anchor[3] + 6 * lh
    else:
        x0, x1 = min(anchor[0], box[0]) - 4 * lh, box[0] + box[2] + 8 * lh
        y0, y1 = box[1] - 3 * lh, box[1] + box[3] + 6 * lh

    def grow(a, b, mn):
        need = mn - (b - a)
        return (a - need / 2, b + need / 2) if need > 0 else (a, b)

    x0, x1 = grow(x0, x1, 256)
    y0, y1 = grow(y0, y1, 128)
    left, top = max(0, math.floor(x0)), max(0, math.floor(y0))
    right, bottom = min(W, math.ceil(x1)), min(H, math.ceil(y1))
    return axis, {"left": left, "top": top, "width": right - left, "height": bottom - top}


def band_ok(b, W, H):
    if not isinstance(b, dict):
        return False
    vals = [b.get("left"), b.get("top"), b.get("width"), b.get("height")]
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in vals):
        return False
    return b["width"] > 0 and b["height"] > 0 and b["left"] >= 0 and b["top"] >= 0 and b["left"] + b["width"] <= W and b["top"] + b["height"] <= H


def select_window(lines, q, W, H):
    keys = [k for k in keywords(q) if k not in YESNO]
    best = None
    for line in lines:
        s = line_score(line, keys)
        if s > 0 and (best is None or s > best[0] or (s == best[0] and line["confidence"] > best[1]["confidence"])):
            best = (s, line)
    if best is None:
        return {"matched": False, "keys": keys}
    s, line = best

    def mw(text):
        t = (tokens(text) or [""])[0]
        return any(t == k or (len(k) >= 4 and len(t) >= 4 and (t.startswith(k) or k.startswith(t))) for k in keys)

    hits = [w["box"] for w in line["words"] if mw(w["text"])]
    if hits:
        a = hits[0]
        for bx in hits[1:]:
            a = [min(a[0], bx[0]), min(a[1], bx[1]), max(a[0] + a[2], bx[0] + bx[2]) - min(a[0], bx[0]), max(a[1] + a[3], bx[1] + bx[3]) - min(a[1], bx[1])]
        anchor = a
    else:
        anchor = line["box"]
    axis, band = window_for(line, anchor, W, H)
    return {"matched": True, "keys": keys, "score": s, "lineText": line["text"], "confidence": js_round(line["confidence"]), "axisRow": axis, "band": band}


SHAPE = ["status", "error", "branch", "keys", "hangulKeys", "matched", "score", "lineIndex", "lineText", "confidence", "axisRow", "lineBox", "anchor", "hitWords", "band"]


def shaped(**kw):
    d = {k: None for k in SHAPE}
    d.update(kw)
    return d


def lines_valid(lines):
    if not isinstance(lines, list):
        return False
    for ln in lines:
        if not isinstance(ln, dict) or not isinstance(ln.get("text"), str) or not is_num(ln.get("confidence")):
            return False
        if not (isinstance(ln.get("box"), list) and len(ln["box"]) == 4 and all(is_num(v) for v in ln["box"])):
            return False
        if not isinstance(ln.get("words"), list):
            return False
        for w in ln["words"]:
            if not isinstance(w, dict) or not isinstance(w.get("text"), str):
                return False
            if not (isinstance(w.get("box"), list) and len(w["box"]) == 4 and all(is_num(v) for v in w["box"])):
                return False
    return True


def hangul_bigrams(s):
    out = set()
    for run in re.findall("[가-힣]+", unicodedata.normalize("NFC", s)):
        for i in range(len(run) - 1):
            out.add(run[i:i + 2])
    return out


def expected_k1(lines, q, W, H):
    Q = sorted(hangul_bigrams(q))
    if not lines_valid(lines):
        return shaped(status="error", error="input_validation", branch="k0", hangulKeys=Q)
    k0 = select_window(lines, q, W, H)
    if k0["matched"]:
        best_i, best_s = -1, 0
        for i, ln in enumerate(lines):
            one = select_window([ln], q, W, H)
            s = one.get("score", 0) if one["matched"] else 0
            if s > 0 and (best_i < 0 or s > best_s or (s == best_s and ln["confidence"] > lines[best_i]["confidence"])):
                best_i, best_s = i, s
        out = shaped(status="ok", branch="k0", keys=k0["keys"], hangulKeys=Q, matched=True, score=k0["score"],
                     lineIndex=best_i if best_i >= 0 else None, lineText=k0["lineText"], confidence=k0["confidence"],
                     axisRow=k0["axisRow"], lineBox=lines[best_i]["box"] if best_i >= 0 else None, band=k0["band"])
        if best_i < 0 or lines[best_i]["text"] != k0["lineText"] or best_s != k0["score"]:
            out.update(status="error", error="invalid_output: chosen line not recovered")
        elif not band_ok(k0["band"], W, H):
            out.update(status="error", error="invalid_output: band")
        return out
    unmatched = shaped(status="ok", branch="none", keys=k0["keys"], hangulKeys=Q, matched=False, score=0)
    if not Q:
        return unmatched
    qs = set(Q)
    best = None
    for i, ln in enumerate(lines):
        found = set()
        for w in ln["words"]:
            found |= hangul_bigrams(w["text"]) & qs
        s = len(found)
        if s > 0 and (best is None or s > best[0] or (s == best[0] and ln["confidence"] > best[1]["confidence"])):
            best = (s, ln, i)
    if best is None:
        return unmatched
    s, ln, i = best
    hit = [j for j, w in enumerate(ln["words"]) if hangul_bigrams(w["text"]) & qs]
    bxs = [ln["words"][j]["box"] for j in hit]
    x0, y0 = min(b[0] for b in bxs), min(b[1] for b in bxs)
    x1, y1 = max(b[0] + b[2] for b in bxs), max(b[1] + b[3] for b in bxs)
    anchor = [x0, y0, x1 - x0, y1 - y0]
    axis, band = window_for(ln, anchor, W, H)
    out = shaped(status="ok", branch="hangul", keys=k0["keys"], hangulKeys=Q, matched=True, score=s, lineIndex=i, lineText=ln["text"],
                 confidence=js_round(ln["confidence"]), axisRow=axis, lineBox=ln["box"], anchor=anchor, hitWords=hit, band=band)
    if not band_ok(band, W, H):
        out.update(status="error", error="invalid_output: band")
    return out


# ------------------------------------------------------------------ W1 rule (RECOUNT_SPEC 4)
WS = re.compile("[\u0009-\u000d\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]")


def is_blank(text):
    return WS.sub("", unicodedata.normalize("NFC", text)) == ""


def to_rect(box):
    if not (isinstance(box, list) and len(box) == 4 and all(is_num(v) for v in box)):
        raise ValidationError("bad box %r" % (box,))
    x, y, w, h = box
    if w < 0 or h < 0:
        raise ValidationError("negative box %r" % (box,))
    return [x, y, x + w, y + h]


def same_row_right(h, c):
    if not c[0] >= h[2]:
        return False
    ov = min(h[3], c[3]) - max(h[1], c[1])
    return ov > 0 and ov >= 0.5 * min(h[3] - h[1], c[3] - c[1])


def w1_rule(lines, k1, W, H):
    if not isinstance(k1, dict):
        raise ValidationError("k1 missing")
    none = {"w0": None, "w1": None, "candidates": None, "maxRight": None, "clippedRight": None, "addedPixels": None}
    if k1.get("status") != "ok":
        if k1.get("status") != "error":
            raise ValidationError("k1 status %r" % k1.get("status"))
        return dict(reason="error", **none)
    if k1.get("matched") is False:
        return dict(reason="unmatched", **none)
    if k1.get("matched") is not True:
        raise ValidationError("k1 matched %r" % k1.get("matched"))
    band = k1.get("band")
    if not band_ok(band, W, H):
        raise ValidationError("band invalid")
    w0 = {"left": band["left"], "top": band["top"], "width": band["width"], "height": band["height"]}
    if k1.get("branch") != "hangul":
        if k1.get("branch") != "k0":
            raise ValidationError("branch %r" % k1.get("branch"))
        return {"reason": "k0_branch", "w0": w0, "w1": dict(w0), "candidates": None, "maxRight": None, "clippedRight": None, "addedPixels": 0}
    li = k1.get("lineIndex")
    if not (isinstance(lines, list) and isinstance(li, int) and not isinstance(li, bool) and 0 <= li < len(lines)):
        raise ValidationError("lineIndex %r" % (li,))
    line = lines[li]
    if line.get("text") != k1.get("lineText"):
        raise ValidationError("lineText differs")
    hw = k1.get("hitWords")
    if not (isinstance(hw, list) and hw and len(set(hw)) == len(hw)
            and all(isinstance(j, int) and not isinstance(j, bool) and 0 <= j < len(line["words"]) for j in hw)):
        raise ValidationError("hitWords %r" % (hw,))
    hits = [to_rect(line["words"][j]["box"]) for j in hw]
    cands, max_right = [], None
    for i, ln in enumerate(lines):
        for j, w in enumerate(ln["words"]):
            c = to_rect(w["box"])
            if is_blank(w["text"]):
                continue
            if any(same_row_right(h, c) for h in hits):
                cands.append([i, j])
                if max_right is None or c[2] > max_right:
                    max_right = c[2]
    w0_right = w0["left"] + w0["width"]
    if not cands:
        return {"reason": "no_candidate", "w0": w0, "w1": dict(w0), "candidates": [], "maxRight": None, "clippedRight": None, "addedPixels": 0}
    clipped = min(W, math.ceil(max_right))
    right = max(w0_right, clipped)
    w1 = {"left": w0["left"], "top": w0["top"], "width": right - w0["left"], "height": w0["height"]}
    return {"reason": "widened" if right > w0_right else "not_wider", "w0": w0, "w1": w1, "candidates": cands,
            "maxRight": max_right, "clippedRight": clipped, "addedPixels": (w1["width"] - w0["width"]) * w0["height"]}


# ------------------------------------------------------------------ scoring (RECOUNT_SPEC 5)
def inside(rect, w):
    l, t, r, b = rect
    return l >= w["left"] and t >= w["top"] and r <= w["left"] + w["width"] and b <= w["top"] + w["height"]


def judge(pred, win, page):
    if pred["state"] == "error":
        return {"state": "technical_error", "strict": False, "evidence": None, "fullPage": None, "area": None}
    if pred["state"] == "unmatched":
        return {"state": "unmatched", "strict": False, "evidence": None, "fullPage": None, "area": None}
    area = win["width"] * win["height"]
    page_area = page["width"] * page["height"]
    n = sum(1 for p in page["parts"] if inside(p, win))
    strict = 0 < area < page_area and n == len(page["parts"])
    return {"state": "matched_strict" if strict else "matched_not_strict", "strict": strict,
            "evidence": "all" if n == len(page["parts"]) else ("partial" if n else "none"), "fullPage": area >= page_area, "area": area}


def score_page(pred, page):
    if pred.get("id") != page["id"]:
        raise ValidationError("prediction %r does not join page %r" % (pred.get("id"), page["id"]))
    w0, w1 = judge(pred, pred["w0"], page), judge(pred, pred["w1"], page)
    st = pred["state"]
    stage = "error" if st == "error" else "unmatched" if st == "unmatched" else ("hangul" if pred["branch"] == "hangul" else "k0")
    if w0["strict"] and w1["strict"]:
        tr = "keptSuccess"
    elif w1["strict"]:
        tr = "recovered"
    elif w0["strict"]:
        tr = "lost"
    else:
        tr = "bothFail"
    new_ink = None
    if st == "matched":
        new_ink = {k: 0 for k in INK_KEYS}
        for item, rec in page["inks"].items():
            if inside(rec["ink"], pred["w1"]) and not inside(rec["ink"], pred["w0"]):
                role = rec["role"]
                if item == page["anchorItem"]:
                    k = "targetLabel"
                elif item == page["valueItem"]:
                    k = "targetValue"
                else:
                    k = {"value": "otherValues", "label": "otherLabels", "note": "notes", "header": "headers"}.get(role, "others")
                new_ink[k] += 1
    return {"id": page["id"], "doctype": page["doctype"], "form": page["form"], "vert": page["vert"], "gap": page["gap"], "case": page.get("case"),
            "stage": stage, "reason": pred["reason"], "w0": w0, "w1": w1, "transition": tr, "error": st == "error",
            "addedPixels": pred["addedPixels"], "newInk": new_ink}


def median(xs):
    s = sorted(xs)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


def group(rows, A):
    valid = [r for r in rows if r["stage"] in ("k0", "hangul")]
    wid = [r for r in valid if r["reason"] == "widened"]
    added = [r["addedPixels"] for r in valid]
    added_w = [r["addedPixels"] for r in wid]
    tot, tot_w = sum(added), sum(added_w)
    t = lambda k: sum(1 for r in rows if r["transition"] == k)  # noqa: E731
    rec, lost = t("recovered"), t("lost")
    w0s = sum(1 for r in rows if r["w0"]["strict"])
    net = rec - lost
    ink = {k: sum(r["newInk"][k] for r in valid) for k in INK_KEYS}
    ink["pagesWithOtherValue"] = sum(1 for r in valid if r["newInk"]["otherValues"] > 0)
    return {
        "n": len(rows), "error": sum(1 for r in rows if r["stage"] == "error"), "unmatched": sum(1 for r in rows if r["stage"] == "unmatched"), "matched": len(valid),
        "w0": {"strict": w0s, "fullPage": sum(1 for r in rows if r["w0"]["fullPage"] is True)},
        "w1": {"strict": sum(1 for r in rows if r["w1"]["strict"]), "fullPage": sum(1 for r in rows if r["w1"]["fullPage"] is True)},
        "transition": {"recovered": rec, "lost": lost, "keptSuccess": t("keptSuccess"), "bothFail": t("bothFail"),
                       "bothFailError": sum(1 for r in rows if r["transition"] == "bothFail" and r["stage"] == "error"),
                       "bothFailUnmatched": sum(1 for r in rows if r["transition"] == "bothFail" and r["stage"] == "unmatched")},
        "recoveredOfW0Fail": {"count": rec, "denom": len(rows) - w0s, "pct": pct(rec, len(rows) - w0s)},
        "lostOfW0Success": {"count": lost, "denom": w0s, "pct": pct(lost, w0s)},
        "net": net, "widened": len(wid),
        "area": {
            "validPairs": len(valid), "addedPixelsSum": tot,
            "meanPp": r4(tot * 100 / (len(valid) * A)) if valid else None,
            "medianPp": r4(median(added) * 100 / A) if valid else None,
            "maxPp": r4(max(added) * 100 / A) if valid else None,
            "widenedPages": len(wid),
            "widenedMeanPp": r4(tot_w * 100 / (len(wid) * A)) if wid else None,
            "widenedMedianPp": r4(median(added_w) * 100 / A) if wid else None,
            "widenedMaxPp": r4(max(added_w) * 100 / A) if wid else None,
            "perNewSuccess": r4(tot / rec) if rec > 0 else None,
            "perNet": r4(tot / net) if net > 0 else None,
            "perNetReason": None if net > 0 else "net <= 0",
        },
        "newInk": ink,
    }


def summarize_scores(rows, page_area):
    hang = [r for r in rows if r["stage"] == "hangul"]
    stages = {
        "pages": len(rows), "error": sum(1 for r in rows if r["stage"] == "error"), "unmatched": sum(1 for r in rows if r["stage"] == "unmatched"),
        "k0Matched": sum(1 for r in rows if r["stage"] == "k0"), "hangulMatched": len(hang),
        "hangul": {"hitsVerified": len(hang), "withCandidates": sum(1 for r in hang if r["reason"] in ("widened", "not_wider")),
                   "widened": sum(1 for r in hang if r["reason"] == "widened"), "notWider": sum(1 for r in hang if r["reason"] == "not_wider"),
                   "noCandidate": sum(1 for r in hang if r["reason"] == "no_candidate")},
    }
    groups = {"total": group(rows, page_area)}
    for axis, keys in AXES:
        groups[axis] = {k: group([r for r in rows if r[axis] == k], page_area) for k in keys}
    lists = {
        "recovered": [r["id"] for r in rows if r["transition"] == "recovered"],
        "lost": [r["id"] for r in rows if r["transition"] == "lost"],
        "lostFullPage": [r["id"] for r in rows if r["transition"] == "lost" and r["w1"]["fullPage"] is True],
        "widened": [r["id"] for r in rows if r["reason"] == "widened"],
    }
    return {"stages": stages, "groups": groups, "lists": lists}


# ------------------------------------------------------------------ ids and row comparison
def check_id_set(rows, ids):
    got = [r.get("id") if isinstance(r, dict) else None for r in rows]
    seen = set()
    for i in got:
        if i in seen:
            raise ValidationError("duplicate id %r" % i)
        seen.add(i)
    if any(i not in seen for i in ids):
        raise ValidationError("missing ids")
    if any(i not in set(ids) for i in got):
        raise ValidationError("unexpected ids")
    if got != list(ids):
        raise ValidationError("id order differs")
    return True


def diff_rows(a, b):
    check_id_set(b, [r["id"] for r in a])
    out = []
    for ra, rb in zip(a, b):
        fields = sorted(f for f in set(ra) | set(rb) if f not in ra or f not in rb or not same(ra[f], rb[f]))
        if fields:
            out.append({"id": ra["id"], "fields": fields})
    return out


# ------------------------------------------------------------------ the run
class Report:
    def __init__(self):
        self.checks = {}

    def check(self, name):
        self.checks.setdefault(name, {"ok": True, "mismatches": [], "count": 0})
        return self.checks[name]

    def bad(self, name, key, a=None, b=None):
        c = self.check(name)
        c["ok"] = False
        c["count"] += 1
        if len(c["mismatches"]) < MAX_MISMATCH:
            c["mismatches"].append({"key": key, "mine": a, "recorded": b})

    def ok(self):
        return all(c["ok"] for c in self.checks.values())


def load(args):
    d = args.data
    manifest = read_json(os.path.join(d, "manifest.json"))
    design = read_json(os.path.join(d, "design.json"))
    return {
        "manifest": manifest, "design": design, "questions": read_json(os.path.join(d, "questions.json"))["questions"],
        "gold": read_json(os.path.join(d, "gold.json"))["gold"], "render": read_json(os.path.join(d, "render.json"))["images"],
        "ocrFreeze": read_json(os.path.join(args.ocr, "freeze.json")), "ocr": read_jsonl(os.path.join(args.ocr, "ocr.jsonl")), "k1": read_jsonl(os.path.join(args.ocr, "k1.jsonl")),
        "replayFreeze": read_json(os.path.join(args.replay, "freeze.json")), "preds": read_jsonl(os.path.join(args.replay, "predictions.jsonl")),
        "score": read_jsonl(os.path.join(args.score, "score.jsonl")), "summary": read_json(os.path.join(args.score, "summary.json")),
    }


def pages_of(x):
    pages = []
    for im in x["design"]["images"]:
        g = x["gold"][im["id"]]
        pages.append({"id": im["id"], "doctype": im["doctype"], "form": im["form"], "vert": im["vert"], "gap": im["gap"], "case": im["case"],
                      "width": im["page"]["width"], "height": im["page"]["height"], "anchorItem": im["anchorItem"], "valueItem": im["valueItem"],
                      "parts": [p["rect"] for p in g["parts"]], "inks": x["render"][im["id"]]["items"]})
    return pages


def recount(args, x, rep):
    d = args.data
    # 1 hashes, ids, data
    rep.check("1-hashes-ids-data")
    listed = []
    for root, _, files in os.walk(d):
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), d).replace(os.sep, "/")
            if rel != "manifest.json":
                listed.append(rel)
    if sorted(listed) != sorted(x["manifest"]["files"]):
        rep.bad("1-hashes-ids-data", "manifest file list")
    for rel, m in x["manifest"]["files"].items():
        b = read_bytes(os.path.join(d, rel))
        if sha_bytes(b) != m["sha256"] or len(b) != m["bytes"]:
            rep.bad("1-hashes-ids-data", "manifest " + rel)
    for name, folder, files in (("ocr", args.ocr, ["ocr.jsonl", "k1.jsonl"]), ("replay", args.replay, ["predictions.jsonl"])):
        fz = x["ocrFreeze"] if name == "ocr" else x["replayFreeze"]
        for f in files:
            if fz["files"].get(f) != sha_bytes(read_bytes(os.path.join(folder, f))):
                rep.bad("1-hashes-ids-data", "freeze " + f)
    ids = [im["id"] for im in x["design"]["images"]]
    if len(ids) != PAGES:
        rep.bad("1-hashes-ids-data", "design pages", len(ids), PAGES)
    for name in ("questions", "ocr", "k1", "preds", "score"):
        try:
            check_id_set(x[name], ids)
        except ValidationError as e:
            rep.bad("1-hashes-ids-data", "ids " + name, str(e))
            raise
    pages = pages_of(x)
    pngs = {}
    for im, p in zip(x["design"]["images"], pages):
        g = x["gold"][im["id"]]["parts"]
        if len(g) != 2 or g[0]["item"] != im["anchorItem"] or g[1]["item"] != im["valueItem"]:
            rep.bad("1-hashes-ids-data", im["id"] + " gold items")
            continue
        cells = {it["id"]: it["cell"] for it in im["items"]}
        for part in g:
            l, t, r, b = part["rect"]
            if not (all(isinstance(v, int) for v in part["rect"]) and 0 <= l < r <= 1280 and 0 <= t < b <= 960 and part["size"] == [r - l, b - t]):
                rep.bad("1-hashes-ids-data", im["id"] + " gold rect " + part["item"])
            if x["render"][im["id"]]["items"][part["item"]]["ink"] != part["rect"]:
                rep.bad("1-hashes-ids-data", im["id"] + " gold vs render " + part["item"])
            cl = cells[part["item"]]
            if not (l >= cl[0] and t >= cl[1] and r <= cl[2] and b <= cl[3]):
                rep.bad("1-hashes-ids-data", im["id"] + " gold outside cell " + part["item"])
        a, v = g[0]["rect"], g[1]["rect"]
        if min(a[2], v[2]) > max(a[0], v[0]) and min(a[3], v[3]) > max(a[1], v[1]):
            rep.bad("1-hashes-ids-data", im["id"] + " gold boxes overlap")
        data = read_bytes(os.path.join(d, "images", im["file"]))
        w, h, rows = decode_png(data)
        pngs[im["id"]] = {"sha": sha_bytes(data), "w": w, "h": h}
        if (w, h) != (1280, 960):
            rep.bad("1-hashes-ids-data", im["id"] + " PNG size", [w, h])
        for part in g:
            if not edges_have_ink(rows, part["rect"]):
                rep.bad("1-hashes-ids-data", im["id"] + " gold edge ink " + part["item"])
    for o in x["ocr"]:
        pg = pngs.get(o["id"])
        if pg and o["pngSha256"] != pg["sha"]:
            rep.bad("1-hashes-ids-data", o["id"] + " ocr pngSha256")
        if pg and o["status"] == "ok" and (o["width"], o["height"]) != (pg["w"], pg["h"]):
            rep.bad("1-hashes-ids-data", o["id"] + " ocr size")

    # 2 K1 recompute, W0/W1 predictions
    rep.check("2-k1-w1-predictions")
    qmap = {q["id"]: q["question"] for q in x["questions"]}
    my_preds = []
    for o, k, pr in zip(x["ocr"], x["k1"], x["preds"]):
        pid = o["id"]
        pg = pngs[pid]
        if o["status"] == "ok":
            if js_stringify(o["ocrLines"]) and sha_bytes(js_stringify(o["ocrLines"]).encode("utf-8")) != o["ocrSha256"]:
                rep.bad("2-k1-w1-predictions", pid + " ocrSha256 (JSON number text)")
            exp = expected_k1(o["ocrLines"], qmap[pid], pg["w"], pg["h"])
            for f in SHAPE:
                if f == "error" and exp["status"] == "ok":
                    if k["k1"].get("error") is not None:
                        rep.bad("2-k1-w1-predictions", pid + " k1.error", None, k["k1"].get("error"))
                    continue
                if f == "error":
                    if not str(k["k1"].get("error") or "").startswith(exp["error"].split(":")[0]):
                        rep.bad("2-k1-w1-predictions", pid + " k1.error", exp["error"], k["k1"].get("error"))
                    continue
                if not same(exp[f], k["k1"].get(f)):
                    rep.bad("2-k1-w1-predictions", pid + " k1." + f, exp[f], k["k1"].get(f))
            if k["status"] != ("ok" if exp["status"] == "ok" else "error"):
                rep.bad("2-k1-w1-predictions", pid + " k1 row status")
        else:
            if k["status"] != "error" or k["k1"].get("status") != "error":
                rep.bad("2-k1-w1-predictions", pid + " OCR error without K1 error")
        r = w1_rule(o["ocrLines"] if o["status"] == "ok" else None, k["k1"], pg["w"], pg["h"])
        state = "error" if r["reason"] == "error" else ("unmatched" if r["reason"] == "unmatched" else "matched")
        mine = {"id": pid, "pngSha256": pg["sha"], "ocrSha256": o.get("ocrSha256"), "width": pg["w"], "height": pg["h"], "state": state,
                "branch": k["k1"].get("branch"), "lineIndex": k["k1"].get("lineIndex"), "hitWords": k["k1"].get("hitWords"), **r}
        my_preds.append(mine)
        for f, val in mine.items():
            if not same(val, pr.get(f)):
                rep.bad("2-k1-w1-predictions", pid + " pred." + f, val, pr.get(f))
        if (state == "error") != (pr.get("error") is not None):
            rep.bad("2-k1-w1-predictions", pid + " pred.error presence")
        extra = set(pr) - set(mine) - {"error"}
        if extra:
            rep.bad("2-k1-w1-predictions", pid + " unexpected prediction fields", sorted(extra))
        if state == "matched":
            a, b = r["w0"], r["w1"]
            if not (b["left"] == a["left"] and b["top"] == a["top"] and b["height"] == a["height"] and b["width"] >= a["width"]):
                rep.bad("2-k1-w1-predictions", pid + " W1 does not keep W0 left/top/bottom")

    # 3 row verdicts
    rep.check("3-rows")
    my_rows = [score_page(dict(p, error=None), pg) for p, pg in zip(my_preds, pages)]
    for d_ in diff_rows(my_rows, x["score"]):
        rep.bad("3-rows", d_["id"], d_["fields"])

    # 4 summary
    rep.check("4-summary")
    area = pages[0]["width"] * pages[0]["height"]
    s = summarize_scores(my_rows, area)
    for key in ("stages", "groups", "lists"):
        if not same(s[key], x["summary"].get(key)):
            sub = [k for k in s[key] if not same(s[key][k], x["summary"].get(key, {}).get(k))]
            rep.bad("4-summary", key, sub)
    lost_full = [r["id"] for r in my_rows if r["transition"] == "lost" and not r["w1"]["fullPage"]]
    if lost_full:
        rep.bad("4-summary", "lost without full-page W1", lost_full)
    return my_rows, s


def mutate(args, x):
    """Tamper in-memory copies of the recorded files and run the whole recount on each; every tamper must fail it."""
    out = {}

    def run(name, x2, note=None):
        rep = Report()
        try:
            recount(args, x2, rep)
        except ValidationError as e:
            out[name] = {"rejected": True, "how": "ValidationError: " + str(e)}
        else:
            failed = {k: c["mismatches"][:3] for k, c in rep.checks.items() if not c["ok"]}
            out[name] = {"rejected": bool(failed), "how": "recount check failed", "failed": failed}
        if note:
            out[name]["note"] = note

    rows = x["score"]
    idx = lambda f: [i for i, r in enumerate(rows) if f(r)]  # noqa: E731
    src = idx(lambda r: r["transition"] in ("recovered", "keptSuccess"))
    dst = idx(lambda r: r["transition"] == "bothFail")
    if src and dst:
        x2 = copy.deepcopy(x)
        a, b = src[0], dst[0]
        x2["score"][a]["transition"], x2["score"][b]["transition"] = rows[b]["transition"], rows[a]["transition"]
        run("swapTransition", x2, "transition of %s and %s swapped" % (rows[a]["id"], rows[b]["id"]))
    else:
        out["swapTransition"] = {"notApplicable": "no recovered/keptSuccess and bothFail pair"}
    ap = idx(lambda r: r["addedPixels"] is not None)
    pair = next(((i, j) for i in ap for j in ap if rows[i]["addedPixels"] != rows[j]["addedPixels"]), None)
    if pair:
        x2 = copy.deepcopy(x)
        i, j = pair
        x2["score"][i]["addedPixels"], x2["score"][j]["addedPixels"] = rows[j]["addedPixels"], rows[i]["addedPixels"]
        run("swapAddedPixels", x2)
    else:
        out["swapAddedPixels"] = {"notApplicable": "all matched pages have the same added pixels"}
    mm = idx(lambda r: r["newInk"] is not None)
    if len(mm) > 1:
        x2 = copy.deepcopy(x)
        src_i = next((i for i in mm if rows[i]["newInk"]["otherValues"] > 0), None)
        if src_i is None:
            x2["score"][mm[0]]["newInk"]["otherValues"] += 1
            note = "no page newly covers another record's value: added one to one page"
        else:
            j = next(k for k in mm if k != src_i)
            x2["score"][src_i]["newInk"]["otherValues"] -= 1
            x2["score"][j]["newInk"]["otherValues"] += 1
            note = "one otherValues moved between two pages (total kept)"
        run("moveOtherValue", x2, note)
    else:
        out["moveOtherValue"] = {"notApplicable": "fewer than two matched pages"}
    x2 = copy.deepcopy(x)
    x2["score"][1]["id"] = x2["score"][0]["id"]
    run("duplicateId", x2)
    x2 = copy.deepcopy(x)
    x2["preds"] = x2["preds"][:-1]
    run("missingId", x2)
    m = next((i for i, p in enumerate(x["preds"]) if p["state"] == "matched"), None)
    if m is not None:
        x2 = copy.deepcopy(x)
        x2["preds"][m]["w1"]["width"] += 1
        run("predictionW1WidthPlusOne", x2)
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    for a in ("--data", "--ocr", "--replay", "--score"):
        ap.add_argument(a, required=True)
    ap.add_argument("--out")
    ap.add_argument("--mutate")
    args = ap.parse_args(argv)
    try:
        x = load(args)
    except (InputError, ValueError) as e:
        print("input error: %s" % e, file=sys.stderr)
        return 2
    if args.mutate:
        res = mutate(args, x)
        ok = all(v.get("rejected", False) or "notApplicable" in v for v in res.values())
        with open(args.mutate, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps({"version": "ko-row-window-mutation-1", "allRejected": ok, "tampers": res}, ensure_ascii=False, indent=1) + "\n")
        print(json.dumps({"allRejected": ok}))
        return 0 if ok else 1
    rep = Report()
    try:
        rows, s = recount(args, x, rep)
    except ValidationError as e:
        rep.bad("validation", "abort", str(e))
        rows, s = None, None
    result = {"version": "ko-row-window-recount-1", "ok": rep.ok(), "checks": rep.checks,
              "stages": s["stages"] if s else None, "total": s["groups"]["total"] if s else None, "lists": s["lists"] if s else None}
    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"ok": result["ok"], "failed": [k for k, c in rep.checks.items() if not c["ok"]]}))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
