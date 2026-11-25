"""Independent recount for ko-header-strip (RECOUNT_SPEC.md). Python 3.12 standard library + Pillow.

Does not import or call the research JS code. Reads the #153 objects with `git cat-file` and checks them against
registered.json, re-derives every W5 plan, rebuilds every W1/W4/W5 image from the source pixels, re-scores every
page, re-aggregates the summary and re-renders the public tables.

  python recount.py --build <build dir> --score <score dir> [--results RESULTS.md] --out <recount.json>
  python recount.py --build <build dir> --score <score dir> [--results RESULTS.md] --mutate <mutation.json>
"""
import argparse
import copy
import hashlib
import io
import json
import os
import re
import struct
import subprocess
import sys
import zlib
from fractions import Fraction
from math import ceil, floor

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(HERE, "registered.json"), encoding="utf-8") as _f:
    REG = json.load(_f)
SRC = REG["source"]
LUMA = REG["strip"]["separatorLuma"]
PUBLISHED = "research/results/ko-header-strip/build-a"


class ContractError(Exception):
    def __init__(self, code, detail=""):
        super().__init__(f"{code}: {detail}")
        self.code = code


class IntegrityError(Exception):
    def __init__(self, code, detail=""):
        super().__init__(f"{code}: {detail}")
        self.code = code


# ---------------------------------------------------------------- numbers
DEC = re.compile(r"^-?(0|[1-9][0-9]*)(\.[0-9]+)?$")


def dec(s):
    if not isinstance(s, str) or not DEC.match(s):
        raise ValueError(f"not a finite decimal: {s!r}")
    return Fraction(s)


def dec_str(x):
    """Exact decimal text of a power-of-ten rational: integer if whole, else no trailing zeros."""
    x = Fraction(x)
    if x.denominator == 1:
        return str(x.numerator)
    k = next(k for k in range(1, 64) if (10 ** k) % x.denominator == 0)
    n = x.numerator * (10 ** k // x.denominator)
    s = str(abs(n)).rjust(k + 1, "0")
    return ("-" if n < 0 else "") + (s[:-k] + "." + s[-k:]).rstrip("0")


def pp_text(f):
    if f is None:
        return "—"
    f = Fraction(f)
    a = abs(f)
    c = floor(a * 100 + Fraction(1, 2))
    s = f"{c // 100}.{c % 100:02d}"
    return "-" + s if f < 0 else s


def mean(values):
    if not values:
        return None
    m = sum(values, Fraction(0)) / len(values)
    return {"num": str(m.numerator), "den": str(m.denominator)}


# ---------------------------------------------------------------- projection and plan
def _int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def _win_ok(w, W, H):
    return (isinstance(w, dict) and all(_int(w.get(k)) for k in ("left", "top", "width", "height"))
            and w["left"] >= 0 and w["top"] >= 0 and w["width"] > 0 and w["height"] > 0
            and w["left"] + w["width"] <= W and w["top"] + w["height"] <= H)


def _win(w):
    return {"left": w["left"], "top": w["top"], "width": w["width"], "height": w["height"]}


def _inside(a, b):
    return (a["left"] >= b["left"] and a["top"] >= b["top"] and a["left"] + a["width"] <= b["left"] + b["width"]
            and a["top"] + a["height"] <= b["top"] + b["height"])


def project(pred):
    pid, W, H, state = pred.get("id"), pred.get("width"), pred.get("height"), pred.get("state")
    if not isinstance(pid, str) or not isinstance(pred.get("pngSha256"), str) or not _int(W) or not _int(H) or W <= 0 or H <= 0:
        raise IntegrityError("integrity_output", f"{pid}: id/size")
    base = {"id": pid, "pngSha256": pred["pngSha256"], "width": W, "height": H, "state": state, "w4Reason": pred.get("w4Reason")}
    if state in ("error", "unmatched"):
        return {**base, "w1": None, "w2": None, "w4": None, "header": None}
    if state != "matched":
        raise IntegrityError("integrity_output", f"{pid}: state {state!r}")
    for k in ("w1", "w2", "w4"):
        if not _win_ok(pred.get(k), W, H):
            raise ContractError("contract_window", f"{pid}: {k}")
    if not _inside(pred["w2"], pred["w1"]):
        raise ContractError("contract_window", f"{pid}: w2 not in w1")
    base.update({"w1": _win(pred["w1"]), "w2": _win(pred["w2"]), "w4": _win(pred["w4"])})
    if pred.get("w4Reason") != "applied":
        if pred.get("w4From") != "w1" or _win(pred["w4"]) != _win(pred["w1"]):
            raise ContractError("contract_window", f"{pid}: w4 != w1")
        return {**base, "header": None}
    d = pred.get("w4Diag") or {}
    hd = d.get("header")
    q = d.get("qualified")
    if not hd or not isinstance(q, list) or q != [hd.get("line")]:
        raise ContractError("contract_header_line", pid)
    lines = d.get("lines")
    if not isinstance(lines, list):
        raise ContractError("contract_line_ids", pid)
    ids = [ln.get("line") if isinstance(ln, dict) else None for ln in lines]
    sel = [ln for ln in lines if isinstance(ln, dict) and ln.get("line") == hd["line"]]
    if len(set(map(repr, ids))) != len(ids) or len(sel) != 1:
        raise ContractError("contract_line_ids", pid)
    ln = sel[0]
    if ln.get("why") != "eligible" or not isinstance(ln.get("groups"), list) or len(ln["groups"]) != 3:
        raise ContractError("contract_group_count", pid)
    if ln.get("failure") is not None:
        raise ContractError("contract_group_failure", pid)
    t, c, m = hd.get("target"), hd.get("comp"), hd.get("match")
    if (t not in (1, 2) or c not in (1, 2) or t == c or isinstance(t, bool) or isinstance(c, bool)
            or not isinstance(m, list) or len(m) != 2 or m[t - 1] is not True or m[c - 1] is not False):
        raise ContractError("contract_index", pid)
    groups = []
    for g in ln["groups"]:
        b = g.get("box") if isinstance(g, dict) else None
        if not isinstance(b, list) or len(b) != 4 or not all(isinstance(s, str) and DEC.match(s) for s in b):
            raise ContractError("contract_box", pid)
        x0, y0, x1, y1 = map(Fraction, b)
        if not (0 <= x0 < x1 <= W and 0 <= y0 < y1 <= H):
            raise ContractError("contract_box", pid)
        groups.append({"x0": b[0], "y0": b[1], "x1": b[2], "y1": b[3]})
    if pred.get("w4From") != "w2" or _win(pred["w4"]) != _win(pred["w2"]):
        raise ContractError("contract_w4_not_w2", pid)
    return {**base, "header": {"groups": groups, "target": t, "comp": c}}


def _rect(w):
    return [w["left"], w["top"], w["left"] + w["width"], w["top"] + w["height"]]


def _w1_plan(proj, reason, rec):
    r = _rect(proj["w1"])
    out = {"reason": reason, "kind": "w1", "B": None, "H": None, "t": None, "b": None, "p": None}
    out.update(rec)
    out["pieces"] = [{"kind": "source", "sourceRect": r, "displayRect": [0, 0, r[2] - r[0], r[3] - r[1]]}]
    out["display"] = {"width": r[2] - r[0], "height": r[3] - r[1]}
    return out


def plan(proj):
    if proj["state"] in ("error", "unmatched"):
        return {"reason": "upstream_error" if proj["state"] == "error" else "upstream_unmatched", "kind": None,
                "B": None, "H": None, "t": None, "b": None, "p": None, "pieces": [], "display": None}
    if proj["w4Reason"] != "applied":
        return _w1_plan(proj, "w4_not_applied", {})
    B = _rect(proj["w4"])
    gs = [{k: Fraction(g[k]) for k in ("x0", "y0", "x1", "y1")} for g in proj["header"]["groups"]]
    t = min(g["y0"] for g in gs)
    b = max(g["y1"] for g in gs)
    p = ceil((b - t) / 4)
    top = max(0, floor(t) - p)
    bottom = min(proj["height"], ceil(b) + p)
    Hr = [B[0], top, B[2], bottom]
    rec = {"B": B, "H": Hr, "t": dec_str(t), "b": dec_str(b), "p": p}
    if any(floor(g["x0"]) < B[0] or ceil(g["x1"]) > B[2] for g in gs):
        return _w1_plan(proj, "header_outside_body_width", rec)
    w = B[2] - B[0]
    if Hr[3] >= B[1] and Hr[1] <= B[3]:
        if Hr[1] >= B[1] and Hr[3] <= B[3]:
            reason, kind, y0, y1 = "merged_contained", "body", B[1], B[3]
        else:
            reason, kind, y0, y1 = "merged", "merged", min(Hr[1], B[1]), max(Hr[3], B[3])
        return {"reason": reason, "kind": kind, **rec,
                "pieces": [{"kind": "source", "sourceRect": [B[0], y0, B[2], y1], "displayRect": [0, 0, w, y1 - y0]}],
                "display": {"width": w, "height": y1 - y0}}
    if Hr[1] > B[3]:
        return _w1_plan(proj, "header_below_body", rec)
    hh, bh, s = Hr[3] - Hr[1], B[3] - B[1], len(LUMA)
    return {"reason": "two_bands", "kind": "two_bands", **rec, "pieces": [
        {"kind": "source", "sourceRect": [B[0], Hr[1], B[2], Hr[3]], "displayRect": [0, 0, w, hh]},
        {"kind": "separator", "displayRect": [0, hh, w, hh + s], "luma": list(LUMA)},
        {"kind": "source", "sourceRect": list(B), "displayRect": [0, hh + s, w, hh + s + bh]}],
        "display": {"width": w, "height": hh + s + bh}}


def compose(pl, src_rows):
    """Output rows (bytes) of a plan; src_rows[y] = bytes of source row y."""
    rows = []
    for pc in pl["pieces"]:
        if pc["kind"] == "separator":
            rows.extend(bytes([v]) * (pc["displayRect"][2] - pc["displayRect"][0]) for v in pc["luma"])
        else:
            x0, y0, x1, y1 = pc["sourceRect"]
            rows.extend(src_rows[y][x0:x1] for y in range(y0, y1))
    return rows


def coords_row(proj, pl):
    return {"id": proj["id"], "w5Reason": pl["reason"], "w5Kind": pl["kind"], "page": {"width": proj["width"], "height": proj["height"]},
            "pngSha256": proj["pngSha256"], "w1": proj["w1"], "w4": proj["w4"], "B": pl["B"], "H": pl["H"], "t": pl["t"],
            "b": pl["b"], "p": pl["p"], "pieces": pl["pieces"], "display": pl["display"]}


# ---------------------------------------------------------------- exposure and area
def merge_intervals(iv):
    out = []
    for a, c in sorted(iv):
        if out and a <= out[-1][1]:
            out[-1][1] = max(out[-1][1], c)
        else:
            out.append([a, c])
    return out


def _union(pl):
    src = [p for p in pl["pieces"] if p["kind"] == "source"]
    if not src:
        return None
    L, R = src[0]["sourceRect"][0], src[0]["sourceRect"][2]
    if any(p["sourceRect"][0] != L or p["sourceRect"][2] != R for p in src):
        raise IntegrityError("integrity_output", "source pieces differ in x")
    return L, R, merge_intervals([(p["sourceRect"][1], p["sourceRect"][3]) for p in src])


def exposure(ink, pl):
    if ink is None:
        return "source_missing"
    u = _union(pl)
    if u is None:
        return None
    L, R, iv = u
    x0, y0, x1, y1 = ink
    if L <= x0 and x1 <= R and any(a <= y0 and y1 <= c for a, c in iv):
        return "full"
    if min(x1, R) - max(x0, L) > 0 and any(min(y1, c) - max(y0, a) > 0 for a, c in iv):
        return "partial"
    return "none"


def area(pl):
    u = _union(pl)
    source = (u[1] - u[0]) * sum(c - a for a, c in u[2]) if u else 0
    sep = sum((p["displayRect"][2] - p["displayRect"][0]) * (p["displayRect"][3] - p["displayRect"][1]) for p in pl["pieces"] if p["kind"] == "separator")
    disp = pl["display"]["width"] * pl["display"]["height"] if pl.get("display") else 0
    return {"source": source, "separator": sep, "display": disp}


def _wplan(w):
    return {"pieces": [{"kind": "source", "sourceRect": _rect(w)}]} if w else {"pieces": []}


# ---------------------------------------------------------------- git and files
def git(*args):
    return subprocess.run(["git", *args], cwd=HERE, check=True, capture_output=True,
                          creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0)).stdout


