"""ko-blind-reader: seeded generator of the 18 new Korean table sources, the method assignment and the order.

Protocol: research/plans/2026-11-25-ko-blind-reader-protocol.md; registered values: registered.json (same folder).

Usage:
  python generate.py --mock --font <NotoSansKR-VF.ttf> --out <new dir>            # public mock seed
  python generate.py --seed-file <seed.json> --font <font> --out <new dir>          # real seed (admin folder only)
  python generate.py --check-pools --font <font>                                    # pool filter and width report

Output (all inside --out, which must not exist):
  design.json            render input for research/tools/r09/render.py (unchanged renderer)
  plan.json              per source: stratum, method, order position, flags, kind, texts, answer, ids (secret for real)
  selector/questions.json  OCR-side input (image id, file, question) in image id order
  summary.json           counts and pass flags only
stdout: one JSON line with counts, pass flags and SHA-256 of the written files. Never texts, values or assignment.
"""
import argparse
import hashlib
import hmac
import io
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
REG = json.loads((HERE / "registered.json").read_text(encoding="utf-8"))
DES = REG["design"]
METHODS = DES["methods"]
QTYPES = DES["qtypes"]
SIDES = DES["sides"]
RECORDS = 3
PAGE = {"width": 1280, "height": 960}
PAD_X = 12
LABEL_X = (40, 320)
COL_X = {"L": (360, 580), "R": (620, 840)}
NOTE_X = (1060, 1250)
TITLE_CELL = [40, 28, 1000, 84]
FRAME_X = (24, 1256)
HEADER_Y = 104
LINE = 40
BLOCK = 80
GAP = 8
Y0 = 160
RULES_Y = [96, 150]
SUFFIX = DES["suffix"]
UNIT = DES["unit"]
WHITE_SPACE = set(chr(c) for c in list(range(0x09, 0x0E)) + [0x20, 0x85, 0xA0, 0x1680] + list(range(0x2000, 0x200B)) + [0x2028, 0x2029, 0x202F, 0x205F, 0x3000])
GRAMMAR = {
    "time": re.compile(r"^(?:[0-9]|[01][0-9]|2[0-3]):[0-5][0-9]$", re.ASCII),
    "count": re.compile(r"^[1-9][0-9]{0,2}명$", re.ASCII),
    "pages": re.compile(r"^[1-9][0-9]{0,2}쪽$", re.ASCII),
}
QUESTION_RE = re.compile(r"^(?P<record>.+)의 (?P<field>[가-힣]+(?: [가-힣]+)* ?(?P<suffix>시각|인원|분량))(?P<josa>은|는) 몇 (?P<unit>시|명|쪽)인가요\?$")
HANGUL_RUN = re.compile("[가-힣]+")
ASCII_ALNUM = re.compile("[A-Za-z0-9]")
CUE_WORDS = ["시각", "인원", "분량"]


class GenerationError(Exception):
    pass


# ------------------------------------------------------------------ text helpers (same definitions as #153 design.py)
def squash(text):
    return "".join(ch for ch in unicodedata.normalize("NFKC", text) if ch not in WHITE_SPACE)


def fold(text):
    out, prev = [], False
    for ch in unicodedata.normalize("NFKC", text):
        if ch in WHITE_SPACE:
            if not prev:
                out.append(" ")
            prev = True
        else:
            out.append(ch)
            prev = False
    return "".join(out).strip(" ")


def bigrams(text):
    out = set()
    for run in HANGUL_RUN.findall(unicodedata.normalize("NFC", text)):
        for i in range(len(run) - 1):
            out.add(run[i:i + 2])
    return out


def norm_q(q):
    return " ".join(unicodedata.normalize("NFC", q).split())


def parse_question(q):
    f = fold(q)
    if f.count("의 ") != 1:
        return None
    m = QUESTION_RE.fullmatch(f)
    if not m:
        return None
    t = {"시각": "time", "인원": "count", "분량": "pages"}[m.group("suffix")]
    if UNIT[t] != m.group("unit"):
        return None
    return {"record": m.group("record"), "field": m.group("field"), "qtype": t}


def value_key(qtype, text):
    """Comparable number of a generated value text."""
    if qtype == "time":
        h, m = text.split(":")
        return int(h) * 60 + int(m)
    return int(text[:-1])


