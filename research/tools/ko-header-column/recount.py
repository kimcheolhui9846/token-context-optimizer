"""Independent recount of ko-header-column (tools/ko-header-column/RECOUNT_SPEC.md). Python 3.12 standard library only.

Recomputes K0/K1 from the raw OCR, the fixed #150 W1 rule, the fixed #151 W2 rule, the fixed #152 W3 rule with its candidate
scan, the new W4 header-column rule (exact decimals from the JSON number text), the gold attribution, exposures, reading events,
per-page verdicts, J events, areas, the summary, the verdict and the public tables from the frozen files, and compares them with
the recorded outputs row by row and cell by cell. Imports no project JS. Provenance: the PNG decoder, JS number formatting,
K0/K1, W1, W2 and W3 parts are ported from the #152 recount (blob 11afa0f5 in 6865828f); W4, attribution, scoring, aggregates,
pairing, verdict, tables and tampers are new here. All of it was written by the same author as the JS implementation (no
independent second author).

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

PAGES = 144
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


# ------------------------------------------------------------------ exact decimals (RECOUNT_SPEC 4.0) — ported from the #152 recount
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


# ------------------------------------------------------------------ prediction validation (RECOUNT_SPEC 5.1)
def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def validate_prediction_w3(p):
    """#152 validation of the W0-W3 part (RECOUNT_SPEC 3)."""
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



# ------------------------------------------------------------------ W4 (RECOUNT_SPEC 4) — new for ko-header-column
W4_REASONS = ["error", "unmatched", "not_applicable", "qtype_none", "qtype_multiple", "no_valid_hit_word", "question_unparsed", "question_type_mismatch",
              "header_none", "header_multiple", "header_duplicate", "header_no_match", "no_target_candidate", "multiple_target_candidates", "target_outside_w2", "applied"]
W4_MATCHED = W4_REASONS[2:]
SIDES = ["L", "R"]
HEADERS = ["normal", "blank", "dup"]
ANS = ["same", "below"]
KINDS = ["library", "sports", "culture"]
QTYPES = ["time", "count", "pages"]
SLOTS = [0, 1, 2]
CELLS = ["%s-%s-%s" % (s, h, a) for s in SIDES for h in HEADERS for a in ANS]
WIN = ["w1", "w2", "w3", "w4"]
HEADER_CLASSES = ["target_header", "comp_header", "other_item", "undetermined"]
CANDIDATE_CLASSES = ["target_value", "comp_value", "other_record_value", "other_record_comp", "other_item", "undetermined"]
EXPOSURE_KEYS = ["targetHeader", "compHeader", "compValue", "targetValue"]
QUESTION_RE = re.compile("(?P<record>.+)의 (?P<field>[가-힣]+(?: [가-힣]+)* ?(?P<suffix>시각|인원|분량))(?P<josa>은|는) 몇 (?P<unit>시|명|쪽)인가요[?]")
SUFFIX_TYPE = {"시각": "time", "인원": "count", "분량": "pages"}
UNIT_TYPE = {"시": "time", "명": "count", "쪽": "pages"}
TYPE_SUFFIX = {"time": "시각", "count": "인원", "pages": "분량"}
HANGUL = re.compile("[가-힣]+")


def load_exact(text):
    return parse_exact(text)


def fold(s):
    out, space = [], False
    for ch in unicodedata.normalize("NFKC", s):
        if ord(ch) in WHITE:
            space = True
        else:
            if space and out:
                out.append(" ")
            space = False
            out.append(ch)
    return "".join(out)


def parse_question(q):
    f = fold(q)
    if f.count("의 ") != 1:
        return None
    m = QUESTION_RE.fullmatch(f)
    if not m:
        return None
    t = SUFFIX_TYPE[m.group("suffix")]
    if t != UNIT_TYPE[m.group("unit")]:
        return None
    return {"record": m.group("record"), "field": m.group("field"), "qtype": t}


def valid_word(w):
    b = word_box(w)
    if b is None or not isinstance(w.get("text"), str):
        return None
    t = squash(w["text"])
    if t == "":
        return None
    return b, t


def group_line(words):
    ws = []
    for i, w in enumerate(words):
        b, t = valid_word(w)
        ws.append((b, t, i, [plain(v) for v in w["box"]]))
    ws.sort(key=lambda e: (e[0][0], e[0][2], e[2]))
    groups, cur = [], None
    for j, e in enumerate(ws):
        if j > 0:
            p = ws[j - 1][0]
            if e[0][0] - p[2] > 2 * max(p[5], e[0][5]):
                cur = None
        if cur is None:
            cur = []
            groups.append(cur)
        cur.append(e)
    out = []
    for g in groups:
        x0 = min(e[0][0] for e in g)
        y0 = min(e[0][1] for e in g)
        x1 = max(e[0][2] for e in g)
        y1 = max(e[0][3] for e in g)
        out.append({"words": [e[2] for e in g], "boxes": [e[3] for e in g], "text": "".join(e[1] for e in g), "box": [dec_str(x0), dec_str(y0), dec_str(x1), dec_str(y1)]})
    return out


def qualify(groups, suffix):
    if len(groups) != 3:
        return "group_count"
    if not HANGUL.fullmatch(groups[0]["text"]):
        return "first_not_hangul"
    tail = re.compile("[가-힣]+" + suffix)
    if not tail.fullmatch(groups[1]["text"]) or not tail.fullmatch(groups[2]["text"]):
        return "value_group_suffix"
    for a in range(3):
        for b in range(a + 1, 3):
            ax0, _, ax1, _ = (dec(v) for v in groups[a]["box"])
            bx0, _, bx1, _ = (dec(v) for v in groups[b]["box"])
            if min(ax1, bx1) - max(ax0, bx0) > 0:
                return "x_overlap"
    return None


def w4_rule(question, lines, k1, r, w3):
    if not isinstance(r, dict):
        raise ValidationError("W2 result missing")
    if r["reason"] in ("error", "unmatched"):
        return {"w4Reason": r["reason"], "w4From": None, "w4": None, "w4CutPixels": None, "w4Diag": None}
    w1, w2 = r.get("w1"), r.get("w2")
    if w1 is None or w2 is None:
        raise ValidationError("matched page without W1/W2")
    parsed = parse_question(question)
    anchor = None
    vh = w3.get("validHits")
    if isinstance(vh, list) and vh:
        if not isinstance(lines, list):
            raise ValidationError("OCR lines missing")
        words = lines[k1["lineIndex"]]["words"]
        for j in vh:
            b = word_box(words[j])
            if b is None:
                raise ValidationError("valid hit %r has no valid box" % (j,))
            anchor = b[1] if anchor is None else min(anchor, b[1])
    d_lines = qualified = header = assign = counts = chosen = None
    if anchor is not None and parsed:
        suffix = TYPE_SUFFIX[parsed["qtype"]]
        d_lines = []
        for i, line in enumerate(lines):
            words = line.get("words") if isinstance(line, dict) else None
            if not isinstance(words, list):
                raise ValidationError("OCR line %d words" % i)
            if i == k1["lineIndex"]:
                why = "k1_line"
            elif not words:
                why = "no_words"
            elif any(valid_word(w) is None for w in words):
                why = "invalid_word"
            elif any(valid_word(w)[0][3] > anchor for w in words):
                why = "below_anchor"
            else:
                why = "eligible"
            if why != "eligible":
                d_lines.append({"line": i, "why": why, "groups": None, "failure": None})
                continue
            groups = group_line(words)
            d_lines.append({"line": i, "why": why, "groups": groups, "failure": qualify(groups, suffix)})
        qualified = [e["line"] for e in d_lines if e["why"] == "eligible" and e["failure"] is None]
        if len(qualified) == 1:
            hl = d_lines[qualified[0]]
            want = squash(parsed["field"])
            match = [hl["groups"][1]["text"] == want, hl["groups"][2]["text"] == want]
            one = match[0] != match[1]
            header = {"line": hl["line"], "match": match, "target": (1 if match[0] else 2) if one else None, "comp": (2 if match[0] else 1) if one else None}
            scan = w3.get("scan")
            if header["target"] is not None and scan:
                T = [dec(v) for v in hl["groups"][header["target"]]["box"]]
                C = [dec(v) for v in hl["groups"][header["comp"]]["box"]]
                hT, hC = T[3] - T[1], C[3] - C[1]
                assign = []
                for k, u in enumerate(scan["units"]):
                    x0 = dec(u["union"][0])
                    dT, dC = abs(x0 - T[0]), abs(x0 - C[0])
                    column = None
                    if dT < dC:
                        if dT <= hT:
                            column, why = "target", "nearest"
                        else:
                            why = "too_far"
                    elif dC < dT:
                        if dC <= hC:
                            column, why = "comp", "nearest"
                        else:
                            why = "too_far"
                    else:
                        why = "tie"
                    assign.append({"unit": k, "line": u["line"], "first": u["first"], "last": u["last"], "x0": dec_str(x0), "dTarget": dec_str(dT), "dComp": dec_str(dC), "column": column, "why": why})
                counts = {"target": sum(1 for a in assign if a["column"] == "target"), "comp": sum(1 for a in assign if a["column"] == "comp"),
                          "unassigned": sum(1 for a in assign if a["column"] is None)}
                chosen = next(a["unit"] for a in assign if a["column"] == "target") if counts["target"] == 1 else None
    diag = {"question": parsed, "anchorY": None if anchor is None else dec_str(anchor), "lines": d_lines, "qualified": qualified, "header": header,
            "assign": assign, "counts": counts, "chosen": chosen}
    qt = w3.get("qtypes")
    if r.get("w2Reason") != "cut":
        reason = "not_applicable"
    elif not isinstance(qt, list):
        raise ValidationError("W3 qtypes missing")
    elif len(qt) == 0:
        reason = "qtype_none"
    elif len(qt) > 1:
        reason = "qtype_multiple"
    elif not isinstance(vh, list):
        raise ValidationError("cut page without valid hits")
    elif not vh:
        reason = "no_valid_hit_word"
    elif not parsed:
        reason = "question_unparsed"
    elif parsed["qtype"] != qt[0]:
        reason = "question_type_mismatch"
    elif not qualified:
        reason = "header_none"
    elif len(qualified) > 1:
        reason = "header_multiple"
    elif header["match"][0] and header["match"][1]:
        reason = "header_duplicate"
    elif not header["match"][0] and not header["match"][1]:
        reason = "header_no_match"
    else:
        if not w3.get("scan"):
            raise ValidationError("header selected but W3 gave no scan")
        if counts["target"] == 0:
            reason = "no_target_candidate"
        elif counts["target"] > 1:
            reason = "multiple_target_candidates"
        elif not union_inside(w3["scan"]["units"][chosen]["union"], w2):
            reason = "target_outside_w2"
        else:
            reason = "applied"
    w4 = band_copy(w2 if reason == "applied" else w1)
    out = {"w4Reason": reason, "w4From": "w2" if reason == "applied" else "w1", "w4": w4, "w4CutPixels": (w1["height"] - w4["height"]) * w1["width"], "w4Diag": diag}
    if not (same_band(w4, w1) or same_band(w4, w2)):
        raise ValidationError("W4 is neither W1 nor W2")
    if not (w4["top"] <= w2["top"] and bottom(w4) >= bottom(w2) and w4["top"] >= w1["top"] and bottom(w4) <= bottom(w1)):
        raise ValidationError("W2 inside W4 inside W1 broken")
    return out


