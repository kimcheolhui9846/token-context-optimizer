"""Independent recount of ko-row-gate (tools/ko-row-gate/RECOUNT_SPEC.md). Python 3.12 standard library only.

Recomputes K0/K1 from the raw OCR, the fixed #150 W1 rule, the fixed #151 W2 rule, the new W3 rule (exact decimals from the
JSON number text), the candidate classification, the per-page verdicts, other-value exposure, the events, the areas, the
summary and the public tables from the frozen files, and compares them with the recorded outputs row by row and cell by cell.
Imports no project JS. Provenance: the PNG decoder, JS number formatting, K0/K1, W1 and W2 parts are ported from the #151
recount (blob in d75f5455, same author family); W3, classification, scoring, aggregates, pairing, tables and tampers are new
here and were written by the same author as the JS implementation (no independent second author).

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
from fractions import Fraction

PAGES = 48
DOCTYPES = ["lecture", "exhibit", "meeting"]
FORMS = ["table", "cards"]
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


# ------------------------------------------------------------------ exact decimals (RECOUNT_SPEC 4.0) — new for ko-row-gate
class Tok(str):
    """A JSON number kept as its source text."""


def _bad_constant(name):
    raise InputError("JSON constant %s" % name)


def parse_exact(text):
    """json.loads with every number kept as its JSON source text (a str subclass, equal to the plain text)."""
    return json.loads(text, parse_float=Tok, parse_int=Tok, parse_constant=_bad_constant)


NUM_TEXT = re.compile(r"-?(?:0|[1-9][0-9]*)(?:[.][0-9]+)?(?:[eE][+-]?[0-9]+)?")


def dec(v):
    """Exact Fraction of a JSON number token, a numeral string or an int."""
    if isinstance(v, bool):
        raise ValidationError("boolean is not a number")
    if isinstance(v, int):
        return Fraction(v)
    if isinstance(v, str) and NUM_TEXT.fullmatch(v):
        return Fraction(v)
    raise ValidationError("not an exact number: %r" % (v,))


def dec_str(x):
    f = x if isinstance(x, Fraction) else dec(x)
    if f.denominator == 1:
        return str(f.numerator)
    k, num = 0, f
    while num.denominator != 1:
        num *= 10
        k += 1
        if k > 2000:
            raise ValidationError("not a finite decimal")
    n = num.numerator
    neg = n < 0
    digits = str(-n if neg else n).rjust(k + 1, "0")
    return ("-" if neg else "") + digits[:-k] + "." + digits[-k:]


def plain(s):
    return "%s" % s


def word_box(word):
    """Valid word: box of 4 JSON numbers (tokens or ints), width > 0, height > 0. Exact (x0, y0, x1, y1, w, h) or None."""
    b = word.get("box") if isinstance(word, dict) else None
    if not (isinstance(b, list) and len(b) == 4 and all(isinstance(v, Tok) or (isinstance(v, int) and not isinstance(v, bool)) for v in b)):
        return None
    x, y, w, h = (dec(v) for v in b)
    if w <= 0 or h <= 0:
        return None
    return (x, y, x + w, y + h, w, h)


def same_row_right_exact(h, u):
    if u[0] < h[2]:
        return False
    ov = max(Fraction(0), min(u[3], h[3]) - max(u[1], h[1]))
    return 2 * ov >= min(u[5], h[5])


# ------------------------------------------------------------------ text (RECOUNT_SPEC 4.1)
WHITE = set([0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0x85, 0xA0, 0x1680, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000] + list(range(0x2000, 0x200B)))


def squash(s):
    return "".join(ch for ch in unicodedata.normalize("NFKC", s) if ord(ch) not in WHITE)


CUES = {"time": ["시각", "몇시"], "count": ["몇명"], "pages": ["몇쪽"]}


def question_types(q):
    s = squash(q)
    return sorted(t for t, cs in CUES.items() if any(c in s for c in cs))


GRAMMAR = {
    "time": re.compile("(?:[0-9]|[01][0-9]|2[0-3]):[0-5][0-9]"),
    "count": re.compile("[1-9][0-9]{0,2}명"),
    "pages": re.compile("[1-9][0-9]{0,2}쪽"),
}


def grammar_match(qtype, text):
    if qtype not in GRAMMAR:
        raise ValidationError("unknown question type %r" % qtype)
    return GRAMMAR[qtype].fullmatch(squash(text)) is not None


# ------------------------------------------------------------------ W3 (RECOUNT_SPEC 4)
W3_REASONS = ["error", "unmatched", "not_applicable", "qtype_none", "qtype_multiple", "no_valid_hit_word", "no_candidate",
              "multiple_candidates", "candidate_outside_w2", "applied"]
W3_MATCHED = W3_REASONS[2:]
W2_REASONS = ["inherit", "cut", "no_cut", "hit_outside_w1"]
W1_REASONS = ["widened", "not_wider", "no_candidate", "k0_branch", "unmatched", "error"]
CLASSES = ["target_value", "intended_decoy", "other_record_value", "other_or_ambiguous"]


def same_band(a, b):
    return all(a[k] == b[k] for k in ("left", "top", "width", "height"))


def bottom(b):
    return b["top"] + b["height"]


def band_copy(b):
    return {"left": b["left"], "top": b["top"], "width": b["width"], "height": b["height"]}


def enumerate_units(lines, qtype, hits):
    units = []
    for i, line in enumerate(lines):
        words = line.get("words") if isinstance(line, dict) else None
        if not isinstance(words, list):
            raise ValidationError("OCR line %d words" % i)
        for j in range(len(words)):
            seg = []
            for n in range(1, 4):
                if j + n - 1 >= len(words):
                    break
                w = words[j + n - 1]
                box = word_box(w)
                text = squash(w["text"]) if isinstance(w, dict) and isinstance(w.get("text"), str) else ""
                if box is None or text == "":
                    break
                if seg:
                    p = seg[-1][0]
                    gap = box[0] - p[2]
                    if gap < 0 or 2 * gap > min(p[5], box[5]):
                        break
                seg.append((box, text, w["box"]))
                t = "".join(s[1] for s in seg)
                if not GRAMMAR[qtype].fullmatch(t):
                    continue
                support = sorted(hw for hw, hb in hits if all(same_row_right_exact(hb, s[0]) for s in seg))
                if not support:
                    continue
                x0 = min(s[0][0] for s in seg)
                y0 = min(s[0][1] for s in seg)
                x1 = max(s[0][2] for s in seg)
                y1 = max(s[0][3] for s in seg)
                units.append({"line": i, "first": j, "last": j + n - 1, "text": t,
                              "boxes": [[plain(v) for v in s[2]] for s in seg],
                              "union": [dec_str(x0), dec_str(y0), dec_str(x1), dec_str(y1)], "support": support})
    return {"count": len(units), "units": units}


def union_inside(union, w):
    x0, y0, x1, y1 = (dec(v) for v in union)
    return w["left"] <= x0 and w["top"] <= y0 and x1 <= w["left"] + w["width"] and y1 <= w["top"] + w["height"]


def w3_rule(question, lines, k1, r):
    if not isinstance(r, dict):
        raise ValidationError("W2 result missing")
    if r["reason"] in ("error", "unmatched"):
        return {"qtypes": None, "validHits": None, "scan": None, "w3Reason": r["reason"], "w3From": None, "w3": None, "w3CutPixels": None}
    w1, w2 = r.get("w1"), r.get("w2")
    if w1 is None or w2 is None:
        raise ValidationError("matched page without W1/W2")
    if not isinstance(lines, list):
        raise ValidationError("OCR lines missing")
    qtypes = question_types(question)
    valid_hits, hits = None, None
    hw = k1.get("hitWords") if isinstance(k1, dict) else None
    if isinstance(hw, list):
        li = k1.get("lineIndex")
        if not (isinstance(li, int) and not isinstance(li, bool) and 0 <= li < len(lines)) or not isinstance(lines[li].get("words"), list):
            raise ValidationError("K1 line %r missing" % (li,))
        words = lines[li]["words"]
        hits = []
        for j in hw:
            if not (isinstance(j, int) and not isinstance(j, bool) and 0 <= j < len(words)):
                raise ValidationError("hit word %r out of range" % (j,))
            b = word_box(words[j])
            if b is not None:
                hits.append((j, b))
        valid_hits = [j for j, _ in hits]
    scan = enumerate_units(lines, qtypes[0], hits) if hits and len(qtypes) == 1 else None

    def keep(reason):
        return {"qtypes": qtypes, "validHits": valid_hits, "scan": scan, "w3Reason": reason, "w3From": "w1", "w3": band_copy(w1), "w3CutPixels": 0}

    if r.get("w2Reason") != "cut":
        out = keep("not_applicable")
    elif len(qtypes) == 0:
        out = keep("qtype_none")
    elif len(qtypes) > 1:
        out = keep("qtype_multiple")
    elif hits is None:
        raise ValidationError("cut page without K1 hit words")
    elif not hits:
        out = keep("no_valid_hit_word")
    elif scan["count"] == 0:
        out = keep("no_candidate")
    elif scan["count"] > 1:
        out = keep("multiple_candidates")
    elif not union_inside(scan["units"][0]["union"], w2):
        out = keep("candidate_outside_w2")
    else:
        out = {"qtypes": qtypes, "validHits": valid_hits, "scan": scan, "w3Reason": "applied", "w3From": "w2", "w3": band_copy(w2),
               "w3CutPixels": (w1["height"] - w2["height"]) * w1["width"]}
    w3 = out["w3"]
    if not (same_band(w3, w1) or same_band(w3, w2)):
        raise ValidationError("W3 is neither W1 nor W2")
    if not (w3["top"] <= w2["top"] and bottom(w3) >= bottom(w2) and w3["top"] >= w1["top"] and bottom(w3) <= bottom(w1)):
        raise ValidationError("W2 inside W3 inside W1 broken")
    if out["w3CutPixels"] != (w1["height"] - w3["height"]) * w1["width"]:
        raise ValidationError("w3CutPixels")
    return out


# ------------------------------------------------------------------ candidate classification (RECOUNT_SPEC 5.3)
def classify_candidate(cand, page):
    assigned = []
    for bx in cand["boxes"]:
        x, y, w, h = (dec(v) for v in bx)
        cx2, cy2 = 2 * x + w, 2 * y + h
        hit = [k for k, it in page["items"].items()
               if 2 * dec(it["cell"][0]) <= cx2 < 2 * dec(it["cell"][2]) and 2 * dec(it["cell"][1]) <= cy2 < 2 * dec(it["cell"][3])]
        assigned.append(hit[0] if len(hit) == 1 else None)
    item = assigned[0] if assigned and all(a is not None and a == assigned[0] for a in assigned) else None
    if item is not None:
        l, t, r_, b = (dec(v) for v in page["items"][item]["ink"])
        x0, y0, x1, y1 = (dec(v) for v in cand["union"])
        if not (min(r_, x1) - max(l, x0) > 0 and min(b, y1) - max(t, y0) > 0):
            item = None
    if item is None:
        cls = "other_or_ambiguous"
    elif item == page["valueItem"]:
        cls = "target_value"
    elif item == page["decoyItem"]:
        cls = "intended_decoy"
    elif item in page["otherValueItems"]:
        cls = "other_record_value"
    else:
        cls = "other_or_ambiguous"
    return {"class": cls, "item": item}


# ------------------------------------------------------------------ prediction validation (RECOUNT_SPEC 5.1)
def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def validate_prediction(p):
    W, H, pid = p.get("width"), p.get("height"), p.get("id")
    st = p.get("state")

    def bad(msg):
        raise ValidationError("%s: %s" % (pid, msg))
    if st == "matched":
        for k in ("w0", "w1", "w2", "w3"):
            if not band_ok(p.get(k), W, H):
                bad("%s is not a positive window inside the page" % k)
        w0, w1, w2, w3 = p["w0"], p["w1"], p["w2"], p["w3"]
        if not (w1["left"] == w0["left"] and w1["top"] == w0["top"] and w1["height"] == w0["height"] and w1["width"] >= w0["width"]):
            bad("W1 does not keep W0 left/top/height")
        if w2["left"] != w1["left"] or w2["width"] != w1["width"]:
            bad("W2 left/width differ from W1")
        if not (w2["top"] >= w1["top"] and bottom(w2) <= bottom(w1)):
            bad("W2 is not inside W1")
        if p.get("w2Reason") not in W2_REASONS:
            bad("w2Reason")
        if (p.get("reason") != "widened") != (p["w2Reason"] == "inherit"):
            bad("w2Reason vs W1 reason")
        if (p["w2Reason"] == "cut") == same_band(w2, w1):
            bad("W2 window vs w2Reason")
        if not is_int(p.get("cutPixels")) or p["cutPixels"] != (w1["height"] - w2["height"]) * w1["width"]:
            bad("cutPixels")
        if p["w2Reason"] in ("cut", "no_cut"):
            ht, hb = p.get("hitTop"), p.get("hitBottom")
            if not (is_num(ht) and is_num(hb) and ht >= w2["top"] and hb <= bottom(w2)):
                bad("hits not inside W2")
        wr = p.get("w3Reason")
        if wr not in W3_MATCHED:
            bad("w3Reason %r" % wr)
        if (p["w2Reason"] != "cut") != (wr == "not_applicable"):
            bad("w3Reason vs w2Reason")
        if wr == "applied":
            if p.get("w3From") != "w2" or not same_band(w3, w2):
                bad("applied W3 must be W2")
        elif p.get("w3From") != "w1" or not same_band(w3, w1):
            bad("held W3 must be W1")
        if not is_int(p.get("w3CutPixels")) or p["w3CutPixels"] != (w1["height"] - w3["height"]) * w1["width"]:
            bad("w3CutPixels")
        if not isinstance(p.get("qtypes"), list):
            bad("qtypes")
        if wr == "qtype_none" and p["qtypes"]:
            bad("qtype_none with types")
        if wr == "qtype_multiple" and len(p["qtypes"]) < 2:
            bad("qtype_multiple with < 2 types")
        if wr == "no_valid_hit_word" and p.get("validHits") != []:
            bad("no_valid_hit_word with hits")
        s = p.get("scan")
        if s is not None and not (isinstance(s, dict) and is_int(s.get("count")) and isinstance(s.get("units"), list) and len(s["units"]) == s["count"]):
            bad("scan")
        if wr in ("no_candidate", "multiple_candidates", "candidate_outside_w2", "applied") and s is None:
            bad("%s without a candidate scan" % wr)
        if wr == "no_candidate" and s["count"] != 0:
            bad("no_candidate with candidates")
        if wr == "multiple_candidates" and s["count"] < 2:
            bad("multiple_candidates with < 2")
        if wr == "applied" and not (s["count"] == 1 and union_inside(s["units"][0]["union"], w2)):
            bad("applied needs one candidate inside W2")
        if wr == "candidate_outside_w2" and not (s["count"] == 1 and not union_inside(s["units"][0]["union"], w2)):
            bad("candidate_outside_w2 needs one candidate outside W2")
    elif st in ("unmatched", "error"):
        for k in ("w0", "w1", "w2", "w3", "cutPixels", "w3CutPixels", "w3From", "qtypes", "validHits", "scan"):
            if p.get(k) is not None:
                bad("%s row carries %s" % (st, k))
        if p.get("w2Reason") != "inherit":
            bad("%s row w2Reason" % st)
        if p.get("w3Reason") != st:
            bad("%s row w3Reason" % st)
    else:
        bad("state %r" % (st,))
    return True


# ------------------------------------------------------------------ scoring (RECOUNT_SPEC 5.4)
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
    return "keptSuccess" if a and b else ("recovered" if b else ("lost" if a else "bothFail"))


def tally(xs):
    return {"full": xs.count("full"), "partial": xs.count("partial"), "none": xs.count("none")}


def score_page(pred, page):
    if pred.get("id") != page["id"]:
        raise ValidationError("score: prediction %r does not join page %s" % (pred.get("id"), page["id"]))
    validate_prediction(pred)
    matched = pred["state"] == "matched"
    w1, w2, w3 = (judge(pred, pred[k], page) for k in ("w1", "w2", "w3"))
    stage = "error" if pred["state"] == "error" else ("unmatched" if pred["state"] == "unmatched" else ("hangul" if pred.get("branch") == "hangul" else "k0"))
    t12, t13 = transition(w1["strict"], w2["strict"]), transition(w1["strict"], w3["strict"])
    for t, wx, name in ((t12, w2, "W2"), (t13, w3, "W3")):
        if t == "recovered" and not (w1["fullPage"] is True and wx["fullPage"] is not True):
            raise ValidationError("%s: %s recovery without a full-page W1" % (page["id"], name))

    def lost(t, band):
        if t != "lost":
            return None
        out = []
        if exposure(page["parts"][0], band) != "full":
            out.append("label")
        if exposure(page["parts"][1], band) != "full":
            out.append("value")
        return out
    others = None
    if matched:
        items = []
        for item in page["otherValueItems"]:
            ink = page["items"].get(item, {}).get("ink")
            if ink is None:
                raise ValidationError("%s: other value %s has no ink" % (page["id"], item))
            items.append({"item": item, "w1": exposure(ink, pred["w1"]), "w2": exposure(ink, pred["w2"]), "w3": exposure(ink, pred["w3"])})

        def from_full(k):
            return tally([i[k] for i in items if i["w1"] == "full"])
        others = {"n": len(items), "w1": tally([i["w1"] for i in items]), "w2": tally([i["w2"] for i in items]), "w3": tally([i["w3"] for i in items]),
                  "fromW1Full2": from_full("w2"), "fromW1Full3": from_full("w3"), "items": items}
    opportunity = bool(matched and w1["strict"] and pred["w2Reason"] == "cut" and others["w1"]["full"] >= 1)
    scan = pred.get("scan")
    return {
        "id": page["id"], "source": page["source"], "doctype": page["doctype"], "form": page["form"], "content": page["content"],
        "ans": page["ans"], "dec": page["dec"], "layout": page["layout"], "qtype": page["qtype"], "slot": page["slot"], "stage": stage,
        "reason": pred["reason"], "w2Reason": pred["w2Reason"], "w3Reason": pred["w3Reason"], "w3From": pred["w3From"],
        "w1": w1, "w2": w2, "w3": w3, "t12": t12, "t13": t13,
        "fullPageToPartial2": (w1["fullPage"] is True and w2["fullPage"] is not True) if matched else None,
        "fullPageToPartial3": (w1["fullPage"] is True and w3["fullPage"] is not True) if matched else None,
        "lostParts2": lost(t12, pred["w2"]), "lostParts3": lost(t13, pred["w3"]), "prevented": t12 == "lost" and t13 != "lost",
        "cutPixels2": pred["cutPixels"], "cutPixels3": pred["w3CutPixels"],
        "candidateCount": scan["count"] if scan else None,
        "uniqueCandidate": classify_candidate(scan["units"][0], page) if scan and scan["count"] == 1 else None,
        "others": others, "opportunity": opportunity,
        "event2": bool(opportunity and w2["strict"] and others["fromW1Full2"]["none"] >= 1),
        "event3": bool(opportunity and w3["strict"] and others["fromW1Full3"]["none"] >= 1),
        "error": pred["state"] == "error",
    }


# ------------------------------------------------------------------ summary (RECOUNT_SPEC 6)
EV = {"all": 2, "partial": 1, "none": 0}
LAYOUTS = ["same-same", "same-other", "below-same", "below-other"]
ANS = ["same", "below"]
DEC = ["same", "other"]
QTYPES = ["time", "count", "pages"]


def camel(s):
    return re.sub("_([a-z0-9])", lambda m: m.group(1).upper(), s)


def nsrc(rows):
    return len({r["source"] for r in rows})


def is_matched(r):
    return r["stage"] in ("k0", "hangul")


def median(xs):
    s = sorted(xs)
    m = len(s) // 2
    return s[m] if len(s) % 2 else (s[m - 1] + s[m]) / 2


def area_stats(px, A):
    total = sum(px)
    if not px:
        return {"sum": 0, "meanPp": None, "medianPp": None, "maxPp": None}
    return {"sum": total, "meanPp": r4(total * 100 / (len(px) * A)), "medianPp": r4(median(px) * 100 / A), "maxPp": r4(max(px) * 100 / A)}


def group(rows, A):
    def c(f):
        return sum(1 for r in rows if f(r))
    valid = [r for r in rows if is_matched(r)]

    def tr(k):
        return {"recovered": c(lambda r: r[k] == "recovered"), "lost": c(lambda r: r[k] == "lost"),
                "keptSuccess": c(lambda r: r[k] == "keptSuccess"), "bothFail": c(lambda r: r[k] == "bothFail")}
    w1s = c(lambda r: r["w1"]["strict"])
    lost2 = [r for r in rows if r["t12"] == "lost"]
    lost3 = [r for r in rows if r["t13"] == "lost"]
    prev = [r for r in rows if r["prevented"]]
    opp = [r for r in rows if r["opportunity"]]
    e2 = [r for r in rows if r["event2"]]
    e3 = [r for r in rows if r["event3"]]
    applied = [r for r in rows if r["w3Reason"] == "applied"]

    def classes(rs):
        return {k: sum(1 for r in rs if r["uniqueCandidate"] and r["uniqueCandidate"]["class"] == k) for k in CLASSES}

    def osum(f):
        return sum(f(r["others"]) for r in valid)
    L2 = {"count": len(lost2), "denom": w1s, "pct": pct(len(lost2), w1s), "sources": nsrc(lost2)}
    L3 = {"count": len(lost3), "denom": w1s, "pct": pct(len(lost3), w1s), "sources": nsrc(lost3)}
    if L2["count"] == 0:
        prevention = "no_w2_loss"
    elif not prev:
        prevention = "prevented_none"
    elif len(prev) == L2["count"]:
        prevention = "prevented_all"
    else:
        prevention = "prevented_some"
    if not applied:
        removal = "no_opportunity_applied"
    elif not opp:
        removal = "no_opportunity_denominator"
    elif e3:
        removal = "observed_repeated_sources" if nsrc(e3) >= 2 else "observed_single_source"
    else:
        removal = "not_observed"
    fpn3 = lambda k: {x: osum(lambda o: o[k][x]) for x in ("full", "partial", "none")}  # noqa: E731
    return {
        "n": len(rows), "error": c(lambda r: r["stage"] == "error"), "unmatched": c(lambda r: r["stage"] == "unmatched"), "matched": len(valid),
        "strict": {k: c(lambda r, k=k: r[k]["strict"]) for k in ("w1", "w2", "w3")},
        "fullPage": {k: c(lambda r, k=k: r[k]["fullPage"] is True) for k in ("w1", "w2", "w3")},
        "t12": tr("t12"), "t13": tr("t13"),
        "recoveredFullPage": {"t12": c(lambda r: r["t12"] == "recovered" and r["w1"]["fullPage"] is True),
                              "t13": c(lambda r: r["t13"] == "recovered" and r["w1"]["fullPage"] is True)},
        "L2": L2, "L3": L3,
        "prevented": {"count": len(prev), "of": L2["count"], "sources": nsrc(prev)},
        "opportunity": {"count": len(opp), "sources": nsrc(opp)}, "event2": {"count": len(e2), "sources": nsrc(e2)},
        "event3": {"count": len(e3), "sources": nsrc(e3)},
        "keptEvents": {"count": c(lambda r: r["event3"] and r["event2"]), "of": len(e2)},
        "cut": c(lambda r: r["w2Reason"] == "cut"), "applied": len(applied),
        "w3Reason": {k: c(lambda r, k=k: r["w3Reason"] == k) for k in W3_REASONS},
        "uniqueClass": classes(rows), "uniqueClassApplied": classes(applied),
        "others": {
            "itemsW1Full": osum(lambda o: o["w1"]["full"]), "pagesW1Full": sum(1 for r in valid if r["others"]["w1"]["full"] >= 1),
            "fromW1Full2": fpn3("fromW1Full2"), "fromW1Full3": fpn3("fromW1Full3"),
            "pagesW1FullToNone2": sum(1 for r in valid if r["others"]["fromW1Full2"]["none"] >= 1),
            "pagesW1FullToNone3": sum(1 for r in valid if r["others"]["fromW1Full3"]["none"] >= 1),
            "pagesW1FullToPartial3": sum(1 for r in valid if r["others"]["fromW1Full3"]["partial"] >= 1),
            "newlyFullW3": osum(lambda o: sum(1 for i in o["items"] if i["w3"] == "full" and i["w1"] != "full")),
        },
        "area": {"validPairs": len(valid), "w2": area_stats([r["cutPixels2"] for r in valid], A), "w3": area_stats([r["cutPixels3"] for r in valid], A),
                 "appliedPages": len(applied), "w3Applied": area_stats([r["cutPixels3"] for r in applied], A)},
        "sources": nsrc(rows),
        "verdict": {"loss3": "loss" if L3["count"] > 0 else "no_loss", "loss2": "loss" if L2["count"] > 0 else "no_loss", "prevention": prevention, "removal": removal},
    }


def summarize_scores(rows, page_area, preds=None):
    A = page_area

    def by(f):
        return [r for r in rows if f(r)]

    def n(f):
        return len(by(f))
    stages = {
        "pages": len(rows), "error": n(lambda r: r["stage"] == "error"), "normal": len(rows) - n(lambda r: r["stage"] == "error"),
        "unmatched": n(lambda r: r["stage"] == "unmatched"), "k0Matched": n(lambda r: r["stage"] == "k0"), "hangulMatched": n(lambda r: r["stage"] == "hangul"),
        "w1Reason": {camel(k): n(lambda r, k=k: r["reason"] == k) for k in W1_REASONS},
        "w2Reason": {"inherit": n(lambda r: r["w2Reason"] == "inherit"), "cut": n(lambda r: r["w2Reason"] == "cut"),
                     "noCut": n(lambda r: r["w2Reason"] == "no_cut"), "hitOutside": n(lambda r: r["w2Reason"] == "hit_outside_w1")},
        "w3Reason": {camel(k): n(lambda r, k=k: r["w3Reason"] == k) for k in W3_REASONS},
    }
    sources = []
    for r in rows:
        if r["source"] not in sources:
            sources.append(r["source"])

    def sub(field, keys):
        return {k: group(by(lambda r, k=k: r[field] == k), A) for k in keys}
    groups = {
        "total": group(rows, A), "cut": group(by(lambda r: r["w2Reason"] == "cut"), A), "applied": group(by(lambda r: r["w3Reason"] == "applied"), A),
        "layout": sub("layout", LAYOUTS), "ans": sub("ans", ANS), "dec": sub("dec", DEC), "form": sub("form", FORMS),
        "doctype": sub("doctype", DOCTYPES), "qtype": sub("qtype", QTYPES), "w3Reason": sub("w3Reason", W3_REASONS), "source": sub("source", sources),
    }

    def ids(f):
        return [r["id"] for r in rows if f(r)]
    lists = {
        "t12Lost": ids(lambda r: r["t12"] == "lost"), "t13Lost": ids(lambda r: r["t13"] == "lost"), "prevented": ids(lambda r: r["prevented"]),
        "t12Recovered": ids(lambda r: r["t12"] == "recovered"), "t13Recovered": ids(lambda r: r["t13"] == "recovered"),
        "applied": ids(lambda r: r["w3Reason"] == "applied"),
        "held": ids(lambda r: is_matched(r) and r["w3Reason"] not in ("applied", "not_applicable")),
        "opportunity": ids(lambda r: r["opportunity"]), "event2": ids(lambda r: r["event2"]), "event3": ids(lambda r: r["event3"]),
        "uniqueWrong": ids(lambda r: r["candidateCount"] == 1 and r["uniqueCandidate"]["class"] != "target_value"),
        "errors": ids(lambda r: r["stage"] == "error"), "unmatched": ids(lambda r: r["stage"] == "unmatched"),
    }
    table = []
    for s in sources:
        rs = by(lambda r, s=s: r["source"] == s)
        cells = {}
        for k in LAYOUTS:
            r = next((x for x in rs if x["layout"] == k), None)
            if r is None:
                cells[k] = None
                continue
            m = is_matched(r)
            cells[k] = {"id": r["id"], "stage": r["stage"], "w2Reason": r["w2Reason"], "w3Reason": r["w3Reason"],
                        "w1Strict": r["w1"]["strict"], "w2Strict": r["w2"]["strict"], "w3Strict": r["w3"]["strict"], "t12": r["t12"], "t13": r["t13"],
                        "candidateCount": r["candidateCount"], "uniqueClass": r["uniqueCandidate"]["class"] if r["uniqueCandidate"] else None,
                        "w1Full": r["others"]["w1"]["full"] if m else None, "w3Full": r["others"]["w3"]["full"] if m else None,
                        "fromW1Full3None": r["others"]["fromW1Full3"]["none"] if m else None, "cut3Pp": r4(r["cutPixels3"] * 100 / A) if m else None}
        table.append({"source": s, "doctype": rs[0]["doctype"], "form": rs[0]["form"], "content": rs[0]["content"], "slot": rs[0]["slot"], "qtype": rs[0]["qtype"], "cells": cells})
    valid = by(is_matched)

    def idset(f):
        return {r["id"] for r in rows if f(r)}
    w3in = nested = None
    if preds is not None:
        check_id_set(preds, [r["id"] for r in rows])
        mp = [p for p in preds if p["state"] == "matched"]
        w3in = sum(1 for p in mp if same_band(p["w3"], p["w1"]) or same_band(p["w3"], p["w2"]))
        nested = sum(1 for p in mp if p["w3"]["left"] == p["w1"]["left"] and p["w3"]["width"] == p["w1"]["width"] and p["w3"]["top"] <= p["w2"]["top"]
                     and bottom(p["w3"]) >= bottom(p["w2"]) and p["w3"]["top"] >= p["w1"]["top"] and bottom(p["w3"]) <= bottom(p["w1"]))
    invariants = {
        "checked": len(valid), "w3InW1W2": w3in, "nested": nested,
        "lost3SubsetLost2": idset(lambda r: r["t13"] == "lost") <= idset(lambda r: r["t12"] == "lost"),
        "events3SubsetEvents2": idset(lambda r: r["event3"]) <= idset(lambda r: r["event2"]),
        "newlyFullW3": sum(1 for r in valid for i in r["others"]["items"] if i["w3"] == "full" and i["w1"] != "full"),
        "newEvidenceW3": sum(max(0, EV[r["w3"]["evidence"]] - EV[r["w1"]["evidence"]]) for r in valid),
        "recoveredNotFullPage": sum(1 for r in rows if (r["t12"] == "recovered" and not (r["w1"]["fullPage"] is True and r["w2"]["fullPage"] is not True))
                                    or (r["t13"] == "recovered" and not (r["w1"]["fullPage"] is True and r["w3"]["fullPage"] is not True))),
    }
    return {"invariants": invariants, "stages": stages, "groups": groups, "lists": lists, "sourceTable": table}


# ------------------------------------------------------------------ public tables (RECOUNT_SPEC 10)
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


def head(cells):
    return [tline(cells), "|" + "---|" * len(cells)]


def group_rows(g):
    out = [("전체", g["total"]), ("W2 cut", g["cut"]), ("W3 applied", g["applied"])]
    out += [("layout " + k, g["layout"][k]) for k in LAYOUTS]
    out += [("ans " + k, g["ans"][k]) for k in ANS] + [("dec " + k, g["dec"][k]) for k in DEC]
    out += [("form " + k, g["form"][k]) for k in FORMS] + [("doctype " + k, g["doctype"][k]) for k in DOCTYPES]
    out += [("qtype " + k, g["qtype"][k]) for k in QTYPES] + [("W3 " + k, g["w3Reason"][k]) for k in W3_REASONS]
    return out


ABBR = {"target_value": "T", "intended_decoy": "D", "other_record_value": "O", "other_or_ambiguous": "X"}
ARROW = chr(0x2192)


def source_cell(c):
    if c is None:
        return None
    if c["stage"] == "error":
        return "error"
    if c["stage"] == "unmatched":
        return "unmatched"
    sf = lambda b: "S" if b else "F"  # noqa: E731
    s = "%s%s%s %s c%s %s %s%s%s" % (sf(c["w1Strict"]), sf(c["w2Strict"]), sf(c["w3Strict"]), c["w3Reason"],
                                      "-" if c["candidateCount"] is None else fmt(c["candidateCount"]),
                                      ABBR[c["uniqueClass"]] if c["uniqueClass"] else "-", fmt(c["w1Full"]), ARROW, fmt(c["w3Full"]))
    if c["fromW1Full3None"] > 0:
        s += " none%s" % fmt(c["fromW1Full3None"])
    return s


def render_tables(summary):
    g, st = summary["groups"], summary["stages"]
    rows = group_rows(g)

    def frac(a, b):
        return "%s/%s" % (fmt(a), fmt(b))

    def fpn(x):
        return "%s/%s/%s" % (fmt(x["full"]), fmt(x["partial"]), fmt(x["none"]))
    stages = head(["항목", "쪽수"]) + [tline(x) for x in [
        ["등록 쪽", st["pages"]], ["기술 오류", st["error"]], ["정상 처리(미매치 포함)", st["normal"]], ["정상 미매치", st["unmatched"]],
        ["K0 매치", st["k0Matched"]], ["한글 매치", st["hangulMatched"]],
        ["W1 widened", st["w1Reason"]["widened"]], ["W1 not_wider", st["w1Reason"]["notWider"]], ["W1 no_candidate", st["w1Reason"]["noCandidate"]],
        ["W1 k0_branch", st["w1Reason"]["k0Branch"]],
        ["W2 cut", st["w2Reason"]["cut"]], ["W2 no_cut", st["w2Reason"]["noCut"]], ["W2 hit_outside_w1", st["w2Reason"]["hitOutside"]], ["W2 inherit", st["w2Reason"]["inherit"]],
    ] + [["W3 " + k, st["w3Reason"][camel(k)]] for k in W3_REASONS]]
    groups = head(["그룹", "n", "오류", "미매치", "매치", "W1 엄격", "W2 엄격", "W3 엄격", "W2 cut", "W3 적용", "L2 손실/W1 성공", "L3 손실/W1 성공", "L3 원본",
                   "예방/L2", "공통 기회", "기회 원본", "W2 사건", "W3 사건", "W3 사건 원본", "W3 유지/W2 사건", "회복 W2(전체쪽)", "회복 W3(전체쪽)"]) + [
        tline([name, b["n"], b["error"], b["unmatched"], b["matched"], b["strict"]["w1"], b["strict"]["w2"], b["strict"]["w3"], b["cut"], b["applied"],
               frac(b["L2"]["count"], b["L2"]["denom"]), frac(b["L3"]["count"], b["L3"]["denom"]), b["L3"]["sources"],
               frac(b["prevented"]["count"], b["prevented"]["of"]), b["opportunity"]["count"], b["opportunity"]["sources"], b["event2"]["count"],
               b["event3"]["count"], b["event3"]["sources"], frac(b["keptEvents"]["count"], b["keptEvents"]["of"]),
               "%s (%s)" % (fmt(b["t12"]["recovered"]), fmt(b["recoveredFullPage"]["t12"])), "%s (%s)" % (fmt(b["t13"]["recovered"]), fmt(b["recoveredFullPage"]["t13"]))])
        for name, b in rows]
    R = ["not_applicable", "qtype_none", "qtype_multiple", "no_valid_hit_word", "no_candidate", "multiple_candidates", "candidate_outside_w2", "applied", "error", "unmatched"]
    reasons = head(["그룹"] + R) + [tline([name] + [b["w3Reason"][k] for k in R]) for name, b in rows]
    candidates = head(["그룹", "유일 후보 쪽", "목표 값", "의도 방해", "타 레코드 값", "기타/모호", "적용 중 목표 값", "적용 중 의도 방해", "적용 중 타 레코드 값", "적용 중 기타/모호"]) + [
        tline([name, sum(b["uniqueClass"][k] for k in CLASSES)] + [b["uniqueClass"][k] for k in CLASSES] + [b["uniqueClassApplied"][k] for k in CLASSES])
        for name, b in rows]
    others = head(["그룹", "W1 완전 값(쪽)", "W1 완전→W2 완전/일부/전혀", "W1 완전→W3 완전/일부/전혀", "W2 전혀≥1 쪽", "W3 전혀≥1 쪽", "W3 일부≥1 쪽", "W3 새 완전"]) + [
        tline([name, "%s (%s)" % (fmt(b["others"]["itemsW1Full"]), fmt(b["others"]["pagesW1Full"])), fpn(b["others"]["fromW1Full2"]), fpn(b["others"]["fromW1Full3"]),
               b["others"]["pagesW1FullToNone2"], b["others"]["pagesW1FullToNone3"], b["others"]["pagesW1FullToPartial3"], b["others"]["newlyFullW3"]])
        for name, b in rows]
    area = head(["그룹", "유효 쌍", "W2 평균 %p", "W2 중앙 %p", "W2 최대 %p", "W3 평균 %p", "W3 중앙 %p", "W3 최대 %p", "W3 적용 쪽", "적용 평균 %p", "적용 중앙 %p", "적용 최대 %p"]) + [
        tline([name, b["area"]["validPairs"], b["area"]["w2"]["meanPp"], b["area"]["w2"]["medianPp"], b["area"]["w2"]["maxPp"],
               b["area"]["w3"]["meanPp"], b["area"]["w3"]["medianPp"], b["area"]["w3"]["maxPp"], b["area"]["appliedPages"],
               b["area"]["w3Applied"]["meanPp"], b["area"]["w3Applied"]["medianPp"], b["area"]["w3Applied"]["maxPp"]])
        for name, b in rows]
    verdict = head(["그룹", "W3 손실 판정", "W2 손실 판정", "예방 판정", "제거 판정"]) + [
        tline([name, b["verdict"]["loss3"], b["verdict"]["loss2"], b["verdict"]["prevention"], b["verdict"]["removal"]])
        for name, b in [("전체", g["total"])] + [("layout " + k, g["layout"][k]) for k in LAYOUTS]]
    sources = head(["원본", "양식", "유형", "목표 슬롯"] + LAYOUTS) + [
        tline([s["source"], s["form"], s["qtype"], s["slot"]] + [source_cell(s["cells"][k]) for k in LAYOUTS]) for s in summary["sourceTable"]]
    return {"stages": stages, "groups": groups, "reasons": reasons, "candidates": candidates, "others": others, "area": area, "verdict": verdict, "sources": sources}


TABLE_BLOCK = re.compile(r"<!-- krg:table (\S+) -->\n([\s\S]*?)\n<!-- /krg:table -->")


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
            raise ValidationError("duplicate id %r" % (i,))
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


def read_jsonl_exact(path):
    raw = read_bytes(path)
    if b"\r" in raw:
        raise InputError("CR in " + path)
    lines = raw.decode("utf-8").split("\n")
    if lines[-1] != "":
        raise InputError("no final newline in " + path)
    lines.pop()
    if any(ln == "" for ln in lines):
        raise InputError("empty line in " + path)
    return [parse_exact(ln) for ln in lines]


def load(args):
    d = args.data
    return {
        "manifest": read_json(os.path.join(d, "manifest.json")), "design": read_json(os.path.join(d, "scoring", "design.json")),
        "questions": read_json(os.path.join(d, "selector", "questions.json"))["questions"],
        "gold": read_json(os.path.join(d, "scoring", "gold.json"))["gold"], "render": read_json(os.path.join(d, "scoring", "render.json"))["images"],
        "ocrFreeze": read_json(os.path.join(args.ocr, "freeze.json")), "ocr": read_jsonl(os.path.join(args.ocr, "ocr.jsonl")),
        "ocrExact": read_jsonl_exact(os.path.join(args.ocr, "ocr.jsonl")), "k1": read_jsonl(os.path.join(args.ocr, "k1.jsonl")),
        "replayFreeze": read_json(os.path.join(args.replay, "freeze.json")), "preds": read_jsonl(os.path.join(args.replay, "predictions.jsonl")),
        "inputs": read_json(os.path.join(args.replay, "inputs.json")),
        "score": read_jsonl(os.path.join(args.score, "score.jsonl")), "summary": read_json(os.path.join(args.score, "summary.json")),
        "results": read_bytes(args.results).decode("utf-8") if args.results else None,
    }


def pages_of(x):
    pages = []
    for im in x["design"]["images"]:
        g = x["gold"][im["id"]]
        inks = x["render"][im["id"]]["items"]
        pages.append({"id": im["id"], "source": im["source"], "doctype": im["doctype"], "form": im["form"], "content": im["content"],
                      "ans": im["ans"], "dec": im["dec"], "layout": im["layout"], "qtype": im["qtype"], "slot": im["slot"],
                      "width": im["page"]["width"], "height": im["page"]["height"], "anchorItem": im["anchorItem"], "valueItem": im["valueItem"],
                      "decoyItem": im["decoyItem"], "parts": [p["rect"] for p in g["parts"]], "otherValueItems": im["otherValueItems"],
                      "items": {it["id"]: {"role": it["role"], "cell": it["cell"], "ink": inks[it["id"]]["ink"]} for it in im["items"]}})
    return pages


def norm_question(q):
    return " ".join(unicodedata.normalize("NFC", q).split())


SELECTOR_ALLOW = re.compile(r"^selector/(questions[.]json|images/[A-Za-z0-9_-]+[.]png)$")
PRED_FIELDS = ["id", "pngSha256", "ocrSha256", "width", "height", "state", "error", "branch", "lineIndex", "hitWords", "reason", "w0", "w1",
               "candidates", "maxRight", "clippedRight", "addedPixels", "w2Reason", "hitTop", "hitBottom", "pad", "w2", "cutPixels",
               "qtypes", "validHits", "scan", "w3Reason", "w3From", "w3", "w3CutPixels"]
SWAPPING = ["valueItem", "auxAItem", "decoyItem", "auxBItem"]


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
    for name in ("questions", "ocr", "ocrExact", "k1", "preds", "score"):
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
    for im in x["design"]["images"]:
        g = x["gold"][im["id"]]["parts"]
        if len(g) != 2 or g[0]["item"] != im["anchorItem"] or g[1]["item"] != im["valueItem"]:
            rep.bad(C1, im["id"] + " gold items")
            continue
        cells = {it["id"]: it["cell"] for it in im["items"]}
        inks = x["render"][im["id"]]["items"]
        for part in g:
            l, t, r, b = part["rect"]
            if not (all(is_int(v) for v in part["rect"]) and 0 <= l < r <= 1280 and 0 <= t < b <= 960 and part["size"] == [r - l, b - t]):
                rep.bad(C1, im["id"] + " gold rect " + part["item"])
            if inks[part["item"]]["ink"] != part["rect"]:
                rep.bad(C1, im["id"] + " gold vs render " + part["item"])
            cl = cells[part["item"]]
            if not (l >= cl[0] and t >= cl[1] and r <= cl[2] and b <= cl[3]):
                rep.bad(C1, im["id"] + " gold outside cell " + part["item"])
        a, v = g[0]["rect"], g[1]["rect"]
        if min(a[2], v[2]) > max(a[0], v[0]) and min(a[3], v[3]) > max(a[1], v[1]):
            rep.bad(C1, im["id"] + " gold boxes overlap")
        di, fi, ci = DOCTYPES.index(im["doctype"]), FORMS.index(im["form"]), im["content"]
        slot = (di + fi + ci) % 3
        if im["slot"] != slot or im["qtype"] != QTYPES[(2 * di + fi + ci) % 3] or im["otherValueItems"] != ["r%d-value" % s for s in range(3) if s != slot] \
                or im["decoyItem"] != "r%d-decoy" % slot or im["layout"] != "%s-%s" % (im["ans"], im["dec"]):
            rep.bad(C1, im["id"] + " slot/qtype/otherValueItems/layout")
        data = read_bytes(os.path.join(d, "selector", "images", im["file"]))
        w, h, rows = decode_png(data)
        pngs[im["id"]] = {"sha": sha_bytes(data), "w": w, "h": h}
        if (w, h) != (1280, 960):
            rep.bad(C1, im["id"] + " PNG size", [w, h])
        for name in [im["anchorItem"], im["valueItem"], im["decoyItem"]] + im["otherValueItems"]:
            if not edges_have_ink(rows, inks[name]["ink"]):
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
        sw = {r[k] for r in im["records"] for k in SWAPPING}
        return (im["question"], im["answer"], im["qtype"], im["anchorItem"], im["valueItem"], im["decoyItem"], tuple(im["otherValueItems"]),
                tuple((it["id"], it["role"], it["text"], inks[it["id"]]["ink"][0], inks[it["id"]]["ink"][2], inks[it["id"]]["ink"][3] - inks[it["id"]]["ink"][1],
                       None if it["id"] in sw else inks[it["id"]]["ink"][1]) for it in im["items"]))
    if len(by_src) != 12:
        rep.bad(CP, "sources", len(by_src), 12)
    for s, ims in by_src.items():
        if sorted(im["layout"] for im in ims) != sorted(LAYOUTS):
            rep.bad(CP, s + " layouts")
        if any(sig(im) != sig(ims[0]) for im in ims):
            rep.bad(CP, s + " pages differ beyond the swapped items' y")
    nq = [norm_question(im["question"]) for im in x["design"]["images"]]
    if len(set(nq)) != 12 or any(nq.count(q) != 4 for q in nq) or any(len({norm_question(im["question"]) for im in ims}) != 1 for ims in by_src.values()):
        rep.bad(CP, "normalized questions are not 12 x 4 by source")
    if len({p["sha"] for p in pngs.values()}) != PAGES:
        rep.bad(CP, "PNG SHA-256 not unique")

    # 1c question types and value grammar (RECOUNT_SPEC 2.7)
    CT = "1c-types-grammar"
    rep.check(CT)
    for im in x["design"]["images"]:
        if question_types(im["question"]) != [im["qtype"]]:
            rep.bad(CT, im["id"] + " question types", question_types(im["question"]), [im["qtype"]])
        texts = {it["id"]: it["text"] for it in im["items"]}
        vals = [im["valueItem"], im["decoyItem"]] + im["otherValueItems"]
        if len({texts[k] for k in vals}) != len(vals):
            rep.bad(CT, im["id"] + " value texts not distinct")
        for it in im["items"]:
            ok = grammar_match(im["qtype"], it["text"]) if it["id"] in vals else not any(grammar_match(t, it["text"]) for t in QTYPES)
            if not ok:
                rep.bad(CT, im["id"] + " grammar " + it["id"])

    # 2 K1 recompute, W0/W1/W2/W3 predictions
    C2 = "2-k1-w1-w2-w3-predictions"
    rep.check(C2)
    qmap = {q["id"]: q["question"] for q in x["questions"]}
    my_preds = []
    for o, ox, k, pr in zip(x["ocr"], x["ocrExact"], x["k1"], x["preds"]):
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
        w3 = w3_rule(qmap[pid], ox["ocrLines"] if o["status"] == "ok" else None, k["k1"], r)
        mine = {"id": pid, "pngSha256": pg["sha"], "ocrSha256": o.get("ocrSha256"), "width": pg["w"], "height": pg["h"], "state": state,
                "branch": k["k1"].get("branch"), "lineIndex": k["k1"].get("lineIndex"), "hitWords": k["k1"].get("hitWords"), **r, **w3}
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

    # 2b approved inputs of the replay (RECOUNT_SPEC 7)
    C2b = "2b-replay-inputs"
    rep.check(C2b)
    data_paths = [e["path"] for e in x["inputs"].get("data", [])]
    if any(not SELECTOR_ALLOW.match(p) for p in data_paths):
        rep.bad(C2b, "a replay data input outside the selector allowlist", [p for p in data_paths if not SELECTOR_ALLOW.match(p)][:5])
    want_paths = ["selector/questions.json"] + ["selector/images/" + im["file"] for im in x["design"]["images"]]
    if data_paths != want_paths:
        rep.bad(C2b, "replay data inputs are not exactly questions + 48 PNGs in order")
    for e in x["inputs"].get("data", []):
        m = x["manifest"]["files"].get(e["path"])
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
    s = summarize_scores(my_rows, area, my_preds)
    for key in ("invariants", "stages", "groups", "lists", "sourceTable"):
        if not same(s[key], x["summary"].get(key)):
            sub = [k for k in s[key] if not same(s[key][k], (x["summary"].get(key) or {}).get(k))] if isinstance(s[key], dict) else None
            rep.bad(C4, key, sub)
    inv = s["invariants"]
    if inv["w3InW1W2"] != inv["checked"] or inv["nested"] != inv["checked"] or not inv["lost3SubsetLost2"] or not inv["events3SubsetEvents2"] \
            or inv["newlyFullW3"] or inv["newEvidenceW3"] or inv["recoveredNotFullPage"]:
        rep.bad(C4, "W3 invariant broken", inv)
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
    """Tamper in-memory copies of the recorded files (RECOUNT_SPEC 9) and run the whole recount on each; every tamper must fail it."""
    out = {}

    def run(name, x2, note=None):
        rep = Report()
        try:
            recount(args, x2, rep)
        except ValidationError as e:
            out[name] = {"rejected": True, "how": "ValidationError: " + str(e)[:300]}
        except (KeyError, IndexError, TypeError, ValueError) as e:
            out[name] = {"rejected": True, "how": "input error: %r" % (e,)}
        else:
            failed = {k: c["mismatches"][:3] for k, c in rep.checks.items() if not c["ok"]}
            out[name] = {"rejected": bool(failed), "how": "recount check failed", "failed": failed}
        if note:
            out[name]["note"] = note

    def na(name, why):
        out[name] = {"notApplicable": why}
    rows, preds = x["score"], x["preds"]
    # 1 swap t13
    pair = next(((i, j) for i in range(len(rows)) for j in range(i + 1, len(rows)) if rows[i]["t13"] != rows[j]["t13"]), None)
    if pair:
        x2 = copy.deepcopy(x)
        i, j = pair
        x2["score"][i]["t13"], x2["score"][j]["t13"] = rows[j]["t13"], rows[i]["t13"]
        run("swapT13", x2, "t13 of %s and %s swapped (totals kept)" % (rows[i]["id"], rows[j]["id"]))
    else:
        na("swapT13", "every page has the same t13")
    # 2 swap w3Reason
    pair = next(((i, j) for i in range(len(preds)) for j in range(i + 1, len(preds)) if preds[i]["w3Reason"] != preds[j]["w3Reason"]), None)
    if pair:
        x2 = copy.deepcopy(x)
        i, j = pair
        x2["preds"][i]["w3Reason"], x2["preds"][j]["w3Reason"] = preds[j]["w3Reason"], preds[i]["w3Reason"]
        run("swapW3Reason", x2, "w3Reason of %s and %s swapped" % (preds[i]["id"], preds[j]["id"]))
    else:
        na("swapW3Reason", "every page has the same w3Reason")
    # 3 candidate id, 4 candidate count
    u = next((i for i, p in enumerate(preds) if p.get("scan") and p["scan"]["count"] >= 1), None)
    if u is not None:
        x2 = copy.deepcopy(x)
        x2["preds"][u]["scan"]["units"][0]["first"] += 1
        run("candidateFirstPlusOne", x2, "scan.units[0].first + 1 on " + preds[u]["id"])
    else:
        na("candidateFirstPlusOne", "no prediction has a candidate unit")
    c = next((i for i, p in enumerate(preds) if p.get("scan")), None)
    if c is not None:
        x2 = copy.deepcopy(x)
        x2["preds"][c]["scan"]["count"] += 1
        run("candidateCountPlusOne", x2, "scan.count + 1 on " + preds[c]["id"])
    else:
        na("candidateCountPlusOne", "no prediction has a candidate scan")
    # 5 opportunity flip
    x2 = copy.deepcopy(x)
    x2["score"][0]["opportunity"] = not rows[0]["opportunity"]
    run("opportunityFlipped", x2, "opportunity of %s flipped" % rows[0]["id"])
    # 6 other value exposure under W3
    loc = [(i, k, it["w3"]) for i, r in enumerate(rows) if r["others"] for k, it in enumerate(r["others"]["items"])]
    if loc:
        x2 = copy.deepcopy(x)
        i, k, cl = loc[0]
        x2["score"][i]["others"]["items"][k]["w3"] = {"full": "partial", "partial": "none", "none": "partial"}[cl]
        run("exposureW3Changed", x2, "%s item %d: W3 %s changed" % (rows[i]["id"], k, cl))
    else:
        na("exposureW3Changed", "no matched page")
    # 7, 8 prediction windows 1 px
    m = next((i for i, p in enumerate(preds) if p["state"] == "matched"), None)
    if m is not None:
        x2 = copy.deepcopy(x)
        x2["preds"][m]["w3"]["top"] += 1
        run("predictionW3TopPlusOne", x2, "W3 boundary moved by 1 px on " + preds[m]["id"])
        x2 = copy.deepcopy(x)
        x2["preds"][m]["w2"]["top"] += 1
        run("predictionW2TopPlusOne", x2, "W2 boundary moved by 1 px on " + preds[m]["id"])
    else:
        na("predictionW3TopPlusOne", "no matched page")
        na("predictionW2TopPlusOne", "no matched page")
    # 9, 10 ids
    x2 = copy.deepcopy(x)
    x2["score"][1]["id"] = x2["score"][0]["id"]
    run("duplicateId", x2)
    x2 = copy.deepcopy(x)
    x2["preds"] = x2["preds"][:-1]
    run("missingId", x2)
    # 11 gold 1 px
    x2 = copy.deepcopy(x)
    first = x["design"]["images"][0]["id"]
    x2["gold"][first]["parts"][1]["rect"][3] += 1
    x2["gold"][first]["parts"][1]["size"][1] += 1
    run("goldValueBottomPlusOne", x2, "answer box of %s moved by 1 px" % first)
    # 12 K1 hitWords
    k1i = next((i for i, k in enumerate(x["k1"]) if isinstance(k["k1"].get("hitWords"), list) and k["k1"]["hitWords"]), None)
    if k1i is not None:
        x2 = copy.deepcopy(x)
        hw = x2["k1"][k1i]["k1"]["hitWords"]
        x2["k1"][k1i]["k1"]["hitWords"] = hw[:-1] if len(hw) > 1 else hw + [hw[0]]
        run("k1HitWordsChanged", x2, "selection record of " + x["k1"][k1i]["id"])
    else:
        na("k1HitWordsChanged", "no K1 record has hit words")
    # 13 public table cell
    if x["results"] is not None:
        x2 = copy.deepcopy(x)
        x2["results"] = x["results"].replace("| 전체 | 48 |", "| 전체 | 47 |", 1)
        if x2["results"] != x["results"]:
            run("publicTableCell", x2, "groups table: total n 48 -> 47")
        else:
            na("publicTableCell", "groups total row not found")
    else:
        na("publicTableCell", "no --results given")
    # 14 unique candidate class
    uc = next((i for i, r in enumerate(rows) if r.get("uniqueCandidate")), None)
    if uc is not None:
        x2 = copy.deepcopy(x)
        cl = rows[uc]["uniqueCandidate"]["class"]
        x2["score"][uc]["uniqueCandidate"]["class"] = "intended_decoy" if cl == "target_value" else "target_value"
        run("uniqueClassChanged", x2, "uniqueCandidate.class of %s: %s changed" % (rows[uc]["id"], cl))
    else:
        na("uniqueClassChanged", "no page has exactly one candidate")
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
            f.write(json.dumps({"version": "ko-row-gate-mutation-1", "allRejected": ok, "tampers": res}, ensure_ascii=False, indent=1) + "\n")
        print(json.dumps({"allRejected": ok, "tampers": len(res), "notApplicable": [k for k, v in res.items() if "notApplicable" in v]}))
        return 0 if ok else 1
    rep = Report()
    try:
        rows, s = recount(args, x, rep)
    except ValidationError as e:
        rep.bad("validation", "abort", str(e))
        rows, s = None, None
    result = {"version": "ko-row-gate-recount-1", "ok": rep.ok(), "checks": rep.checks,
              "stages": s["stages"] if s else None, "total": s["groups"]["total"] if s else None, "lists": s["lists"] if s else None,
              "invariants": s["invariants"] if s else None}
    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"ok": result["ok"], "failed": [k for k, c in rep.checks.items() if not c["ok"]]}))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