# ------------------------------------------------------------------ DRBG (registered: HMAC-SHA256 counter mode)
class Drbg:
    def __init__(self, seed: bytes, stream: str):
        if len(seed) < 32:
            raise GenerationError("seed must be at least 32 bytes")
        self.seed, self.stream, self.counter, self.buf = seed, stream, 0, b""

    def read(self, n):
        while len(self.buf) < n:
            msg = self.stream.encode("utf-8") + b"\x00" + self.counter.to_bytes(8, "big")
            self.buf += hmac.new(self.seed, msg, hashlib.sha256).digest()
            self.counter += 1
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def randbelow(self, n):
        if n <= 0:
            raise GenerationError("randbelow of a non-positive bound")
        limit = (1 << 64) - ((1 << 64) % n)
        while True:
            u = int.from_bytes(self.read(8), "big")
            if u < limit:
                return u % n

    def shuffle(self, a):
        a = list(a)
        for i in range(len(a) - 1, 0, -1):
            j = self.randbelow(i + 1)
            a[i], a[j] = a[j], a[i]
        return a

    def choice(self, a):
        return a[self.randbelow(len(a))]

    def sample(self, a, k):
        return self.shuffle(a)[:k]


# ------------------------------------------------------------------ prior corpus and near reuse (registered priorCorpus)
def git(args, binary=True):
    flags = 0x08000000 if sys.platform == "win32" else 0  # CREATE_NO_WINDOW
    out = subprocess.run(["git", *args], cwd=HERE, capture_output=True, check=True, creationflags=flags)
    return out.stdout if binary else out.stdout.decode("utf-8")


def prior_corpus():
    """Strings containing Hangul in the pinned prior files, and their questions. Checks every blob id."""
    strings, questions = set(), set()
    for f in REG["priorCorpus"]["files"]:
        at = git(["rev-parse", f"{f['commit']}:{f['path']}"], binary=False).strip()
        if at != f["blob"]:
            raise GenerationError(f"prior file {f['path']} at {f['commit'][:8]} is {at}, not {f['blob']}")
        data = json.loads(git(["cat-file", "blob", f["blob"]]).decode("utf-8"))

        def walk(o):
            if isinstance(o, dict):
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
            elif isinstance(o, str) and HANGUL_RUN.search(o):
                strings.add(o)
        walk(data)
        if isinstance(data, dict) and isinstance(data.get("questions"), list):
            for q in data["questions"]:
                if isinstance(q, dict) and isinstance(q.get("question"), str):
                    questions.add(norm_q(q["question"]))
    return sorted(strings), questions


def prior_images():
    shas = set()
    for t in REG["priorCorpus"]["imageTrees"]:
        at = git(["rev-parse", f"{t['commit']}:{t['path']}"], binary=False).strip()
        if at != t["tree"]:
            raise GenerationError(f"prior tree {t['path']} is {at}, not {t['tree']}")
        for line in git(["ls-tree", "--full-tree", t["tree"]], binary=False).strip().split("\n"):
            meta, _name = line.split("\t")
            shas.add(hashlib.sha256(git(["cat-file", "blob", meta.split(" ")[2]])).hexdigest())
    return shas


def label_reused(label, corpus):
    s, b = squash(label), bigrams(label)
    for c in corpus:
        if s in squash(c):
            return True
        if b and len(b & bigrams(c)) * 2 >= len(b):
            return True
    return False


def field_reused(field, corpus):
    s = squash(field)
    return any(s in squash(c) for c in corpus)


# ------------------------------------------------------------------ font widths (registered max widths)
def load_font(font_path):
    if not font_path:
        return None
    from PIL import ImageFont
    data = Path(font_path).read_bytes()
    if hashlib.sha256(data).hexdigest() != REG["fixed"]["font"]["sha256"]:
        raise GenerationError("font SHA-256 differs from the registered font")
    font = ImageFont.truetype(io.BytesIO(data), REG["fixed"]["font"]["bodySize"], layout_engine=ImageFont.Layout.BASIC)
    font.set_variation_by_axes([REG["fixed"]["font"]["weight"]])
    return font


def text_width(font, text):
    box = font.getbbox(text)
    return box[2] - box[0]