def blob_id(b):
    return hashlib.sha1(b"blob %d\0" % len(b) + b).hexdigest()


def sha(b):
    return hashlib.sha256(b).hexdigest()


def read_pinned(path, blob=None, sha256=None):
    got = git("rev-parse", f"{SRC['commit']}:{path}").decode().strip()
    data = git("cat-file", "blob", got)
    if blob_id(data) != got or (blob and got != blob) or (sha256 and sha(data) != sha256):
        raise IntegrityError("integrity_pin", path)
    return data


def jsonl(data, name):
    s = data.decode("utf-8")
    if "\r" in s or not s.endswith("\n") or s.endswith("\n\n"):
        raise IntegrityError("integrity_output", f"{name} not strict JSONL")
    return [json.loads(x) for x in s[:-1].split("\n")]


IDS = [f"p{i:03d}" for i in range(144)]


def check_ids(rows, name):
    if [r["id"] for r in rows] != IDS:
        raise IntegrityError("integrity_id", name)


def decode(png):
    im = Image.open(io.BytesIO(png))
    im.load()
    if im.format != "PNG" or im.mode != "L":
        raise IntegrityError("integrity_png", f"mode {im.mode}")
    return im.size, im.tobytes()


def png_chunks(png):
    i, out = 8, []
    while i < len(png):
        n = struct.unpack(">I", png[i:i + 4])[0]
        out.append(png[i + 4:i + 8].decode("latin-1"))
        i += 12 + n
    return out


def encode(size, data):
    buf = io.BytesIO()
    Image.frombytes("L", size, data).save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------- load
