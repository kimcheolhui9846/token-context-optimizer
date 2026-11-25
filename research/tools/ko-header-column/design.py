"""ko-header-column: registered generator of the 144 new Korean table pages
(protocol research/plans/2026-11-25-ko-header-column-protocol.md, 3).

12 source tables (3 document kinds x 4 contents; question types per kind fixed at (2,1,1), (1,2,1), (1,1,2)), each rendered
in 12 paired variants (full cross):
  side   = "L" (the asked field is the left value column) | "R" (the right value column); both header cells and every data
           cell of the two value columns swap together
  header = "normal" (two different field names) | "blank" (only the asked column's header cell is empty, no text item)
           | "dup" (both value-column headers show the asked field name)
  ans    = "same" (the asked value sits on the record label line A) | "below" (one line below, line B)
The competing field's same-format value always sits on line A. In the asked column the value swaps rows with an aux phrase
of another format. Every record follows the same `ans` row. The 12 pages of one source share the question, the answer,
every record text and the font; only the header texts, the x of the two value columns and the y of the two swapping items
of each record differ.

Page ids and file names are opaque: a registered permutation of the 144 serials (OPAQUE_SEED), "p000".."p143".

Usage:
  python design.py --out <dir> [--font <NotoSansKR-VF.ttf>]

Writes <dir>/design.json (scoring side; input format of the fixed renderer research/tools/r09/render.py) and
<dir>/questions.json (selector side: opaque id, file, question only). Standard library only for generation; with --font the
design checks also measure every item's text box with Pillow (no image is written). Same arguments -> same bytes.
Exits 1 when any registered design check fails (the files are still written so the failure can be inspected).
"""
import argparse
import json
import math
import random
import re
import sys
import unicodedata
from pathlib import Path

VERSION = "ko-header-column-design-1"
QVERSION = "ko-header-column-questions-1"
FONT = {"file": "NotoSansKR-VF.ttf", "sha256": "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0", "weight": 400, "bodySize": 24, "titleSize": 32}
PAGE = {"width": 1280, "height": 960}
PAD_X = 12  # fixed renderer: text starts 12 px right of the cell's left edge, vertically centred in the cell

# ------------------------------------------------------------------ grid (protocol 3.1)
DOCTYPES = ["library", "sports", "culture"]
SIDES = ["L", "R"]
HEADERS = ["normal", "blank", "dup"]
ANS_ROWS = ["same", "below"]
QTYPES = ["time", "count", "pages"]
RECORDS = 3
SLOT_NAMES = ["top", "middle", "bottom"]
OPAQUE_SEED = "ko-header-column|opaque-ids|v1"
SUFFIX = {"time": "시각", "count": "인원", "pages": "분량"}
UNIT = {"time": "시", "count": "명", "pages": "쪽"}

# ------------------------------------------------------------------ geometry (protocol 3.2), half-open [x0, y0, x1, y1)
LABEL_X = (40, 320)
COL_X = {"L": (360, 580), "R": (620, 840)}  # equal widths (220), so the L/R swap keeps every margin
NOTE_X = (1060, 1250)  # far-right note column without a header cell (protocol 3.2: lets the fixed W1 widen)
TITLE_CELL = [40, 28, 1000, 84]
FRAME_X = (24, 1256)
HEADER_Y = 104
LINE = 40  # body cell height
BLOCK = 80  # record block: line A [y, y+40), line B [y+40, y+80)
GAP = 8  # empty rows between two record blocks
Y0 = 160  # top of the first record block
RULES_Y = [96, 150]  # horizontal rules above and below the header row; one more in the middle of each record gap
PRINTABLE = [16, 16, 1264, 944]
# registered measurement tolerances on ink (protocol 3.2)
SAME_TOP_DIFF = 8  # same line: |item ink top - label ink top| <= 8 and the W3 same-row condition holds
OTHER_TOP_DIFF = (32, 48)  # other line: item ink top >= label ink bottom and item top - label top in [32, 48]
RECORD_INK_GAP = (12, 40)  # neighbouring records: lower record ink top - upper record ink bottom
MAIN_GAP_MIN_RATIO = 3  # gaps between the label / two value columns on the header row and on line A: > 3 x the larger ink height
NOTE_GAP_MIN_PX = 260  # gap between the last value-column ink and the note ink on line A