def pool_report(font):
    """Deterministic pool filter: prior near reuse, then widths. Returns the filtered pools and counts."""
    corpus, _ = prior_corpus()
    pools = REG["pools"]
    kinds, removed = [], {"labelReuse": [], "labelWidth": [], "labelBigrams": [], "fieldReuse": [], "fieldWord": [], "fieldWidth": [], "auxWidth": [], "noteWidth": []}
    for k in pools["kinds"]:
        keep = []
        for lab in k["labels"]:
            if label_reused(lab, corpus):
                removed["labelReuse"].append(lab)
            elif len(bigrams(lab)) < 4:
                removed["labelBigrams"].append(lab)
            elif font and text_width(font, lab) > DES["labelMaxWidthPx"]:
                removed["labelWidth"].append(lab)
            else:
                keep.append(lab)
        kinds.append({**k, "labels": keep})
    pairs = {}
    for t in QTYPES:
        keep = []
        for pair in pools["fieldPairs"][t]:
            bad = [f for f in pair if field_reused(f, corpus)]
            wide = [f for f in pair if font and text_width(font, f) > DES["headerMaxWidthPx"]]
            word2 = all(re.fullmatch("[가-힣]{2} " + SUFFIX[t], f) for f in pair)
            if bad:
                removed["fieldReuse"].append(pair)
            elif not word2:
                removed["fieldWord"].append(pair)
            elif wide:
                removed["fieldWidth"].append(pair)
            else:
                keep.append(pair)
        pairs[t] = keep
    aux = [a for a in pools["aux"] if not (font and text_width(font, a) > DES["auxMaxWidthPx"])]
    notes = [n for n in pools["notes"] if not (font and text_width(font, n) > DES["noteMaxWidthPx"])]
    removed["auxWidth"] = [a for a in pools["aux"] if a not in aux]
    removed["noteWidth"] = [n for n in pools["notes"] if n not in notes]
    return {"kinds": kinds, "fieldPairs": pairs, "aux": aux, "notes": notes}, removed


# ------------------------------------------------------------------ assignment and order (registered design)
def assign_structure(seed):
    """Strata, method per source, flags (larger, natural first, slot), kind per source."""
    d = Drbg(seed, "assign")
    sources = []
    for si, (qtype, side) in enumerate(DES["strataOrder"]):
        perm = d.shuffle(METHODS)
        for j in range(DES["perStratum"]):
            sources.append({"index": len(sources), "stratum": si, "qtype": qtype, "side": side, "method": perm[j]})
    for flag in ["larger", "naturalFirst"]:
        for m in METHODS:
            mine = [s for s in sources if s["method"] == m]
            more = d.choice(SIDES)
            for side in SIDES:
                group = [s for s in mine if s["side"] == side]
                k = 2 if side == more else 1
                chosen = set(x["index"] for x in d.sample(group, k))
                for s in group:
                    s[flag] = s["index"] in chosen
    for m in METHODS:
        mine = [s for s in sources if s["method"] == m]
        slots = d.shuffle(DES["slotsPerMethod"])
        for s, slot in zip(mine, slots):
            s["slot"] = slot
    dk = Drbg(seed, "kind")
    kinds = dk.shuffle([k["id"] for k in REG["pools"]["kinds"] for _ in range(3)])
    for s, k in zip(sources, kinds):
        s["kind"] = k
    return sources


def order_problems(sources, order):
    """Registered order constraints on a permutation of source indices."""
    probs = []
    by = {s["index"]: s for s in sources}
    if sorted(order) != list(range(len(sources))):
        return ["order is not a permutation"]
    bs = DES["blockSize"]
    for b in range(DES["blocks"]):
        blk = [by[i] for i in order[b * bs:(b + 1) * bs]]
        for m in METHODS:
            if sum(s["method"] == m for s in blk) != 2:
                probs.append(f"block {b} method count")
        for t in QTYPES:
            if sum(s["qtype"] == t for s in blk) != 2:
                probs.append(f"block {b} type count")
        if sum(s["side"] == "L" for s in blk) != 3:
            probs.append(f"block {b} side count")
    run = 1
    for i in range(1, len(order)):
        run = run + 1 if by[order[i]]["method"] == by[order[i - 1]]["method"] else 1
        if run > DES["maxSameMethodRun"]:
            probs.append(f"same method run at position {i + 1}")
    return probs


def draw_order(seed, sources):
    d = Drbg(seed, "order")
    for attempt in range(DES["orderMaxTries"]):
        order = d.shuffle(range(len(sources)))
        if not order_problems(sources, order):
            return order, attempt + 1
    raise GenerationError("no admissible order within the registered number of tries")