class Source:
    def __init__(self):
        if git("cat-file", "-t", SRC["commit"]).decode().strip() != "commit":
            raise IntegrityError("integrity_pin", "commit")
        f = SRC["files"]
        self.manifest = json.loads(read_pinned(f["manifest"]["path"], f["manifest"]["blob"], f["manifest"]["sha256"]))
        self.preds = jsonl(read_pinned(f["predictions"]["path"], f["predictions"]["blob"], f["predictions"]["sha256"]), "predictions")
        check_ids(self.preds, "predictions")
        freeze = json.loads(read_pinned(f["freeze"]["path"], f["freeze"]["blob"], f["freeze"]["sha256"]))
        if freeze["files"]["predictions.jsonl"] != f["predictions"]["sha256"]:
            raise IntegrityError("integrity_pin", "freeze")
        self.summary153 = json.loads(read_pinned(f["summary"]["path"], f["summary"]["blob"], f["summary"]["sha256"]))
        tree = git("rev-parse", f"{SRC['commit']}:{SRC['imageTree']['path']}").decode().strip()
        if tree != SRC["imageTree"]["tree"]:
            raise IntegrityError("integrity_pin", "tree")
        self.tree = {}
        for line in git("ls-tree", tree).decode().splitlines():
            m = re.match(r"^100644 blob ([0-9a-f]{40})\t(p[0-9]{3}\.png)$", line)
            if not m:
                raise IntegrityError("integrity_pin", line)
            self.tree[m.group(2)] = m.group(1)
        if sorted(self.tree) != [i + ".png" for i in IDS]:
            raise IntegrityError("integrity_png", "tree ids")
        self._px = {}

    def pixels(self, pid):
        if pid not in self._px:
            m = self.manifest["files"][f"selector/images/{pid}.png"]
            data = read_pinned(f"{SRC['imageTree']['path']}/{pid}.png", self.tree[pid + ".png"], m["sha256"])
            if len(data) != m["bytes"]:
                raise IntegrityError("integrity_png", pid)
            (w, h), px = decode(data)
            self._px[pid] = ((w, h), [px[y * w:(y + 1) * w] for y in range(h)], sha(data))
        return self._px[pid]

    def scoring(self):
        m = self.manifest["files"]
        sf = SRC["scoringFiles"]
        design = json.loads(read_pinned(sf["design"], sha256=m["scoring/design.json"]["sha256"]))
        gold = json.loads(read_pinned(sf["gold"], sha256=m["scoring/gold.json"]["sha256"]))
        render = json.loads(read_pinned(sf["render"], sha256=m["scoring/render.json"]["sha256"]))
        ref = jsonl(read_pinned(sf["score"]), "#153 score")
        check_ids(ref, "#153 score")
        return design, gold, render, ref


# ---------------------------------------------------------------- build checks
def classify_file(png, entry):
    """Compare a PNG file with its manifest entry: None if equal, else a category."""
    if len(png) == entry["bytes"] and sha(png) == entry["sha256"]:
        return None
    (w, h), px = decode(png)
    if (w, h) != (entry["width"], entry["height"]):
        return "dimension_mismatch"
    if sha(px) != entry["pixelSha256"]:
        return "pixel_mismatch"
    extra = [c for c in png_chunks(png) if c not in ("IHDR", "IDAT", "IEND")]
    return "metadata_only" if extra else "manifest_mismatch"


def structure(c):
    bad = []
    src = [p for p in c["pieces"] if p["kind"] == "source"]
    for a, b in zip(src, src[1:]):
        if b["sourceRect"][1] < a["sourceRect"][3]:
            bad.append("rows overlap/order")
    if len({(p["sourceRect"][0], p["sourceRect"][2]) for p in src}) > 1:
        bad.append("x ranges")
    y = 0
    for p in c["pieces"]:
        if p["displayRect"][1] != y:
            bad.append("display rows")
        y = p["displayRect"][3]
        if p["kind"] == "separator" and (p["luma"] != LUMA or p["displayRect"][3] - p["displayRect"][1] != len(LUMA)):
            bad.append("separator")
        if p["kind"] == "source" and p["sourceRect"][3] - p["sourceRect"][1] != p["displayRect"][3] - p["displayRect"][1]:
            bad.append("piece height")
    if c["display"] and y != c["display"]["height"]:
        bad.append("display height")
    if c["B"] and any(p["displayRect"][0] != p["sourceRect"][0] - c["B"][0] for p in src):
        bad.append("x alignment")
    return bad


def check_build(S, coords, manifest, w5, ids=None, extra_dirs=None):
    """Issues [(id, category, detail)]. w5 = {id: png bytes}. extra_dirs: {'w1': dir, 'w4': dir} when restored."""
    issues = []
    want = ids or IDS
    if ids is None:
        try:
            check_ids(coords, "coords")
        except IntegrityError:
            return [(None, "id_mismatch", "coords ids")]
    by = {c["id"]: c for c in coords}
    for pid in want:
        pred = S.preds[IDS.index(pid)]
        c = by.get(pid)
        exp = coords_row(project(pred), plan(project(pred)))
        if c != exp:
            issues.append((pid, "coords_mismatch", "coords differ from re-derived plan"))
        if c is None:
            continue
        for s in structure(c):
            issues.append((pid, "structure", s))
        (W, H), rows, _ = S.pixels(pid)
        outs = manifest["outputs"]
        for k, w in (("w1", exp["w1"]), ("w4", exp["w4"])):
            e = outs[k].get(pid)
            if w is None:
                if e is not None:
                    issues.append((pid, "manifest_mismatch", f"{k} entry without output"))
                continue
            px = b"".join(r[w["left"]:w["left"] + w["width"]] for r in rows[w["top"]:w["top"] + w["height"]])
            if not e or e["pixelSha256"] != sha(px) or (e["width"], e["height"]) != (w["width"], w["height"]):
                issues.append((pid, "manifest_mismatch", f"{k} pixel hash"))
            if extra_dirs and k in extra_dirs:
                f = os.path.join(extra_dirs[k], pid + ".png")
                with open(f, "rb") as fh:
                    cat = classify_file(fh.read(), e)
                if cat:
                    issues.append((pid, cat, k))
        e = outs["w5"].get(pid)
        if exp["display"] is None:
            if e is not None:
                issues.append((pid, "manifest_mismatch", "w5 entry without output"))
            continue
        expect = b"".join(compose(exp, rows))
        png = w5.get(pid)
        if png is None:
            issues.append((pid, "missing_output", "w5 file"))
            continue
        cat = classify_file(png, e)
        if cat:
            issues.append((pid, cat, "w5 file vs manifest"))
        (w, h), px = decode(png)
        if (w, h) != (exp["display"]["width"], exp["display"]["height"]):
            issues.append((pid, "dimension_mismatch", "w5 vs rebuilt"))
        elif px != expect:
            issues.append((pid, "pixel_mismatch", "w5 vs rebuilt from source"))
        if e["pixelSha256"] != sha(expect):
            issues.append((pid, "manifest_mismatch", "w5 pixel hash vs rebuilt"))
    return issues


# ---------------------------------------------------------------- scoring
ITEMS = ("anchor", "targetValue", "targetHeader", "compHeader", "compValue")
FOUR = ("targetHeader", "compHeader", "targetValue", "compValue")


def _trans(a, b):
    return "keptSuccess" if a and b else "recovered" if b else "lost" if a else "bothFail"


def _placement(ink, c):
    if not ink:
        return None
    for p in c["pieces"]:
        if p["kind"] != "source":
            continue
        sx0, sy0, sx1, sy1 = p["sourceRect"]
        dx0, dy0 = p["displayRect"][0], p["displayRect"][1]
        if sx0 <= ink[0] and ink[2] <= sx1 and sy0 <= ink[1] and ink[3] <= sy1:
            return [ink[0] - sx0 + dx0, ink[1] - sy0 + dy0, ink[2] - sx0 + dx0, ink[3] - sy0 + dy0]
    return None