# ------------------------------------------------------------------ text rules (protocol 4.1; same as fixed #152 squash / questionTypes)
CUES = {"time": ["시각", "몇시"], "count": ["몇명"], "pages": ["몇쪽"]}
WHITE_SPACE = set(chr(c) for c in list(range(0x09, 0x0E)) + [0x20, 0x85, 0xA0, 0x1680] + list(range(0x2000, 0x200B)) + [0x2028, 0x2029, 0x202F, 0x205F, 0x3000])
GRAMMAR = {
    "time": re.compile(r"^(?:[0-9]|[01][0-9]|2[0-3]):[0-5][0-9]$", re.ASCII),
    "count": re.compile(r"^[1-9][0-9]{0,2}명$", re.ASCII),
    "pages": re.compile(r"^[1-9][0-9]{0,2}쪽$", re.ASCII),
}
# Question parser (protocol 4.2). Applied to the whitespace-folded question (NFKC, every White_Space run -> one U+0020, trimmed).
QUESTION_RE = re.compile(r"^(?P<record>.+)의 (?P<field>[가-힣]+(?: [가-힣]+)* ?(?P<suffix>시각|인원|분량))(?P<josa>은|는) 몇 (?P<unit>시|명|쪽)인가요\?$")


def squash(text):
    """NFKC, then remove every Unicode White_Space code point."""
    return "".join(ch for ch in unicodedata.normalize("NFKC", text) if ch not in WHITE_SPACE)


def fold(text):
    """NFKC, every run of Unicode White_Space -> one U+0020, trimmed."""
    out, prev_ws = [], False
    for ch in unicodedata.normalize("NFKC", text):
        if ch in WHITE_SPACE:
            if not prev_ws:
                out.append(" ")
            prev_ws = True
        else:
            out.append(ch)
            prev_ws = False
    return "".join(out).strip(" ")


def question_types(q):
    s = squash(q)
    return sorted({t for t, cues in CUES.items() if any(c in s for c in cues)})


def parse_question(q):
    """{record, field, qtype} or None (protocol 4.2)."""
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


def matches(qtype, text):
    return bool(GRAMMAR[qtype].fullmatch(squash(text)))


# ------------------------------------------------------------------ content (protocol 3.3)
DOC = {
    "library": {
        "title": "도서관 자료 이용 예약표",
        "labelHeader": "이용 신청 항목",
        "labels": [
            "고서 영인본 열람", "지역 신문 원문 검색", "희귀 지도 복제 의뢰", "어린이 그림책 낭독회",
            "시청각실 영화 감상", "전자책 단말기 대여", "논문 작성 상담", "외국어 원서 강독",
            "독서 토론 모임", "족보 기록 찾기", "학습 공간 좌석 배정", "옛 사진 수집 공개",
        ],
    },
    "sports": {
        "title": "생활체육 시설 운영표",
        "labelHeader": "운영 강좌 이름",
        "labels": [
            "새벽 수영 강습반", "주말 배드민턴 교실", "어르신 걷기 동호회", "청소년 농구 리그",
            "실내 암벽 등반", "필라테스 기초 과정", "탁구 친선 대회", "가족 자전거 행사",
            "에어로빅 저녁반", "풋살 경기장 개방", "골프 연습장 정비", "줄넘기 체력 단련",
        ],
    },
    "culture": {
        "title": "문화행사 운영 지원표",
        "labelHeader": "행사 프로그램 이름",
        "labels": [
            "강변 음악 축제 무대", "전통 공예 체험 장터", "청소년 연극 발표회", "시민 합창단 정기 공연",
            "야외 영화 상영", "거리 미술 전시", "어린이 인형극", "국악 한마당 잔치",
            "사진 공모전 시상", "북 콘서트 낭독", "불꽃놀이 관람", "지역 작가 사인회",
        ],
    },
}
# Registered 3 x 4 source table (protocol 3.1): kind rows (2,1,1), (1,2,1), (1,1,2) over time/count/pages; target slot
# 4/4/4 overall and (2,1,1)/(1,2,1)/(1,1,2) inside the question types; the asked field is the first name of its pair in 6
# sources ("first") and the second in 6 ("second").
SOURCES = [
    # id, kind, content, qtype, slot, (asked field, competing field), asked position in the natural pair
    ("library-c0", "library", 0, "time", 0, ("방문 시각", "반납 시각"), "first"),
    ("library-c1", "library", 1, "time", 1, ("퇴실 시각", "입실 시각"), "second"),
    ("library-c2", "library", 2, "count", 1, ("동반 인원", "대기 인원"), "first"),
    ("library-c3", "library", 3, "pages", 2, ("출력 분량", "복사 분량"), "second"),
    ("sports-c0", "sports", 0, "time", 2, ("개장 시각", "폐장 시각"), "first"),
    ("sports-c1", "sports", 1, "count", 2, ("결원 인원", "등록 인원"), "second"),
    ("sports-c2", "sports", 2, "count", 0, ("참가 인원", "보조 인원"), "first"),
    ("sports-c3", "sports", 3, "pages", 0, ("일지 분량", "규정집 분량"), "second"),
    ("culture-c0", "culture", 0, "time", 0, ("철수 시각", "리허설 시각"), "second"),
    ("culture-c1", "culture", 1, "count", 1, ("봉사 인원", "안내 인원"), "first"),
    ("culture-c2", "culture", 2, "pages", 1, ("악보 분량", "대본 분량"), "second"),
    ("culture-c3", "culture", 3, "pages", 2, ("전단 분량", "보고서 분량"), "first"),
]
QUESTION = {
    "time": "{label}의 {field}은 몇 시인가요?",
    "count": "{label}의 {field}은 몇 명인가요?",
    "pages": "{label}의 {field}은 몇 쪽인가요?",
}
AUX = ["현장 확인", "사전 접수", "변경 가능", "선착순", "문의 요망", "추후 공지", "당일 결정", "협의 예정", "확정 대기", "일정 조정"]
NOTES = ["주차 가능", "휠체어 접근", "음식물 반입 불가", "우천 순연", "촬영 금지", "간식 제공", "보호자 필요", "실내화 지참"]
TARGET_POOL = 4  # label indices 0-3 are the target labels of the 4 sources of a kind; 4-11 are the neighbour pool