def structure_problems(sources):
    """Per method: 2 per type, 3 L / 3 R, larger 3/3 with side counts in {1,2}, natural first likewise, slots 2/2/2."""
    probs = []
    if len(sources) != DES["sources"]:
        probs.append("source count")
    for st in range(len(DES["strataOrder"])):
        ms = sorted(s["method"] for s in sources if s["stratum"] == st)
        if ms != sorted(METHODS):
            probs.append(f"stratum {st} methods")
    for m in METHODS:
        mine = [s for s in sources if s["method"] == m]
        if len(mine) != 6:
            probs.append(f"{m} count")
        for t in QTYPES:
            if sum(s["qtype"] == t for s in mine) != 2:
                probs.append(f"{m} type")
        for flag in ["larger", "naturalFirst"]:
            if sum(s[flag] for s in mine) != 3:
                probs.append(f"{m} {flag} total")
            for side in SIDES:
                c = sum(s[flag] for s in mine if s["side"] == side)
                if c not in (1, 2):
                    probs.append(f"{m} {flag} {side}")
        if sorted(s["slot"] for s in mine) != sorted(DES["slotsPerMethod"]):
            probs.append(f"{m} slots")
    if sum(s["larger"] for s in sources) != 9:
        probs.append("larger overall")
    return probs


# ------------------------------------------------------------------ content (registered generation.perSource)
def value_text(qtype, d, digits):
    if qtype == "time":
        return f"{10 + d.randbelow(11)}:{10 * d.randbelow(6):02d}"
    if qtype == "count":
        return f"{10 + d.randbelow(86)}명"
    if digits == 2:
        return f"{12 + d.randbelow(88)}쪽"
    return f"{100 + d.randbelow(141)}쪽"