def score_page(c, d, ink, pred, ref, fixed):
    page = c["page"]["width"] * c["page"]["height"]
    box = lambda item: ink[item]["ink"] if item else None  # noqa: E731
    boxes = {"anchor": box(d["anchorItem"]), "targetValue": box(d["valueItem"]), "targetHeader": box(d["targetHeaderItem"]),
             "compHeader": box(d["compHeaderItem"]), "compValue": box(d["compValueItem"])}
    plans = {"w1": _wplan(c["w1"]), "w4": _wplan(c["w4"]), "w5": c if c["display"] else {"pieces": []}}
    shown = {"w1": c["w1"] is not None, "w4": c["w4"] is not None, "w5": c["display"] is not None}
    exp, strict = {}, {}
    for k in ("w1", "w4", "w5"):
        exp[k] = {it: exposure(boxes[it], plans[k]) for it in ITEMS} if shown[k] else None
        a = area(plans[k])["source"] if shown[k] else 0
        strict[k] = bool(shown[k] and 0 < a < page and exp[k]["anchor"] == "full" and exp[k]["targetValue"] == "full")
    a5 = area(c) if shown["w5"] else {"source": 0, "separator": 0, "display": 0}
    ar = {"page": page, "w1": c["w1"]["width"] * c["w1"]["height"] if c["w1"] else 0,
          "w4": c["w4"]["width"] * c["w4"]["height"] if c["w4"] else 0,
          "w5Source": a5["source"], "w5Separator": a5["separator"], "w5Display": a5["display"]}
    others = [{"item": it, "w1": exposure(box(it), plans["w1"]), "w4": exposure(box(it), plans["w4"]),
               "w5": exposure(box(it), plans["w5"]) if shown["w5"] else None} for it in d["otherValueItems"]]
    reexposed = sum(1 for o in others if o["w1"] == "full" and o["w4"] == "none" and o["w5"] in ("partial", "full"))
    opp = bool(shown["w1"] and strict["w1"] and pred["w2Reason"] == "cut" and any(o["w1"] == "full" for o in others))
    event = lambda k: bool(opp and strict[k] and any(o["w1"] == "full" and o[k] == "none" for o in others))  # noqa: E731
    e1 = lambda k: exp[k]["targetHeader"] == "none" and exp[k]["compValue"] == "full"  # noqa: E731
    e2 = lambda k: exp[k]["targetHeader"] in ("partial", "none") and exp[k]["compValue"] in ("partial", "full")  # noqa: E731
    reading = ({"e1": {k: e1(k) for k in ("w1", "w4", "w5")}, "e2": {k: e2(k) for k in ("w1", "w4", "w5")}}
               if d["header"] == "normal" and all(shown.values()) else None)
    applied = bool(c["w4"]) and pred["w4Reason"] == "applied"
    attribution = ref["attribution"]["outcome"] if ref.get("attribution") else None
    xa = None
    if applied and c["B"] is not None:
        xa = all(p["displayRect"][0] == p["sourceRect"][0] - c["B"][0]
                 and p["displayRect"][2] - p["displayRect"][0] == p["sourceRect"][2] - p["sourceRect"][0]
                 for p in c["pieces"] if p["kind"] == "source")
    four = (all(exp["w5"][it] == "full" for it in FOUR) and xa is True and attribution == "correct") if applied else None
    place = {it: _placement(boxes[it], c) for it in FOUR} if applied else None
    outside = 0
    if shown["w5"]:
        lo, hi = c["w1"]["top"], c["w1"]["top"] + c["w1"]["height"]
        for a, b in _union(c)[2]:
            outside += max(0, min(b, lo) - a) + max(0, b - max(a, hi))
    return {"id": c["id"], "key": d["key"], "source": d["source"], "side": d["side"], "header": d["header"], "ans": d["ans"],
            "cell": d["cellName"], "fixed22": c["id"] in fixed, "w4Reason": pred["w4Reason"], "w5Reason": c["w5Reason"],
            "w5Kind": c["w5Kind"], "strict": strict, "area": ar, "sourceOutsideW1Rows": outside,
            "t15": _trans(strict["w1"], strict["w5"]), "t45": _trans(strict["w4"], strict["w5"]), "exposure": exp,
            "others": {"items": others, "reexposed": reexposed}, "opportunity": opp, "event4": event("w4"), "event5": event("w5"),
            "reading": reading, "attribution": attribution, "xAligned": xa, "fourItems": four, "placement": place}


def reference_ok(row, ref):
    for k in ("w1", "w4"):
        if ref[k]["strict"] != row["strict"][k] or ref[k]["area"] != row["area"][k]:
            return False
        if any(ref["exposure"][k][it] != row["exposure"][k][it] for it in ("targetHeader", "compHeader", "compValue", "targetValue")):
            return False
    for o, r in zip(ref["others"]["items"], row["others"]["items"]):
        if (o["item"], o["w1"], o["w4"]) != (r["item"], r["w1"], r["w4"]):
            return False
    if ref["opportunity"] != row["opportunity"] or ref["event4"] != row["event4"]:
        return False
    if ref.get("reading"):
        for e in ("e1", "e2"):
            for k in ("w1", "w4"):
                if ref["reading"][e][k] != row["reading"][e][k]:
                    return False
    return True


REASONS = ["upstream_error", "upstream_unmatched", "w4_not_applied", "header_outside_body_width", "header_below_body", "merged_contained", "merged", "two_bands"]
CELLS = [f"{s}-{h}-{a}" for s in "LR" for h in ("normal", "blank", "dup") for a in ("same", "below")]


def _pp(x, page):
    return Fraction(100 * x, page)


def group_block(rows):
    n = len(rows)
    cnt = lambda f: sum(1 for r in rows if f(r))  # noqa: E731
    srcs = lambda rs: len({r["source"] for r in rs})  # noqa: E731
    lost = [r for r in rows if r["t15"] == "lost"]
    re_ = [r for r in rows if r["others"]["reexposed"] > 0]
    rd = [r for r in rows if r["reading"]]
    rc = lambda f: sum(1 for r in rd if f(r["reading"]))  # noqa: E731
    ap = [r for r in rows if r["fourItems"] is not None]
    m = lambda f: mean([f(r) for r in rows]) if n else None  # noqa: E731
    return {
        "n": n, "shown": cnt(lambda r: r["w5Kind"] is not None),
        "strict": {k: cnt(lambda r, k=k: r["strict"][k]) for k in ("w1", "w4", "w5")},
        "L5": {"count": len(lost), "denom": cnt(lambda r: r["strict"]["w1"]), "sources": srcs(lost)},
        "t45": {k: cnt(lambda r, k=k: r["t45"] == k) for k in ("keptSuccess", "recovered", "lost", "bothFail")},
        "opportunity": cnt(lambda r: r["opportunity"]), "J4": cnt(lambda r: r["event4"]), "J5": cnt(lambda r: r["event5"]),
        "J5Sources": srcs([r for r in rows if r["event5"]]),
        "J4kept": {"count": cnt(lambda r: r["event4"] and r["event5"]), "of": cnt(lambda r: r["event4"])},
        "reexposed": {"items": sum(r["others"]["reexposed"] for r in rows), "pages": len(re_), "sources": srcs(re_)},
        "reading": {
            "pages": len(rd),
            "e1": {k: rc(lambda x, k=k: x["e1"][k]) for k in ("w1", "w4", "w5")},
            "e2": {k: rc(lambda x, k=k: x["e2"][k]) for k in ("w1", "w4", "w5")},
            "newE1W1": rc(lambda x: x["e1"]["w5"] and not x["e1"]["w1"]), "newE1W4": rc(lambda x: x["e1"]["w5"] and not x["e1"]["w4"]),
            "newE2W1": rc(lambda x: x["e2"]["w5"] and not x["e2"]["w1"]), "newE2W4": rc(lambda x: x["e2"]["w5"] and not x["e2"]["w4"]),
            "resolvedE1W4": rc(lambda x: x["e1"]["w4"] and not x["e1"]["w5"]),
            "newE1W1Sources": srcs([r for r in rd if r["reading"]["e1"]["w5"] and not r["reading"]["e1"]["w1"]]),
        },
        "fourItems": {"count": sum(1 for r in ap if r["fourItems"]), "of": len(ap)},
        "area": {
            "w4VsW1": m(lambda r: _pp(r["area"]["w1"] - r["area"]["w4"], r["area"]["page"])),
            "w5SourceVsW1": m(lambda r: _pp(r["area"]["w1"] - r["area"]["w5Source"], r["area"]["page"])),
            "w5DisplayVsW1": m(lambda r: _pp(r["area"]["w1"] - r["area"]["w5Display"], r["area"]["page"])),
            "w5SourceVsW4": m(lambda r: _pp(r["area"]["w5Source"] - r["area"]["w4"], r["area"]["page"])),
            "displayGtW1": cnt(lambda r: r["area"]["w5Display"] > r["area"]["w1"]),
            "sourceOutsideW1": cnt(lambda r: r["sourceOutsideW1Rows"] > 0),
        },
    }