# ------------------------------------------------------------------ gold attribution (RECOUNT_SPEC 5.3)
def attribute(boxes, page):
    if not isinstance(boxes, list) or not boxes:
        return None
    ex = []
    for b in boxes:
        if not (isinstance(b, list) and len(b) == 4):
            return None
        try:
            x, y, w, h = (dec(v) for v in b)
        except ValidationError:
            return None
        if w <= 0 or h <= 0:
            return None
        ex.append((x, y, x + w, y + h))
    assigned = []
    for x0, y0, x1, y1 in ex:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        hit = [iid for iid, it in page["items"].items() if it["cell"][0] <= cx < it["cell"][2] and it["cell"][1] <= cy < it["cell"][3]]
        assigned.append(hit[0] if len(hit) == 1 else None)
    if any(a is None for a in assigned) or len(set(assigned)) != 1:
        return None
    item = assigned[0]
    l, t, r, b = page["items"][item]["ink"]
    x0, y0 = min(e[0] for e in ex), min(e[1] for e in ex)
    x1, y1 = max(e[2] for e in ex), max(e[3] for e in ex)
    return item if min(r, x1) - max(l, x0) > 0 and min(b, y1) - max(t, y0) > 0 else None


def header_class(item, page):
    if item is None:
        return "undetermined"
    if page["targetHeaderItem"] is not None and item == page["targetHeaderItem"]:
        return "target_header"
    if item == page["compHeaderItem"]:
        return "comp_header"
    return "other_item"


def candidate_class(item, page):
    if item is None:
        return "undetermined"
    if item == page["valueItem"]:
        return "target_value"
    if item == page["compValueItem"]:
        return "comp_value"
    if item in page["otherValueItems"]:
        return "other_record_value"
    if item in page["recordCompItems"]:
        return "other_record_comp"
    return "other_item"


# ------------------------------------------------------------------ prediction validation (RECOUNT_SPEC 5.1)
def validate_prediction(p):
    validate_prediction_w3(p)
    pid, st = p.get("id"), p.get("state")

    def bad(msg):
        raise ValidationError("%s: %s" % (pid, msg))
    if st == "matched":
        if not band_ok(p.get("w4"), p["width"], p["height"]):
            bad("w4 is not a positive window inside the page")
        R = p.get("w4Reason")
        if R not in W4_MATCHED:
            bad("w4Reason %r" % (R,))
        if (p["w2Reason"] != "cut") != (R == "not_applicable"):
            bad("w4Reason vs w2Reason")
        if R == "applied":
            if p.get("w4From") != "w2" or not same_band(p["w4"], p["w2"]):
                bad("applied W4 must be W2")
        elif p.get("w4From") != "w1" or not same_band(p["w4"], p["w1"]):
            bad("held W4 must be W1")
        if not is_int(p.get("w4CutPixels")) or p["w4CutPixels"] != (p["w1"]["height"] - p["w4"]["height"]) * p["w1"]["width"]:
            bad("w4CutPixels")
        d = p.get("w4Diag")
        if not isinstance(d, dict):
            bad("w4Diag missing")
        if R in ("header_none", "header_multiple", "header_duplicate", "header_no_match", "no_target_candidate", "multiple_target_candidates", "target_outside_w2", "applied"):
            q = d.get("qualified")
            if not isinstance(q, list):
                bad("%s without qualified lines" % R)
            if R == "header_none" and q:
                bad("header_none with qualified lines")
            if R == "header_multiple" and len(q) < 2:
                bad("header_multiple with < 2 lines")
            if R not in ("header_none", "header_multiple"):
                if len(q) != 1 or not d.get("header"):
                    bad("%s needs one header line" % R)
                a, b = d["header"]["match"]
                if R == "header_duplicate" and not (a and b):
                    bad("header_duplicate match")
                if R == "header_no_match" and (a or b):
                    bad("header_no_match match")
                if R not in ("header_duplicate", "header_no_match"):
                    if a == b or not d.get("counts"):
                        bad("%s needs one target header and counts" % R)
                    t = d["counts"]["target"]
                    if R == "no_target_candidate" and t != 0:
                        bad("no_target_candidate with targets")
                    if R == "multiple_target_candidates" and t < 2:
                        bad("multiple_target_candidates with < 2")
                    if R in ("target_outside_w2", "applied"):
                        c = d.get("chosen")
                        if t != 1 or not is_int(c) or not p.get("scan") or not (0 <= c < len(p["scan"]["units"])):
                            bad("%s needs one chosen unit" % R)
                        ins = union_inside(p["scan"]["units"][c]["union"], p["w2"])
                        if (R == "applied") != ins:
                            bad("%s with the chosen unit %s W2" % (R, "inside" if ins else "outside"))
    elif st in ("unmatched", "error"):
        for k in ("w4", "w4From", "w4CutPixels", "w4Diag"):
            if p.get(k) is not None:
                bad("%s row carries %s" % (st, k))
        if p.get("w4Reason") != st:
            bad("%s row w4Reason" % st)
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


def item_exposure(page, item, band):
    if band is None:
        return None
    ink = page["items"].get(item, {}).get("ink") if item else None
    return exposure(ink, band) if ink else "source_missing"