def build_page(src, kind):
    side = src["side"]
    tx, cx = COL_X[side], COL_X["R" if side == "L" else "L"]

    def cell(x, y0):
        return [x[0], y0, x[1], y0 + LINE]

    def hrule(y):
        return [FRAME_X[0], y, FRAME_X[1], y + 2]
    items = [{"id": "title", "role": "title", "text": kind["title"], "cell": list(TITLE_CELL), "size": "title"},
             {"id": "h-label", "role": "header", "text": kind["labelHeader"], "cell": cell(LABEL_X, HEADER_Y), "size": "body"},
             {"id": "h-target", "role": "header", "text": src["field"], "cell": cell(tx, HEADER_Y), "size": "body"},
             {"id": "h-comp", "role": "header", "text": src["compField"], "cell": cell(cx, HEADER_Y), "size": "body"}]
    rules = [hrule(y) for y in RULES_Y]
    for s in range(RECORDS):
        ya = Y0 + s * (BLOCK + GAP)
        yb = ya + LINE
        items += [
            {"id": f"r{s}-label", "role": "label", "record": s, "text": src["labels"][s], "cell": cell(LABEL_X, ya), "size": "body"},
            {"id": f"r{s}-tval", "role": "target_value", "record": s, "text": src["targetValues"][s], "cell": cell(tx, ya), "size": "body"},
            {"id": f"r{s}-taux", "role": "aux", "record": s, "text": src["targetAux"][s], "cell": cell(tx, yb), "size": "body"},
            {"id": f"r{s}-cval", "role": "comp_value", "record": s, "text": src["compValues"][s], "cell": cell(cx, ya), "size": "body"},
            {"id": f"r{s}-caux", "role": "aux", "record": s, "text": src["compAux"][s], "cell": cell(cx, yb), "size": "body"},
            {"id": f"r{s}-note", "role": "note", "record": s, "text": src["notes"][s], "cell": cell(NOTE_X, ya), "size": "body"},
        ]
        if s < RECORDS - 1:
            rules.append(hrule(ya + BLOCK + GAP // 2 - 1))
    slot = src["slot"]
    return {"page": dict(PAGE), "items": items, "rules": rules, "answer": src["targetValues"][slot],
            "goldItems": [f"r{slot}-label", f"r{slot}-tval"], "anchorItem": f"r{slot}-label", "valueItem": f"r{slot}-tval",
            "compValueItem": f"r{slot}-cval", "targetHeaderItem": "h-target", "compHeaderItem": "h-comp",
            "otherValueItems": [f"r{s}-tval" for s in range(RECORDS) if s != slot], "targetColumn": list(tx), "compColumn": list(cx)}


def page_problems(src, page, font=None):
    """Registered page rules (generation.pageRules)."""
    probs = []
    q = src["question"]
    label = src["labels"][src["slot"]]
    if q.count(label) != 1:
        probs.append("question label count")
    p = parse_question(q)
    if not p or p["record"] != label or squash(p["field"]) != squash(src["field"]) or p["qtype"] != src["qtype"]:
        probs.append("question parse")
    for lab in src["labels"]:
        if len(bigrams(lab)) < 4:
            probs.append("label bigrams")
    qb, lb = bigrams(q), bigrams(label)
    for it in page["items"]:
        b = bigrams(it["text"])
        if it["id"] != f"r{src['slot']}-label" and b & lb:
            probs.append(f"{it['id']} shares a bigram with the target label")
        shared = len(b & qb)
        if it["id"] == "h-label":
            if shared:
                probs.append("label header shares a bigram with the question")
        elif it["role"] in ("header", "title"):
            if shared > 2:
                probs.append(f"{it['id']} shares > 2 bigrams with the question")
        elif it["id"] != f"r{src['slot']}-label" and shared:
            probs.append(f"{it['id']} shares a bigram with the question")
        is_value = it["role"] in ("target_value", "comp_value")
        for t in QTYPES:
            if GRAMMAR[t].fullmatch(squash(it["text"])) and not is_value:
                probs.append(f"{it['id']} matches a value grammar")
        if is_value and not GRAMMAR[src["qtype"]].fullmatch(squash(it["text"])):
            probs.append(f"{it['id']} value grammar")
        if not is_value and ASCII_ALNUM.search(it["text"]):
            probs.append(f"{it['id']} ASCII")
        if it["role"] != "header" or it["id"] == "h-label":
            if any(c in squash(it["text"]) for c in CUE_WORDS):
                probs.append(f"{it['id']} contains a cue word")
        if font:
            limit = {"label": DES["labelMaxWidthPx"], "header": DES["headerMaxWidthPx"], "aux": DES["auxMaxWidthPx"], "note": DES["noteMaxWidthPx"],
                     "target_value": DES["headerMaxWidthPx"], "comp_value": DES["headerMaxWidthPx"]}.get(it["role"])
            if it["id"] == "h-label":
                limit = DES["labelMaxWidthPx"]
            if limit and text_width(font, it["text"]) > limit:
                probs.append(f"{it['id']} too wide")
    vals = src["targetValues"] + src["compValues"]
    if len(set(vals)) != 6 or len(set(value_key(src["qtype"], v) for v in vals)) != 6:
        probs.append("values not distinct")
    if ASCII_ALNUM.search(label):
        probs.append("label ASCII")
    return probs


def draw_content(seed, s, kind, pools, used):
    for attempt in range(DES["contentMaxAttempts"]):
        d = Drbg(seed, f"content:{s['index']}:{attempt}")
        pairs = [p for p in pools["fieldPairs"][s["qtype"]] if tuple(p) not in used["pairs"]]
        labels = [x for x in kind["labels"] if x not in used["labels"]]
        if not pairs or len(labels) < RECORDS:
            raise GenerationError("pool exhausted")
        pair = d.choice(pairs)
        field, comp = (pair[0], pair[1]) if s["naturalFirst"] else (pair[1], pair[0])
        labs = d.sample(labels, RECORDS)
        digits = (2 if d.randbelow(2) == 0 else 3) if s["qtype"] == "pages" else None
        vals = []
        while len(vals) < 2 * RECORDS:
            v = value_text(s["qtype"], d, digits)
            if v not in vals:
                vals.append(v)
        tvals, cvals = vals[:RECORDS], vals[RECORDS:]
        slot = s["slot"]
        bigger = value_key(s["qtype"], tvals[slot]) > value_key(s["qtype"], cvals[slot])
        if bigger != s["larger"]:
            tvals[slot], cvals[slot] = cvals[slot], tvals[slot]
        aux = d.sample(pools["aux"], 2 * RECORDS)
        notes = d.sample(pools["notes"], RECORDS)
        src = {**s, "pair": list(pair), "field": field, "compField": comp, "labels": labs, "digits": digits,
               "targetValues": tvals, "compValues": cvals, "targetAux": aux[:RECORDS], "compAux": aux[RECORDS:], "notes": notes,
               "question": DES["question"][s["qtype"]].format(label=labs[slot], field=field), "attempts": attempt + 1}
        page = build_page(src, kind)
        if not page_problems(src, page, used["font"]):
            used["pairs"].add(tuple(pair))
            used["labels"].update(labs)
            return src, page
    raise GenerationError(f"source {s['index']}: no admissible content within the registered attempts")


def generate(seed, font=None, exclude=None, corpus=None, set_name="mock"):
    pools, removed = pool_report(font) if corpus is None else corpus
    sources = assign_structure(seed)
    probs = structure_problems(sources)
    if probs:
        raise GenerationError(f"structure: {len(probs)} problems")
    order, order_tries = draw_order(seed, sources)
    used = {"pairs": set(), "labels": set(), "font": font}
    if exclude:
        used["pairs"].update(tuple(p) for p in exclude["pairs"])
        used["labels"].update(exclude["labels"])
    kinds = {k["id"]: k for k in pools["kinds"]}
    did = Drbg(seed, "ids")
    out = []
    ids = set()
    for s in sources:
        src, page = draw_content(seed, s, kinds[s["kind"]], pools, used)
        while True:
            iid = "q" + did.read(4).hex()
            if iid not in ids:
                ids.add(iid)
                break
        src["imageId"], src["file"] = iid, f"{iid}.png"
        src["position"] = order.index(s["index"]) + 1
        src["answer"] = src["targetValues"][s["slot"]]
        out.append((src, page))
    dp = Drbg(seed, "packet")
    packet_id = "kbr-" + dp.read(8).hex()
    return {"sources": out, "order": order, "orderTries": order_tries, "packetId": packet_id, "removed": removed, "set": set_name}


def mock_exclusion(font, corpus):
    g = generate(bytes.fromhex(REG["drbg"]["mockSeedHex"]), font, None, corpus, "mock")
    return {"pairs": [s["pair"] for s, _ in g["sources"]], "labels": [x for s, _ in g["sources"] for x in s["labels"]]}


def design_json(g):
    images = []
    for src, page in sorted(g["sources"], key=lambda sp: sp[0]["imageId"]):
        images.append({"id": src["imageId"], "file": src["file"], **page})
    f = REG["fixed"]["font"]
    return {"version": "ko-blind-reader-design-1", "set": f"ko-blind-reader-{g['set']}",
            "font": {"file": f["file"], "sha256": f["sha256"], "weight": f["weight"], "bodySize": f["bodySize"], "titleSize": f["titleSize"]},
            "images": images}


def plan_json(g):
    rows = []
    for src, page in g["sources"]:
        rows.append({k: src[k] for k in ["index", "stratum", "qtype", "side", "method", "larger", "naturalFirst", "slot", "kind", "pair", "field", "compField",
                                         "labels", "digits", "targetValues", "compValues", "targetAux", "compAux", "notes", "question", "answer", "imageId", "file",
                                         "position", "attempts"]}
                    | {"anchorItem": page["anchorItem"], "valueItem": page["valueItem"], "compValueItem": page["compValueItem"],
                       "targetHeaderItem": page["targetHeaderItem"], "compHeaderItem": page["compHeaderItem"], "otherValueItems": page["otherValueItems"]})
    return {"version": "ko-blind-reader-plan-1", "set": g["set"], "packetId": g["packetId"], "order": g["order"], "orderTries": g["orderTries"], "sources": rows}


def practice_design():
    """The registered practice page (reader.practice): fixed content, no seed; public for mock and real."""
    pr = REG["reader"]["practice"]
    src = {"side": pr["targetSide"], "slot": pr["targetSlot"], "field": pr["fields"][0], "compField": pr["fields"][1], "labels": pr["labels"],
           "targetValues": pr["values"]["target"], "compValues": pr["values"]["comp"], "targetAux": pr["aux"][:3], "compAux": pr["aux"][3:6], "notes": pr["notes"]}
    page = build_page(src, {"title": pr["title"], "labelHeader": pr["labelHeader"]})
    f = REG["fixed"]["font"]
    return {"version": "ko-blind-reader-design-1", "set": "ko-blind-reader-practice",
            "font": {"file": f["file"], "sha256": f["sha256"], "weight": f["weight"], "bodySize": f["bodySize"], "titleSize": f["titleSize"]},
            "images": [{"id": "practice", "file": "practice.png", **page}]}


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--mock", action="store_true")
    ap.add_argument("--seed-file")
    ap.add_argument("--font")
    ap.add_argument("--out")
    ap.add_argument("--check-pools", action="store_true")
    ap.add_argument("--practice", action="store_true")
    ap.add_argument("--new-seed")
    a = ap.parse_args(argv)
    if a.new_seed:
        # The real seed: 32 bytes from the OS CSPRNG, written once to a new file in the admin folder, never printed.
        import secrets
        p = Path(a.new_seed)
        with open(p, "x", encoding="utf-8", newline="\n") as fh:
            fh.write(json.dumps({"format": "kbr-seed-1", "seedHex": secrets.token_bytes(32).hex()}) + "\n")
        print(json.dumps({"ok": True, "out": str(p).replace(chr(92), "/")}))
        return 0
    if a.practice:
        out = Path(a.out)
        if out.exists():
            raise GenerationError("--out must not exist")
        out.mkdir(parents=True)
        text = dump(practice_design())
        (out / "design.json").write_text(text, encoding="utf-8", newline="\n")
        print(json.dumps({"ok": True, "set": "practice", "sha256": {"design.json": hashlib.sha256(text.encode("utf-8")).hexdigest()}}))
        return 0
    font = load_font(a.font)
    if a.check_pools:
        pools, removed = pool_report(font)
        print(json.dumps({"kinds": [len(k["labels"]) for k in pools["kinds"]], "pairs": {t: len(v) for t, v in pools["fieldPairs"].items()},
                          "aux": len(pools["aux"]), "notes": len(pools["notes"]), "removed": {k: len(v) for k, v in removed.items()}}))
        return 0
    if not font:
        raise GenerationError("--font is required")
    if bool(a.mock) == bool(a.seed_file):
        raise GenerationError("give exactly one of --mock and --seed-file")
    out = Path(a.out)
    if out.exists():
        raise GenerationError("--out must not exist")
    corpus = pool_report(font)
    if a.mock:
        seed, exclude, name = bytes.fromhex(REG["drbg"]["mockSeedHex"]), None, "mock"
    else:
        sf = json.loads(Path(a.seed_file).read_text(encoding="utf-8"))
        if sf.get("format") != "kbr-seed-1":
            raise GenerationError("seed file format")
        seed, exclude, name = bytes.fromhex(sf["seedHex"]), mock_exclusion(font, corpus), "real"
        if len(seed) < 32:
            raise GenerationError("seed shorter than 32 bytes")
    g = generate(seed, font, exclude, corpus, name)
    _, prior_q = prior_corpus()
    qdup = sum(norm_q(s["question"]) in prior_q for s, _ in g["sources"])
    if qdup:
        raise GenerationError("a question equals a prior question")
    if len(set(norm_q(s["question"]) for s, _ in g["sources"])) != DES["sources"]:
        raise GenerationError("questions are not distinct")
    out.mkdir(parents=True)
    (out / "selector").mkdir()
    files = {"design.json": dump(design_json(g)), "plan.json": dump(plan_json(g)),
             "selector/questions.json": dump({"version": "ko-blind-reader-questions-1", "questions": [
                 {"id": s["imageId"], "file": s["file"], "question": s["question"]} for s, _ in sorted(g["sources"], key=lambda sp: sp[0]["imageId"])]})}
    summary = {"version": "ko-blind-reader-gen-summary-1", "set": name, "sources": len(g["sources"]), "structureProblems": 0, "orderProblems": 0,
               "orderTries": g["orderTries"], "contentAttemptsMax": max(s["attempts"] for s, _ in g["sources"]),
               "priorQuestionOverlap": qdup, "poolsRemoved": {k: len(v) for k, v in g["removed"].items()},
               "mockExcluded": None if exclude is None else {"pairs": len(exclude["pairs"]), "labels": len(exclude["labels"])}}
    files["summary.json"] = dump(summary)
    for rel, text in files.items():
        (out / rel).write_text(text, encoding="utf-8", newline="\n")
    print(json.dumps({"ok": True, "set": name, "sources": summary["sources"], "orderTries": summary["orderTries"], "contentAttemptsMax": summary["contentAttemptsMax"],
                      "sha256": {rel: hashlib.sha256(text.encode("utf-8")).hexdigest() for rel, text in files.items()}}))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except GenerationError as e:
        print(json.dumps({"ok": False, "error": "generation", "detail": str(e)[:200]}))
        sys.exit(2)