def summarize(rows, fixed22, sources, w1_mismatch, checks, meta):
    fixed = set(fixed22)
    sel = lambda f: [r for r in rows if f(r)]  # noqa: E731
    g = {"total": group_block(rows), "fixed22": group_block(sel(lambda r: r["id"] in fixed)), "other122": group_block(sel(lambda r: r["id"] not in fixed))}
    for k in REASONS:
        g[f"reason {k}"] = group_block(sel(lambda r, k=k: r["w5Reason"] == k))
    for s in "LR":
        g[f"side {s}"] = group_block(sel(lambda r, s=s: r["side"] == s))
    for h in ("normal", "blank", "dup"):
        g[f"header {h}"] = group_block(sel(lambda r, h=h: r["header"] == h))
    for a in ("same", "below"):
        g[f"ans {a}"] = group_block(sel(lambda r, a=a: r["ans"] == a))
    for c in CELLS:
        g[f"cell {c}"] = group_block(sel(lambda r, c=c: r["cell"] == c))
    for s in sources:
        g[f"source {s}"] = group_block(sel(lambda r, s=s: r["source"] == s))

    def rsel(name):
        if name == "total":
            return rows
        if name == "fixed22":
            return sel(lambda r: r["id"] in fixed)
        if name == "other122":
            return sel(lambda r: r["id"] not in fixed)
        return sel(lambda r: r["header"] == name[7:])
    reason_rows = [{"group": n, "counts": {x: sum(1 for r in rsel(n) if r["w5Reason"] == x) for x in REASONS}}
                   for n in ("total", "fixed22", "other122", "header normal", "header blank", "header dup")]
    fixed_rows = [{"id": r["id"], "key": r["key"], "w5Reason": r["w5Reason"],
                   **{it: (r["exposure"]["w5"][it] if r["exposure"]["w5"] else None) for it in ("targetHeader", "compHeader", "targetValue", "compValue")},
                   "place": r["placement"]["targetHeader"] if r["placement"] else None, "fourItems": r["fourItems"] is True,
                   "e1w4": bool(r["reading"] and r["reading"]["e1"]["w4"]), "e1w5": bool(r["reading"] and r["reading"]["e1"]["w5"])}
                  for r in rows if r["id"] in fixed]
    ids = lambda f: [r["id"] for r in rows if f(r)]  # noqa: E731
    lists = {"fixed22Applied": ids(lambda r: r["w4Reason"] == "applied"), "j4": ids(lambda r: r["event4"]), "j5": ids(lambda r: r["event5"]),
             "newE1W4": ids(lambda r: r["reading"] and r["reading"]["e1"]["w4"] and not r["reading"]["e1"]["w1"]),
             "e1W5": ids(lambda r: r["reading"] and r["reading"]["e1"]["w5"]), "reexposedPages": ids(lambda r: r["others"]["reexposed"] > 0),
             "w1KeptPixelMismatch": w1_mismatch, "fourItemsFail": ids(lambda r: r["fourItems"] is False)}
    trans = {}
    for r in rows:
        for o in r["others"]["items"]:
            k = f"{o['w1']}/{o['w4']}/{o['w5']}"
            trans[k] = trans.get(k, 0) + 1
    comp = {k: {v: sum(1 for r in rows if r["exposure"][k] and r["exposure"][k]["compValue"] == v) for v in ("full", "partial", "none")} for k in ("w1", "w4", "w5")}
    expt = {h: {k: {it: {v: sum(1 for r in rows if r["header"] == h and r["exposure"][k] and r["exposure"][k][it] == v)
                         for v in ("full", "partial", "none", "source_missing")}
                    for it in ("targetHeader", "compHeader", "compValue", "targetValue")} for k in ("w1", "w4", "w5")}
            for h in ("normal", "blank", "dup")}
    pairs = []
    for s in sources:
        for h in ("normal", "blank", "dup"):
            for a in ("same", "below"):
                L = next(r for r in rows if (r["source"], r["header"], r["ans"], r["side"]) == (s, h, a, "L"))
                R = next(r for r in rows if (r["source"], r["header"], r["ans"], r["side"]) == (s, h, a, "R"))
                f = lambda r: {"w5Reason": r["w5Reason"], "strict": r["strict"]["w5"], "e1": r["reading"]["e1"]["w5"] if r["reading"] else None, "fourItems": r["fourItems"]}  # noqa: E731
                fl, fr = f(L), f(R)
                fields = [k for k in fl if fl[k] != fr[k]]
                if fields:
                    pairs.append({"source": s, "header": h, "ans": a, "L": L["id"], "R": R["id"], "fields": fields})
    T, F, N = g["total"], g["fixed22"], g["header normal"]
    na = [r for r in rows if r["w4Reason"] != "applied"]
    C1 = {"L5": T["L5"]["count"], "w1KeptMatch": len(na) - len(w1_mismatch), "of": len(na)}
    C1["pass"] = C1["of"] > 0 and C1["L5"] == 0 and C1["w1KeptMatch"] == C1["of"]
    C2 = {"fixedE1W5": F["reading"]["e1"]["w5"], "fourItems": F["fourItems"]["count"], "of": F["n"], "newE1W1": N["reading"]["newE1W1"],
          "newE2W1": N["reading"]["newE2W1"], "normalPages": N["reading"]["pages"]}
    C2["pass"] = C2["of"] > 0 and C2["normalPages"] > 0 and C2["fixedE1W5"] == 0 and C2["fourItems"] == C2["of"] and C2["newE1W1"] == 0 and C2["newE2W1"] == 0
    C3 = {"J4": T["J4"], "J4kept": T["J4kept"]["count"], "reexposedItems": T["reexposed"]["items"]}
    C3["pass"] = C3["J4"] > 0 and C3["J4kept"] == C3["J4"] and C3["reexposedItems"] == 0
    C4 = {"checks": checks, "pass": all(v is True for v in checks.values())}
    failed = [k for k, c in (("C1", C1), ("C2", C2), ("C3", C3), ("C4", C4)) if not c["pass"]]
    not_eval = C1["of"] == 0 or C2["of"] == 0 or C2["normalPages"] == 0 or C3["J4"] == 0
    return {"version": "ko-header-strip-summary-1", "buildCommit": meta["buildCommit"], "coordsSha256": meta["coordsSha256"],
            "scoreStartedUtc": meta["startedUtc"], "pageArea": meta["pageArea"], "groups": g, "reasonRows": reason_rows,
            "fixedRows": fixed_rows, "lists": lists, "transitions": dict(sorted(trans.items())), "compValue": comp,
            "exposureTable": expt, "pairs": pairs,
            "verdict": {"C1": C1, "C2": C2, "C3": C3, "C4": C4, "status": "not_evaluable" if not_eval else "fail" if failed else "pass", "failed": failed}}


# ---------------------------------------------------------------- tables
def _cell(v):
    return "—" if v is None else ("S" if v else "F") if isinstance(v, bool) else str(v)


def _ppm(f):
    return pp_text(None if f is None else Fraction(int(f["num"]), int(f["den"])))