def value_text(qtype, rng):
    if qtype == "time":
        return f"{rng.randint(9, 20)}:{rng.choice([0, 10, 20, 30, 40, 50]):02d}"
    if qtype == "count":
        return f"{rng.randint(8, 95)}명"
    return f"{rng.randint(12, 240)}쪽"


# ------------------------------------------------------------------ helpers
HANGUL_RUN = re.compile("[가-힣]+")


def bigrams(text):
    out = set()
    for run in HANGUL_RUN.findall(unicodedata.normalize("NFC", text)):
        for i in range(len(run) - 1):
            out.add(run[i:i + 2])
    return out


def norm_q(q):
    return " ".join(unicodedata.normalize("NFC", q).split())


def cell(x, y0):
    return [x[0], y0, x[1], y0 + LINE]


def hrule(y):
    return [FRAME_X[0], y, FRAME_X[1], y + 2]


# ------------------------------------------------------------------ one source (content shared by its 12 variants)
def build_source(spec):
    sid, kind, content, qtype, slot, (field, comp_field), asked = spec
    doc = DOC[kind]
    rng = random.Random(f"ko-header-column|{sid}")
    others = rng.sample(range(TARGET_POOL, len(doc["labels"])), RECORDS - 1)
    labels, it = [], iter(others)
    for s in range(RECORDS):
        labels.append(doc["labels"][content] if s == slot else doc["labels"][next(it)])
    pool = []
    while len(pool) < 2 * RECORDS:
        v = value_text(qtype, rng)
        if v not in pool:
            pool.append(v)
    tvals, cvals = pool[:RECORDS], pool[RECORDS:]
    aux = rng.sample(AUX, 2 * RECORDS)
    notes = rng.sample(NOTES, RECORDS)
    return {"source": sid, "kind": kind, "content": content, "slot": slot, "qtype": qtype, "field": field, "compField": comp_field, "askedPosition": asked,
            "labels": labels, "targetValues": tvals, "compValues": cvals, "targetAux": aux[:RECORDS], "compAux": aux[RECORDS:], "notes": notes,
            "question": QUESTION[qtype].format(label=labels[slot], field=field)}


