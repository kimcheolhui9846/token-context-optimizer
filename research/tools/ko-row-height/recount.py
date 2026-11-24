"""Independent recount of ko-row-height (tools/ko-row-height/RECOUNT_SPEC.md). Python 3.12 standard library only.

Recomputes K0/K1 from the raw OCR, the fixed #150 W1 rule, the new W2 rule, the per-page verdicts, other-value exposure,
the J/L events, the areas, the summary and the public tables from the frozen files, and compares them with the recorded
outputs row by row and cell by cell. Imports no project JS. Provenance: the PNG decoder, K0/K1 and W1 parts are ported
from the #150 recount (same author family); W2, exposure, scoring, aggregates, pairing and tables are new here.

  python recount.py --data <data dir> --ocr <ocr dir> --replay <replay dir> --score <score dir> [--results RESULTS.md] --out <recount.json>
  python recount.py ... --mutate <mutation.json>     (tamper copies of the recorded files; every tamper must be rejected)

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
DOCTYPES = ["venue", "proof", "workshop"]
FORMS = ["table", "cards"]
VERTS = ["same", "below"]
SPACES = ["narrow", "wide"]
LAYOUTS = ["same-narrow", "same-wide", "below-narrow", "below-wide"]
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


# ------------------------------------------------------------------ W2 rule (RECOUNT_SPEC 4) — new for ko-row-height
def median(xs):
    s = sorted(xs)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


def w2_rule(lines, k1, W, H):
    try:
        r = w1_rule(lines, k1, W, H)
    except ValidationError:
        raise
    except (TypeError, KeyError, IndexError, AttributeError) as e:
        raise ValidationError("W1: %r" % (e,))
    out = {"reason": r["reason"], "w0": r["w0"], "w1": r["w1"], "candidates": r["candidates"], "maxRight": r["maxRight"],
           "clippedRight": r["clippedRight"], "addedPixels": r["addedPixels"],
           "w2Reason": "inherit", "hitTop": None, "hitBottom": None, "pad": None, "w2": None, "cutPixels": None}
    if r["reason"] != "widened":
        if r["w1"] is not None:
            out["w2"] = dict(r["w1"])
            out["cutPixels"] = 0
        return out
    line = lines[k1["lineIndex"]]
    hw = k1.get("hitWords")
    if not (isinstance(hw, list) and hw):
        raise ValidationError("widened page without hits")
    if len(set(hw)) != len(hw) or not all(isinstance(j, int) and not isinstance(j, bool) and 0 <= j < len(line["words"]) for j in hw):
        raise ValidationError("hitWords %r" % (hw,))
    rects = []
    for j in hw:
        box = line["words"][j].get("box")
        if not (isinstance(box, list) and len(box) == 4 and all(is_num(v) for v in box)):
            raise ValidationError("hit %d box %r" % (j, box))
        x, y, w, h = box
        if not (w > 0 and h > 0):
            raise ValidationError("hit %d non-positive size %r" % (j, box))
        rects.append([x, y, x + w, y + h])
    a = min(q[1] for q in rects)
    b = max(q[3] for q in rects)
    pad = median([q[3] - q[1] for q in rects])
    w1 = r["w1"]
    w1_top, w1_bottom = w1["top"], w1["top"] + w1["height"]
    out.update(hitTop=a, hitBottom=b, pad=pad)
    if any(q[1] < w1_top or q[3] > w1_bottom for q in rects):
        out.update(w2Reason="hit_outside_w1", w2=dict(w1), cutPixels=0)
        return out
    top = max(w1_top, math.floor(a - pad))
    bottom = min(w1_bottom, math.ceil(b + pad))
    if not top < bottom:
        raise ValidationError("W2 top >= bottom")
    w2 = {"left": w1["left"], "top": top, "width": w1["width"], "height": bottom - top}
    if not all(q[1] >= top and q[3] <= bottom for q in rects):
        raise ValidationError("a hit is not inside W2")
    out.update(w2Reason="no_cut" if (top == w1_top and bottom == w1_bottom) else "cut", w2=w2,
               cutPixels=(w1["height"] - w2["height"]) * w1["width"])
    return out


# ------------------------------------------------------------------ exposure (RECOUNT_SPEC 5.2)
def exposure(ink, band):
    if band is None:
        return None
    l, t, r, b = ink
    L, T, R, B = band["left"], band["top"], band["left"] + band["width"], band["top"] + band["height"]
    if l >= L and t >= T and r <= R and b <= B:
        return "full"
    ix = min(r, R) - max(l, L)
    iy = min(b, B) - max(t, T)
    return "partial" if ix > 0 and iy > 0 else "none"


# ------------------------------------------------------------------ prediction validation (RECOUNT_SPEC 5.1)
W2_REASONS = ["inherit", "cut", "no_cut", "hit_outside_w1"]
W1_REASONS = ["widened", "not_wider", "no_candidate", "k0_branch", "unmatched", "error"]


def same_band(a, b):
    return all(a[k] == b[k] for k in ("left", "top", "width", "height"))


def validate_prediction(p):
    W, H, pid = p.get("width"), p.get("height"), p.get("id")
    st = p.get("state")
    if st == "matched":
        for k in ("w0", "w1", "w2"):
            if not band_ok(p.get(k), W, H):
                raise ValidationError("%s: %s not a positive window inside the page" % (pid, k))
        w0, w1, w2 = p["w0"], p["w1"], p["w2"]
        if not (w1["left"] == w0["left"] and w1["top"] == w0["top"] and w1["height"] == w0["height"] and w1["width"] >= w0["width"]):
            raise ValidationError("%s: W1 does not keep W0 left/top/height" % pid)
        if w2["left"] != w1["left"] or w2["width"] != w1["width"]:
            raise ValidationError("%s: W2 left/width differ from W1" % pid)
        if not (w2["top"] >= w1["top"] and w2["top"] + w2["height"] <= w1["top"] + w1["height"]):
            raise ValidationError("%s: W2 not inside W1" % pid)
        if p.get("w2Reason") not in W2_REASONS:
            raise ValidationError("%s: w2Reason" % pid)
        if (p.get("reason") != "widened") != (p["w2Reason"] == "inherit"):
            raise ValidationError("%s: w2Reason vs W1 reason" % pid)
        if (p["w2Reason"] == "cut") == same_band(w2, w1):
            raise ValidationError("%s: W2 window vs w2Reason" % pid)
        cp = p.get("cutPixels")
        if isinstance(cp, bool) or cp != (w1["height"] - w2["height"]) * w1["width"]:
            raise ValidationError("%s: cutPixels" % pid)
        if p["w2Reason"] in ("cut", "no_cut"):
            ht, hb = p.get("hitTop"), p.get("hitBottom")
            if not (is_num(ht) and is_num(hb) and ht >= w2["top"] and hb <= w2["top"] + w2["height"]):
                raise ValidationError("%s: hits not inside W2" % pid)
    elif st in ("unmatched", "error"):
        if p.get("w0") is not None or p.get("w1") is not None or p.get("w2") is not None or p.get("cutPixels") is not None or p.get("w2Reason") != "inherit":
            raise ValidationError("%s: %s row carries a window" % (pid, st))
    else:
        raise ValidationError("%s: state %r" % (pid, st))
    return True


# ------------------------------------------------------------------ scoring (RECOUNT_SPEC 5.3)
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


def transition(a, b):
    return "keptSuccess" if a and b else "recovered" if b else "lost" if a else "bothFail"


def tally(xs):
    return {"full": sum(1 for x in xs if x == "full"), "partial": sum(1 for x in xs if x == "partial"), "none": sum(1 for x in xs if x == "none")}


def score_page(pred, page):
    if pred.get("id") != page["id"]:
        raise ValidationError("prediction %r does not join page %r" % (pred.get("id"), page["id"]))
    validate_prediction(pred)
    w0, w1, w2 = judge(pred, pred["w0"], page), judge(pred, pred["w1"], page), judge(pred, pred["w2"], page)
    st = pred["state"]
    matched = st == "matched"
    stage = "error" if st == "error" else "unmatched" if st == "unmatched" else ("hangul" if pred["branch"] == "hangul" else "k0")
    t12 = transition(w1["strict"], w2["strict"])
    lost_parts = None
    if t12 == "lost":
        lost_parts = []
        if exposure(page["parts"][0], pred["w2"]) != "full":
            lost_parts.append("label")
        if exposure(page["parts"][1], pred["w2"]) != "full":
            lost_parts.append("value")
    others = None
    if matched:
        items = []
        for item in page["otherValueItems"]:
            ink = page["inks"][item]["ink"]
            items.append({"item": item, "w0": exposure(ink, pred["w0"]), "w1": exposure(ink, pred["w1"]), "w2": exposure(ink, pred["w2"])})
        others = {"n": len(items), "w1": tally([i["w1"] for i in items]), "w2": tally([i["w2"] for i in items]),
                  "fromW1Full": tally([i["w2"] for i in items if i["w1"] == "full"]), "items": items}
    j_opp = bool(matched and w1["strict"] and pred["w2Reason"] == "cut" and others["w1"]["full"] >= 1)
    j_event = bool(j_opp and w2["strict"] and others["fromW1Full"]["none"] >= 1)
    return {"id": page["id"], "source": page["source"], "doctype": page["doctype"], "form": page["form"], "content": page["content"],
            "vert": page["vert"], "space": page["space"], "slot": page["slot"], "stage": stage, "reason": pred["reason"], "w2Reason": pred["w2Reason"],
            "w0": w0, "w1": w1, "w2": w2, "t01": transition(w0["strict"], w1["strict"]), "t12": t12,
            "fullPageToPartial": (w1["fullPage"] is True and w2["fullPage"] is not True) if matched else None,
            "lostParts": lost_parts, "cutPixels": pred["cutPixels"], "others": others, "jOpportunity": j_opp, "jEvent": j_event, "error": st == "error"}


# ------------------------------------------------------------------ aggregates (RECOUNT_SPEC 6)
EV = {"all": 2, "partial": 1, "none": 0}


def nsrc(rows):
    return len({r["source"] for r in rows})


def group(rows, A):
    def c(f):
        return sum(1 for r in rows if f(r))
    valid = [r for r in rows if r["stage"] in ("k0", "hangul")]

    def tr(k):
        return {"recovered": c(lambda r: r[k] == "recovered"), "lost": c(lambda r: r[k] == "lost"),
                "keptSuccess": c(lambda r: r[k] == "keptSuccess"), "bothFail": c(lambda r: r[k] == "bothFail")}
    lost = [r for r in rows if r["t12"] == "lost"]
    w1s = c(lambda r: r["w1"]["strict"])
    je = [r for r in rows if r["jEvent"]]
    jo = [r for r in rows if r["jOpportunity"]]
    fp = [r for r in rows if r["fullPageToPartial"] is True]
    cut_rows = [r for r in valid if r["w2Reason"] == "cut"]
    px = [r["cutPixels"] for r in valid]
    pxc = [r["cutPixels"] for r in cut_rows]
    tot, totc = sum(px), sum(pxc)
    widened = c(lambda r: r["reason"] == "widened")
    cut = c(lambda r: r["w2Reason"] == "cut")
    L = {"count": len(lost), "denom": w1s, "pct": pct(len(lost), w1s), "sources": nsrc(lost)}
    J = {"count": len(je), "opportunity": len(jo), "pct": pct(len(je), len(jo)), "sources": nsrc(je), "opportunitySources": nsrc(jo)}
    if widened == 0:
        removal = "no_opportunity_widened"
    elif cut == 0:
        removal = "no_opportunity_cut"
    elif J["opportunity"] == 0:
        removal = "no_opportunity_denominator"
    elif J["count"] >= 1:
        removal = "observed_repeated_sources" if J["sources"] >= 2 else "observed_single_source"
    else:
        removal = "not_observed"

    def o(r):
        return r["others"]

    def osum(f):
        return sum(f(r) for r in valid)
    return {
        "n": len(rows), "error": c(lambda r: r["stage"] == "error"), "unmatched": c(lambda r: r["stage"] == "unmatched"), "matched": len(valid),
        "strict": {"w0": c(lambda r: r["w0"]["strict"]), "w1": w1s, "w2": c(lambda r: r["w2"]["strict"])},
        "fullPage": {k: c(lambda r, k=k: r[k]["fullPage"] is True) for k in ("w0", "w1", "w2")},
        "t01": tr("t01"), "t12": tr("t12"), "L": L, "J": J,
        "fullPageToPartial": {"count": len(fp), "recovered": sum(1 for r in fp if r["t12"] == "recovered")},
        "lostParts": {"label": sum(1 for r in lost if r["lostParts"] == ["label"]), "value": sum(1 for r in lost if r["lostParts"] == ["value"]),
                      "both": sum(1 for r in lost if r["lostParts"] == ["label", "value"])},
        "widened": widened, "cut": cut, "noCut": c(lambda r: r["w2Reason"] == "no_cut"), "hitOutside": c(lambda r: r["w2Reason"] == "hit_outside_w1"),
        "others": {
            "pagesW1Full": sum(1 for r in valid if o(r)["w1"]["full"] >= 1), "itemsW1Full": osum(lambda r: o(r)["w1"]["full"]),
            "pagesW2Full": sum(1 for r in valid if o(r)["w2"]["full"] >= 1), "itemsW2Full": osum(lambda r: o(r)["w2"]["full"]),
            "itemsW1Partial": osum(lambda r: o(r)["w1"]["partial"]), "itemsW2Partial": osum(lambda r: o(r)["w2"]["partial"]),
            "fromW1Full": {k: osum(lambda r, k=k: o(r)["fromW1Full"][k]) for k in ("full", "partial", "none")},
            "pagesReduced": sum(1 for r in valid if o(r)["w2"]["full"] < o(r)["w1"]["full"]),
            "pagesReducedBothStrict": sum(1 for r in valid if o(r)["w2"]["full"] < o(r)["w1"]["full"] and r["w1"]["strict"] and r["w2"]["strict"]),
            "pagesFullToPartialOnly": sum(1 for r in valid if o(r)["fromW1Full"]["partial"] >= 1 and o(r)["fromW1Full"]["none"] == 0),
            "pagesFullToNone": sum(1 for r in valid if o(r)["fromW1Full"]["none"] >= 1),
            "pagesFullToPartialAndNone": sum(1 for r in valid if o(r)["fromW1Full"]["partial"] >= 1 and o(r)["fromW1Full"]["none"] >= 1),
            "newlyFullW2": osum(lambda r: sum(1 for i in o(r)["items"] if i["w2"] == "full" and i["w1"] != "full")),
            "newEvidenceW2": osum(lambda r: max(0, EV[r["w2"]["evidence"]] - EV[r["w1"]["evidence"]])),
        },
        "area": {
            "validPairs": len(valid), "cutPixelsSum": tot,
            "meanPp": r4(tot * 100 / (len(valid) * A)) if valid else None,
            "medianPp": r4(median(px) * 100 / A) if valid else None,
            "maxPp": r4(max(px) * 100 / A) if valid else None,
            "cutPages": len(cut_rows), "cutPixelsSumCut": totc,
            "cutMeanPp": r4(totc * 100 / (len(cut_rows) * A)) if cut_rows else None,
            "cutMedianPp": r4(median(pxc) * 100 / A) if cut_rows else None,
            "cutMaxPp": r4(max(pxc) * 100 / A) if cut_rows else None,
        },
        "sources": nsrc(rows),
        "verdict": {"loss": "loss" if L["count"] > 0 else "no_loss", "removal": removal},
    }


def summarize_scores(rows, page_area):
    A = page_area

    def by(f):
        return [r for r in rows if f(r)]
    err = len(by(lambda r: r["stage"] == "error"))
    stages = {
        "pages": len(rows), "error": err, "normal": len(rows) - err, "unmatched": len(by(lambda r: r["stage"] == "unmatched")),
        "k0Matched": len(by(lambda r: r["stage"] == "k0")), "hangulMatched": len(by(lambda r: r["stage"] == "hangul")),
        "w1Reason": {"widened": len(by(lambda r: r["reason"] == "widened")), "notWider": len(by(lambda r: r["reason"] == "not_wider")),
                     "noCandidate": len(by(lambda r: r["reason"] == "no_candidate")), "k0Branch": len(by(lambda r: r["reason"] == "k0_branch")),
                     "unmatched": len(by(lambda r: r["reason"] == "unmatched")), "error": len(by(lambda r: r["reason"] == "error"))},
        "w2Reason": {"inherit": len(by(lambda r: r["w2Reason"] == "inherit")), "cut": len(by(lambda r: r["w2Reason"] == "cut")),
                     "noCut": len(by(lambda r: r["w2Reason"] == "no_cut")), "hitOutside": len(by(lambda r: r["w2Reason"] == "hit_outside_w1"))},
    }
    sources = []
    for r in rows:
        if r["source"] not in sources:
            sources.append(r["source"])
    groups = {
        "total": group(rows, A),
        "w1Widened": group(by(lambda r: r["reason"] == "widened"), A),
        "cut": group(by(lambda r: r["w2Reason"] == "cut"), A),
        "layout": {k: group(by(lambda r, k=k: "%s-%s" % (r["vert"], r["space"]) == k), A) for k in LAYOUTS},
        "vert": {k: group(by(lambda r, k=k: r["vert"] == k), A) for k in VERTS},
        "space": {k: group(by(lambda r, k=k: r["space"] == k), A) for k in SPACES},
        "form": {k: group(by(lambda r, k=k: r["form"] == k), A) for k in FORMS},
        "doctype": {k: group(by(lambda r, k=k: r["doctype"] == k), A) for k in DOCTYPES},
        "w2Reason": {k: group(by(lambda r, k=k: r["w2Reason"] == k), A) for k in W2_REASONS},
        "w1Reason": {k: group(by(lambda r, k=k: r["reason"] == k), A) for k in W1_REASONS},
        "source": {k: group(by(lambda r, k=k: r["source"] == k), A) for k in sources},
    }

    def ids(f):
        return [r["id"] for r in rows if f(r)]
    lists = {
        "t12Lost": ids(lambda r: r["t12"] == "lost"), "t12Recovered": ids(lambda r: r["t12"] == "recovered"),
        "jEvent": ids(lambda r: r["jEvent"]), "jOpportunity": ids(lambda r: r["jOpportunity"]),
        "fullPageToPartial": ids(lambda r: r["fullPageToPartial"] is True), "cut": ids(lambda r: r["w2Reason"] == "cut"),
        "widened": ids(lambda r: r["reason"] == "widened"), "t01Recovered": ids(lambda r: r["t01"] == "recovered"),
        "t01Lost": ids(lambda r: r["t01"] == "lost"), "errors": ids(lambda r: r["stage"] == "error"), "unmatched": ids(lambda r: r["stage"] == "unmatched"),
    }
    table = []
    for s in sources:
        rs = by(lambda r, s=s: r["source"] == s)
        cells = {}
        for k in LAYOUTS:
            r = next((x for x in rs if "%s-%s" % (x["vert"], x["space"]) == k), None)
            if r is None:
                cells[k] = None
                continue
            o = r["others"]
            cells[k] = {"id": r["id"], "stage": r["stage"], "w1Reason": r["reason"], "w2Reason": r["w2Reason"], "w1Strict": r["w1"]["strict"],
                        "w2Strict": r["w2"]["strict"], "t12": r["t12"], "w1Full": o["w1"]["full"] if o else None, "w2Full": o["w2"]["full"] if o else None,
                        "fromW1FullPartial": o["fromW1Full"]["partial"] if o else None, "fromW1FullNone": o["fromW1Full"]["none"] if o else None,
                        "cutPp": None if r["cutPixels"] is None else r4(r["cutPixels"] * 100 / A)}
        table.append({"source": s, "doctype": rs[0]["doctype"], "form": rs[0]["form"], "content": rs[0]["content"], "slot": rs[0]["slot"], "cells": cells})
    return {"stages": stages, "groups": groups, "lists": lists, "sourceTable": table}


# ------------------------------------------------------------------ public tables (RECOUNT_SPEC 8)
def fmt(v):
    if v is None:
        return "—"
    if v is True or v is False:
        return "S" if v else "F"
    if isinstance(v, (int, float)):
        return js_number(v)
    return str(v)


def tline(cells):
    return "| " + " | ".join(fmt(c) for c in cells) + " |"


def group_rows(g):
    out = [("전체", g["total"]), ("W1 widened", g["w1Widened"]), ("세로 제한(cut)", g["cut"])]
    out += [("layout " + k, g["layout"][k]) for k in LAYOUTS]
    out += [("vert " + k, g["vert"][k]) for k in VERTS] + [("space " + k, g["space"][k]) for k in SPACES]
    out += [("form " + k, g["form"][k]) for k in FORMS] + [("doctype " + k, g["doctype"][k]) for k in DOCTYPES]
    out += [("W2 " + k, g["w2Reason"][k]) for k in W2_REASONS]
    out += [("W1 widened 사유" if k == "widened" else "W1 " + k, g["w1Reason"][k]) for k in W1_REASONS]
    return out


def source_cell(c):
    if c is None:
        return None
    if c["stage"] == "error":
        return "error"
    if c["stage"] == "unmatched":
        return "unmatched"
    reason = "inherit:" + c["w1Reason"] if c["w2Reason"] == "inherit" else c["w2Reason"]
    s = "%s→%s %s %s→%s" % ("S" if c["w1Strict"] else "F", "S" if c["w2Strict"] else "F", reason, fmt(c["w1Full"]), fmt(c["w2Full"]))
    if c["fromW1FullNone"] > 0:
        s += " none%d" % c["fromW1FullNone"]
    if c["fromW1FullPartial"] > 0:
        s += " part%d" % c["fromW1FullPartial"]
    return s


def render_tables(summary):
    g, st = summary["groups"], summary["stages"]

    def head(cells):
        return [tline(cells), "|" + "---|" * len(cells)]
    stages = head(["항목", "쪽수"]) + [tline(x) for x in [
        ["등록 쪽", st["pages"]], ["기술 오류", st["error"]], ["정상 처리(미매치 포함)", st["normal"]], ["정상 미매치", st["unmatched"]],
        ["K0 매치", st["k0Matched"]], ["한글 매치", st["hangulMatched"]],
        ["W1 widened", st["w1Reason"]["widened"]], ["W1 not_wider", st["w1Reason"]["notWider"]], ["W1 no_candidate", st["w1Reason"]["noCandidate"]],
        ["W1 k0_branch", st["w1Reason"]["k0Branch"]], ["W2 cut", st["w2Reason"]["cut"]], ["W2 no_cut", st["w2Reason"]["noCut"]],
        ["W2 hit_outside_w1", st["w2Reason"]["hitOutside"]], ["W2 inherit", st["w2Reason"]["inherit"]]]]
    groups = head(["그룹", "n", "오류", "미매치", "매치", "W0 엄격", "W1 엄격", "W2 엄격", "W1 widened", "세로 제한", "L 손실/W1 성공", "L 원본",
                   "J/기회", "J 원본", "기회 원본", "전체→부분(회복)"])
    others = head(["그룹", "W1 완전 값(쪽)", "W2 완전 값(쪽)", "W1 완전→W2 완전/일부/전혀", "감소 쪽", "감소∧둘 다 엄격", "완전→일부만", "완전→전혀≥1", "둘 다", "W2 새 완전"])
    area = head(["그룹", "유효 쌍", "절감 픽셀 합", "평균 %p", "중앙 %p", "최대 %p", "자른 쪽", "자른 쪽 픽셀 합", "자른 쪽 평균 %p", "자른 쪽 중앙 %p", "자른 쪽 최대 %p"])
    for name, b in group_rows(g):
        groups.append(tline([name, b["n"], b["error"], b["unmatched"], b["matched"], b["strict"]["w0"], b["strict"]["w1"], b["strict"]["w2"],
                             b["widened"], b["cut"], "%d/%d" % (b["L"]["count"], b["L"]["denom"]), b["L"]["sources"],
                             "%d/%d" % (b["J"]["count"], b["J"]["opportunity"]), b["J"]["sources"], b["J"]["opportunitySources"],
                             "%d (%d)" % (b["fullPageToPartial"]["count"], b["fullPageToPartial"]["recovered"])]))
        o = b["others"]
        others.append(tline([name, "%d (%d)" % (o["itemsW1Full"], o["pagesW1Full"]), "%d (%d)" % (o["itemsW2Full"], o["pagesW2Full"]),
                             "%d/%d/%d" % (o["fromW1Full"]["full"], o["fromW1Full"]["partial"], o["fromW1Full"]["none"]), o["pagesReduced"],
                             o["pagesReducedBothStrict"], o["pagesFullToPartialOnly"], o["pagesFullToNone"], o["pagesFullToPartialAndNone"], o["newlyFullW2"]]))
        a = b["area"]
        area.append(tline([name, a["validPairs"], a["cutPixelsSum"], a["meanPp"], a["medianPp"], a["maxPp"], a["cutPages"], a["cutPixelsSumCut"],
                           a["cutMeanPp"], a["cutMedianPp"], a["cutMaxPp"]]))
    verdict = head(["그룹", "손실 판정", "제거 판정"]) + [tline([n, b["verdict"]["loss"], b["verdict"]["removal"]])
                                                    for n, b in [("전체", g["total"])] + [("layout " + k, g["layout"][k]) for k in LAYOUTS]]
    sources = head(["원본", "양식", "목표 슬롯"] + LAYOUTS) + [tline([s["source"], s["form"], s["slot"]] + [source_cell(s["cells"][k]) for k in LAYOUTS])
                                                       for s in summary["sourceTable"]]
    return {"stages": stages, "groups": groups, "others": others, "area": area, "verdict": verdict, "sources": sources}


TABLE_BLOCK = re.compile(r"<!-- krh:table (\S+) -->\n([\s\S]*?)\n<!-- /krh:table -->")


def cells_of(line):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [x.strip() for x in s.split("|")]


def check_tables(markdown, summary):
    want = render_tables(summary)
    text = markdown.replace("\r\n", "\n")
    got, out = {}, []
    for m in TABLE_BLOCK.finditer(text):
        if m.group(1) in got:
            out.append({"table": m.group(1), "row": None, "col": None, "want": "one block", "got": "duplicate block"})
        got[m.group(1)] = m.group(2).split("\n")
    for name in got:
        if name not in want:
            out.append({"table": name, "row": None, "col": None, "want": "no such table", "got": "table"})
    for name, lines in want.items():
        have = got.get(name)
        if have is None:
            out.append({"table": name, "row": None, "col": None, "want": "table", "got": "missing"})
            continue
        for i in range(max(len(lines), len(have))):
            if i >= len(lines) or i >= len(have):
                out.append({"table": name, "row": i, "col": None, "want": lines[i] if i < len(lines) else None, "got": have[i] if i < len(have) else None})
                continue
            a, b = cells_of(lines[i]), cells_of(have[i])
            for j in range(max(len(a), len(b))):
                x = a[j] if j < len(a) else None
                y = b[j] if j < len(b) else None
                if x != y:
                    out.append({"table": name, "row": i, "col": j, "want": x, "got": y})
    return out


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
    return {
        "manifest": read_json(os.path.join(d, "manifest.json")), "design": read_json(os.path.join(d, "scoring", "design.json")),
        "questions": read_json(os.path.join(d, "selector", "questions.json"))["questions"],
        "gold": read_json(os.path.join(d, "scoring", "gold.json"))["gold"], "render": read_json(os.path.join(d, "scoring", "render.json"))["images"],
        "ocrFreeze": read_json(os.path.join(args.ocr, "freeze.json")), "ocr": read_jsonl(os.path.join(args.ocr, "ocr.jsonl")), "k1": read_jsonl(os.path.join(args.ocr, "k1.jsonl")),
        "replayFreeze": read_json(os.path.join(args.replay, "freeze.json")), "preds": read_jsonl(os.path.join(args.replay, "predictions.jsonl")),
        "inputs": read_json(os.path.join(args.replay, "inputs.json")),
        "score": read_jsonl(os.path.join(args.score, "score.jsonl")), "summary": read_json(os.path.join(args.score, "summary.json")),
        "results": read_bytes(args.results).decode("utf-8") if args.results else None,
    }


def pages_of(x):
    pages = []
    for im in x["design"]["images"]:
        g = x["gold"][im["id"]]
        pages.append({"id": im["id"], "source": im["source"], "doctype": im["doctype"], "form": im["form"], "content": im["content"],
                      "vert": im["vert"], "space": im["space"], "slot": im["slot"], "width": im["page"]["width"], "height": im["page"]["height"],
                      "anchorItem": im["anchorItem"], "valueItem": im["valueItem"], "parts": [p["rect"] for p in g["parts"]],
                      "otherValueItems": im["otherValueItems"], "inks": x["render"][im["id"]]["items"]})
    return pages


def norm_question(q):
    return " ".join(unicodedata.normalize("NFC", q).split())


SELECTOR_ALLOW = re.compile(r"^selector/(questions\.json|images/[A-Za-z0-9_-]+\.png)$")
PRED_FIELDS = ["id", "pngSha256", "ocrSha256", "width", "height", "state", "error", "branch", "lineIndex", "hitWords", "reason", "w0", "w1",
               "candidates", "maxRight", "clippedRight", "addedPixels", "w2Reason", "hitTop", "hitBottom", "pad", "w2", "cutPixels"]


def recount(args, x, rep):
    d = args.data
    C1 = "1-hashes-ids-data"
    rep.check(C1)
    listed = []
    for root, _, files in os.walk(d):
        for f in files:
            rel = os.path.relpath(os.path.join(root, f), d).replace(os.sep, "/")
            if rel != "manifest.json":
                listed.append(rel)
    if sorted(listed) != sorted(x["manifest"]["files"]):
        rep.bad(C1, "manifest file list")
    for rel, m in x["manifest"]["files"].items():
        b = read_bytes(os.path.join(d, rel))
        if sha_bytes(b) != m["sha256"] or len(b) != m["bytes"]:
            rep.bad(C1, "manifest " + rel)
    for fz, folder, files in ((x["ocrFreeze"], args.ocr, ["ocr.jsonl", "k1.jsonl"]), (x["replayFreeze"], args.replay, ["predictions.jsonl", "inputs.json"])):
        for f in files:
            if fz["files"].get(f) != sha_bytes(read_bytes(os.path.join(folder, f))):
                rep.bad(C1, "freeze " + f)
    ids = [im["id"] for im in x["design"]["images"]]
    if len(ids) != PAGES:
        rep.bad(C1, "design pages", len(ids), PAGES)
    for name in ("questions", "ocr", "k1", "preds", "score"):
        try:
            check_id_set(x[name], ids)
        except ValidationError as e:
            rep.bad(C1, "ids " + name, str(e))
            raise
    for q, im in zip(x["questions"], x["design"]["images"]):
        if (q["file"], q["question"]) != (im["file"], im["question"]):
            rep.bad(C1, im["id"] + " questions.json vs design")
    pages = pages_of(x)
    pngs = {}
    for im, p in zip(x["design"]["images"], pages):
        g = x["gold"][im["id"]]["parts"]
        if len(g) != 2 or g[0]["item"] != im["anchorItem"] or g[1]["item"] != im["valueItem"]:
            rep.bad(C1, im["id"] + " gold items")
            continue
        cells = {it["id"]: it["cell"] for it in im["items"]}
        for part in g:
            l, t, r, b = part["rect"]
            if not (all(isinstance(v, int) for v in part["rect"]) and 0 <= l < r <= 1280 and 0 <= t < b <= 960 and part["size"] == [r - l, b - t]):
                rep.bad(C1, im["id"] + " gold rect " + part["item"])
            if x["render"][im["id"]]["items"][part["item"]]["ink"] != part["rect"]:
                rep.bad(C1, im["id"] + " gold vs render " + part["item"])
            cl = cells[part["item"]]
            if not (l >= cl[0] and t >= cl[1] and r <= cl[2] and b <= cl[3]):
                rep.bad(C1, im["id"] + " gold outside cell " + part["item"])
        a, v = g[0]["rect"], g[1]["rect"]
        if min(a[2], v[2]) > max(a[0], v[0]) and min(a[3], v[3]) > max(a[1], v[1]):
            rep.bad(C1, im["id"] + " gold boxes overlap")
        slot = (DOCTYPES.index(im["doctype"]) + FORMS.index(im["form"]) + im["content"]) % 3
        if im["slot"] != slot or im["otherValueItems"] != ["r%d-value" % s for s in range(3) if s != slot]:
            rep.bad(C1, im["id"] + " slot/otherValueItems")
        data = read_bytes(os.path.join(d, "selector", "images", im["file"]))
        w, h, rows = decode_png(data)
        pngs[im["id"]] = {"sha": sha_bytes(data), "w": w, "h": h}
        if (w, h) != (1280, 960):
            rep.bad(C1, im["id"] + " PNG size", [w, h])
        for rect, name in [(part["rect"], part["item"]) for part in g] + [(x["render"][im["id"]]["items"][k]["ink"], k) for k in im["otherValueItems"]]:
            if not edges_have_ink(rows, rect):
                rep.bad(C1, im["id"] + " edge ink " + name)
    for o in x["ocr"]:
        pg = pngs.get(o["id"])
        if pg and o["pngSha256"] != pg["sha"]:
            rep.bad(C1, o["id"] + " ocr pngSha256")
        if pg and o["status"] == "ok" and (o["width"], o["height"]) != (pg["w"], pg["h"]):
            rep.bad(C1, o["id"] + " ocr size")

    # 1b pairing (RECOUNT_SPEC 2.6)
    CP = "1b-pairing"
    rep.check(CP)
    by_src = {}
    for im in x["design"]["images"]:
        by_src.setdefault(im["source"], []).append(im)

    def sig(im):
        inks = x["render"][im["id"]]["items"]
        return (im["question"], im["answer"], im["anchorItem"], im["valueItem"], tuple(im["otherValueItems"]),
                tuple((it["id"], it["role"], it["text"], inks[it["id"]]["ink"][0], inks[it["id"]]["ink"][2], inks[it["id"]]["ink"][3] - inks[it["id"]]["ink"][1]) for it in im["items"]))
    if len(by_src) != 12:
        rep.bad(CP, "sources", len(by_src), 12)
    for s, ims in by_src.items():
        if sorted("%s-%s" % (im["vert"], im["space"]) for im in ims) != sorted(LAYOUTS):
            rep.bad(CP, s + " layouts")
        if any(sig(im) != sig(ims[0]) for im in ims):
            rep.bad(CP, s + " pages differ beyond y")
    nq = [norm_question(im["question"]) for im in x["design"]["images"]]
    if len(set(nq)) != 12 or any(nq.count(q) != 4 for q in nq) or any(len({norm_question(im["question"]) for im in ims}) != 1 for ims in by_src.values()):
        rep.bad(CP, "normalized questions are not 12 x 4 by source")
    if len({p["sha"] for p in pngs.values()}) != PAGES:
        rep.bad(CP, "PNG SHA-256 not unique")

    # 2 K1 recompute, W0/W1/W2 predictions
    C2 = "2-k1-w1-w2-predictions"
    rep.check(C2)
    qmap = {q["id"]: q["question"] for q in x["questions"]}
    my_preds = []
    for o, k, pr in zip(x["ocr"], x["k1"], x["preds"]):
        pid = o["id"]
        pg = pngs[pid]
        if o["status"] == "ok":
            if sha_bytes(js_stringify(o["ocrLines"]).encode("utf-8")) != o["ocrSha256"]:
                rep.bad(C2, pid + " ocrSha256 (JSON number text)")
            exp = expected_k1(o["ocrLines"], qmap[pid], pg["w"], pg["h"])
            for f in SHAPE:
                if f == "error":
                    if exp["status"] == "ok":
                        if k["k1"].get("error") is not None:
                            rep.bad(C2, pid + " k1.error", None, k["k1"].get("error"))
                    elif not str(k["k1"].get("error") or "").startswith(exp["error"].split(":")[0]):
                        rep.bad(C2, pid + " k1.error", exp["error"], k["k1"].get("error"))
                    continue
                if not same(exp[f], k["k1"].get(f)):
                    rep.bad(C2, pid + " k1." + f, exp[f], k["k1"].get(f))
            if k["status"] != ("ok" if exp["status"] == "ok" else "error"):
                rep.bad(C2, pid + " k1 row status")
        elif k["status"] != "error" or k["k1"].get("status") != "error":
            rep.bad(C2, pid + " OCR error without K1 error")
        r = w2_rule(o["ocrLines"] if o["status"] == "ok" else None, k["k1"], pg["w"], pg["h"])
        state = "error" if r["reason"] == "error" else ("unmatched" if r["reason"] == "unmatched" else "matched")
        mine = {"id": pid, "pngSha256": pg["sha"], "ocrSha256": o.get("ocrSha256"), "width": pg["w"], "height": pg["h"], "state": state,
                "branch": k["k1"].get("branch"), "lineIndex": k["k1"].get("lineIndex"), "hitWords": k["k1"].get("hitWords"), **r}
        validate_prediction(mine)
        my_preds.append(mine)
        if list(pr) != PRED_FIELDS:
            rep.bad(C2, pid + " prediction field order", PRED_FIELDS, list(pr))
        for f, val in mine.items():
            if not same(val, pr.get(f)):
                rep.bad(C2, pid + " pred." + f, val, pr.get(f))
        if (state == "error") != (pr.get("error") is not None):
            rep.bad(C2, pid + " pred.error presence")
        try:
            validate_prediction(pr)
        except ValidationError as e:
            rep.bad(C2, pid + " recorded prediction invalid", str(e))

    # 2b approved inputs of the replay (protocol 4.5)
    C2b = "2b-replay-inputs"
    rep.check(C2b)
    data_paths = [e["path"] for e in x["inputs"].get("data", [])]
    if any(not SELECTOR_ALLOW.match(p) for p in data_paths):
        rep.bad(C2b, "a replay data input outside the selector allowlist", [p for p in data_paths if not SELECTOR_ALLOW.match(p)][:5])
    want_paths = ["selector/questions.json"] + ["selector/images/" + im["file"] for im in x["design"]["images"]]
    if data_paths != want_paths:
        rep.bad(C2b, "replay data inputs are not exactly questions + 48 PNGs in order")
    for e in x["inputs"].get("data", []):
        m = x["manifest"]["files"].get("/".join(e["path"].split("/")[0:]))
        if not m or m["sha256"] != e["sha256"]:
            rep.bad(C2b, "input hash " + e["path"])
    if sorted(e["path"] for e in x["inputs"].get("ocr", [])) != ["ocr/freeze.json", "ocr/k1.jsonl", "ocr/ocr.jsonl"]:
        rep.bad(C2b, "replay OCR inputs")

    # 3 rows
    C3 = "3-rows"
    rep.check(C3)
    my_rows = [score_page(p, pg) for p, pg in zip(my_preds, pages)]
    for d_ in diff_rows(my_rows, x["score"]):
        rep.bad(C3, d_["id"], d_["fields"])

    # 4 summary
    C4 = "4-summary"
    rep.check(C4)
    area = pages[0]["width"] * pages[0]["height"]
    s = summarize_scores(my_rows, area)
    for key in ("stages", "groups", "lists", "sourceTable"):
        if not same(s[key], x["summary"].get(key)):
            sub = [k for k in s[key]] if isinstance(s[key], dict) else None
            if isinstance(s[key], dict):
                sub = [k for k in s[key] if not same(s[key][k], (x["summary"].get(key) or {}).get(k))]
            rep.bad(C4, key, sub)
    matched = [r for r in my_rows if r["stage"] in ("k0", "hangul")]
    inv = {"checked": len(matched), "w2InsideW1": len(matched), "sameLeftWidth": len(matched),
           "hitsInsideW2": sum(1 for r in matched if r["w2Reason"] in ("cut", "no_cut")),
           "newlyFullW2": s["groups"]["total"]["others"]["newlyFullW2"], "newEvidenceW2": s["groups"]["total"]["others"]["newEvidenceW2"]}
    if not same(inv, x["summary"].get("invariants")):
        rep.bad(C4, "invariants", inv, x["summary"].get("invariants"))
    if inv["newlyFullW2"] or inv["newEvidenceW2"]:
        rep.bad(C4, "W2 newly holds ink W1 did not", inv)
    if x["summary"].get("pageArea") != area or x["summary"].get("predictionsSha256") != x["replayFreeze"]["files"]["predictions.jsonl"]:
        rep.bad(C4, "summary header")

    # 6 public tables
    C6 = "6-public-tables"
    rep.check(C6)
    if x["results"] is None:
        rep.checks[C6]["unverifiable"] = "no --results given"
    else:
        for mm in check_tables(x["results"], s):
            rep.bad(C6, "%s r%s c%s" % (mm["table"], mm["row"], mm["col"]), mm["want"], mm["got"])
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
    pair = next(((i, j) for i in range(len(rows)) for j in range(i + 1, len(rows)) if rows[i]["t12"] != rows[j]["t12"]), None)
    if pair:
        x2 = copy.deepcopy(x)
        i, j = pair
        x2["score"][i]["t12"], x2["score"][j]["t12"] = rows[j]["t12"], rows[i]["t12"]
        run("swapT12", x2, "t12 of %s and %s swapped (totals kept)" % (rows[i]["id"], rows[j]["id"]))
    else:
        out["swapT12"] = {"notApplicable": "every page has the same t12"}
    cp = idx(lambda r: r["cutPixels"] is not None)
    pair = next(((i, j) for i in cp for j in cp if rows[i]["cutPixels"] != rows[j]["cutPixels"]), None)
    if pair:
        x2 = copy.deepcopy(x)
        i, j = pair
        x2["score"][i]["cutPixels"], x2["score"][j]["cutPixels"] = rows[j]["cutPixels"], rows[i]["cutPixels"]
        run("swapCutPixels", x2, "cutPixels of %s and %s swapped (sum kept)" % (rows[i]["id"], rows[j]["id"]))
    else:
        out["swapCutPixels"] = {"notApplicable": "all matched pages have the same cutPixels"}
    loc = [(i, k, it["w2"]) for i, r in enumerate(rows) if r["others"] for k, it in enumerate(r["others"]["items"])]
    p_ = next(((i, k) for i, k, c in loc if c == "partial"), None)
    n_ = next(((i, k) for i, k, c in loc if c == "none" and (p_ is None or i != p_[0])), None)
    if p_ and n_:
        x2 = copy.deepcopy(x)
        x2["score"][p_[0]]["others"]["items"][p_[1]]["w2"] = "none"
        x2["score"][n_[0]]["others"]["items"][n_[1]]["w2"] = "partial"
        run("exposurePartialNoneSwap", x2, "partial -> none on %s, none -> partial on %s (sums kept)" % (rows[p_[0]]["id"], rows[n_[0]]["id"]))
    else:
        out["exposurePartialNoneSwap"] = {"notApplicable": "no partial item and a none item on another page"}
    if loc:
        x2 = copy.deepcopy(x)
        i, k, c = loc[0]
        x2["score"][i]["others"]["items"][k]["w2"] = {"full": "partial", "partial": "none", "none": "partial"}[c]
        run("exposureClassChanged", x2, "%s item %d: %s changed" % (rows[i]["id"], k, c))
    m = next((i for i, p in enumerate(x["preds"]) if p["state"] == "matched"), None)
    if m is not None:
        x2 = copy.deepcopy(x)
        x2["preds"][m]["w2"]["top"] += 1
        run("predictionW2TopPlusOne", x2, "boundary moved by 1 px on " + x["preds"][m]["id"])
    x2 = copy.deepcopy(x)
    x2["score"][1]["id"] = x2["score"][0]["id"]
    run("duplicateId", x2)
    x2 = copy.deepcopy(x)
    x2["preds"] = x2["preds"][:-1]
    run("missingId", x2)
    x2 = copy.deepcopy(x)
    first = x["design"]["images"][0]["id"]
    x2["gold"][first]["parts"][1]["rect"][3] += 1
    x2["gold"][first]["parts"][1]["size"][1] += 1
    run("goldValueBottomPlusOne", x2, "answer box of %s moved by 1 px" % first)
    k1i = next((i for i, k in enumerate(x["k1"]) if isinstance(k["k1"].get("hitWords"), list) and k["k1"]["hitWords"]), None)
    if k1i is not None:
        x2 = copy.deepcopy(x)
        x2["k1"][k1i]["k1"]["hitWords"] = x2["k1"][k1i]["k1"]["hitWords"][:-1] if len(x2["k1"][k1i]["k1"]["hitWords"]) > 1 else x2["k1"][k1i]["k1"]["hitWords"] + [x2["k1"][k1i]["k1"]["hitWords"][0]]
        run("k1HitWordsChanged", x2, "selection record of " + x["k1"][k1i]["id"])
    if x["results"] is not None:
        x2 = copy.deepcopy(x)
        x2["results"] = x["results"].replace("| 전체 | 48 |", "| 전체 | 47 |", 1)
        if x2["results"] != x["results"]:
            run("publicTableCell", x2, "groups table: total n 48 -> 47")
        else:
            out["publicTableCell"] = {"notApplicable": "groups total row not found"}
    else:
        out["publicTableCell"] = {"notApplicable": "no --results given"}
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    for a in ("--data", "--ocr", "--replay", "--score"):
        ap.add_argument(a, required=True)
    ap.add_argument("--results")
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
            f.write(json.dumps({"version": "ko-row-height-mutation-1", "allRejected": ok, "tampers": res}, ensure_ascii=False, indent=1) + "\n")
        print(json.dumps({"allRejected": ok, "tampers": len(res)}))
        return 0 if ok else 1
    rep = Report()
    try:
        rows, s = recount(args, x, rep)
    except ValidationError as e:
        rep.bad("validation", "abort", str(e))
        rows, s = None, None
    result = {"version": "ko-row-height-recount-1", "ok": rep.ok(), "checks": rep.checks,
              "stages": s["stages"] if s else None, "total": s["groups"]["total"] if s else None, "lists": s["lists"] if s else None}
    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"ok": result["ok"], "failed": [k for k, c in rep.checks.items() if not c["ok"]]}))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