def score_page(pred, page):
    pid = page["id"]
    if pred.get("id") != pid:
        raise ValidationError("score: prediction %r does not join page %s" % (pred.get("id"), pid))
    matched = pred["state"] == "matched"
    w = {k: judge(pred, pred[k], page) for k in WIN}
    stage = "error" if pred["state"] == "error" else ("unmatched" if pred["state"] == "unmatched" else ("hangul" if pred.get("branch") == "hangul" else "k0"))
    t12, t13, t14 = (transition(w["w1"]["strict"], w[k]["strict"]) for k in ("w2", "w3", "w4"))
    t34 = transition(w["w3"]["strict"], w["w4"]["strict"])
    for t, k in ((t12, "w2"), (t13, "w3"), (t14, "w4")):
        if t == "recovered" and not (w["w1"]["fullPage"] is True and w[k]["fullPage"] is not True):
            raise ValidationError("%s: %s recovery without a full-page W1" % (pid, k))

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
                raise ValidationError("%s: other value %s has no ink" % (pid, item))
            items.append({"item": item, **{k: exposure(ink, pred[k]) for k in WIN}})

        def from_full(k):
            return tally([i[k] for i in items if i["w1"] == "full"])
        others = {"n": len(items), **{k: tally([i[k] for i in items]) for k in WIN},
                  "fromW1Full2": from_full("w2"), "fromW1Full3": from_full("w3"), "fromW1Full4": from_full("w4"), "items": items}
    opportunity = bool(matched and w["w1"]["strict"] and pred["w2Reason"] == "cut" and others["w1"]["full"] >= 1)
    exp = None
    if matched:
        exp = {k: {"targetHeader": item_exposure(page, page["targetHeaderItem"], pred[k]), "compHeader": item_exposure(page, page["compHeaderItem"], pred[k]),
                   "compValue": item_exposure(page, page["compValueItem"], pred[k]), "targetValue": item_exposure(page, page["valueItem"], pred[k])} for k in WIN}
    reading = None
    if matched and page["header"] == "normal":
        def e1(k):
            return exp[k]["targetHeader"] == "none" and exp[k]["compValue"] == "full"

        def e2(k):
            return exp[k]["targetHeader"] in ("partial", "none") and exp[k]["compValue"] in ("partial", "full")
        reading = {"e1": {k: e1(k) for k in WIN}, "e2": {k: e2(k) for k in WIN},
                   "headerLost": {k: exp["w1"]["targetHeader"] == "full" and exp[k]["targetHeader"] == "none" and exp[k]["compValue"] == "full" for k in ("w2", "w3", "w4")}}
    attribution = None
    if pred.get("w4Reason") == "applied":
        d = pred["w4Diag"]
        hl = next(e for e in d["lines"] if e["line"] == d["header"]["line"])
        h_item = attribute(hl["groups"][d["header"]["target"]]["boxes"], page)
        c_item = attribute(pred["scan"]["units"][d["chosen"]]["boxes"], page)
        hc, cc = header_class(h_item, page), candidate_class(c_item, page)
        if hc == "target_header" and cc == "target_value":
            outcome = "correct"
        elif hc not in ("undetermined", "target_header") or cc not in ("undetermined", "target_value"):
            outcome = "wrong"
        else:
            outcome = "undetermined"
        attribution = {"header": {"item": h_item, "class": hc}, "candidate": {"item": c_item, "class": cc}, "outcome": outcome}
    scan = pred.get("scan")
    d = pred.get("w4Diag")
    return {
        "id": pid, "key": page["key"], "source": page["source"], "kind": page["kind"], "content": page["content"], "side": page["side"], "header": page["header"],
        "ans": page["ans"], "cell": page["cell"], "qtype": page["qtype"], "slot": page["slot"], "stage": stage, "reason": pred["reason"], "w2Reason": pred["w2Reason"],
        "w3Reason": pred["w3Reason"], "w4Reason": pred["w4Reason"], "w4From": pred["w4From"], "w1": w["w1"], "w2": w["w2"], "w3": w["w3"], "w4": w["w4"],
        "t12": t12, "t13": t13, "t14": t14, "t34": t34,
        "lostParts2": lost(t12, pred["w2"]), "lostParts3": lost(t13, pred["w3"]), "lostParts4": lost(t14, pred["w4"]), "prevented34": t13 == "lost" and t14 != "lost",
        "cutPixels2": pred["cutPixels"], "cutPixels3": pred["w3CutPixels"], "cutPixels4": pred["w4CutPixels"],
        "candidateCount": scan["count"] if scan else None, "counts": d["counts"] if d else None, "attribution": attribution, "others": others, "opportunity": opportunity,
        "event2": bool(opportunity and w["w2"]["strict"] and others["fromW1Full2"]["none"] >= 1),
        "event3": bool(opportunity and w["w3"]["strict"] and others["fromW1Full3"]["none"] >= 1),
        "event4": bool(opportunity and w["w4"]["strict"] and others["fromW1Full4"]["none"] >= 1),
        "exposure": exp, "reading": reading, "textIdentifiable": page["header"] == "normal", "error": pred["state"] == "error",
    }


# ------------------------------------------------------------------ summary (RECOUNT_SPEC 6)
def nsrc(rows):
    return len({r["source"] for r in rows})


def is_matched(r):
    return r["stage"] in ("k0", "hangul")


def mean_pp(px, A):
    if not px:
        return None
    f = Fraction(100 * sum(px), A * len(px))
    return {"num": str(f.numerator), "den": str(f.denominator)}