def tables(s):
    g = s["groups"]
    srcs = [k for k in g if k.startswith("source ")]
    names = ["total", "fixed22", "other122", "side L", "side R", "header normal", "header blank", "header dup", "ans same", "ans below", *[f"cell {c}" for c in CELLS], *srcs]
    lab = lambda k: {"total": "전체", "fixed22": "고정 22", "other122": "그 밖 122"}.get(k, k)  # noqa: E731
    T = {}
    T["groups"] = [["그룹", "n", "W5 표시", "W1 엄격", "W4 엄격", "W5 엄격", "L5/W1 성공", "L5 원본", "공통 기회", "J4", "J5", "J5 원본", "J4 유지", "재노출 항목", "재노출 쪽", "4항목/적용"]]
    for k in names:
        b = g[k]
        T["groups"].append([_cell(x) for x in (lab(k), b["n"], b["shown"], b["strict"]["w1"], b["strict"]["w4"], b["strict"]["w5"],
                                               f"{b['L5']['count']}/{b['L5']['denom']}", b["L5"]["sources"], b["opportunity"], b["J4"], b["J5"], b["J5Sources"],
                                               f"{b['J4kept']['count']}/{b['J4kept']['of']}", b["reexposed"]["items"], b["reexposed"]["pages"],
                                               f"{b['fourItems']['count']}/{b['fourItems']['of']}")])
    T["reasons"] = [["그룹", *REASONS]] + [[_cell(x) for x in (lab(r["group"]), *[r["counts"][x] for x in REASONS])] for r in s["reasonRows"]]
    T["reading"] = [["그룹", "비교 쪽", "E1 W1", "E1 W4", "E1 W5", "E1 W5 새(W1 기준)", "E1 W5 새(W4 기준)", "E1 W4→W5 해소", "E2 W1", "E2 W4", "E2 W5", "E2 W5 새(W1 기준)", "E2 W5 새(W4 기준)"]]
    for k in ("header normal", "fixed22", "cell L-normal-same", "cell L-normal-below", "cell R-normal-same", "cell R-normal-below"):
        r = g[k]["reading"]
        T["reading"].append([_cell(x) for x in (lab(k), r["pages"], r["e1"]["w1"], r["e1"]["w4"], r["e1"]["w5"], r["newE1W1"], r["newE1W4"], r["resolvedE1W4"],
                                                r["e2"]["w1"], r["e2"]["w4"], r["e2"]["w5"], r["newE2W1"], r["newE2W4"])])
    T["area"] = [["그룹", "쪽", "W4 감소 %p", "W5 원본 감소 %p", "W5 표시 감소 %p", "W5 원본 − W4 증가 %p", "표시 > W1 쪽", "W1 밖 원본 행 쪽"]]
    for k in ("total", "fixed22", "other122", *srcs):
        b = g[k]
        T["area"].append([_cell(x) for x in (lab(k), b["n"], _ppm(b["area"]["w4VsW1"]), _ppm(b["area"]["w5SourceVsW1"]), _ppm(b["area"]["w5DisplayVsW1"]),
                                             _ppm(b["area"]["w5SourceVsW4"]), b["area"]["displayGtW1"], b["area"]["sourceOutsideW1"])])
    T["transitions"] = [["W1/W4/W5", "항목 수"]] + [[k, str(v)] for k, v in s["transitions"].items()]
    T["compValue"] = [["창", "full", "partial", "none"]] + [[k.upper(), *[str(s["compValue"][k][v]) for v in ("full", "partial", "none")]] for k in ("w1", "w4", "w5")]
    f4 = lambda o, m: f"{o['full']}/{o['partial']}/{o['none']}" + (f"/{o['source_missing']}" if m else "")  # noqa: E731
    T["exposure"] = [["행", "목표 표제 f/p/n/m", "경쟁 표제 f/p/n/m", "경쟁 값 f/p/n", "목표 값 f/p/n"]]
    for h in ("normal", "blank", "dup"):
        for k in ("w1", "w4", "w5"):
            e = s["exposureTable"][h][k]
            T["exposure"].append([f"{h} {k.upper()}", f4(e["targetHeader"], True), f4(e["compHeader"], True), f4(e["compValue"], False), f4(e["targetValue"], False)])
    T["fixed22"] = [["ID", "키", "W5 사유", "목표 표제", "경쟁 표제", "목표 값", "경쟁 값", "목표 표제 출력 위치", "4항목", "E1 W4→W5"]]
    for r in s["fixedRows"]:
        T["fixed22"].append([_cell(x) for x in (r["id"], r["key"], r["w5Reason"], r["targetHeader"], r["compHeader"], r["targetValue"], r["compValue"],
                                                "[" + ",".join(map(str, r["place"])) + "]" if r["place"] else "—", "S" if r["fourItems"] else "F",
                                                ("E1" if r["e1w4"] else "-") + "→" + ("E1" if r["e1w5"] else "-"))])
    v = s["verdict"]
    T["verdict"] = [["조건", "값", "판정"],
                    ["C1", f"L5 {v['C1']['L5']}, W1 유지 일치 {v['C1']['w1KeptMatch']}/{v['C1']['of']}", "통과" if v["C1"]["pass"] else "미달"],
                    ["C2", f"고정 22 W5 E1 {v['C2']['fixedE1W5']}, 4항목 {v['C2']['fourItems']}/{v['C2']['of']}, 정상 {v['C2']['normalPages']}쪽 새 E1 {v['C2']['newE1W1']}·새 E2 {v['C2']['newE2W1']}(W1 기준)", "통과" if v["C2"]["pass"] else "미달"],
                    ["C3", f"J4 유지 {v['C3']['J4kept']}/{v['C3']['J4']}, 재노출 항목 {v['C3']['reexposedItems']}", "통과" if v["C3"]["pass"] else "미달"],
                    ["C4(채점기)", ", ".join(f"{k} {'S' if x else 'F'}" for k, x in v["C4"]["checks"].items()), "통과" if v["C4"]["pass"] else "미달"],
                    ["판정", ("미달 " + ",".join(v["failed"])) if v["failed"] else "미달 없음", v["status"]]]
    return T


BLOCK = re.compile(r"<!-- khs:table ([a-zA-Z0-9]+) -->\n([\s\S]*?)<!-- /khs:table -->")


def check_tables(md, summary):
    T = tables(summary)
    bad, seen = [], set()
    for m in BLOCK.finditer(md):
        name = m.group(1)
        seen.add(name)
        lines = [ln for ln in m.group(2).strip("\n").split("\n") if ln.strip()]
        got = [[c.strip() for c in ln.strip().strip("|").split("|")] for i, ln in enumerate(lines) if i != 1]
        want = T.get(name)
        if want is None:
            bad.append(f"{name}: unknown table")
            continue
        if len(got) != len(want):
            bad.append(f"{name}: {len(got)} rows != {len(want)}")
            continue
        for i, (a, b) in enumerate(zip(got, want)):
            if a != b:
                bad.append(f"{name} row {i}: {a} != {b}")
    missing = set(T) - seen
    if missing:
        bad.append(f"missing tables {sorted(missing)}")
    return bad


# ---------------------------------------------------------------- run
def load_build(build_dir):
    with open(os.path.join(build_dir, "coords.jsonl"), "rb") as f:
        cb = f.read()
    coords = jsonl(cb, "coords")
    with open(os.path.join(build_dir, "manifest.json"), "rb") as f:
        mb = f.read()
    manifest = json.loads(mb)
    w5 = {}
    for pid in IDS:
        p = os.path.join(build_dir, "w5", pid + ".png")
        if os.path.exists(p):
            with open(p, "rb") as f:
                w5[pid] = f.read()
    extra = {k: os.path.join(build_dir, k) for k in ("w1", "w4") if os.path.isdir(os.path.join(build_dir, k))}
    return {"coordsBytes": cb, "coords": coords, "manifestBytes": mb, "manifest": manifest, "w5": w5, "extra": extra}