# ------------------------------------------------------------------ one page (one variant of a source)
def build_page(src, side, header, ans):
    doc = DOC[src["kind"]]
    key = f"{src['source']}-{side}-{header}-{ans}"
    tx, cx = COL_X[side], COL_X["R" if side == "L" else "L"]
    items, rules, records = [], [hrule(y) for y in RULES_Y], []
    items.append({"id": "title", "role": "title", "text": doc["title"], "cell": list(TITLE_CELL), "size": "title"})
    items.append({"id": "h-label", "role": "header", "text": doc["labelHeader"], "cell": cell(LABEL_X, HEADER_Y), "size": "body"})
    target_header = {"normal": src["field"], "blank": None, "dup": src["field"]}[header]
    comp_header = {"normal": src["compField"], "blank": src["compField"], "dup": src["field"]}[header]
    if target_header is not None:
        items.append({"id": "h-target", "role": "header", "text": target_header, "cell": cell(tx, HEADER_Y), "size": "body"})
    items.append({"id": "h-comp", "role": "header", "text": comp_header, "cell": cell(cx, HEADER_Y), "size": "body"})
    for s in range(RECORDS):
        y = Y0 + s * (BLOCK + GAP)
        ya, yb = y, y + LINE
        y_tval, y_taux = (ya, yb) if ans == "same" else (yb, ya)
        rec = {"slot": s, "position": SLOT_NAMES[s], "labelItem": f"r{s}-label", "targetValueItem": f"r{s}-tval", "targetAuxItem": f"r{s}-taux",
               "compValueItem": f"r{s}-cval", "compAuxItem": f"r{s}-caux", "noteItem": f"r{s}-note", "block": [y, y + BLOCK], "lineA": [ya, ya + LINE], "lineB": [yb, yb + LINE]}
        items.append({"id": rec["labelItem"], "role": "label", "record": s, "text": src["labels"][s], "cell": cell(LABEL_X, ya), "size": "body"})
        items.append({"id": rec["targetValueItem"], "role": "target_value", "record": s, "text": src["targetValues"][s], "cell": cell(tx, y_tval), "size": "body"})
        items.append({"id": rec["targetAuxItem"], "role": "aux", "record": s, "text": src["targetAux"][s], "cell": cell(tx, y_taux), "size": "body"})
        items.append({"id": rec["compValueItem"], "role": "comp_value", "record": s, "text": src["compValues"][s], "cell": cell(cx, ya), "size": "body"})
        items.append({"id": rec["compAuxItem"], "role": "aux", "record": s, "text": src["compAux"][s], "cell": cell(cx, yb), "size": "body"})
        items.append({"id": rec["noteItem"], "role": "note", "record": s, "text": src["notes"][s], "cell": cell(NOTE_X, ya), "size": "body"})
        records.append(rec)
        if s < RECORDS - 1:
            rules.append(hrule(y + BLOCK + GAP // 2 - 1))
    slot = src["slot"]
    target = records[slot]
    return {
        "key": key, "source": src["source"], "kind": src["kind"], "content": src["content"], "side": side, "header": header, "ans": ans,
        "cellName": f"{side}-{header}-{ans}", "page": dict(PAGE), "slot": slot, "slotPosition": SLOT_NAMES[slot], "qtype": src["qtype"],
        "records": records, "question": src["question"], "answer": src["targetValues"][slot], "label": src["labels"][slot],
        "field": src["field"], "compField": src["compField"], "targetColumn": list(tx), "compColumn": list(cx),
        "headerCells": {"label": cell(LABEL_X, HEADER_Y), "target": cell(tx, HEADER_Y), "comp": cell(cx, HEADER_Y)},
        "headerTexts": {"target": target_header, "comp": comp_header},
        "targetHeaderItem": "h-target" if target_header is not None else None, "compHeaderItem": "h-comp",
        "anchorItem": target["labelItem"], "valueItem": target["targetValueItem"], "compValueItem": target["compValueItem"],
        "goldItems": [target["labelItem"], target["targetValueItem"]],
        "otherValueItems": [r["targetValueItem"] for r in records if r["slot"] != slot],
        "items": items, "rules": rules,
    }


def opaque_ids(n):
    order = list(range(n))
    random.Random(OPAQUE_SEED).shuffle(order)
    return [f"p{order[i]:03d}" for i in range(n)]


def build():
    sources = [build_source(s) for s in SOURCES]
    images = []
    for src in sources:
        for side in SIDES:
            for header in HEADERS:
                for ans in ANS_ROWS:
                    images.append(build_page(src, side, header, ans))
    ids = opaque_ids(len(images))
    for i, im in enumerate(images):
        im["serial"] = i
        im["id"] = ids[i]
        im["file"] = f"{ids[i]}.png"
    return sources, images


# ------------------------------------------------------------------ registered design checks (protocol 3.4, design part)
def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def inside(inner, outer):
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def same_row_right(h, j):
    """#152 W3 same-row condition on two [x0, y0, x1, y1] boxes: j right of h, 2 x overlap >= smaller height."""
    ov = max(0, min(j[3], h[3]) - max(j[1], h[1]))
    return j[0] >= h[2] and 2 * ov >= min(j[3] - j[1], h[3] - h[1])


def exposure(ink, band):
    """full / partial / none of a half-open ink box in a half-open [x0, y0, x1, y1] window."""
    if inside(ink, band):
        return "full"
    ix = min(ink[2], band[2]) - max(ink[0], band[0])
    iy = min(ink[3], band[3]) - max(ink[1], band[1])
    return "partial" if ix > 0 and iy > 0 else "none"


def ref_band(label_ink):
    """Reference W2-like band (protocol 3.4): the label ink as one hit word, pad = its height, full page width."""
    h = label_ink[3] - label_ink[1]
    return [0, math.floor(label_ink[1] - h), PAGE["width"], math.ceil(label_ink[3] + h)]


def load_fonts(font_path):
    import io
    from PIL import ImageFont
    raw = Path(font_path).read_bytes()
    fonts = {}
    for size_name, size in (("body", FONT["bodySize"]), ("title", FONT["titleSize"])):
        ft = ImageFont.truetype(io.BytesIO(raw), size, layout_engine=ImageFont.Layout.BASIC)
        ft.set_variation_by_axes([FONT["weight"]])
        fonts[size_name] = ft
    return fonts


def measured_ink(fonts, it):
    x0, y0, x1, y1 = it["cell"]
    bb = fonts[it["size"]].getbbox(it["text"], anchor="lm")
    return [x0 + PAD_X + bb[0], (y0 + y1) / 2 + bb[1], x0 + PAD_X + bb[2], (y0 + y1) / 2 + bb[3]]


IDEAL_W4 = {("normal", "same"): "applied", ("normal", "below"): "no_target_candidate",
            ("blank", "same"): "header_none", ("blank", "below"): "header_none",
            ("dup", "same"): "header_duplicate", ("dup", "below"): "header_duplicate"}


def check(sources, images, font_path=None):
    problems = []
    p = problems.append
    if len(sources) != 12 or len(images) != 144:
        p(f"{len(sources)} sources / {len(images)} pages, not 12 / 144")
    keys = [f"{s[0]}-{a}-{h}-{b}" for s in SOURCES for a in SIDES for h in HEADERS for b in ANS_ROWS]
    if [im["key"] for im in images] != keys:
        p("page keys/order differ from the registered grid")
    ids = [im["id"] for im in images]
    if len(set(ids)) != 144 or sorted(ids) != [f"p{i:03d}" for i in range(144)]:
        p("opaque ids are not a permutation of p000..p143")
    # 3 x 3 assignment (protocol 3.1)
    want = {"library": {"time": 2, "count": 1, "pages": 1}, "sports": {"time": 1, "count": 2, "pages": 1}, "culture": {"time": 1, "count": 1, "pages": 2}}
    for kind, row in want.items():
        got = {t: sum(1 for s in sources if s["kind"] == kind and s["qtype"] == t) for t in QTYPES}
        if got != row:
            p(f"{kind}: question types {got} != {row}")
    slots = [s["slot"] for s in sources]
    if [slots.count(k) for k in range(RECORDS)] != [4, 4, 4]:
        p(f"target slots not 4/4/4: {slots}")
    slot_by_type = {"time": [2, 1, 1], "count": [1, 2, 1], "pages": [1, 1, 2]}
    for t, row in slot_by_type.items():
        got = [sum(1 for s in sources if s["qtype"] == t and s["slot"] == k) for k in range(RECORDS)]
        if got != row:
            p(f"{t}: target slots {got} != {row}")
    if sorted(s["askedPosition"] for s in sources).count("first") != 6:
        p("asked field is not the first name of its pair in exactly 6 sources")
    qs = [norm_q(s["question"]) for s in sources]
    if len(set(qs)) != 12:
        p("questions are not 12 distinct texts")
    for src in sources:
        sid = src["source"]
        q = src["question"]
        if re.search("[A-Za-z0-9]", q):
            p(f"{sid}: question has ASCII letters or digits (K0 must stay unmatched)")
        if question_types(q) != [src["qtype"]]:
            p(f"{sid}: fixed #152 question types {question_types(q)} != [{src['qtype']}]")
        parsed = parse_question(q)
        if parsed != {"record": src["labels"][src["slot"]], "field": src["field"], "qtype": src["qtype"]}:
            p(f"{sid}: parser returned {parsed}")
        for fld in (src["field"], src["compField"]):
            if not re.fullmatch(r"[가-힣]+ " + SUFFIX[src["qtype"]], fld):
                p(f"{sid}: field {fld!r} is not '<Hangul qualifier> {SUFFIX[src['qtype']]}'")
        if squash(src["field"]) == squash(src["compField"]):
            p(f"{sid}: the two field names are equal")
        if q.count(src["labels"][src["slot"]]) != 1:
            p(f"{sid}: question does not contain the target label exactly once")
    fonts = load_fonts(font_path) if font_path else None
    by_source = {}
    for im in images:
        by_source.setdefault(im["source"], []).append(im)
    # pairing: the 12 pages of a source share every record text; only header texts, value-column x and swapping y differ
    for sid, pages in by_source.items():
        if len(pages) != 12 or sorted(pg["cellName"] for pg in pages) != sorted(f"{a}-{h}-{b}" for a in SIDES for h in HEADERS for b in ANS_ROWS):
            p(f"{sid}: not exactly the 12 registered variants")
            continue
        ref = pages[0]
        for pg in pages[1:]:
            for k in ("question", "answer", "label", "field", "compField", "slot", "qtype", "kind", "content", "page", "anchorItem", "valueItem", "compValueItem", "goldItems", "otherValueItems", "rules"):
                if pg[k] != ref[k]:
                    p(f"{pg['key']}: {k} differs from {ref['key']}")
            rec = lambda im: [(it["id"], it["role"], it["text"], it["size"], it["cell"][3] - it["cell"][1]) for it in im["items"] if it["id"].startswith("r")]  # noqa: E731
            if rec(pg) != rec(ref):
                p(f"{pg['key']}: record items differ from {ref['key']}")
    for im in images:
        pid = im["key"]
        items = {it["id"]: it for it in im["items"]}
        if len(items) != len(im["items"]):
            p(f"{pid}: item ids not unique")
        if items[im["anchorItem"]]["text"] != im["label"] or items[im["valueItem"]]["text"] != im["answer"] or im["anchorItem"] != f"r{im['slot']}-label":
            p(f"{pid}: label/answer/slot")
        hdr = [it for it in im["items"] if it["role"] == "header"]
        want_h = {"normal": ["h-label", "h-target", "h-comp"], "blank": ["h-label", "h-comp"], "dup": ["h-label", "h-target", "h-comp"]}[im["header"]]
        if [it["id"] for it in hdr] != want_h:
            p(f"{pid}: header items {[it['id'] for it in hdr]} != {want_h}")
        if im["header"] == "dup" and not (items["h-target"]["text"] == items["h-comp"]["text"] == im["field"]):
            p(f"{pid}: duplicate header texts")
        if im["header"] == "normal" and not (items["h-target"]["text"] == im["field"] and items["h-comp"]["text"] == im["compField"]):
            p(f"{pid}: normal header texts")
        if im["header"] == "blank" and ("h-target" in items or items["h-comp"]["text"] != im["compField"]):
            p(f"{pid}: blank header")
        # grammar and suffix: values match the question type; nothing else matches any grammar or contains a type suffix
        for it in im["items"]:
            role = it["role"]
            if role in ("target_value", "comp_value"):
                if not matches(im["qtype"], it["text"]):
                    p(f"{pid}: {it['id']} {it['text']!r} does not match the {im['qtype']} grammar")
            else:
                if any(matches(t, it["text"]) for t in QTYPES) or re.search("[A-Za-z0-9]", it["text"]):
                    p(f"{pid}: {it['id']} {it['text']!r} has ASCII alphanumerics or matches a grammar")
            if role not in ("header",) and any(sfx in squash(it["text"]) for sfx in SUFFIX.values()):
                p(f"{pid}: {it['id']} {it['text']!r} contains a type suffix but is not a value-column header")
        vals = [items[r["targetValueItem"]]["text"] for r in im["records"]] + [items[r["compValueItem"]]["text"] for r in im["records"]]
        if len(set(vals)) != 2 * RECORDS:
            p(f"{pid}: the 6 same-format values are not distinct")
        Q = bigrams(im["question"])
        lab = bigrams(im["label"])
        if len(lab) < 4:
            p(f"{pid}: target label has {len(lab)} Hangul bigrams, fewer than 4")
        for it in im["items"]:
            if it["id"] == im["anchorItem"]:
                continue
            if bigrams(it["text"]) & lab:
                p(f"{pid}: item {it['id']} shares a bigram with the target label")
            shared = len(bigrams(it["text"]) & Q)
            if it["role"] in ("header", "title"):
                if shared > 2:
                    p(f"{pid}: {it['id']} shares {shared} question bigrams (> 2)")
            elif shared:
                p(f"{pid}: {it['id']} shares {shared} question bigrams")
        if bigrams(items["h-label"]["text"]) & Q:
            p(f"{pid}: the label-column header shares a question bigram")
        texts = [it["text"] for it in im["items"] if it["role"] != "header"]
        if len(set(texts)) != len(texts):
            p(f"{pid}: non-header item texts not unique")
        for r in im["records"]:
            lc = items[r["labelItem"]]["cell"]
            want = {"targetValueItem": (tuple(im["targetColumn"]), im["ans"] == "same"), "targetAuxItem": (tuple(im["targetColumn"]), im["ans"] != "same"),
                    "compValueItem": (tuple(im["compColumn"]), True), "compAuxItem": (tuple(im["compColumn"]), False), "noteItem": (NOTE_X, True)}
            for k, (xs, on_a) in want.items():
                c = items[r[k]]["cell"]
                y = lc[1] if on_a else lc[3]
                if c != [xs[0], y, xs[1], y + LINE]:
                    p(f"{pid}: {r[k]} cell {c} not at its registered position")
        cells = [it["cell"] for it in im["items"]]
        for i, a in enumerate(cells):
            if not inside(a, [0, 0, PAGE["width"], PAGE["height"]]):
                p(f"{pid}: cell {im['items'][i]['id']} outside page")
            for b in cells[i + 1:]:
                if overlaps(a, b):
                    p(f"{pid}: cells overlap")
            for rl in im["rules"]:
                if overlaps(a, rl):
                    p(f"{pid}: cell {im['items'][i]['id']} overlaps rule {rl}")
        if fonts:
            ink = {}
            for it in im["items"]:
                ink[it["id"]] = measured_ink(fonts, it)
                if not inside(ink[it["id"]], it["cell"]):
                    p(f"{pid}: {it['id']} text box {ink[it['id']]} not inside cell {it['cell']}")
                if not inside(ink[it["id"]], PRINTABLE):
                    p(f"{pid}: {it['id']} text box outside the printable area")
            for problem in layout_problems(im, ink)["problems"]:
                p(problem)
    return problems


def layout_problems(im, ink):
    """Registered ink layout conditions of protocol 3.2 and the ideal-geometry predictions of 3.4 (also run on rendered inks)."""
    out = []
    pid = im.get("key", im["id"])
    meas = {"sameTopDiff": [], "otherTopDiff": [], "recordGap": [], "mainGapRatio": [], "noteGapPx": [], "headerCandidateDx": [], "headerHeight": []}
    for r in im["records"]:
        la = ink[r["labelItem"]]
        for k in ("targetValueItem", "targetAuxItem", "compValueItem", "compAuxItem", "noteItem"):
            b = ink[r[k]]
            cell_y = next(it["cell"][1] for it in im["items"] if it["id"] == r[k])
            if cell_y == r["lineA"][0]:
                meas["sameTopDiff"].append(b[1] - la[1])
                if not (abs(b[1] - la[1]) <= SAME_TOP_DIFF and same_row_right(la, b)):
                    out.append(f"{pid}: {r[k]} not on the label line {la} {b}")
            else:
                meas["otherTopDiff"].append(b[1] - la[1])
                if not (b[1] >= la[3] and OTHER_TOP_DIFF[0] <= b[1] - la[1] <= OTHER_TOP_DIFF[1]):
                    out.append(f"{pid}: {r[k]} not one line below the label {la} {b}")
                if same_row_right(la, b):
                    out.append(f"{pid}: {r[k]} counts as the label row although it is on line B")
        # gaps on line A between label / left value column / right value column, and before the note
        row_a = sorted([ink[r["labelItem"]]] + [ink[r[k]] for k in ("targetValueItem", "targetAuxItem", "compValueItem") if next(it["cell"][1] for it in im["items"] if it["id"] == r[k]) == r["lineA"][0]], key=lambda b: b[0])
        for a, b in zip(row_a, row_a[1:]):
            ratio = (b[0] - a[2]) / max(a[3] - a[1], b[3] - b[1])
            meas["mainGapRatio"].append(ratio)
            if not ratio > MAIN_GAP_MIN_RATIO:
                out.append(f"{pid}: line A gap ratio {ratio:.2f} <= {MAIN_GAP_MIN_RATIO}")
        note_gap = ink[r["noteItem"]][0] - row_a[-1][2]
        meas["noteGapPx"].append(note_gap)
        if note_gap < NOTE_GAP_MIN_PX:
            out.append(f"{pid}: note gap {note_gap} < {NOTE_GAP_MIN_PX}")
    hdr = sorted([ink[i] for i in ("h-label", "h-target", "h-comp") if i in ink], key=lambda b: b[0])
    for a, b in zip(hdr, hdr[1:]):
        ratio = (b[0] - a[2]) / max(a[3] - a[1], b[3] - b[1])
        meas["mainGapRatio"].append(ratio)
        if not ratio > MAIN_GAP_MIN_RATIO:
            out.append(f"{pid}: header gap ratio {ratio:.2f} <= {MAIN_GAP_MIN_RATIO}")
    outer = []
    for r in im["records"]:
        boxes = [ink[r[k]] for k in ("labelItem", "targetValueItem", "targetAuxItem", "compValueItem", "compAuxItem", "noteItem")]
        outer.append((min(b[1] for b in boxes), max(b[3] for b in boxes)))
    for a, b in zip(outer, outer[1:]):
        meas["recordGap"].append(b[0] - a[1])
        if not RECORD_INK_GAP[0] <= b[0] - a[1] <= RECORD_INK_GAP[1]:
            out.append(f"{pid}: record ink gap {b[0] - a[1]} outside {list(RECORD_INK_GAP)}")
    header_bottom = max(ink[i][3] for i in ("h-label", "h-target", "h-comp") if i in ink)
    if header_bottom > ink[im["records"][0]["labelItem"]][1]:
        out.append(f"{pid}: header ink is not above the first label")
    # ideal geometry (protocol 3.4): same-row candidates, header assignment, ideal W4 reason, reference band exposures
    tr = im["records"][im["slot"]]
    la = ink[tr["labelItem"]]
    cands = [k for k in ("targetValueItem", "compValueItem") if same_row_right(la, ink[tr[k]])]
    want = ["targetValueItem", "compValueItem"] if im["ans"] == "same" else ["compValueItem"]
    if cands != want:
        out.append(f"{pid}: ideal same-row candidates {cands} != {want}")
    for s, r in enumerate(im["records"]):
        if s != im["slot"]:
            for k in ("targetValueItem", "compValueItem"):
                if same_row_right(la, ink[r[k]]):
                    out.append(f"{pid}: {r[k]} of another record is on the target label row")
    # ideal header groups = the header item inks; ideal assignment by left-edge distance
    heads = {"target": ink.get("h-target"), "comp": ink["h-comp"]}
    for k, ck in (("target", "targetValueItem"), ("comp", "compValueItem")):
        c = ink[tr[ck]]
        own = im["targetColumn"] if k == "target" else im["compColumn"]
        hk = heads[k]
        if hk is not None:
            meas["headerCandidateDx"].append(abs(c[0] - hk[0]))
            meas["headerHeight"].append(hk[3] - hk[1])
            other = heads["comp" if k == "target" else "target"]
            if not abs(c[0] - hk[0]) <= hk[3] - hk[1]:
                out.append(f"{pid}: {ck} left edge {c[0]} is farther than one header height from its header {hk}")
            if other is not None and not abs(c[0] - other[0]) > other[3] - other[1]:
                out.append(f"{pid}: {ck} is within one header height of the other column header")
        if not own[0] <= c[0] < own[1]:
            out.append(f"{pid}: {ck} not in its column")
    band = ref_band(la)
    ideal = {
        "w4Reason": IDEAL_W4[(im["header"], im["ans"])],
        "referenceBand": band,
        "bandExposure": {
            "targetValue": exposure(ink[tr["targetValueItem"]], band), "compValue": exposure(ink[tr["compValueItem"]], band),
            "targetHeader": exposure(ink["h-target"], band) if "h-target" in ink else "source_missing", "compHeader": exposure(ink["h-comp"], band),
            "otherValues": [exposure(ink[k], band) for k in im["otherValueItems"]],
        },
    }
    e = ideal["bandExposure"]
    if e["targetValue"] != ("full" if im["ans"] == "same" else "partial") or e["compValue"] != "full":
        out.append(f"{pid}: reference band exposures of the two values {e['targetValue']}/{e['compValue']}")
    if e["targetHeader"] not in ("none", "source_missing") or e["compHeader"] != "none" or any(x != "none" for x in e["otherValues"]):
        out.append(f"{pid}: reference band touches a header or another record value {e}")
    return {"problems": out, "measured": meas, "ideal": ideal}


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--font")
    a = ap.parse_args(argv)
    sources, images = build()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    design = {"version": VERSION, "set": "ko-header-column", "font": FONT,
              "geometry": {"labelX": list(LABEL_X), "colX": {k: list(v) for k, v in COL_X.items()}, "noteX": list(NOTE_X), "headerY": HEADER_Y, "line": LINE, "block": BLOCK, "gap": GAP, "y0": Y0,
                           "rulesY": RULES_Y, "printable": PRINTABLE, "sameTopDiff": SAME_TOP_DIFF, "otherTopDiff": list(OTHER_TOP_DIFF), "recordInkGap": list(RECORD_INK_GAP),
                           "mainGapMinRatio": MAIN_GAP_MIN_RATIO, "noteGapMinPx": NOTE_GAP_MIN_PX},
              "opaqueSeed": OPAQUE_SEED, "sources": sources, "images": images}
    order = sorted(images, key=lambda im: im["id"])
    questions = {"version": QVERSION, "questions": [{"id": im["id"], "file": im["file"], "question": im["question"]} for im in order]}
    (out / "design.json").write_bytes(dump(design).encode("utf-8"))
    (out / "questions.json").write_bytes(dump(questions).encode("utf-8"))
    problems = check(sources, images, a.font)
    summary = {"sources": len(sources), "pages": len(images), "problems": problems[:40], "problemCount": len(problems)}
    if a.font:
        fonts = load_fonts(a.font)
        agg = {}
        for im in images:
            ink = {it["id"]: measured_ink(fonts, it) for it in im["items"]}
            for k, v in layout_problems(im, ink)["measured"].items():
                agg.setdefault(k, []).extend(v)
        summary["measured"] = {k: [round(min(v), 3), round(max(v), 3)] if v else None for k, v in agg.items()}
    print(json.dumps(summary, ensure_ascii=False))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
