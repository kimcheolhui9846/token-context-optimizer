#!/usr/bin/env python3
"""Independent recount verifier for the ko-ocr-factorial experiment.

Implemented only from RECOUNT_SPEC.md, the protocol and the fixed selector
(research/src/selector.mjs).  Standard library only.

Exit codes: 0 = every comparison matched, 1 = at least one mismatch,
2 = an input could not be read.
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
from decimal import Decimal
from functools import reduce

HERE = os.path.dirname(os.path.abspath(__file__))
RESEARCH = os.path.abspath(os.path.join(HERE, "..", ".."))

COHORT_SHA = "86ccac534bacaeb6b4ca463fe7f5de41a5b33f68cc534f2002c417e35e6b2eb3"
REPLAY_FILE_SHA = "9510835d4120cf181e3b879bf965446f6b01f8248102e55623f8a02c3b110204"
C_R09 = "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1"
C_FCP = "708d9946ae091180a1b716baadfdd73fcfe5a19b"
C_REPLAY = "cdff545c3eb31bee3099ec4a62cb7b637975b4c7"
LANG_FILES = [
    ("eng", "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747", 5199098),
    ("kor", "ec1749377d49ac38fb3d3cd05dd5e2a53359d329f359762bc638a81132109992", 2208378),
]

R09P = "research/results/r09-bilingual/heldout/"
FCPP = "research/results/fresh-crop-padding/"
FIXED = {
    "r09.questions": (C_R09, R09P + "questions.json", "605ff760cc1c12de0a0d21076ac0b8eecb79032a", "blob"),
    "r09.images": (C_R09, R09P + "images", "66bf13c62c6ae10e380558b7add188747928352b", "tree"),
    "r09.design": (C_R09, R09P + "design.json", "dc3307818cba423b3fc2eade8ed7f2116593f788", "blob"),
    "r09.gold": (C_R09, R09P + "gold.json", "5d6c277d4c9cd55e4a101252fce8032294a21ae9", "blob"),
    "r09.past": (C_R09, R09P + "run-a/raw.jsonl", "876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318", "blob"),
    "fcp.questions": (C_FCP, FCPP + "frozen/selector-input/questions.json", "ae578b7267ff124ecf4a0a5157f7067925b177ca", "blob"),
    "fcp.images": (C_FCP, FCPP + "frozen/selector-input/images", "84eb5dddb4bb37f0ff1bf62e82e523f77e7dbbca", "tree"),
    "fcp.index": (C_FCP, FCPP + "frozen/selector-input/index.json", "75109569a3c310127f4dbe4d8551c259aa537cba", "blob"),
    "fcp.gold": (C_FCP, FCPP + "frozen/oracle/gold.json", "eb43d6009cc77b0d86bfb9275ff891477db3d25f", "blob"),
    "fcp.past": (C_FCP, FCPP + "run-a/caller.jsonl", "d657d59d7124f68743a1e54a7eb7c62f521dbc21", "blob"),
    "replay": (C_REPLAY, "research/results/ko-anchor-diagnostic/replay.jsonl", "3f0564c2a1988d70de7ed308c2cab80a2dc7e686", "blob"),
    "selector": (C_R09, "research/src/selector.mjs", "b3b4965b2d330907c0143fe178013aace1be8372", "blob"),
}
DATASETS = ("r09", "fcp")
CONDS = ("O0K0", "O0K1", "O1K0", "O1K1")
PAIRS = (("O0K0", "O0K1"), ("O1K0", "O1K1"), ("O0K0", "O1K0"), ("O0K1", "O1K1"), ("O0K0", "O1K1"))
KR_FIELDS = ("status", "error", "branch", "keys", "hangulKeys", "matched", "score", "lineIndex",
             "lineText", "confidence", "axisRow", "lineBox", "anchor", "hitWords", "band")
ROW_FIELDS = ("ocr", "dataset", "id", "pngSha256", "width", "height", "status", "error",
              "ocrSha256", "ocrLineCount", "k0", "k1")
SCORE_FIELDS = ("cond", "dataset", "id", "cell", "cohort", "baselineMatched", "baselineStrict",
                "baselineEvidence", "branch", "state", "matched", "fallback", "strict", "evidence",
                "fullPage", "error")
OCR_ALIASES = {"O0": ("O0", "eng"), "O1": ("O1", "eng+kor")}
HIST_DIFF_FIELDS = ("keys", "matched", "score", "lineText", "confidence", "axisRow", "band")


class InputError(Exception):
    """An input could not be read (exit 2)."""


# --------------------------------------------------------------------------
# JS semantics helpers
# --------------------------------------------------------------------------
def js_round(x):
    """Math.round: x.5 rounds toward +infinity."""
    r = math.floor(x)
    return r + 1 if x - r >= 0.5 else r


def pct(c, n):
    if n is None or not n > 0:
        return None
    return js_round(c * 10000 / n) / 100


def js_num(x):
    """Number -> string exactly like JS Number.prototype.toString."""
    if isinstance(x, bool):
        raise TypeError("bool")
    if isinstance(x, int):
        return str(x)
    if x != x or x in (float("inf"), float("-inf")):
        return "null"
    if x == 0:
        return "0"
    sign = "-" if x < 0 else ""
    dec = Decimal(repr(abs(x)))
    _, digs, exp = dec.as_tuple()
    s = "".join(map(str, digs)).rstrip("0")
    # value = 0.s * 10^n
    n = len(digs) + exp
    k = len(s)
    if k <= n <= 21:
        body = s + "0" * (n - k)
    elif 0 < n <= 21:
        body = s[:n] + "." + s[n:]
    elif -6 < n <= 0:
        body = "0." + "0" * (-n) + s
    else:
        e = n - 1
        es = ("+" if e >= 0 else "-") + str(abs(e))
        body = (s[0] if k == 1 else s[0] + "." + s[1:]) + "e" + es
    return sign + body


def js_stringify(v):
    """JSON.stringify without whitespace for parsed JSON values."""
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, (int, float)):
        return js_num(v)
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, list):
        return "[" + ",".join(js_stringify(i) for i in v) + "]"
    if isinstance(v, dict):
        return "{" + ",".join(json.dumps(k, ensure_ascii=False) + ":" + js_stringify(x) for k, x in v.items()) + "}"
    raise TypeError(type(v))


def sha256(b):
    return hashlib.sha256(b).hexdigest()


def len16(s):
    return len(s.encode("utf-16-le", "surrogatepass")) // 2


# --------------------------------------------------------------------------
# Fixed selector port (selector.mjs: tokens, keywords, score, selectWindow)
# --------------------------------------------------------------------------
STOP = set("what which when where who how much many the and for are was were with from that this into onto shown show written according answer number value label labeled labelled noted under screen image chart line card item bottom top next turned does there their your have has".split(" "))
YESNO = {"off", "yes"}
_NONKEY = re.compile(r"[^a-z0-9\- ]")


def tokens(s):
    return _NONKEY.sub(" ", s.lower()).split()


def keywords(question):
    out = []
    for t in tokens(question):
        if len(t) >= 3 and t not in STOP and t not in out:
            out.append(t)
    return out


def line_score(line, keys):
    words = tokens(line["text"])
    n = 0
    for k in keys:
        for w in words:
            if w == k or (len(k) >= 4 and (w.startswith(k) or k.startswith(w)) and len(w) >= 4):
                n += 1
                break
    return n


def union_box(a, b):
    return [min(a[0], b[0]), min(a[1], b[1]),
            max(a[0] + a[2], b[0] + b[2]) - min(a[0], b[0]),
            max(a[1] + a[3], b[1] + b[3]) - min(a[1], b[1])]


def window_for(line, anchor, W, H):
    """Shared geometry of selectWindow (and of K1's hangul branch)."""
    lb = line["box"]
    words = line["words"]
    lh = max(8, lb[3])
    mean_len = sum(len16(w["text"]) for w in words) / max(1, len(words))
    axis = len(words) >= 8 and mean_len <= 4 and anchor[2] < 0.25 * lb[2]
    if axis:
        half = max(1.5 * anchor[2], 3 * lh)
        cx = anchor[0] + anchor[2] / 2
        x0, x1 = cx - half, cx + half
        y0, y1 = anchor[1] - 0.75 * H, anchor[1] + anchor[3] + 6 * lh
    else:
        x0, x1 = min(anchor[0], lb[0]) - 4 * lh, lb[0] + lb[2] + 8 * lh
        y0, y1 = lb[1] - 3 * lh, lb[1] + lb[3] + 6 * lh

    def grow(a, b, mn):
        need = mn - (b - a)
        return (a - need / 2, b + need / 2) if need > 0 else (a, b)

    x0, x1 = grow(x0, x1, 256)
    y0, y1 = grow(y0, y1, 128)
    left, top = max(0, math.floor(x0)), max(0, math.floor(y0))
    right, bottom = min(W, math.ceil(x1)), min(H, math.ceil(y1))
    return axis, {"left": left, "top": top, "width": right - left, "height": bottom - top}


def select_window(lines, question, W, H):
    keys = [k for k in keywords(question) if k not in YESNO]

    def match_word(w):
        tk = tokens(w)
        t = tk[0] if tk else ""
        return any(t == k or (len(k) >= 4 and len(t) >= 4 and (t.startswith(k) or k.startswith(t))) for k in keys)

    best = None
    for line in lines:
        sc = line_score(line, keys)
        if sc > 0 and (best is None or sc > best[0] or (sc == best[0] and line["confidence"] > best[1]["confidence"])):
            best = (sc, line)
    if best is None:
        return {"matched": False, "keys": keys}
    line = best[1]
    hits = [w for w in line["words"] if match_word(w["text"])]
    anchor = reduce(union_box, [w["box"] for w in hits]) if hits else line["box"]
    axis, band = window_for(line, anchor, W, H)
    return {"matched": True, "keys": keys, "score": best[0], "lineText": line["text"],
            "confidence": js_round(line["confidence"]), "axisRow": axis, "band": band}


# --------------------------------------------------------------------------
# K1 (protocol 4.2)
# --------------------------------------------------------------------------
_HANGUL = re.compile("[가-힣]+")


def bigrams(s):
    out = set()
    for run in _HANGUL.findall(unicodedata.normalize("NFC", s)):
        for i in range(len(run) - 1):
            out.add(run[i:i + 2])
    return out


def validate_lines(lines):
    """Return None if valid, else a reason (protocol 4.2 input validation)."""
    def fin(x):
        return isinstance(x, (int, float)) and not isinstance(x, bool) and math.isfinite(x)

    def box_ok(b):
        return isinstance(b, list) and len(b) == 4 and all(fin(v) for v in b)

    if not isinstance(lines, list):
        return "ocrLines is not an array"
    for i, l in enumerate(lines):
        if not isinstance(l, dict):
            return "line %d is not an object" % i
        if not isinstance(l.get("text"), str):
            return "line %d text" % i
        if not fin(l.get("confidence")):
            return "line %d confidence" % i
        if not box_ok(l.get("box")):
            return "line %d box" % i
        if not isinstance(l.get("words"), list):
            return "line %d words" % i
        for j, w in enumerate(l["words"]):
            if not isinstance(w, dict) or not isinstance(w.get("text"), str) or not box_ok(w.get("box")):
                return "line %d word %d" % (i, j)
    return None


def window_ok(band, W, H):
    vals = [band.get(k) for k in ("left", "top", "width", "height")]
    if not all(isinstance(v, int) and not isinstance(v, bool) for v in vals):
        return False
    l, t, w, h = vals
    return w > 0 and h > 0 and l >= 0 and t >= 0 and l + w <= W and t + h <= H


def _err(msg):
    return {"status": "error", "errorPrefix": msg, "exact": False}


def k0_result(lines, question, W, H):
    sel = select_window(lines, question, W, H)
    if not sel["matched"]:
        return {"status": "ok", "error": None, "branch": "k0", "keys": sel["keys"], "hangulKeys": None,
                "matched": False, "score": 0, "lineIndex": None, "lineText": None, "confidence": None,
                "axisRow": None, "lineBox": None, "anchor": None, "hitWords": None, "band": None}
    keys = sel["keys"]
    best_i, best_s = None, None
    for i, line in enumerate(lines):
        s = line_score(line, keys)
        if best_i is None or s > best_s or (s == best_s and line["confidence"] > lines[best_i]["confidence"]):
            best_i, best_s = i, s
    if lines[best_i]["text"] != sel["lineText"]:
        return _err("invalid_output: lineText")
    if not window_ok(sel["band"], W, H):
        return _err("invalid_output: window")
    return {"status": "ok", "error": None, "branch": "k0", "keys": keys, "hangulKeys": None,
            "matched": True, "score": sel["score"], "lineIndex": best_i, "lineText": sel["lineText"],
            "confidence": sel["confidence"], "axisRow": sel["axisRow"], "lineBox": lines[best_i]["box"],
            "anchor": None, "hitWords": None, "band": sel["band"]}


def k1_result(lines, question, W, H, k0):
    if k0["status"] != "ok":
        return {"status": "error", "errorPrefix": "k0: " + k0["errorPrefix"], "exact": False, "branch": "k0"}
    q = bigrams(question)
    hk = sorted(q)
    if k0["matched"]:
        r = dict(k0)
        r["hangulKeys"] = hk
        return r
    none = {"status": "ok", "error": None, "branch": "none", "keys": k0["keys"], "hangulKeys": hk,
            "matched": False, "score": 0, "lineIndex": None, "lineText": None, "confidence": None,
            "axisRow": None, "lineBox": None, "anchor": None, "hitWords": None, "band": None}
    if not q:
        return none
    best_i, best_s = None, 0
    for i, line in enumerate(lines):
        u = set()
        for w in line["words"]:
            u |= bigrams(w["text"])
        s = len(q & u)
        if s > 0 and (best_i is None or s > best_s or (s == best_s and line["confidence"] > lines[best_i]["confidence"])):
            best_i, best_s = i, s
    if best_i is None:
        return none
    line = lines[best_i]
    hit_idx = [j for j, w in enumerate(line["words"]) if bigrams(w["text"]) & q]
    anchor = reduce(union_box, [line["words"][j]["box"] for j in hit_idx])
    axis, band = window_for(line, anchor, W, H)
    if not window_ok(band, W, H):
        return {"status": "error", "errorPrefix": "invalid_output: window", "exact": False, "branch": "hangul"}
    return {"status": "ok", "error": None, "branch": "hangul", "keys": k0["keys"], "hangulKeys": hk,
            "matched": True, "score": best_s, "lineIndex": best_i, "lineText": line["text"],
            "confidence": js_round(line["confidence"]), "axisRow": axis, "lineBox": line["box"],
            "anchor": anchor, "hitWords": hit_idx, "band": band}


def expected_keyresults(lines, question, W, H):
    """Return (kind, k0, k1); kind in ok / input_validation / invalid_output."""
    reason = validate_lines(lines)
    if reason is not None:
        e = {"status": "error", "errorPrefix": "input_validation", "exact": True}
        return "input_validation:" + reason, e, dict(e)
    k0 = k0_result(lines, question, W, H)
    k1 = k1_result(lines, question, W, H, k0)
    kind = "ok" if (k0["status"] == "ok" and k1["status"] == "ok") else "invalid_output"
    return kind, k0, k1


# --------------------------------------------------------------------------
# Judging (protocol 6.1)
# --------------------------------------------------------------------------
def judge_band(band, parts, W, H):
    """Return (n_contained, strict, evidence, fullPage) for a matched window."""
    left, top, w, h = band["left"], band["top"], band["width"], band["height"]
    n = 0
    for p in parts:
        l, t, r, b = p["rect"]
        if l >= left and t >= top and r <= left + w and b <= top + h:
            n += 1
    evidence = "all" if n == 2 else ("partial" if n == 1 else "none")
    area = w * h
    return evidence, (0 < area < W * H and evidence == "all"), area >= W * H


def judge_baseline(past, parts, W, H):
    if past is None or past.get("status") != "ok" or not past.get("matched"):
        return False, None
    ev, strict, _ = judge_band(past["band"], parts, W, H)
    return strict, ev


def judge_row(row, kr, parts, W, H):
    if kr.get("status") != "ok" or row.get("status") != "ok":
        return {"state": "technical_error", "matched": None, "fallback": None, "strict": False,
                "evidence": None, "fullPage": None}
    if not kr.get("matched"):
        return {"state": "unmatched", "matched": False, "fallback": True, "strict": False,
                "evidence": None, "fullPage": None}
    ev, strict, full = judge_band(kr["band"], parts, W, H)
    return {"state": "matched_strict" if strict else "matched_not_strict", "matched": True,
            "fallback": False, "strict": strict, "evidence": ev, "fullPage": full}


# --------------------------------------------------------------------------
# Git access
# --------------------------------------------------------------------------
_TOP = None
_GIT_CACHE = {}


def toplevel():
    global _TOP
    if _TOP is None:
        p = subprocess.run(["git", "rev-parse", "--show-toplevel"], cwd=HERE, capture_output=True)
        if p.returncode != 0:
            raise InputError("git toplevel: " + p.stderr.decode("utf-8", "replace"))
        _TOP = p.stdout.decode().strip()
    return _TOP


def git(*args):
    key = args
    if key in _GIT_CACHE:
        return _GIT_CACHE[key]
    p = subprocess.run(["git", *args], cwd=toplevel(), capture_output=True)
    if p.returncode != 0:
        raise InputError("git %s: %s" % (" ".join(args), p.stderr.decode("utf-8", "replace").strip()))
    _GIT_CACHE[key] = p.stdout
    return p.stdout


def ensure_commits():
    missing = []
    for c in (C_FCP, C_REPLAY):
        p = subprocess.run(["git", "cat-file", "-t", c], cwd=toplevel(), capture_output=True)
        if p.returncode != 0:
            missing.append(c)
    if missing:
        subprocess.run(["git", "fetch", "origin", "pull/145/head", "pull/146/head"], cwd=toplevel(), capture_output=True)


def git_blob_id(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def read_fixed(label, chk):
    commit, path, want, kind = FIXED[label]
    got = git("rev-parse", "%s:%s" % (commit, path)).decode().strip()
    if got != want:
        chk.fail("%s: id %s != registered %s" % (label, got, want))
    if kind == "blob":
        data = git("cat-file", "blob", got)
        if git_blob_id(data) != got:
            chk.fail("%s: recomputed blob id differs" % label)
        return data
    entries = {}
    for rec in git("ls-tree", "--full-tree", "-z", got).split(b"\0"):
        if not rec:
            continue
        meta, name = rec.split(b"\t", 1)
        entries[name.decode("utf-8")] = meta.split()[2].decode()
    return entries


def parse_jsonl(data, what, chk=None):
    if b"\r" in data or (data and not data.endswith(b"\n")):
        if chk is not None:
            chk.fail("%s: not LF-terminated UTF-8 lines" % what)
    rows = []
    try:
        for i, ln in enumerate(data.decode("utf-8").split("\n")):
            if ln.strip():
                rows.append(json.loads(ln))
    except (ValueError, UnicodeDecodeError) as e:
        raise InputError("%s: unparsable (%s)" % (what, e))
    return rows


# --------------------------------------------------------------------------
# Check bookkeeping
# --------------------------------------------------------------------------
class Check:
    def __init__(self, name):
        self.name = name
        self.failures = 0
        self.mismatches = []
        self.compared = 0

    def fail(self, msg):
        self.failures += 1
        if len(self.mismatches) < 20:
            self.mismatches.append(msg)

    @property
    def ok(self):
        return self.failures == 0

    def as_dict(self):
        return {"ok": self.ok, "compared": self.compared, "failures": self.failures,
                "mismatches": self.mismatches}


def _isnum(x):
    return isinstance(x, (int, float)) and not isinstance(x, bool)


def diff_values(e, a, path, chk):
    """Deep compare parsed values (bool != number, int == float by value)."""
    chk.compared += 1
    if _isnum(e) and _isnum(a):
        if e != a:
            chk.fail("%s: expected %r got %r" % (path, e, a))
        return
    if type(e) is not type(a):
        chk.fail("%s: expected %r got %r" % (path, e, a))
        return
    if isinstance(e, dict):
        for k in e:
            if k not in a:
                chk.fail("%s.%s: missing" % (path, k))
            else:
                diff_values(e[k], a[k], "%s.%s" % (path, k), chk)
        for k in a:
            if k not in e:
                chk.fail("%s.%s: unexpected key" % (path, k))
    elif isinstance(e, list):
        if len(e) != len(a):
            chk.fail("%s: length %d != %d" % (path, len(e), len(a)))
            return
        for i, (x, y) in enumerate(zip(e, a)):
            diff_values(x, y, "%s[%d]" % (path, i), chk)
    elif e != a:
        chk.fail("%s: expected %r got %r" % (path, e, a))


# --------------------------------------------------------------------------
# Inputs
# --------------------------------------------------------------------------
_INPUTS_CACHE = {}


def load_inputs(cohort_path, checks):
    key = os.path.abspath(cohort_path)
    ck_git = checks["git_objects"]
    ck_cohort = checks["cohort"]
    ensure_commits()

    raw = {k: read_fixed(k, ck_git) for k in FIXED}

    # cohort
    try:
        with open(cohort_path, "rb") as f:
            cdata = f.read()
    except OSError as e:
        raise InputError("cohort: %s" % e)
    cnorm = cdata.replace(b"\r\n", b"\n")
    if sha256(cnorm) != COHORT_SHA:
        ck_cohort.fail("cohort sha256(LF) %s != registered" % sha256(cnorm))
    cohort = parse_jsonl(cnorm, "cohort")
    if len(cohort) != 96:
        ck_cohort.fail("cohort rows %d != 96" % len(cohort))
    rewritten = "".join(js_stringify(r) + "\n" for r in cohort).encode("utf-8")
    cohort_sha = sha256(rewritten)

    replay_data = raw["replay"]
    if sha256(replay_data) != REPLAY_FILE_SHA:
        ck_git.fail("replay file sha256 differs")
    replay = parse_jsonl(replay_data, "replay")
    if len(replay) != len(cohort):
        ck_cohort.fail("replay rows %d != cohort rows %d" % (len(replay), len(cohort)))
    for i, (c, r) in enumerate(zip(cohort, replay)):
        ck_cohort.compared += 1
        if (c.get("dataset"), c.get("id"), c.get("baselineMatched")) != (r.get("dataset"), r.get("id"), r.get("matched")):
            ck_cohort.fail("cohort row %d differs from #146 replay" % i)
        if r.get("status") != "ok" or r.get("ok") is not True:
            ck_cohort.fail("replay row %d not ok" % i)

    # questions / classification / gold / past
    questions, klass, gold, past, png = {}, {}, {}, {}, {}
    for ds in DATASETS:
        qs = json.loads(raw[ds + ".questions"])["questions"]
        questions[ds] = qs
        cls = json.loads(raw["r09.design" if ds == "r09" else "fcp.index"])["images"]
        for im in cls:
            klass[(ds, im["id"])] = im
        gj = json.loads(raw[ds + ".gold"])["gold"]
        for i, g in gj.items():
            parts = g.get("parts", [])
            if len(parts) != 2:
                raise InputError("gold %s/%s: %d parts" % (ds, i, len(parts)))
            for p in parts:
                l, t, r, b = p["rect"]
                if p.get("size") != [r - l, b - t]:
                    ck_git.fail("gold %s/%s size != rect" % (ds, i))
            gold[(ds, i)] = parts
        for row in parse_jsonl(raw[ds + ".past"], ds + " past"):
            past[(ds, row["id"])] = row
        tree = raw[ds + ".images"]
        for q in qs:
            name = q["file"]
            if name not in tree:
                raise InputError("png %s missing in tree" % name)
            data = git("cat-file", "blob", tree[name])
            if git_blob_id(data) != tree[name]:
                ck_git.fail("png %s blob id mismatch" % name)
            if data[:8] != b"\x89PNG\r\n\x1a\n":
                raise InputError("not a png: %s" % name)
            w, h = int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
            png[(ds, q["id"])] = {"sha": sha256(data), "w": w, "h": h}
            if ds == "fcp":
                if klass[(ds, q["id"])].get("sha256") != sha256(data):
                    ck_git.fail("fcp index sha256 != png bytes for %s" % q["id"])
            pg = klass[(ds, q["id"])]["page"]
            if (pg["width"], pg["height"]) != (w, h):
                ck_git.fail("png IHDR size != classification page for %s/%s" % (ds, q["id"]))

    # cohort order vs question order, primary == KO/nl
    for ds in DATASETS:
        ids_c = [c["id"] for c in cohort if c["dataset"] == ds]
        ids_q = [q["id"] for q in questions[ds]]
        ck_cohort.compared += 1
        if ids_c != ids_q:
            ck_cohort.fail("%s: cohort ids differ from question order" % ds)
    prim = sorted((c["dataset"], c["id"]) for c in cohort if not c["baselineMatched"])
    ko_nl = sorted(k for k, v in klass.items() if v["lang"] == "ko" and v["anchor"] == "nl")
    ck_cohort.compared += 1
    if prim != ko_nl:
        ck_cohort.fail("primary cohort != KO/nl pages of classification")

    return {"cohort": cohort, "cohortSha": cohort_sha, "questions": questions, "klass": klass,
            "gold": gold, "past": past, "png": png,
            "qtext": {(ds, q["id"]): q["question"] for ds in DATASETS for q in questions[ds]}}


# --------------------------------------------------------------------------
# Expected artifacts
# --------------------------------------------------------------------------
def norm_ocr(v):
    for k, al in OCR_ALIASES.items():
        if v in al:
            return k
    return None


def expected_pred(ocond, ds, pid, inp, ocr_row):
    """Return (row_dict_expected, kind). Error-type key results use errorPrefix dicts."""
    page = inp["klass"][(ds, pid)]["page"]
    W, H = page["width"], page["height"]
    png = inp["png"][(ds, pid)]
    lines = ocr_row.get("ocrLines")
    row = {"ocr": ocond, "dataset": ds, "id": pid, "pngSha256": png["sha"], "width": W, "height": H}
    if ocr_row.get("status") != "ok" or lines is None:
        row.update({"status": "error", "ocrSha256": None, "ocrLineCount": None})
        e = {"status": "error", "errorPrefix": "", "exact": False}
        row["error"] = {"nonEmpty": True}
        row["k0"], row["k1"] = e, dict(e)
        return row, "ocr_error"
    kind, k0, k1 = expected_keyresults(lines, inp["qtext"][(ds, pid)], W, H)
    try:
        row["ocrSha256"] = sha256(js_stringify(lines).encode("utf-8"))
        row["ocrLineCount"] = len(lines)
    except (TypeError, UnicodeEncodeError, AttributeError):
        row["ocrSha256"] = row["ocrLineCount"] = "ANY"
    if kind.startswith("input_validation"):
        row["status"] = "error"
        row["error"] = {"prefix": "input_validation: "}
        row["ocrSha256"] = "ANY"  # spec is silent for input_validation rows
        row["ocrLineCount"] = "ANY"
    elif kind == "invalid_output":
        row["status"] = {"either": ("ok", "error")}
        row["error"] = {"either": True}
    else:
        row["status"] = "ok"
        row["error"] = None
    row["k0"], row["k1"] = k0, k1
    return row, kind


def materialize(row):
    """Turn an expected pred row into a plain row writable to predictions.jsonl."""
    out = {}
    for k in ROW_FIELDS:
        v = row[k]
        if k == "status" and isinstance(v, dict):
            v = "ok"
        if k == "error":
            if isinstance(v, dict):
                v = (v.get("prefix", "") + "synthetic") if "prefix" in v else (None if v.get("either") else "ocr failure")
        if k in ("k0", "k1") and "errorPrefix" in v:
            v = {"status": "error", "error": v["errorPrefix"] or "failure", "branch": v.get("branch", "k0"),
                 **{f: None for f in KR_FIELDS if f not in ("status", "error", "branch")}}
        if v == "ANY":
            v = None
        out[k] = v
    return out


def compare_kr(exp, act, path, chk):
    if "errorPrefix" in exp:
        chk.compared += 1
        if not isinstance(act, dict) or act.get("status") != "error":
            chk.fail("%s: expected status error" % path)
            return
        err = act.get("error")
        if not isinstance(err, str) or (exp["exact"] and err != exp["errorPrefix"]) or \
                (not exp["exact"] and not err.startswith(exp["errorPrefix"])) or err == "":
            chk.fail("%s.error: expected %r got %r" % (path, exp["errorPrefix"], err))
        return
    if not isinstance(act, dict) or tuple(sorted(act)) != tuple(sorted(KR_FIELDS)):
        chk.fail("%s: field set differs" % path)
        if not isinstance(act, dict):
            return
    diff_values(exp, {k: act.get(k) for k in KR_FIELDS}, path, chk)


def compare_pred_row(exp, act, i, chk):
    p = "pred[%d]" % i
    if not isinstance(act, dict) or tuple(sorted(act)) != tuple(sorted(ROW_FIELDS)):
        chk.fail("%s: field set differs" % p)
        if not isinstance(act, dict):
            return
    if norm_ocr(act.get("ocr")) != exp["ocr"]:
        chk.fail("%s.ocr: %r" % (p, act.get("ocr")))
    for k in ("dataset", "id", "pngSha256", "width", "height", "ocrSha256", "ocrLineCount"):
        if exp[k] == "ANY":
            continue
        if exp[k] is None and k in ("ocrSha256", "ocrLineCount"):
            # ocrLines null: spec is silent; accept null or the value for "null"/0
            ok = act.get(k) in (None, 0, sha256(b"null"))
            chk.compared += 1
            if not ok:
                chk.fail("%s.%s: %r" % (p, k, act.get(k)))
            continue
        diff_values(exp[k], act.get(k), "%s.%s" % (p, k), chk)
    st, er = exp["status"], exp["error"]
    if isinstance(st, dict):
        chk.compared += 1
        if act.get("status") not in st["either"]:
            chk.fail("%s.status: %r" % (p, act.get("status")))
    else:
        diff_values(st, act.get("status"), p + ".status", chk)
    chk.compared += 1
    ae = act.get("error")
    if er is None:
        if ae is not None:
            chk.fail("%s.error: expected null got %r" % (p, ae))
    elif "prefix" in er:
        if not (isinstance(ae, str) and ae.startswith(er["prefix"])):
            chk.fail("%s.error: expected prefix %r got %r" % (p, er["prefix"], ae))
    elif er.get("nonEmpty"):
        if not (isinstance(ae, str) and ae):
            chk.fail("%s.error: expected non-empty string" % p)
    # "either" -> no constraint
    compare_kr(exp["k0"], act.get("k0"), p + ".k0", chk)
    compare_kr(exp["k1"], act.get("k1"), p + ".k1", chk)


# ---- scoring ----
def build_score(inp, pred_by_key):
    rows = []
    for cond in CONDS:
        oc, kk = cond[:2], cond[2:].lower()
        for c in inp["cohort"]:
            ds, pid = c["dataset"], c["id"]
            pr = pred_by_key.get((oc, ds, pid))
            if pr is None:
                raise InputError("no prediction row for %s/%s/%s" % (oc, ds, pid))
            page = inp["klass"][(ds, pid)]
            W, H = page["page"]["width"], page["page"]["height"]
            parts = inp["gold"][(ds, pid)]
            kr = pr.get(kk) or {}
            j = judge_row(pr, kr, parts, W, H)
            bs, be = judge_baseline(inp["past"].get((ds, pid)), parts, W, H)
            err = None
            if j["state"] == "technical_error":
                err = kr.get("error") if kr.get("error") is not None else pr.get("error")
            rows.append({"cond": cond, "dataset": ds, "id": pid, "cell": "%s/%s" % (page["lang"], page["anchor"]),
                         "cohort": "control" if c["baselineMatched"] else "primary",
                         "baselineMatched": c["baselineMatched"], "baselineStrict": bs, "baselineEvidence": be,
                         "branch": kr.get("branch"), **j, "error": err})
    return rows


def build_history(inp, pred_by_key, ocr_by_key, score_rows):
    o0k0 = {(r["dataset"], r["id"]): r for r in score_rows if r["cond"] == "O0K0"}
    rows = []
    for c in inp["cohort"]:
        ds, pid = c["dataset"], c["id"]
        pr = pred_by_key[("O0", ds, pid)]
        k0 = pr.get("k0") or {}
        past = inp["past"][(ds, pid)]
        if pr.get("status") == "ok" and k0.get("status") == "ok":
            diff = [f for f in HIST_DIFF_FIELDS if not _same(past.get(f), k0.get(f))]
        else:
            diff = ["technical_error"]
        o = ocr_by_key.get(("O0", ds, pid), {})
        sc = o0k0[(ds, pid)]
        rows.append({"dataset": ds, "id": pid, "selectionSame": diff == [],
                     "diff": diff, "ocrIdentical": _same(o.get("ocrLines"), past.get("ocrLines")),
                     "baselineStrict": sc["baselineStrict"], "nowStrict": sc["strict"],
                     "strictSame": sc["baselineStrict"] == sc["strict"] and sc["state"] != "technical_error"})
    return rows


def _same(a, b):
    ck = Check("tmp")
    diff_values(a, b, "", ck)
    return ck.ok


# ---- summary ----
def blk_top(rows):
    n = len(rows)
    s = sum(1 for r in rows if r["strict"])
    return {"n": n, "technicalError": sum(1 for r in rows if r["state"] == "technical_error"),
            "matched": sum(1 for r in rows if r["matched"] is True),
            "unmatched": sum(1 for r in rows if r["state"] == "unmatched"), "strict": s, "strictPct": pct(s, n)}


def blk_primary(rows):
    n = len(rows)
    m = sum(1 for r in rows if r["matched"] is True)
    s = sum(1 for r in rows if r["strict"])
    return {"n": n, "technicalError": sum(1 for r in rows if r["state"] == "technical_error"),
            "matched": m, "strict": s, "matchedOnly": sum(1 for r in rows if r["state"] == "matched_not_strict"),
            "evidencePartial": sum(1 for r in rows if r["evidence"] == "partial"),
            "evidenceNone": sum(1 for r in rows if r["evidence"] == "none"),
            "unmatched": sum(1 for r in rows if r["state"] == "unmatched"),
            "matchedPct": pct(m, n), "strictPct": pct(s, n)}


def blk_control(rows):
    n = len(rows)
    bs = [r for r in rows if r["baselineStrict"]]
    m2u = sum(1 for r in rows if r["state"] == "unmatched")
    stf = sum(1 for r in bs if r["state"] in ("unmatched", "matched_not_strict"))
    return {"n": n, "technicalError": sum(1 for r in rows if r["state"] == "technical_error"),
            "matchedToUnmatched": m2u, "stillMatched": sum(1 for r in rows if r["matched"] is True),
            "baselineStrict": len(bs), "strictToFail": stf,
            "strictToFailUnmatched": sum(1 for r in bs if r["state"] == "unmatched"),
            "matchedKeptLostEvidence": sum(1 for r in bs if r["state"] == "matched_not_strict"),
            "strictTechnicalError": sum(1 for r in bs if r["state"] == "technical_error"),
            "baselineNotStrict": n - len(bs),
            "newStrict": sum(1 for r in rows if not r["baselineStrict"] and r["strict"]),
            "strict": sum(1 for r in rows if r["strict"]),
            "matchedToUnmatchedPct": pct(m2u, n), "strictToFailPct": pct(stf, len(bs))}


def blk_cell(rows):
    out = {}
    for cell in sorted({r["cell"] for r in rows}):
        rs = [r for r in rows if r["cell"] == cell]
        out[cell] = {"n": len(rs), "technicalError": sum(1 for r in rs if r["state"] == "technical_error"),
                     "matched": sum(1 for r in rs if r["state"] in ("matched_strict", "matched_not_strict")),
                     "unmatched": sum(1 for r in rs if r["state"] == "unmatched"),
                     "strict": sum(1 for r in rs if r["strict"])}
    return out


def ds_filter(rows, which):
    return rows if which == "total" else [r for r in rows if r["dataset"] == which]


METRICS = (
    ("matchRecovery", "primary", "matched", "primary", "n", False, "primary.technicalError"),
    ("strictRecovery", "primary", "strict", "primary", "n", False, "primary.technicalError"),
    ("matchedToUnmatched", "control", "matchedToUnmatched", "control", "n", True, "control.technicalError"),
    ("strictToFail", "control", "strictToFail", "control", "baselineStrict", True, "control.strictTechnicalError"),
    ("totalStrict", None, "strict", None, "n", False, "technicalError"),
)
DIR_SUCCESS = "count is a success; positive effect = improvement"
DIR_LOSS = "count is a loss; effects use the negated count, positive = improvement"


def compute_interaction(conds):
    """conds: cond -> block (the 'total' block incl. primary/control)."""
    out = {}
    for name, grp, cnt, dgrp, dnm, loss, errpath in METRICS:
        def get(c, g, key):
            b = conds[c]
            return (b[g] if g else b)[key]
        counts = {c: get(c, grp, cnt) for c in CONDS}
        denoms = {c: get(c, dgrp, dnm) for c in CONDS}
        dset = set(denoms.values())
        denom = next(iter(dset)) if len(dset) == 1 else None
        v = {c: (-counts[c] if loss else counts[c]) for c in CONDS}
        eff = {"kAtO0": v["O0K1"] - v["O0K0"], "kAtO1": v["O1K1"] - v["O1K0"],
               "oAtK0": v["O1K0"] - v["O0K0"], "oAtK1": v["O1K1"] - v["O0K1"]}
        eff["interaction"] = (v["O1K1"] - v["O1K0"]) - (v["O0K1"] - v["O0K0"])
        errs = 0
        for c in CONDS:
            b = conds[c]
            if errpath.startswith("primary."):
                errs += b["primary"][errpath.split(".")[1]]
            elif errpath.startswith("control."):
                errs += b["control"][errpath.split(".")[1]]
            else:
                errs += b[errpath]
        entry = {"direction": DIR_LOSS if loss else DIR_SUCCESS,
                 "raw": {c: {"count": counts[c], "denom": denoms[c], "pct": pct(counts[c], denoms[c])} for c in CONDS},
                 "denom": denom}
        for k, val in eff.items():
            entry[k] = {"count": val, "pp": pct(val, denom) if denom is not None else None}
        entry["technicalErrors"] = errs
        entry["qualified"] = errs > 0
        out[name] = entry
    return out


def compute_pairs(score_rows):
    idx = {(r["cond"], r["dataset"], r["id"]): r for r in score_rows}
    pairs = {}
    for fr, to in PAIRS:
        entry = {}
        for g in ("primary", "control", "total"):
            entry[g] = {}
            for metric in ("strict", "matched"):
                cell = {"n": 0, "technicalError": 0, "both": 0, "fromOnly": 0, "toOnly": 0, "neither": 0}
                for r in score_rows:
                    if r["cond"] != to or (g != "total" and r["cohort"] != g):
                        continue
                    f = idx[(fr, r["dataset"], r["id"])]
                    cell["n"] += 1
                    if f["state"] == "technical_error" or r["state"] == "technical_error":
                        cell["technicalError"] += 1
                        continue
                    x = f["strict"] if metric == "strict" else f["matched"] is True
                    y = r["strict"] if metric == "strict" else r["matched"] is True
                    cell["both" if x and y else "fromOnly" if x else "toOnly" if y else "neither"] += 1
                entry[g][metric] = cell
        pairs["%s->%s" % (fr, to)] = entry
    return pairs


def build_summary(inp, pred_rows, ocr_by_key, score_rows, hist_rows, freeze_files):
    cohort = inp["cohort"]
    s = {}
    s["inputs"] = {"predictionsSha256": freeze_files.get("predictions.jsonl"),
                   "ocrSha256": freeze_files.get("ocr.jsonl"), "cohortSha256": inp["cohortSha"],
                   "replayBlob": FIXED["replay"][2]}
    ctrl = [r for r in score_rows if r["cond"] == "O0K0" and r["cohort"] == "control"]
    s["denominators"] = {"pages": len(cohort),
                         "primary": sum(1 for c in cohort if not c["baselineMatched"]),
                         "control": sum(1 for c in cohort if c["baselineMatched"]),
                         "baselineStrictControl": sum(1 for r in ctrl if r["baselineStrict"])}
    base = {}
    o0k0 = [r for r in score_rows if r["cond"] == "O0K0"]
    for w in ("r09", "fcp", "total"):
        rs = ds_filter(o0k0, w)
        m = [r for r in rs if r["baselineMatched"]]
        u = [r for r in rs if not r["baselineMatched"]]
        base[w] = {"n": len(rs), "matched": len(m), "strictAmongMatched": sum(1 for r in m if r["baselineStrict"]),
                   "strictAmongUnmatched": sum(1 for r in u if r["baselineStrict"]),
                   "strict": sum(1 for r in rs if r["baselineStrict"])}
    base["registeredExpectation"] = {"strictAmongMatched": 70, "r09": 35, "fcp": 35}
    s["baseline"] = base
    hs = {}
    for w in ("r09", "fcp", "total"):
        rs = ds_filter(hist_rows, w)
        hs[w] = {"n": len(rs), "selectionSame": sum(1 for r in rs if r["selectionSame"]),
                 "ocrIdentical": sum(1 for r in rs if r["ocrIdentical"]),
                 "strictSame": sum(1 for r in rs if r["strictSame"])}
    s["history"] = hs
    compared = differ = 0
    for c in cohort:
        a = ocr_by_key.get(("O0", c["dataset"], c["id"]), {}).get("ocrLines")
        b = ocr_by_key.get(("O1", c["dataset"], c["id"]), {}).get("ocrLines")
        if a is not None and b is not None:
            compared += 1
            ta = [l.get("text") for l in a] if isinstance(a, list) else a
            tb = [l.get("text") for l in b] if isinstance(b, list) else b
            if not _same(ta, tb):
                differ += 1
    s["ocrLineTextDiff"] = {"compared": compared, "differ": differ}
    kb = {}
    for oc in ("O0", "O1"):
        kb[oc] = {}
        for w in ("r09", "fcp", "total"):
            cnt = {"k0": 0, "hangul": 0, "none": 0, "error": 0}
            for r in pred_rows:
                if norm_ocr(r.get("ocr")) != oc or (w != "total" and r["dataset"] != w):
                    continue
                k1 = r.get("k1") or {}
                if r.get("status") == "ok" and k1.get("status") == "ok" and k1.get("branch") in cnt:
                    cnt[k1["branch"]] += 1
                else:
                    cnt["error"] += 1
            kb[oc][w] = cnt
    s["k1Branches"] = kb
    conds = {}
    for cond in CONDS:
        cr = [r for r in score_rows if r["cond"] == cond]
        conds[cond] = {}
        for w in ("r09", "fcp", "total"):
            rs = ds_filter(cr, w)
            b = blk_top(rs)
            b["primary"] = blk_primary([r for r in rs if r["cohort"] == "primary"])
            b["control"] = blk_control([r for r in rs if r["cohort"] == "control"])
            b["byCell"] = blk_cell(rs)
            conds[cond][w] = b
    s["conditions"] = conds
    pairs = compute_pairs(score_rows)
    s["pairs"] = pairs
    s["interaction"] = compute_interaction({c: conds[c]["total"] for c in CONDS})
    return s


# --------------------------------------------------------------------------
# guard-summary (language files, protocol 4.1)
# --------------------------------------------------------------------------
def check_lang_files(guard, chk):
    lf = guard.get("langFiles") if isinstance(guard, dict) else None
    chk.compared += 1
    entries = list(lf.values()) if isinstance(lf, dict) else lf
    if not isinstance(entries, list) or len(entries) != 2:
        chk.fail("langFiles must list exactly two files (eng, kor)")
        return
    for name, sha, size in LANG_FILES:
        found = False
        for e in entries:
            if not isinstance(e, dict):
                continue
            s_ = e.get("sha256", e.get("sha"))
            z = e.get("size", e.get("bytes", e.get("byteLength")))
            if s_ == sha and z == size:
                found = True
        if not found:
            chk.fail("language file %s (sha %s, %d bytes) not recorded" % (name, sha[:12], size))


# --------------------------------------------------------------------------
# Main verification
# --------------------------------------------------------------------------
CHECK_NAMES = ("freeze", "git_objects", "cohort", "file_format", "predictions", "ocr_consistency",
               "score", "history", "summary", "guard_summary")


def read_file(path):
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError as e:
        raise InputError("%s: %s" % (path, e))


def verify(run_dir, score_dir, cohort_path=None):
    cohort_path = cohort_path or os.path.join(RESEARCH, "results", "ko-ocr-factorial", "cohort.jsonl")
    checks = {n: Check(n) for n in CHECK_NAMES}
    info = {}
    inp = load_inputs(cohort_path, checks)

    # freeze
    freeze = json.loads(read_file(os.path.join(run_dir, "freeze.json")).decode("utf-8"))
    pbytes = read_file(os.path.join(run_dir, "predictions.jsonl"))
    obytes = read_file(os.path.join(run_dir, "ocr.jsonl"))
    ff = freeze.get("files", {}) if isinstance(freeze, dict) else {}
    ck = checks["freeze"]
    for name, data in (("predictions.jsonl", pbytes), ("ocr.jsonl", obytes)):
        ck.compared += 1
        if ff.get(name) != sha256(data):
            ck.fail("freeze.files[%s] %r != actual %s" % (name, ff.get(name), sha256(data)))
    ck.compared += 1
    if not isinstance(freeze.get("hashBasis"), str):
        ck.fail("freeze.hashBasis missing")

    preds = parse_jsonl(pbytes, "predictions.jsonl", checks["file_format"])
    ocrs = parse_jsonl(obytes, "ocr.jsonl", checks["file_format"])
    ck = checks["predictions"]
    order = [(oc, c["dataset"], c["id"]) for oc in ("O0", "O1") for c in inp["cohort"]]
    if len(preds) != 192:
        ck.fail("predictions rows %d != 192" % len(preds))
    if len(ocrs) != 192:
        checks["ocr_consistency"].fail("ocr rows %d != 192" % len(ocrs))

    ocr_by_key = {}
    for i, o in enumerate(ocrs):
        k = (norm_ocr(o.get("ocr")), o.get("dataset"), o.get("id"))
        ocr_by_key[k] = o
        if i < len(order) and k != order[i]:
            checks["ocr_consistency"].fail("ocr row %d key %r != expected %r" % (i, k, order[i]))
    pred_by_key = {}
    for i, r in enumerate(preds):
        k = (norm_ocr(r.get("ocr")), r.get("dataset"), r.get("id"))
        pred_by_key[k] = r
        if i < len(order) and k != order[i]:
            ck.fail("pred row %d key %r != expected %r" % (i, k, order[i]))
    kinds = {}
    for i, key in enumerate(order):
        o = ocr_by_key.get(key)
        p = pred_by_key.get(key)
        if o is None or p is None:
            ck.fail("missing row for %r" % (key,))
            continue
        oc = checks["ocr_consistency"]
        oc.compared += 1
        if o.get("status") != p.get("status") and not (o.get("status") == "ok" and p.get("status") == "error"):
            oc.fail("%r: ocr status %r vs prediction status %r" % (key, o.get("status"), p.get("status")))
        exp, kind = expected_pred(key[0], key[1], key[2], inp, o)
        kinds[kind.split(":")[0]] = kinds.get(kind.split(":")[0], 0) + 1
        compare_pred_row(exp, p, i, ck)
    info["rowKinds"] = kinds

    # score
    score_rows_exp = build_score(inp, pred_by_key)
    sbytes = read_file(os.path.join(score_dir, "score.jsonl"))
    hbytes = read_file(os.path.join(score_dir, "history.jsonl"))
    summ = json.loads(read_file(os.path.join(score_dir, "summary.json")).decode("utf-8"))
    score_act = parse_jsonl(sbytes, "score.jsonl", checks["file_format"])
    ck = checks["score"]
    if len(score_act) != len(score_rows_exp):
        ck.fail("score rows %d != %d" % (len(score_act), len(score_rows_exp)))
    for i, (e, a) in enumerate(zip(score_rows_exp, score_act)):
        if not isinstance(a, dict) or sorted(a) != sorted(SCORE_FIELDS):
            ck.fail("score[%d]: field set differs" % i)
            continue
        diff_values(e, a, "score[%d]" % i, ck)

    hist_exp = build_history(inp, pred_by_key, ocr_by_key, score_rows_exp)
    hist_act = parse_jsonl(hbytes, "history.jsonl", checks["file_format"])
    ck = checks["history"]
    if len(hist_act) != len(hist_exp):
        ck.fail("history rows %d != %d" % (len(hist_act), len(hist_exp)))
    for i, (e, a) in enumerate(zip(hist_exp, hist_act)):
        diff_values(e, a, "history[%d]" % i, ck)

    pred_list = [pred_by_key[k] for k in order if k in pred_by_key]
    summ_exp = build_summary(inp, pred_list, ocr_by_key, score_rows_exp, hist_exp, ff)
    ck = checks["summary"]
    if not isinstance(summ, dict):
        ck.fail("summary.json is not an object")
    else:
        extras = [k for k in summ if k not in summ_exp]
        if extras:
            info["summaryExtraTopLevelKeys"] = extras
        for k, e in summ_exp.items():
            if k not in summ:
                ck.fail("summary.%s missing" % k)
            elif k == "inputs":
                a = summ[k]
                diff_values({kk: vv for kk, vv in e.items() if kk != "replayBlob"},
                            {kk: a.get(kk) for kk in e if kk != "replayBlob"}, "summary.inputs", ck)
                rb = a.get("replayBlob")
                ck.compared += 1
                if not (isinstance(rb, str) and len(rb) >= 8 and e["replayBlob"].startswith(rb)):
                    ck.fail("summary.inputs.replayBlob %r != %s" % (rb, e["replayBlob"]))
            else:
                diff_values(e, summ[k], "summary." + k, ck)

    # guard summary (optional)
    gp = os.path.join(run_dir, "guard-summary.json")
    ck = checks["guard_summary"]
    if os.path.exists(gp):
        try:
            g = json.loads(read_file(gp).decode("utf-8"))
        except ValueError as e:
            raise InputError("guard-summary.json unparsable: %s" % e)
        check_lang_files(g, ck)
    else:
        info["guardSummary"] = "absent (not a listed input); not checked"

    info["baselineStrict"] = summ_exp["baseline"]["total"]["strict"]
    info["baselineStrictRegistered"] = 70
    info["baselineVsPastMatched"] = sum(
        1 for c in inp["cohort"] if bool(inp["past"][(c["dataset"], c["id"])].get("matched")) != c["baselineMatched"])
    return checks, info


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--run", required=True)
    ap.add_argument("--score", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cohort", default=None)
    a = ap.parse_args(argv)
    try:
        checks, info = verify(a.run, a.score, a.cohort)
        ok = all(c.ok for c in checks.values())
        code = 0 if ok else 1
        report = {"ok": ok, "exitCode": code, "checks": {k: c.as_dict() for k, c in checks.items()}, "info": info}
    except (InputError, ValueError, KeyError, TypeError, AttributeError) as e:
        code = 2
        report = {"ok": False, "exitCode": 2, "error": "%s: %s" % (type(e).__name__, e)}
    with open(a.out, "w", encoding="utf-8", newline="\n") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
        f.write("\n")
    if code:
        print("recount: exit %d" % code, report.get("error") or [k for k, c in report["checks"].items() if not c["ok"]],
              file=sys.stderr)
    else:
        print("recount: all checks matched")
    return code


if __name__ == "__main__":
    sys.exit(main())