def head_blob(path):
    try:
        return git("show", f"HEAD:{path}")
    except subprocess.CalledProcessError:
        return None


def rescore(S, coords, manifest, scoring, fixed22, swap=None):
    design, gold, render, ref = scoring
    dby = {d["id"]: d for d in design["images"]}
    if swap:
        a, b = swap
        dby[a], dby[b] = dby[b], dby[a]
    rows, ref_ok = [], True
    for i, c in enumerate(coords):
        d = dby[c["id"]]
        ink = render["images"][d["id"]]["items"]
        for part in gold["gold"][d["id"]]["parts"]:
            if ink[part["item"]]["ink"] != part["rect"]:
                raise IntegrityError("integrity_output", f"gold {c['id']}")
        row = score_page(c, d, ink, S.preds[i], ref[i], set(fixed22))
        ref_ok = ref_ok and reference_ok(row, ref[i])
        rows.append(row)
    na = [p["id"] for p in S.preds if p["w4Reason"] != "applied"]
    o = manifest["outputs"]
    w1_mm = [i for i in na if not o["w1"].get(i) or not o["w5"].get(i) or o["w1"][i]["pixelSha256"] != o["w5"][i]["pixelSha256"]
             or (o["w1"][i]["width"], o["w1"][i]["height"]) != (o["w5"][i]["width"], o["w5"][i]["height"])]
    return rows, ref_ok, w1_mm


def fixed22_equal(S, rows, fixed22):
    applied = [p["id"] for p in S.preds if p["w4Reason"] == "applied"]
    j4 = [r["id"] for r in rows if r["event4"]]
    ne = [r["id"] for r in rows if r["reading"] and r["reading"]["e1"]["w4"] and not r["reading"]["e1"]["w1"]]
    L = S.summary153["lists"]
    return all(x == fixed22 for x in (applied, L["applied"], L["event4"], L["readingNewE1W4"], j4, ne))


def recount(build_dir, score_dir, results=None, S=None, B=None, scoring=None, score_rows=None, summary=None, fixed22=None, swap=None, build_ids=None):
    """Returns (failures, details). Arguments after `results` are for in-memory tampering."""
    S = S or Source()
    B = B or load_build(build_dir)
    scoring = scoring or S.scoring()
    fixed22 = fixed22 if fixed22 is not None else REG["fixed22"]
    if score_rows is None:
        with open(os.path.join(score_dir, "score.jsonl"), "rb") as f:
            score_rows = jsonl(f.read(), "score")
    if summary is None:
        with open(os.path.join(score_dir, "summary.json"), encoding="utf-8") as f:
            summary = json.load(f)
    fails = []
    issues = check_build(S, B["coords"], B["manifest"], B["w5"], ids=build_ids, extra_dirs=B["extra"])
    for pid, cat, detail in issues:
        fails.append({"check": "build", "id": pid, "category": cat, "detail": detail})
    if B["manifest"].get("coordsSha256") != sha(B["coordsBytes"]):
        fails.append({"check": "build", "id": None, "category": "manifest_mismatch", "detail": "coordsSha256"})
    rows, ref_ok, w1_mm = rescore(S, B["coords"], B["manifest"], scoring, fixed22, swap)
    if not ref_ok:
        fails.append({"check": "reference", "category": "reference_mismatch", "detail": "#153 W1/W4 not reproduced"})
    if len(score_rows) != len(rows):
        fails.append({"check": "score", "category": "score_mismatch", "detail": "row count"})
    for a, b in zip(rows, score_rows):
        if a != b:
            fails.append({"check": "score", "id": a["id"], "category": "score_mismatch", "detail": sorted(k for k in a if a.get(k) != b.get(k))})
    f22 = fixed22_equal(S, rows, fixed22)
    if not f22:
        fails.append({"check": "fixed22", "category": "fixed22_mismatch", "detail": "registered set differs"})
    hc, hm = head_blob(f"{PUBLISHED}/coords.jsonl"), head_blob(f"{PUBLISHED}/manifest.json")
    checks = {"referenceW1W4": ref_ok, "fixed22Equal": f22, "buildMatchesHead": hc == B["coordsBytes"] and hm == B["manifestBytes"],
              "manifestCoords": B["manifest"].get("coordsSha256") == sha(B["coordsBytes"])}
    design = scoring[0]
    want = summarize(rows, fixed22, [s["source"] for s in design["sources"]], w1_mm, checks,
                     {"buildCommit": summary.get("buildCommit"), "coordsSha256": sha(B["coordsBytes"]), "startedUtc": summary.get("scoreStartedUtc"),
                      "pageArea": B["coords"][0]["page"]["width"] * B["coords"][0]["page"]["height"]})
    if want != summary:
        diff = sorted(k for k in want if want.get(k) != summary.get(k))
        fails.append({"check": "summary", "category": "summary_mismatch", "detail": diff})
    if results:
        with open(results, encoding="utf-8") as f:
            md = f.read()
        for b in check_tables(md, want):
            fails.append({"check": "tables", "category": "table_mismatch", "detail": b})
    return fails, {"rows": len(rows), "w5Files": len(B["w5"]), "buildIssues": len(issues), "checks": checks, "verdict": want["verdict"]["status"]}


# ---------------------------------------------------------------- tampering
def _first(coords, kind):
    return next(c["id"] for c in coords if c["w5Kind"] == kind)


def _reencode(png, f):
    (w, h), px = decode(png)
    rows = [bytearray(px[y * w:(y + 1) * w]) for y in range(h)]
    rows, size = f(rows, w, h)
    return encode(size, b"".join(bytes(r) for r in rows))


def _sync(man, pid, png):
    (w, h), px = decode(png)
    man["outputs"]["w5"][pid].update({"bytes": len(png), "sha256": sha(png), "width": w, "height": h, "pixelSha256": sha(px)})