def pp_text(f):
    if f is None:
        return None
    if isinstance(f, dict):
        f = Fraction(int(f["num"]), int(f["den"]))
    neg = f < 0
    a = -f if neg else f
    v = (a.numerator * 200 + a.denominator) // (2 * a.denominator)
    return ("-" if neg else "") + "%d.%02d" % (v // 100, v % 100)


def group(rows, A):
    def c(f):
        return sum(1 for r in rows if f(r))
    valid = [r for r in rows if is_matched(r)]

    def tr(k):
        return {"recovered": c(lambda r: r[k] == "recovered"), "lost": c(lambda r: r[k] == "lost"), "keptSuccess": c(lambda r: r[k] == "keptSuccess"), "bothFail": c(lambda r: r[k] == "bothFail")}
    w1s, w3s = c(lambda r: r["w1"]["strict"]), c(lambda r: r["w3"]["strict"])

    def L(k):
        rs = [r for r in rows if r[k] == "lost"]
        return {"count": len(rs), "denom": w1s, "sources": nsrc(rs)}
    L3 = L("t13")
    prev = [r for r in rows if r["prevented34"]]
    nl = [r for r in rows if r["t34"] == "lost"]
    rc = [r for r in rows if r["t34"] == "recovered"]

    def ev(k):
        rs = [r for r in rows if r[k]]
        return {"count": len(rs), "sources": nsrc(rs)}
    ap_rows = [r for r in rows if r["attribution"]]

    def cnt(xs, keys):
        return {k: xs.count(k) for k in keys}
    expo = {k: {e: cnt([r["exposure"][k][e] for r in valid], ["full", "partial", "none", "source_missing"]) for e in EXPOSURE_KEYS} for k in WIN}
    rd = [r for r in rows if r["reading"]]

    def change(e, k):
        nw = [r for r in rd if r["reading"][e][k] and not r["reading"][e]["w1"]]
        ex = [r for r in rd if r["reading"][e][k] and r["reading"][e]["w1"]]
        rs = [r for r in rd if not r["reading"][e][k] and r["reading"][e]["w1"]]
        return {"new": len(nw), "newSources": nsrc(nw), "existing": len(ex), "existingSources": nsrc(ex), "resolved": len(rs), "resolvedSources": nsrc(rs)}
    ap = [r for r in rows if r["w4Reason"] == "applied" and is_matched(r)]
    return {
        "n": len(rows), "error": c(lambda r: r["stage"] == "error"), "unmatched": c(lambda r: r["stage"] == "unmatched"), "matched": len(valid),
        "strict": {k: c(lambda r, k=k: r[k]["strict"]) for k in WIN}, "fullPage": {k: c(lambda r, k=k: r[k]["fullPage"] is True) for k in WIN},
        "t12": tr("t12"), "t13": tr("t13"), "t14": tr("t14"), "t34": tr("t34"),
        "L2": L("t12"), "L3": L3, "L4": L("t14"),
        "prevented34": {"count": len(prev), "of": L3["count"], "sources": nsrc(prev)},
        "newLoss34": {"count": len(nl), "of": w3s, "sources": nsrc(nl)},
        "recovered34": {"count": len(rc), "of": len(rows) - w3s, "sources": nsrc(rc)},
        "cut": c(lambda r: r["w2Reason"] == "cut"), "applied": c(lambda r: r["w4Reason"] == "applied"),
        "w4Reason": {k: c(lambda r, k=k: r["w4Reason"] == k) for k in W4_REASONS},
        "opportunity": ev("opportunity"), "event2": ev("event2"), "event3": ev("event3"), "event4": ev("event4"),
        "attribution": {
            "applied": len(ap_rows), "correct": sum(1 for r in ap_rows if r["attribution"]["outcome"] == "correct"),
            "wrong": sum(1 for r in ap_rows if r["attribution"]["outcome"] == "wrong"), "undetermined": sum(1 for r in ap_rows if r["attribution"]["outcome"] == "undetermined"),
            "header": cnt([r["attribution"]["header"]["class"] for r in ap_rows], HEADER_CLASSES), "candidate": cnt([r["attribution"]["candidate"]["class"] for r in ap_rows], CANDIDATE_CLASSES),
        },
        "exposure": expo,
        "reading": {
            "pages": len(rd), "e1": {k: sum(1 for r in rd if r["reading"]["e1"][k]) for k in WIN}, "e2": {k: sum(1 for r in rd if r["reading"]["e2"][k]) for k in WIN},
            "change": {e: {k: change(e, k) for k in ("w2", "w3", "w4")} for e in ("e1", "e2")},
            "headerLost": {k: {"count": sum(1 for r in rd if r["reading"]["headerLost"][k]), "sources": nsrc([r for r in rd if r["reading"]["headerLost"][k]])} for k in ("w2", "w3", "w4")},
        },
        "area": {"pages": len(valid), "w2": mean_pp([r["cutPixels2"] for r in valid], A), "w3": mean_pp([r["cutPixels3"] for r in valid], A),
                 "w4": mean_pp([r["cutPixels4"] for r in valid], A), "appliedPages": len(ap), "w4Applied": mean_pp([r["cutPixels4"] for r in ap], A)},
    }


def source_order(rows):
    seen = []
    for r in rows:
        if r["source"] not in [s for s, _ in seen]:
            seen.append((r["source"], r))
    return [s for s, r in sorted(seen, key=lambda e: (KINDS.index(e[1]["kind"]), e[1]["content"]))]


def verdict_of(g):
    t, nb = g["total"], g["header"]["normal"]
    G1 = {"L4": t["L4"]["count"], "pass": t["L4"]["count"] == 0}
    G2 = {"blank": g["header"]["blank"]["applied"], "dup": g["header"]["dup"]["applied"], "pass": g["header"]["blank"]["applied"] == 0 and g["header"]["dup"]["applied"] == 0}
    sl, sr = g["normalSide"]["L"]["event4"]["sources"], g["normalSide"]["R"]["event4"]["sources"]
    G3 = {"L": sl, "R": sr, "pass": sl >= 2 and sr >= 2}
    at = nb["attribution"]
    status = "not_applicable" if at["applied"] == 0 else ("pass" if at["correct"] == at["applied"] and at["wrong"] == 0 and at["undetermined"] == 0 else "fail")
    G4 = {"denom": at["applied"], "denomL": g["normalSide"]["L"]["attribution"]["applied"], "denomR": g["normalSide"]["R"]["attribution"]["applied"],
          "correct": at["correct"], "wrong": at["wrong"], "undetermined": at["undetermined"], "status": status}
    failed = [k for k, p in (("G1", G1["pass"]), ("G2", G2["pass"]), ("G3", G3["pass"]), ("G4", status == "pass")) if not p]
    geometry = "fail" if failed else "pass"
    ch = nb["reading"]["change"]["e1"]["w4"]
    rstat = "not_evaluable" if nb["reading"]["pages"] == 0 else ("loss" if ch["new"] >= 1 else "no_loss")
    reading = {"comparable": nb["reading"]["pages"], "newE1": ch["new"], "newE1Sources": ch["newSources"], "status": rstat}
    FINAL = {("pass", "no_loss"): "followup_possible", ("pass", "loss"): "geometry_ok_reading_worse", ("fail", "no_loss"): "geometry_fail", ("fail", "loss"): "both_unfavorable",
             ("pass", "not_evaluable"): "geometry_pass_reading_not_evaluable", ("fail", "not_evaluable"): "geometry_fail_reading_not_evaluable"}
    return {"G1": G1, "G2": G2, "G3": G3, "G4": G4, "geometry": geometry, "failed": failed, "reading": reading, "final": FINAL[(geometry, rstat)]}


def summarize_scores(rows, page_area, preds=None):
    A = page_area

    def by(f):
        return [r for r in rows if f(r)]

    def n(f):
        return len(by(f))
    stages = {
        "pages": len(rows), "error": n(lambda r: r["stage"] == "error"), "normal": len(rows) - n(lambda r: r["stage"] == "error"),
        "unmatched": n(lambda r: r["stage"] == "unmatched"), "k0Matched": n(lambda r: r["stage"] == "k0"), "hangulMatched": n(lambda r: r["stage"] == "hangul"),
        "w1Reason": {k: n(lambda r, k=k: r["reason"] == k) for k in W1_REASONS}, "w2Reason": {k: n(lambda r, k=k: r["w2Reason"] == k) for k in W2_REASONS},
        "w3Reason": {k: n(lambda r, k=k: r["w3Reason"] == k) for k in W3_REASONS}, "w4Reason": {k: n(lambda r, k=k: r["w4Reason"] == k) for k in W4_REASONS},
    }
    sources = source_order(rows)

    def gby(keys, f):
        return {k: group(by(lambda r, k=k: f(r, k)), A) for k in keys}
    groups = {
        "total": group(rows, A), "cut": group(by(lambda r: r["w2Reason"] == "cut"), A), "applied": group(by(lambda r: r["w4Reason"] == "applied"), A),
        "side": gby(SIDES, lambda r, k: r["side"] == k), "header": gby(HEADERS, lambda r, k: r["header"] == k), "ans": gby(ANS, lambda r, k: r["ans"] == k),
        "normalSide": gby(SIDES, lambda r, k: r["header"] == "normal" and r["side"] == k), "cell": gby(CELLS, lambda r, k: r["cell"] == k),
        "kind": gby(KINDS, lambda r, k: r["kind"] == k), "qtype": gby(QTYPES, lambda r, k: r["qtype"] == k), "slot": {str(k): v for k, v in gby(SLOTS, lambda r, k: r["slot"] == k).items()},
        "w4Reason": gby(W4_REASONS, lambda r, k: r["w4Reason"] == k), "source": gby(sources, lambda r, k: r["source"] == k),
    }

    def ids(f):
        return [r["id"] for r in rows if f(r)]

    def new_e1(r):
        return bool(r["reading"] and r["reading"]["e1"]["w4"] and not r["reading"]["e1"]["w1"])

    def outcome(r):
        return r["attribution"]["outcome"] if r["attribution"] else None
    lists = {
        "t13Lost": ids(lambda r: r["t13"] == "lost"), "t14Lost": ids(lambda r: r["t14"] == "lost"), "prevented34": ids(lambda r: r["prevented34"]),
        "newLoss34": ids(lambda r: r["t34"] == "lost"), "recovered34": ids(lambda r: r["t34"] == "recovered"),
        "applied": ids(lambda r: r["w4Reason"] == "applied"), "appliedNormal": ids(lambda r: r["w4Reason"] == "applied" and r["header"] == "normal"),
        "appliedBlankDup": ids(lambda r: r["w4Reason"] == "applied" and r["header"] != "normal"),
        "attributionWrong": ids(lambda r: outcome(r) == "wrong"), "attributionUndetermined": ids(lambda r: outcome(r) == "undetermined"),
        "opportunity": ids(lambda r: r["opportunity"]), "event4": ids(lambda r: r["event4"]), "readingNewE1W4": ids(new_e1),
        "headerLostW4": ids(lambda r: bool(r["reading"] and r["reading"]["headerLost"]["w4"])),
        "errors": ids(lambda r: r["stage"] == "error"), "unmatched": ids(lambda r: r["stage"] == "unmatched"),
    }
    side_mismatch = []
    for s in sources:
        for h in HEADERS:
            for a in ANS:
                Lr = next((r for r in rows if r["source"] == s and r["header"] == h and r["ans"] == a and r["side"] == "L"), None)
                Rr = next((r for r in rows if r["source"] == s and r["header"] == h and r["ans"] == a and r["side"] == "R"), None)
                if not Lr or not Rr:
                    continue
                f = {"w4Reason": lambda r: r["w4Reason"], "w4Strict": lambda r: r["w4"]["strict"], "event4": lambda r: r["event4"], "outcome": outcome}
                fields = [k for k in f if f[k](Lr) != f[k](Rr)]
                if fields:
                    side_mismatch.append({"source": s, "header": h, "ans": a, "L": Lr["id"], "R": Rr["id"], "fields": fields})

    def conc(pred):
        per = [(s, n(lambda r, s=s: r["source"] == s and pred(r))) for s in sources]
        total = sum(k for _, k in per)
        top, top_count = None, 0
        for s, k in per:
            if k > top_count:
                top, top_count = s, k
        return {"total": total, "topSource": top if total else None, "topCount": top_count}
    concentration = {"event4": conc(lambda r: r["event4"]), "applied": conc(lambda r: r["w4Reason"] == "applied"), "L4": conc(lambda r: r["t14"] == "lost")}
    source_table = []
    for s in sources:
        rs = by(lambda r, s=s: r["source"] == s)
        cells = {}
        for k in CELLS:
            r = next((x for x in rs if x["cell"] == k), None)
            cells[k] = None if r is None else {"id": r["id"], "stage": r["stage"], "w4Reason": r["w4Reason"], "s": "".join("S" if r[w]["strict"] else "F" for w in WIN),
                                               "t14": r["t14"], "counts": r["counts"], "outcome": outcome(r), "event4": r["event4"], "newE1W4": new_e1(r)}
        source_table.append({"source": s, "kind": rs[0]["kind"], "qtype": rs[0]["qtype"], "slot": rs[0]["slot"], "cells": cells})
    valid = by(is_matched)

    def idset(f):
        return {r["id"] for r in rows if f(r)}
    w4in = nested = applied_w2 = None
    if preds is not None:
        check_id_set(preds, [r["id"] for r in rows])
        mp = [p for p in preds if p["state"] == "matched"]
        w4in = sum(1 for p in mp if same_band(p["w4"], p["w1"]) or same_band(p["w4"], p["w2"]))
        nested = sum(1 for p in mp if p["w4"]["left"] == p["w1"]["left"] and p["w4"]["width"] == p["w1"]["width"] and p["w4"]["top"] <= p["w2"]["top"]
                     and bottom(p["w4"]) >= bottom(p["w2"]) and p["w4"]["top"] >= p["w1"]["top"] and bottom(p["w4"]) <= bottom(p["w1"]))
        applied_w2 = all((p["w4Reason"] == "applied") == (p["w4From"] == "w2") and (p["w4Reason"] != "applied" or same_band(p["w4"], p["w2"])) for p in mp)
    invariants = {
        "checked": len(valid), "w4InW1W2": w4in, "nested": nested,
        "lost4SubsetLost2": idset(lambda r: r["t14"] == "lost") <= idset(lambda r: r["t12"] == "lost"),
        "events4SubsetEvents2": idset(lambda r: r["event4"]) <= idset(lambda r: r["event2"]),
        "appliedIsW2": applied_w2,
        "recoveredNotFullPage": sum(1 for r in rows if any(r[t] == "recovered" and not (r["w1"]["fullPage"] is True and r[WIN[i + 1]]["fullPage"] is not True)
                                                       for i, t in enumerate(("t12", "t13", "t14")))),
    }
    return {"invariants": invariants, "stages": stages, "groups": groups, "lists": lists, "sideMismatch": side_mismatch, "concentration": concentration,
            "sourceTable": source_table, "verdict": verdict_of(groups)}


# ------------------------------------------------------------------ public tables (RECOUNT_SPEC 10)
def fmt(v):
    if v is None:
        return "—"
    if isinstance(v, bool):
        return "S" if v else "F"
    return str(v)


def tline(cells):
    return "| " + " | ".join(fmt(c) for c in cells) + " |"


def head(cells):
    return [tline(cells), "|" + "---|" * len(cells)]


def group_rows(g):
    rows = [("전체", g["total"]), ("W2 cut", g["cut"]), ("W4 applied", g["applied"])]
    rows += [("side " + k, g["side"][k]) for k in SIDES] + [("header " + k, g["header"][k]) for k in HEADERS] + [("ans " + k, g["ans"][k]) for k in ANS]
    rows += [("normal " + k, g["normalSide"][k]) for k in SIDES] + [("cell " + k, g["cell"][k]) for k in CELLS]
    rows += [("kind " + k, g["kind"][k]) for k in KINDS] + [("qtype " + k, g["qtype"][k]) for k in QTYPES] + [("slot %d" % k, g["slot"][str(k)]) for k in SLOTS]
    return rows


ABBR = {"correct": "C", "wrong": "W", "undetermined": "U"}
ARROW = chr(0x2192)


def source_cell(c):
    if c is None:
        return None
    if c["stage"] == "error":
        return "error"
    if c["stage"] == "unmatched":
        return "unmatched"
    k = c["counts"]
    s = "%s %s %s %s" % (c["s"], c["w4Reason"], "t%dc%du%d" % (k["target"], k["comp"], k["unassigned"]) if k else "-", ABBR[c["outcome"]] if c["outcome"] else "-")
    if c["event4"]:
        s += " J"
    if c["newE1W4"]:
        s += " E1"
    return s


def render_tables(summary):
    g, st, v = summary["groups"], summary["stages"], summary["verdict"]

    def rows_of(f):
        return [tline([name] + f(b)) for name, b in group_rows(g)]

    def frac(a, b):
        return "%s/%s" % (a, b)
    stages = head(["항목", "쪽수"]) + [tline(r) for r in [
        ["등록 쪽", st["pages"]], ["기술 오류", st["error"]], ["정상 처리(미매치 포함)", st["normal"]], ["정상 미매치", st["unmatched"]], ["K0 매치", st["k0Matched"]],
        ["한글 매치", st["hangulMatched"]], ["W1 widened", st["w1Reason"]["widened"]], ["W1 not_wider", st["w1Reason"]["not_wider"]],
        ["W1 no_candidate", st["w1Reason"]["no_candidate"]], ["W1 k0_branch", st["w1Reason"]["k0_branch"]], ["W2 cut", st["w2Reason"]["cut"]],
        ["W2 no_cut", st["w2Reason"]["no_cut"]], ["W2 hit_outside_w1", st["w2Reason"]["hit_outside_w1"]], ["W2 inherit", st["w2Reason"]["inherit"]],
    ] + [["W3 " + k, st["w3Reason"][k]] for k in W3_REASONS] + [["W4 " + k, st["w4Reason"][k]] for k in W4_REASONS]]
    groups = head(["그룹", "n", "오류", "미매치", "매치", "W1 엄격", "W2 엄격", "W3 엄격", "W4 엄격", "W2 cut", "W4 적용", "L2/W1 성공", "L3/W1 성공", "L4/W1 성공", "L4 원본",
                   "L3 중 W4 예방", "W3" + ARROW + "W4 새 손실", "W3" + ARROW + "W4 회복", "공통 기회", "J2", "J3", "J4", "J4 원본"]) + rows_of(lambda b: [
        b["n"], b["error"], b["unmatched"], b["matched"], b["strict"]["w1"], b["strict"]["w2"], b["strict"]["w3"], b["strict"]["w4"], b["cut"], b["applied"],
        frac(b["L2"]["count"], b["L2"]["denom"]), frac(b["L3"]["count"], b["L3"]["denom"]), frac(b["L4"]["count"], b["L4"]["denom"]), b["L4"]["sources"],
        frac(b["prevented34"]["count"], b["prevented34"]["of"]), frac(b["newLoss34"]["count"], b["newLoss34"]["of"]), frac(b["recovered34"]["count"], b["recovered34"]["of"]),
        b["opportunity"]["count"], b["event2"]["count"], b["event3"]["count"], b["event4"]["count"], b["event4"]["sources"]])
    reasons = head(["그룹"] + W4_REASONS) + rows_of(lambda b: [b["w4Reason"][k] for k in W4_REASONS])
    attribution = head(["그룹", "적용", "정답", "오선택", "미확정", "표제 목표", "표제 경쟁", "표제 기타", "표제 미확정", "후보 목표", "후보 경쟁", "후보 타 레코드 값",
                        "후보 타 레코드 경쟁", "후보 기타", "후보 미확정"]) + rows_of(lambda b: [
        b["attribution"]["applied"], b["attribution"]["correct"], b["attribution"]["wrong"], b["attribution"]["undetermined"]]
        + [b["attribution"]["header"][k] for k in HEADER_CLASSES] + [b["attribution"]["candidate"][k] for k in CANDIDATE_CLASSES])

    def fpnm(x):
        return "%d/%d/%d/%d" % (x["full"], x["partial"], x["none"], x["source_missing"])

    def fpn(x):
        return "%d/%d/%d" % (x["full"], x["partial"], x["none"])
    exposure_t = head(["행", "목표 표제 f/p/n/m", "경쟁 표제 f/p/n/m", "경쟁 값 f/p/n", "목표 값 f/p/n"])
    for h in HEADERS:
        for k in WIN:
            e = g["header"][h]["exposure"][k]
            exposure_t.append(tline(["header %s W%s" % (h, k[1:]), fpnm(e["targetHeader"]), fpnm(e["compHeader"]), fpn(e["compValue"]), fpn(e["targetValue"])]))
    read_rows = [("header normal", g["header"]["normal"])] + [("normal " + k, g["normalSide"][k]) for k in SIDES] + [("cell " + k, g["cell"][k]) for k in CELLS if "-normal-" in k]
    reading = head(["그룹", "비교 쪽", "E1 W1", "E1 W4", "E1 W4 새(원본)", "E1 W4 기존", "E1 W4 해소", "E2 W1", "E2 W4", "E2 W4 새(원본)", "E2 W4 기존", "E2 W4 해소",
                    "표제 소실 W2", "표제 소실 W3", "표제 소실 W4(원본)", "E1 W2 새", "E1 W3 새"])
    for name, b in read_rows:
        r = b["reading"]
        c1, c2 = r["change"]["e1"]["w4"], r["change"]["e2"]["w4"]
        reading.append(tline([name, r["pages"], r["e1"]["w1"], r["e1"]["w4"], "%d (%d)" % (c1["new"], c1["newSources"]), c1["existing"], c1["resolved"],
                              r["e2"]["w1"], r["e2"]["w4"], "%d (%d)" % (c2["new"], c2["newSources"]), c2["existing"], c2["resolved"],
                              r["headerLost"]["w2"]["count"], r["headerLost"]["w3"]["count"], "%d (%d)" % (r["headerLost"]["w4"]["count"], r["headerLost"]["w4"]["sources"]),
                              r["change"]["e1"]["w2"]["new"], r["change"]["e1"]["w3"]["new"]]))
    area = head(["그룹", "매치", "W2 평균 %p", "W3 평균 %p", "W4 평균 %p", "W4 적용 쪽", "W4 적용 평균 %p"]) + rows_of(lambda b: [
        b["area"]["pages"], pp_text(b["area"]["w2"]), pp_text(b["area"]["w3"]), pp_text(b["area"]["w4"]), b["area"]["appliedPages"], pp_text(b["area"]["w4Applied"])])
    sources = head(["원본", "유형", "목표 슬롯"] + CELLS) + [tline([s["source"], s["qtype"], s["slot"]] + [source_cell(s["cells"][k]) for k in CELLS]) for s in summary["sourceTable"]]

    def pf(b):
        return "pass" if b else "fail"
    verdict = head(["조건", "값", "판정"]) + [
        tline(["G1 전체 L4 = 0", "L4 %d" % v["G1"]["L4"], pf(v["G1"]["pass"])]),
        tline(["G2 공란·중복 적용 0", "공란 %d / 중복 %d" % (v["G2"]["blank"], v["G2"]["dup"]), pf(v["G2"]["pass"])]),
        tline(["G3 정상 L·R 각각 J4 원본 ≥ 2", "L %d / R %d" % (v["G3"]["L"], v["G3"]["R"]), pf(v["G3"]["pass"])]),
        tline(["G4 정상 적용 귀속 100%", "정답 %d/%d (L %d, R %d), 오선택 %d, 미확정 %d" % (v["G4"]["correct"], v["G4"]["denom"], v["G4"]["denomL"], v["G4"]["denomR"],
                                                                         v["G4"]["wrong"], v["G4"]["undetermined"]), v["G4"]["status"]]),
        tline(["기하 필요조건", "미달 " + ", ".join(v["failed"]) if v["failed"] else "미달 없음", v["geometry"]]),
        tline(["읽기 근거(정상, W1 대비 새 E1)", "새 E1 %d (원본 %d) / 비교 쪽 %d" % (v["reading"]["newE1"], v["reading"]["newE1Sources"], v["reading"]["comparable"]), v["reading"]["status"]]),
        tline(["최종", "—", v["final"]]),
    ]
    return {"stages": stages, "groups": groups, "reasons": reasons, "attribution": attribution, "exposure": exposure_t, "reading": reading, "area": area,
            "sources": sources, "verdict": verdict}


TABLE_BLOCK = re.compile(r"<!-- khc:table (\S+) -->\n([\s\S]*?)\n<!-- /khc:table -->")


def cells_of(line):
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|"):
        s = s[:-1]
    return [c.strip() for c in s.split("|")]


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
                if (a[j] if j < len(a) else None) != (b[j] if j < len(b) else None):
                    out.append({"table": name, "row": i, "col": j, "want": a[j] if j < len(a) else None, "got": b[j] if j < len(b) else None})
    return out


# ------------------------------------------------------------------ ids and row comparison
def check_id_set(rows, ids):
    got = [r.get("id") if isinstance(r, dict) else None for r in rows]
    seen = set()
    for i in got:
        if i in seen:
            raise ValidationError("duplicate id %s" % i)
        seen.add(i)
    missing = [i for i in ids if i not in seen]
    if missing:
        raise ValidationError("missing ids %s" % ", ".join(missing[:5]))
    extra = [i for i in got if i not in ids]
    if extra:
        raise ValidationError("unexpected ids %s" % ", ".join(map(str, extra[:5])))
    if got != list(ids):
        raise ValidationError("id order differs")
    return True


def diff_rows(a, b):
    check_id_set(b, [r["id"] for r in a])
    out = []
    for ra, rb in zip(a, b):
        fields = sorted(f for f in set(ra) | set(rb) if not same(ra.get(f, "<missing>"), rb.get(f, "<missing>")))
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


HERE = os.path.dirname(os.path.abspath(__file__))


def load(args):
    d = args.data
    return {
        "manifest": read_json(os.path.join(d, "manifest.json")), "design": read_json(os.path.join(d, "scoring", "design.json")),
        "designBytes": read_bytes(os.path.join(d, "scoring", "design.json")), "registeredDesignBytes": read_bytes(os.path.join(HERE, "registered", "design.json")),
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
    for im in sorted(x["design"]["images"], key=lambda im: im["id"]):
        g = x["gold"][im["id"]]
        inks = x["render"][im["id"]]["items"]
        pages.append({"id": im["id"], "key": im["key"], "source": im["source"], "kind": im["kind"], "content": im["content"], "side": im["side"], "header": im["header"],
                      "ans": im["ans"], "cell": im["cellName"], "qtype": im["qtype"], "slot": im["slot"], "width": im["page"]["width"], "height": im["page"]["height"],
                      "anchorItem": im["anchorItem"], "valueItem": im["valueItem"], "compValueItem": im["compValueItem"], "targetHeaderItem": im["targetHeaderItem"],
                      "compHeaderItem": im["compHeaderItem"], "otherValueItems": im["otherValueItems"], "recordCompItems": [r["compValueItem"] for r in im["records"]],
                      "parts": [p["rect"] for p in g["parts"]],
                      "items": {it["id"]: {"role": it["role"], "cell": it["cell"], "ink": inks[it["id"]]["ink"]} for it in im["items"]}})
    return pages


def norm_question(q):
    return " ".join(unicodedata.normalize("NFC", q).split())


SELECTOR_ALLOW = re.compile(r"selector/(questions[.]json|images/p[0-9]{3}[.]png)")
PRED_FIELDS = ["id", "pngSha256", "ocrSha256", "width", "height", "state", "error", "branch", "lineIndex", "hitWords", "reason", "w0", "w1",
               "candidates", "maxRight", "clippedRight", "addedPixels", "w2Reason", "hitTop", "hitBottom", "pad", "w2", "cutPixels",
               "qtypes", "validHits", "scan", "w3Reason", "w3From", "w3", "w3CutPixels", "w4Reason", "w4From", "w4", "w4CutPixels", "w4Diag"]
SCORE_FIELDS = ["id", "key", "source", "kind", "content", "side", "header", "ans", "cell", "qtype", "slot", "stage", "reason", "w2Reason", "w3Reason", "w4Reason",
                "w4From", "w1", "w2", "w3", "w4", "t12", "t13", "t14", "t34", "lostParts2", "lostParts3", "lostParts4", "prevented34", "cutPixels2", "cutPixels3",
                "cutPixels4", "candidateCount", "counts", "attribution", "others", "opportunity", "event2", "event3", "event4", "exposure", "reading",
                "textIdentifiable", "error"]
COL_SHIFT = 260
GRAMMAR_ROLES = ("target_value", "comp_value")


def col_dx(item_id, side):
    if re.fullmatch(r"r[0-9]-t(val|aux)", item_id) or item_id == "h-target":
        return COL_SHIFT if side == "R" else 0
    if re.fullmatch(r"r[0-9]-c(val|aux)", item_id) or item_id == "h-comp":
        return -COL_SHIFT if side == "R" else 0
    return 0


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
    if sha_bytes(x["designBytes"]) != sha_bytes(x["registeredDesignBytes"]):
        rep.bad(C1, "scoring/design.json is not the registered design (opaque ids, grid)")
    images = sorted(x["design"]["images"], key=lambda im: im["id"])
    ids = [im["id"] for im in images]
    if len(ids) != PAGES or ids != ["p%03d" % i for i in range(PAGES)]:
        rep.bad(C1, "design ids are not p000..p143")
    for name in ("questions", "ocr", "ocrExact", "k1", "preds", "score"):
        try:
            check_id_set(x[name], ids)
        except ValidationError as e:
            rep.bad(C1, "ids " + name, str(e))
            raise
    for q, im in zip(x["questions"], images):
        if (q["file"], q["question"]) != (im["file"], im["question"]):
            rep.bad(C1, im["id"] + " questions.json vs design")
    pages = pages_of(x)
    pngs = {}
    for im in images:
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
        data = read_bytes(os.path.join(d, "selector", "images", im["file"]))
        w, h, rows = decode_png(data)
        pngs[im["id"]] = {"sha": sha_bytes(data), "w": w, "h": h}
        if (w, h) != (1280, 960):
            rep.bad(C1, im["id"] + " PNG size", [w, h])
        for name in [im["anchorItem"], im["valueItem"], im["compValueItem"], im["compHeaderItem"]] + im["otherValueItems"] + ([im["targetHeaderItem"]] if im["targetHeaderItem"] else []):
            if not edges_have_ink(rows, inks[name]["ink"]):
                rep.bad(C1, im["id"] + " edge ink " + name)
        if im["header"] == "blank":
            x0, y0, x1, y1 = im["headerCells"]["target"]
            if any(rows[yy][xx] < 255 for yy in range(y0, y1) for xx in range(x0, x1)):
                rep.bad(C1, im["id"] + " blank target header cell has ink")
    for o in x["ocr"]:
        pg = pngs.get(o["id"])
        if pg and o["pngSha256"] != pg["sha"]:
            rep.bad(C1, o["id"] + " ocr pngSha256")
        if pg and o["status"] == "ok" and (o["width"], o["height"]) != (pg["w"], pg["h"]):
            rep.bad(C1, o["id"] + " ocr size")

    # 1b pairing (RECOUNT_SPEC 2.5)
    CP = "1b-pairing"
    rep.check(CP)
    by_src = {}
    for im in images:
        by_src.setdefault(im["source"], []).append(im)
    if len(by_src) != 12:
        rep.bad(CP, "sources", len(by_src), 12)
    for s, ims in by_src.items():
        if sorted(im["cellName"] for im in ims) != sorted(CELLS):
            rep.bad(CP, s + " variants")
            continue
        ref = next(im for im in ims if im["cellName"] == "L-normal-same")
        rink = x["render"][ref["id"]]["items"]
        for im in ims:
            for k in ("question", "answer", "qtype", "slot", "anchorItem", "valueItem", "compValueItem", "otherValueItems", "field", "compField"):
                if im[k] != ref[k]:
                    rep.bad(CP, im["id"] + " " + k)
            recs = [(it["id"], it["role"], it["text"]) for it in im["items"] if it["id"].startswith("r")]
            if recs != [(it["id"], it["role"], it["text"]) for it in ref["items"] if it["id"].startswith("r")]:
                rep.bad(CP, im["id"] + " record items")
            hs = [(it["id"],) if it["id"] == "h-label" else (it["id"], it["text"]) for it in im["items"] if it["role"] == "header"]
            want = {"normal": [("h-label",), ("h-target", ref["field"]), ("h-comp", ref["compField"])], "blank": [("h-label",), ("h-comp", ref["compField"])],
                    "dup": [("h-label",), ("h-target", ref["field"]), ("h-comp", ref["field"])]}[im["header"]]
            if hs != want:
                rep.bad(CP, im["id"] + " headers", hs)
            ink = x["render"][im["id"]]["items"]
            same_ans = next(p for p in ims if p["side"] == "L" and p["header"] == "normal" and p["ans"] == im["ans"])
            aink = x["render"][same_ans["id"]]["items"]
            for iid, v in ink.items():
                if not iid.startswith("r"):
                    continue
                a, b = rink[iid]["ink"], v["ink"]
                dx = col_dx(iid, im["side"])
                if b[0] - a[0] != dx or b[2] - a[2] != dx or b[3] - b[1] != a[3] - a[1]:
                    rep.bad(CP, im["id"] + " " + iid + " ink x/height")
                yref = aink[iid]["ink"] if re.fullmatch(r"r[0-9]-t(val|aux)", iid) else a
                if (b[1], b[3]) != (yref[1], yref[3]):
                    rep.bad(CP, im["id"] + " " + iid + " ink y")
        for h in HEADERS:
            for a in ANS:
                Lp = next(p for p in ims if p["side"] == "L" and p["header"] == h and p["ans"] == a)
                Rp = next(p for p in ims if p["side"] == "R" and p["header"] == h and p["ans"] == a)
                li, ri = x["render"][Lp["id"]]["items"], x["render"][Rp["id"]]["items"]
                if sorted(li) != sorted(ri):
                    rep.bad(CP, "%s %s-%s L/R items" % (s, h, a))
                    continue
                for iid in li:
                    dx = col_dx(iid, "R")
                    l, r = li[iid]["ink"], ri[iid]["ink"]
                    if r[0] - l[0] != dx or r[2] - l[2] != dx or r[1] != l[1] or r[3] != l[3]:
                        rep.bad(CP, "%s %s-%s L/R %s" % (s, h, a, iid))
    nq = [norm_question(im["question"]) for im in images]
    if len(set(nq)) != 12 or any(nq.count(q) != 12 for q in nq) or any(len({norm_question(im["question"]) for im in ims}) != 1 for ims in by_src.values()):
        rep.bad(CP, "normalized questions are not 12 x 12 by source")
    if len({p["sha"] for p in pngs.values()}) != PAGES:
        rep.bad(CP, "PNG SHA-256 not unique")

    # 1c question types, parser and value grammar (RECOUNT_SPEC 2.6)
    CT = "1c-types-parser-grammar"
    rep.check(CT)
    for im in images:
        if question_types(im["question"]) != [im["qtype"]]:
            rep.bad(CT, im["id"] + " question types", question_types(im["question"]), [im["qtype"]])
        if parse_question(im["question"]) != {"record": im["label"], "field": im["field"], "qtype": im["qtype"]}:
            rep.bad(CT, im["id"] + " parser", parse_question(im["question"]))
        vals = [it["text"] for it in im["items"] if it["role"] in GRAMMAR_ROLES]
        if len(vals) != 6 or len(set(vals)) != 6:
            rep.bad(CT, im["id"] + " the 6 values are not distinct")
        for it in im["items"]:
            if it["role"] in GRAMMAR_ROLES:
                ok = grammar_match(im["qtype"], it["text"])
            else:
                ok = not any(grammar_match(t, it["text"]) for t in QTYPES)
                if it["role"] != "header" and any(sfx in squash(it["text"]) for sfx in TYPE_SUFFIX.values()):
                    ok = False
            if not ok:
                rep.bad(CT, im["id"] + " grammar/suffix " + it["id"])

    # 2 K1 recompute, W0-W4 predictions
    C2 = "2-k1-w1-w4-predictions"
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
        lines_x = ox["ocrLines"] if o["status"] == "ok" else None
        w3 = w3_rule(qmap[pid], lines_x, k["k1"], r)
        w4 = w4_rule(qmap[pid], lines_x, k["k1"], r, w3)
        mine = {"id": pid, "pngSha256": pg["sha"], "ocrSha256": o.get("ocrSha256"), "width": pg["w"], "height": pg["h"], "state": state,
                "branch": k["k1"].get("branch"), "lineIndex": k["k1"].get("lineIndex"), "hitWords": k["k1"].get("hitWords"), **r, **w3, **w4}
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

    # 2b approved inputs of the replay (RECOUNT_SPEC 8)
    C2b = "2b-replay-inputs"
    rep.check(C2b)
    data_paths = [e["path"] for e in x["inputs"].get("data", [])]
    if any(not SELECTOR_ALLOW.fullmatch(p) for p in data_paths):
        rep.bad(C2b, "a replay data input outside the selector allowlist", [p for p in data_paths if not SELECTOR_ALLOW.fullmatch(p)][:5])
    want_paths = ["selector/questions.json"] + ["selector/images/" + q["file"] for q in x["questions"]]
    if data_paths != want_paths:
        rep.bad(C2b, "replay data inputs are not exactly questions + 144 PNGs in id order")
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
    for r in x["score"]:
        if list(r) != SCORE_FIELDS:
            rep.bad(C3, r.get("id", "?") + " score field order")
            break
    for d_ in diff_rows(my_rows, x["score"]):
        rep.bad(C3, d_["id"], d_["fields"])

    # 4 summary and verdict
    C4 = "4-summary-verdict"
    rep.check(C4)
    area = pages[0]["width"] * pages[0]["height"]
    s = summarize_scores(my_rows, area, my_preds)
    for key in ("invariants", "stages", "groups", "lists", "sideMismatch", "concentration", "sourceTable", "verdict"):
        if not same(s[key], x["summary"].get(key)):
            sub = [k for k in s[key] if not same(s[key][k], (x["summary"].get(key) or {}).get(k))] if isinstance(s[key], dict) else None
            rep.bad(C4, key, sub)
    inv = s["invariants"]
    if inv["w4InW1W2"] != inv["checked"] or inv["nested"] != inv["checked"] or not inv["lost4SubsetLost2"] or not inv["events4SubsetEvents2"] \
            or not inv["appliedIsW2"] or inv["recoveredNotFullPage"]:
        rep.bad(C4, "W4 invariant broken", inv)
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

    # 7 cases described in RESULTS.md against the raw records (protocol 7; check added after the results, verification only)
    C7 = "7-described-cases"
    rep.check(C7)
    if x["results"] is None:
        rep.checks[C7]["unverifiable"] = "no --results given"
    else:
        try:
            cases = read_cases(x["results"])
        except ValueError as e:
            rep.bad(C7, "cases block", str(e))
            cases = []
        rep.checks[C7]["cases"] = len(cases)
        if not cases:
            rep.bad(C7, "no khc:cases block")
        sources = {"ocr": {o["id"]: o for o in x["ocr"]}, "pred": {p["id"]: p for p in x["preds"]}, "score": {r["id"]: r for r in x["score"]},
                   "design": {im["id"]: im for im in images}, "mine": {r["id"]: r for r in my_rows}}
        for n, c in enumerate(cases):
            for key, mine, recorded in check_case(c, sources):
                rep.bad(C7, "case %d %s %s" % (n, c.get("id"), key), mine, recorded)
    return my_rows, s


CASES_BLOCK = re.compile(r"<!-- khc:cases\n([\s\S]*?)\n-->")


def read_cases(markdown):
    m = CASES_BLOCK.findall(markdown.replace("\r\n", "\n"))
    if len(m) > 1:
        raise ValueError("more than one khc:cases block")
    return json.loads(m[0]) if m else []


def get_path(obj, path):
    for part in path.split("."):
        if isinstance(obj, list):
            obj = obj[int(part)]
        else:
            obj = obj[part]
    return obj


def check_case(c, src):
    """One described case: kind ocr_words (word texts and boxes of one OCR line), ocr_line (all word texts of one line),
    pred / score / design (a field path in the recorded prediction, score row or design page). Returns the mismatches."""
    out = []
    pid, kind = c.get("id"), c.get("kind")
    try:
        if kind in ("ocr_words", "ocr_line"):
            words = src["ocr"][pid]["ocrLines"][c["line"]]["words"]
            if kind == "ocr_line":
                got = [w["text"] for w in words]
                if got != c["texts"]:
                    out.append(("line %d texts" % c["line"], c["texts"], got))
            else:
                for j, w in enumerate(c["words"]):
                    if words[w]["text"] != c["texts"][j]:
                        out.append(("word %d text" % w, c["texts"][j], words[w]["text"]))
                    if "boxes" in c and not same(words[w]["box"], c["boxes"][j]):
                        out.append(("word %d box" % w, c["boxes"][j], words[w]["box"]))
        elif kind in ("pred", "score", "design"):
            got = get_path(src[kind][pid], c["path"])
            if not same(got, c["value"]):
                out.append((kind + "." + c["path"], c["value"], got))
            if kind == "score" and not same(get_path(src["mine"][pid], c["path"]), c["value"]):
                out.append(("recomputed score." + c["path"], c["value"], get_path(src["mine"][pid], c["path"])))
        else:
            out.append(("kind", "ocr_words|ocr_line|pred|score|design", kind))
    except (KeyError, IndexError, TypeError, ValueError) as e:
        out.append(("lookup", None, repr(e)))
    return out


def mutate(args, x):
    """Tamper in-memory copies of the recorded files (RECOUNT_SPEC 9) and run the whole recount on each; every tamper must fail it."""
    out = {}

    def run(name, x2, note=None):
        rep = Report()
        try:
            recount(args, x2, rep)
        except ValidationError as e:
            out[name] = {"rejected": True, "how": "ValidationError: " + str(e)[:300]}
        except (KeyError, IndexError, TypeError, ValueError, StopIteration) as e:
            out[name] = {"rejected": True, "how": "input error: %r" % (e,)}
        else:
            failed = {k: c["mismatches"][:3] for k, c in rep.checks.items() if not c["ok"]}
            out[name] = {"rejected": bool(failed), "how": "recount check failed", "failed": failed}
        if note:
            out[name]["note"] = note

    def na(name, why):
        out[name] = {"notApplicable": why}
    rows, preds = x["score"], x["preds"]

    def first_pair(xs, f):
        return next(((i, j) for i in range(len(xs)) for j in range(i + 1, len(xs)) if f(xs[i]) != f(xs[j])), None)
    # 1 swap t14
    pair = first_pair(rows, lambda r: r["t14"])
    if pair:
        x2 = copy.deepcopy(x)
        i, j = pair
        x2["score"][i]["t14"], x2["score"][j]["t14"] = rows[j]["t14"], rows[i]["t14"]
        run("swapT14", x2, "t14 of %s and %s swapped (totals kept)" % (rows[i]["id"], rows[j]["id"]))
    else:
        na("swapT14", "every page has the same t14")
    # 2 swap w4Reason
    pair = first_pair(preds, lambda p: p["w4Reason"])
    if pair:
        x2 = copy.deepcopy(x)
        i, j = pair
        x2["preds"][i]["w4Reason"], x2["preds"][j]["w4Reason"] = preds[j]["w4Reason"], preds[i]["w4Reason"]
        run("swapW4Reason", x2, "w4Reason of %s and %s swapped" % (preds[i]["id"], preds[j]["id"]))
    else:
        na("swapW4Reason", "every page has the same w4Reason")
    # 3 assignment column, 4 target count, 5 header target group
    a = next((i for i, p in enumerate(preds) if p.get("w4Diag") and p["w4Diag"].get("assign")), None)
    if a is not None:
        x2 = copy.deepcopy(x)
        col = preds[a]["w4Diag"]["assign"][0]["column"]
        x2["preds"][a]["w4Diag"]["assign"][0]["column"] = "comp" if col == "target" else "target"
        run("assignColumnChanged", x2, "w4Diag.assign[0].column of %s: %s changed" % (preds[a]["id"], col))
        x2 = copy.deepcopy(x)
        x2["preds"][a]["w4Diag"]["counts"]["target"] += 1
        run("countsTargetPlusOne", x2, "w4Diag.counts.target + 1 on " + preds[a]["id"])
    else:
        na("assignColumnChanged", "no prediction has a column assignment")
        na("countsTargetPlusOne", "no prediction has a column assignment")
    hdr = next((i for i, p in enumerate(preds) if p.get("w4Diag") and p["w4Diag"].get("header") and p["w4Diag"]["header"]["target"] is not None), None)
    if hdr is not None:
        x2 = copy.deepcopy(x)
        h = x2["preds"][hdr]["w4Diag"]["header"]
        h["target"], h["comp"] = h["comp"], h["target"]
        run("headerTargetSwapped", x2, "w4Diag.header target/comp of %s swapped" % preds[hdr]["id"])
    else:
        na("headerTargetSwapped", "no prediction selected a target header")
    # 6 header group word index
    gw = next(((i, li, gi) for i, p in enumerate(preds) if p.get("w4Diag") and p["w4Diag"].get("lines")
               for li, ln in enumerate(p["w4Diag"]["lines"]) if ln["groups"] for gi in range(len(ln["groups"]))), None)
    if gw is not None:
        x2 = copy.deepcopy(x)
        i, li, gi = gw
        x2["preds"][i]["w4Diag"]["lines"][li]["groups"][gi]["words"][0] += 1
        run("headerGroupWordChanged", x2, "group word index + 1 on %s line entry %d group %d" % (preds[i]["id"], li, gi))
    else:
        na("headerGroupWordChanged", "no eligible header line was grouped")
    # 7 prediction W4 1 px
    m = next((i for i, p in enumerate(preds) if p["state"] == "matched"), None)
    if m is not None:
        x2 = copy.deepcopy(x)
        x2["preds"][m]["w4"]["top"] += 1
        run("predictionW4TopPlusOne", x2, "W4 top + 1 px on " + preds[m]["id"])
    else:
        na("predictionW4TopPlusOne", "no matched page")
    # 8 opportunity flip
    x2 = copy.deepcopy(x)
    x2["score"][0]["opportunity"] = not rows[0]["opportunity"]
    run("opportunityFlipped", x2, "opportunity of %s flipped" % rows[0]["id"])
    # 9 exposure
    e = next((i for i, r in enumerate(rows) if r.get("exposure")), None)
    if e is not None:
        x2 = copy.deepcopy(x)
        v = rows[e]["exposure"]["w4"]["targetHeader"]
        x2["score"][e]["exposure"]["w4"]["targetHeader"] = "partial" if v != "partial" else "none"
        run("exposureW4TargetHeaderChanged", x2, "%s exposure.w4.targetHeader %s changed" % (rows[e]["id"], v))
    else:
        na("exposureW4TargetHeaderChanged", "no matched page")
    # 10 reading event
    rd = next((i for i, r in enumerate(rows) if r.get("reading")), None)
    if rd is not None:
        x2 = copy.deepcopy(x)
        x2["score"][rd]["reading"]["e1"]["w4"] = not rows[rd]["reading"]["e1"]["w4"]
        run("readingE1W4Flipped", x2, "reading.e1.w4 of %s flipped" % rows[rd]["id"])
    else:
        na("readingE1W4Flipped", "no matched normal-header page")
    # 11 attribution class
    at = next((i for i, r in enumerate(rows) if r.get("attribution")), None)
    if at is not None:
        x2 = copy.deepcopy(x)
        c = rows[at]["attribution"]["header"]["class"]
        x2["score"][at]["attribution"]["header"]["class"] = "comp_header" if c == "target_header" else "target_header"
        run("attributionHeaderClassChanged", x2, "attribution.header.class of %s: %s changed" % (rows[at]["id"], c))
    else:
        na("attributionHeaderClassChanged", "no applied page")
    # 12, 13 ids
    x2 = copy.deepcopy(x)
    x2["score"][1]["id"] = x2["score"][0]["id"]
    run("duplicateId", x2)
    x2 = copy.deepcopy(x)
    x2["preds"] = x2["preds"][:-1]
    run("missingId", x2)
    # 14 gold 1 px
    x2 = copy.deepcopy(x)
    first = sorted(im["id"] for im in x["design"]["images"])[0]
    x2["gold"][first]["parts"][1]["rect"][3] += 1
    x2["gold"][first]["parts"][1]["size"][1] += 1
    run("goldValueBottomPlusOne", x2, "answer box of %s moved by 1 px" % first)
    # 15 K1 hitWords
    k1i = next((i for i, k in enumerate(x["k1"]) if isinstance(k["k1"].get("hitWords"), list) and k["k1"]["hitWords"]), None)
    if k1i is not None:
        x2 = copy.deepcopy(x)
        hw = x2["k1"][k1i]["k1"]["hitWords"]
        x2["k1"][k1i]["k1"]["hitWords"] = hw[:-1] if len(hw) > 1 else hw + [hw[0]]
        run("k1HitWordsChanged", x2, "selection record of " + x["k1"][k1i]["id"])
    else:
        na("k1HitWordsChanged", "no K1 record has hit words")
    # 16 public table cell
    if x["results"] is not None:
        x2 = copy.deepcopy(x)
        x2["results"] = x["results"].replace("| 전체 | 144 |", "| 전체 | 143 |", 1)
        if x2["results"] != x["results"]:
            run("publicTableCell", x2, "groups table: total n 144 -> 143")
        else:
            na("publicTableCell", "groups total row not found")
    else:
        na("publicTableCell", "no --results given")
    # 17 area numerator
    ar = x["summary"]["groups"]["total"]["area"]["w4"]
    if ar is not None:
        x2 = copy.deepcopy(x)
        x2["summary"]["groups"]["total"]["area"]["w4"]["num"] = str(int(ar["num"]) + 1)
        run("areaW4NumeratorPlusOne", x2, "summary total area.w4.num + 1")
    else:
        na("areaW4NumeratorPlusOne", "no matched page")
    # 18 verdict code
    x2 = copy.deepcopy(x)
    fin = x["summary"]["verdict"]["final"]
    x2["summary"]["verdict"]["final"] = "followup_possible" if fin != "followup_possible" else "both_unfavorable"
    run("verdictFinalChanged", x2, "verdict.final %s changed" % fin)
    # 19 (added after the results, not in RECOUNT_SPEC 9): one OCR word text in the case block of RESULTS.md
    if x["results"] is not None and read_cases(x["results"]):
        cases = read_cases(x["results"])
        k = next((i for i, c in enumerate(cases) if c.get("kind") == "ocr_words"), None)
        if k is not None:
            cases[k]["texts"][0] = cases[k]["texts"][0] + "X"
            x2 = copy.deepcopy(x)
            x2["results"] = CASES_BLOCK.sub(lambda m: "<!-- khc:cases\n" + json.dumps(cases, ensure_ascii=False, indent=1) + "\n-->", x["results"], count=1)
            run("caseTokenChanged", x2, "case %d (%s): first word text changed in the RESULTS.md case block" % (k, cases[k]["id"]))
        else:
            na("caseTokenChanged", "no ocr_words case")
    else:
        na("caseTokenChanged", "no --results or no case block")
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
            f.write(json.dumps({"version": "ko-header-column-mutation-1", "allRejected": ok, "tampers": res}, ensure_ascii=False, indent=1) + "\n")
        print(json.dumps({"allRejected": ok, "tampers": len(res), "notApplicable": [k for k, v in res.items() if "notApplicable" in v]}))
        return 0 if ok else 1
    rep = Report()
    try:
        rows, s = recount(args, x, rep)
    except ValidationError as e:
        rep.bad("validation", "abort", str(e))
        rows, s = None, None
    result = {"version": "ko-header-column-recount-1", "ok": rep.ok(), "checks": rep.checks,
              "stages": s["stages"] if s else None, "total": s["groups"]["total"] if s else None, "lists": s["lists"] if s else None,
              "invariants": s["invariants"] if s else None, "verdict": s["verdict"] if s else None}
    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(result, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"ok": result["ok"], "failed": [k for k, c in rep.checks.items() if not c["ok"]]}))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