def mutate(build_dir, score_dir, results):
    S = Source()
    B0 = load_build(build_dir)
    scoring = S.scoring()
    with open(os.path.join(score_dir, "score.jsonl"), "rb") as f:
        rows0 = jsonl(f.read(), "score")
    with open(os.path.join(score_dir, "summary.json"), encoding="utf-8") as f:
        sum0 = json.load(f)
    two = _first(B0["coords"], "two_bands") if any(c["w5Kind"] == "two_bands" for c in B0["coords"]) else None
    merged = next((c["id"] for c in B0["coords"] if c["w5Kind"] == "merged"), None)
    kept = _first(B0["coords"], "w1")
    out = []

    def run(name, expect, edit, ids=None, na=None):
        if na:
            out.append({"tamper": name, "notApplicable": na})
            return
        B = copy.deepcopy(B0)
        kw = edit(B) or {}
        fails, _ = recount(build_dir, score_dir, results, S=S, B=B, scoring=scoring,
                           score_rows=kw.get("rows", rows0), summary=kw.get("summary", sum0), fixed22=kw.get("fixed22"),
                           swap=kw.get("swap"), build_ids=ids)
        cats = sorted({f["category"] for f in fails})
        out.append({"tamper": name, "expected": expect, "detected": cats, "rejected": bool(fails),
                    "expectedSeen": any(c in cats for c in expect), "pixelMismatchReported": "pixel_mismatch" in cats})

    def shift(B):
        c = next(x for x in B["coords"] if x["id"] == two)
        b = c["pieces"][2]["displayRect"]

        def f(rows, w, h):
            for y in range(b[1], b[3]):
                rows[y] = bytearray([rows[y][0]]) + rows[y][:-1]
            return rows, (w, h)
        B["w5"][two] = _reencode(B["w5"][two], f)
        _sync(B["manifest"], two, B["w5"][two])
    run("w5_segment_shift_x1", ["pixel_mismatch"], shift, ids=[two], na=None if two else "no two-band page")

    def flip(B):
        B["w5"][two] = _reencode(B["w5"][two], lambda rows, w, h: ([r[::-1] for r in rows], (w, h)))
        _sync(B["manifest"], two, B["w5"][two])
    run("w5_flip_horizontal", ["pixel_mismatch"], flip, ids=[two], na=None if two else "no two-band page")

    def yoff(B):
        c = next(x for x in B["coords"] if x["id"] == two)
        r = c["pieces"][2]["sourceRect"]
        r[1] += 1
        r[3] += 1
    run("coords_y_off_by_one", ["coords_mismatch"], yoff, ids=[two], na=None if two else "no two-band page")

    def swap_bands(B):
        c = next(x for x in B["coords"] if x["id"] == two)
        hR, sR, bR = (p["displayRect"] for p in c["pieces"])

        def f(rows, w, h):
            Hs, Ss, Bs = rows[hR[1]:hR[3]], rows[sR[1]:sR[3]], rows[bR[1]:bR[3]]
            return Bs + Ss + Hs, (w, h)
        B["w5"][two] = _reencode(B["w5"][two], f)
        _sync(B["manifest"], two, B["w5"][two])
    run("band_order_swap", ["pixel_mismatch", "dimension_mismatch"], swap_bands, ids=[two], na=None if two else "no two-band page")

    target = merged or two

    def dup(B):
        c = next(x for x in B["coords"] if x["id"] == target)
        (W, H), src, _ = S.pixels(target)
        Hr, Br = (c["H"], c["B"])
        rows = [src[y][Br[0]:Br[2]] for y in range(Hr[1], Hr[3])] + [src[y][Br[0]:Br[2]] for y in range(Br[1], Br[3])]
        B["w5"][target] = encode((Br[2] - Br[0], len(rows)), b"".join(rows))
        _sync(B["manifest"], target, B["w5"][target])
    run("overlap_rows_duplicated", ["dimension_mismatch", "pixel_mismatch"], dup, ids=[target], na=None if target else "no merged or two-band page")

    def prov_missing(B):
        c = next(x for x in B["coords"] if x["id"] == two)
        del c["pieces"][0]
    run("provenance_missing", ["coords_mismatch"], prov_missing, ids=[two], na=None if two else "no two-band page")

    def prov_wrong(B):
        c = next(x for x in B["coords"] if x["id"] == two)
        c["pieces"][0]["sourceRect"][0] += 260
        c["pieces"][0]["sourceRect"][2] += 260
    run("provenance_wrong", ["coords_mismatch"], prov_wrong, ids=[two], na=None if two else "no two-band page")

    def sep_luma(B):
        c = next(x for x in B["coords"] if x["id"] == two)
        y = c["pieces"][1]["displayRect"][1] + 3

        def f(rows, w, h):
            rows[y][0] = 127
            return rows, (w, h)
        B["w5"][two] = _reencode(B["w5"][two], f)
        _sync(B["manifest"], two, B["w5"][two])
    run("separator_luma_changed", ["pixel_mismatch"], sep_luma, ids=[two], na=None if two else "no two-band page")

    def sep_h(B):
        c = next(x for x in B["coords"] if x["id"] == two)
        c["pieces"][1]["displayRect"][3] += 1
    run("separator_height_changed", ["coords_mismatch", "structure"], sep_h, ids=[two], na=None if two else "no two-band page")

    def kept_px(B):
        def f(rows, w, h):
            rows[0][0] = (rows[0][0] + 1) % 256
            return rows, (w, h)
        B["w5"][kept] = _reencode(B["w5"][kept], f)
        _sync(B["manifest"], kept, B["w5"][kept])
    run("w1_kept_pixel_changed", ["pixel_mismatch"], kept_px, ids=[kept])

    def plus_one(B):
        def f(rows, w, h):
            rows[h - 1][w // 2] = (rows[h - 1][w // 2] + 1) % 256
            return rows, (w, h)
        B["w5"][two] = _reencode(B["w5"][two], f)  # manifest left unchanged: a small pixel difference, not metadata
    run("pixel_value_plus_one", ["pixel_mismatch"], plus_one, ids=[two], na=None if two else "no two-band page")

    def meta(B):
        png = B["w5"][kept]
        body = b"tEXt" + b"k\x00v"
        chunk = struct.pack(">I", 3) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        B["w5"][kept] = png[:-12] + chunk + png[-12:]
    run("png_metadata_only", ["metadata_only"], meta, ids=[kept])

    def man_hash(B):
        e = B["manifest"]["outputs"]["w5"][kept]
        e["sha256"] = ("0" if e["sha256"][0] != "0" else "1") + e["sha256"][1:]
    run("manifest_file_hash", ["manifest_mismatch"], man_hash, ids=[kept])

    fx = REG["fixed22"]
    nonfixed = next(c["id"] for c in B0["coords"] if c["id"] not in fx)
    run("gold_join_swapped", ["score_mismatch"], lambda B: {"swap": (fx[0], nonfixed)}, ids=[kept])

    def denom(B):
        s = copy.deepcopy(sum0)
        t = s["groups"]["total"]
        t["opportunity"], t["J5"] = t["J5"], t["opportunity"]
        return {"summary": s}
    run("denominator_swapped", ["summary_mismatch"], denom, ids=[kept])
    run("fixed22_id_removed", ["fixed22_mismatch"], lambda B: {"fixed22": fx[1:]}, ids=[kept])

    def verdict(B):
        s = copy.deepcopy(sum0)
        s["verdict"]["status"] = "fail" if s["verdict"]["status"] == "pass" else "pass"
        return {"summary": s}
    run("verdict_changed", ["summary_mismatch"], verdict, ids=[kept])

    names = [o["tamper"] for o in out]
    if names != REG["tampers"]:
        raise SystemExit(f"tamper list differs from registration: {names}")
    applicable = [o for o in out if "notApplicable" not in o]
    return {"tampers": len(out), "allRejected": all(o["rejected"] and o["expectedSeen"] for o in applicable),
            "metadataNotPixel": next(o for o in out if o["tamper"] == "png_metadata_only").get("pixelMismatchReported") is False,
            "notApplicable": [o["tamper"] for o in out if "notApplicable" in o], "results": out}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", required=True)
    ap.add_argument("--score", required=True)
    ap.add_argument("--results")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--out")
    g.add_argument("--mutate")
    a = ap.parse_args()
    dest = a.out or a.mutate
    if os.path.exists(dest):
        print(f"refusing: {dest} exists", file=sys.stderr)
        return 2
    try:
        if a.mutate:
            r = mutate(a.build, a.score, a.results)
            with open(dest, "w", encoding="utf-8", newline="\n") as f:
                json.dump(r, f, ensure_ascii=False, indent=1)
                f.write("\n")
            print(json.dumps({"allRejected": r["allRejected"], "tampers": r["tampers"], "metadataNotPixel": r["metadataNotPixel"], "notApplicable": r["notApplicable"]}))
            return 0 if r["allRejected"] and r["metadataNotPixel"] else 1
        fails, info = recount(a.build, a.score, a.results)
    except (IntegrityError, ContractError) as e:
        print(f"input damaged: {e}", file=sys.stderr)
        return 2
    with open(dest, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"ok": not fails, "failed": fails, **info}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(json.dumps({"ok": not fails, "failed": len(fails), "verdict": info["verdict"]}))
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
