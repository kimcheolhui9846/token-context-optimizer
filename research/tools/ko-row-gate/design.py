"""ko-row-gate: registered generator of the 48 new Korean pages (protocol research/plans/2026-11-24-ko-row-gate-protocol.md, 3).

12 source documents (3 document kinds x 2 forms x 2 contents), each rendered in 4 paired layouts:
  answer row  = "same"  (the designated value sits on the label line) | "below" (one line below the label line)
  decoy row   = "same"  (a same-format decoy value sits on the label line) | "other" (the decoy sits on the other line)
Every record block has two lines (A = label line, B = the line below). Two fixed positions per column swap their
items: the value column holds {value, auxA}, the decoy column holds {decoy, auxB}. The 4 pages of one source share
the question, the answer, every item text, every x coordinate, the font and the page size; only the y of the four
swapping items differs.

Usage:
  python design.py --out <dir> [--font <NotoSansKR-VF.ttf>]

Writes <dir>/design.json (scoring side, input format of the fixed renderer research/tools/r09/render.py) and
<dir>/questions.json (selector side: id, file, question only). Standard library only for generation; with --font the
design checks also measure every item's ink box with Pillow (no image is written). Same arguments -> same bytes.
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

VERSION = "ko-row-gate-design-1"
QVERSION = "ko-row-gate-questions-1"
FONT = {"file": "NotoSansKR-VF.ttf", "sha256": "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0", "weight": 400, "bodySize": 24, "titleSize": 32}
PAGE = {"width": 1280, "height": 960}
PAD_X = 12  # fixed renderer: text starts 12 px right of the cell's left edge, vertically centred in the cell

# ------------------------------------------------------------------ grid (protocol 3.1)
DOCTYPES = ["lecture", "exhibit", "meeting"]
FORMS = ["table", "cards"]
CONTENTS = [0, 1]
ANS_ROWS = ["same", "below"]
DECOY_ROWS = ["same", "other"]
QTYPES = ["time", "count", "pages"]
RECORDS = 3
SLOT_NAMES = ["top", "middle", "bottom"]

# ------------------------------------------------------------------ geometry (protocol 3.2), half-open [x0, y0, x1, y1)
LABEL_X = (40, 400)
VALUE_X = (440, 640)
DECOY_X = (680, 880)
NOTE_X = (920, 1240)
TITLE_CELL = [40, 28, 1000, 84]
FRAME_X = (24, 1256)
LINE = 40  # body cell height
BLOCK = 80  # record block: line A [y, y+40), line B [y+40, y+80)
GAP = 8  # empty rows between two record blocks
Y0 = {"table": 160, "cards": 112}  # top of the first record block
PRINTABLE = [16, 16, 1264, 944]  # every ink box must lie inside (protocol 3.2)
# registered measurement tolerances on rendered ink (protocol 3.2)
SAME_TOP_DIFF = 8  # same line: |item ink top - label ink top| <= 8 and 2 * overlap >= min height
OTHER_TOP_DIFF = (32, 48)  # other line: item ink top >= label ink bottom and item top - label top in [32, 48]
RECORD_INK_GAP = (12, 40)  # neighbouring records: lower record ink top - upper record ink bottom

# ------------------------------------------------------------------ question types (protocol 3.3, W3 rule step 1)
QTYPE_OF = lambda d, f, c: (2 * d + f + c) % 3  # noqa: E731  registered balanced assignment
CUES = {"time": ["시각", "몇시"], "count": ["몇명"], "pages": ["몇쪽"]}
WHITE_SPACE = set(chr(c) for c in list(range(0x09, 0x0E)) + [0x20, 0x85, 0xA0, 0x1680] + list(range(0x2000, 0x200B)) + [0x2028, 0x2029, 0x202F, 0x205F, 0x3000])
GRAMMAR = {
    "time": re.compile(r"^(?:[0-9]|[01][0-9]|2[0-3]):[0-5][0-9]$", re.ASCII),
    "count": re.compile(r"^[1-9][0-9]{0,2}명$", re.ASCII),
    "pages": re.compile(r"^[1-9][0-9]{0,2}쪽$", re.ASCII),
}


def squash(text):
    """NFKC, then remove every Unicode White_Space code point."""
    return "".join(ch for ch in unicodedata.normalize("NFKC", text) if ch not in WHITE_SPACE)


def question_types(q):
    s = squash(q)
    return sorted({t for t, cues in CUES.items() if any(c in s for c in cues)})


def matches(qtype, text):
    return bool(GRAMMAR[qtype].fullmatch(squash(text)))


# ------------------------------------------------------------------ content (protocol 3.3)
DOC = {
    "lecture": {
        "title": "지역 강좌 운영표",
        "labelHeader": "강좌명",
        "fields": {"time": ("개강 시각", "종강 시각"), "count": ("신청 인원", "대기 인원"), "pages": ("교재 분량", "부록 분량")},
        "labels": [
            "생활 목공 입문반", "시니어 스마트폰 교실", "우리 동네 역사 탐방", "가정 원예 실습반",
            "기초 수채화 그리기", "한식 반찬 요리", "요가 스트레칭 수업", "합창 발성 훈련",
            "서예 붓글씨 연습", "사진 촬영 기법", "바둑 전략 강의", "천연 화장품 만들기",
        ],
    },
    "exhibit": {
        "title": "전시 해설 예약표",
        "labelHeader": "해설 프로그램",
        "fields": {"time": ("해설 시각", "집합 시각"), "count": ("예약 인원", "현장 인원"), "pages": ("자료 분량", "도록 분량")},
        "labels": [
            "고려 청자 특별전", "근대 신문 아카이브", "공룡 화석 탐험관", "별자리 천문 체험",
            "조선 왕실 공예품", "현대 판화 기획전", "바다 생물 표본실", "옛 지도 이야기",
            "전통 악기 소리방", "한글 활자 전시실", "곤충 생태 관찰", "민화 색채 여행",
        ],
    },
    "meeting": {
        "title": "회의 자료 배부표",
        "labelHeader": "회의명",
        "fields": {"time": ("개회 시각", "휴회 시각"), "count": ("참석 인원", "배석 인원"), "pages": ("배부 분량", "예비 분량")},
        "labels": [
            "도서관 운영 위원회", "청년 창업 협의회", "하천 정비 설명회", "마을 축제 준비 모임",
            "학교 급식 점검단", "공원 조성 간담회", "주민 자치 총회", "교통 안전 토론회",
            "문화 예술 자문단", "재난 대비 훈련 보고", "복지 사각 지대 조사", "환경 미화 평가단",
        ],
    },
}
QUESTION = {
    "time": "{label}의 {field}은 언제인가요?",
    "count": "{label}의 {field}은 몇 명인가요?",
    "pages": "{label}의 {field}은 몇 쪽인가요?",
}
AUX_A = ["본관 강당", "별관 세미나실", "구민회관 소강당", "시청 다목적홀", "문화센터 소극장", "열람실 옆 공간", "청사 대강당", "학습관 강의실"]
AUX_B = ["사전 접수 마감", "현장 등록 가능", "준비물 없음", "추가 공지 예정", "변경 사항 없음", "담당 부서 확인", "안내 문자 발송", "좌석 지정 없음"]
NOTES = ["주차 공간 협소", "음료 반입 금지", "휠체어 접근 가능", "우천 시 실내 진행", "서류 회수 예정", "촬영 사전 동의", "간식 제공", "보조 인력 배치"]
NOTE_HEADER = "비고"
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


# ------------------------------------------------------------------ one source (content shared by its 4 layouts)
def build_source(d_index, doctype, form, content):
    doc = DOC[doctype]
    source_id = f"{doctype}-{form}-c{content}"
    rng = random.Random(f"ko-row-gate|{source_id}")
    f_index = FORMS.index(form)
    slot = (d_index + f_index + content) % RECORDS
    qtype = QTYPES[QTYPE_OF(d_index, f_index, content)]
    t_index = f_index * 2 + content
    others = rng.sample(range(TARGET_POOL, len(doc["labels"])), RECORDS - 1)
    labels, it = [], iter(others)
    for s in range(RECORDS):
        labels.append(doc["labels"][t_index] if s == slot else doc["labels"][next(it)])
    pool = []
    while len(pool) < 2 * RECORDS:
        v = value_text(qtype, rng)
        if v not in pool:
            pool.append(v)
    values, decoys = pool[:RECORDS], pool[RECORDS:]
    aux_a = rng.sample(AUX_A, RECORDS)
    aux_b = rng.sample(AUX_B, RECORDS)
    notes = rng.sample(NOTES, RECORDS)
    field, decoy_field = doc["fields"][qtype]
    return {"source": source_id, "doctype": doctype, "form": form, "content": content, "slot": slot, "qtype": qtype,
            "field": field, "decoyField": decoy_field, "labels": labels, "values": values, "decoys": decoys,
            "auxA": aux_a, "auxB": aux_b, "notes": notes}


# ------------------------------------------------------------------ one page (one layout of a source)
def build_page(src, ans, dec):
    doc = DOC[src["doctype"]]
    form = src["form"]
    page_id = f"{src['source']}-{ans}-{dec}"
    items, rules, records = [], [], []
    items.append({"id": "title", "role": "title", "text": doc["title"], "cell": list(TITLE_CELL), "size": "title"})
    if form == "table":
        rules.append(hrule(96))
        items.append({"id": "h-label", "role": "header", "text": doc["labelHeader"], "cell": cell(LABEL_X, 104), "size": "body"})
        items.append({"id": "h-value", "role": "header", "text": src["field"], "cell": cell(VALUE_X, 104), "size": "body"})
        items.append({"id": "h-decoy", "role": "header", "text": src["decoyField"], "cell": cell(DECOY_X, 104), "size": "body"})
        items.append({"id": "h-note", "role": "header", "text": NOTE_HEADER, "cell": cell(NOTE_X, 104), "size": "body"})
        rules.append(hrule(150))
    for s in range(RECORDS):
        y = Y0[form] + s * (BLOCK + GAP)
        ya, yb = y, y + LINE
        y_value, y_aux_a = (ya, yb) if ans == "same" else (yb, ya)
        y_decoy, y_aux_b = (ya, yb) if dec == "same" else (yb, ya)
        rec = {"slot": s, "position": SLOT_NAMES[s], "labelItem": f"r{s}-label", "valueItem": f"r{s}-value", "auxAItem": f"r{s}-auxA",
               "decoyItem": f"r{s}-decoy", "auxBItem": f"r{s}-auxB", "noteItem": f"r{s}-note", "block": [y, y + BLOCK], "lineA": [ya, ya + LINE], "lineB": [yb, yb + LINE]}
        items.append({"id": rec["labelItem"], "role": "label", "record": s, "text": src["labels"][s], "cell": cell(LABEL_X, ya), "size": "body"})
        items.append({"id": rec["valueItem"], "role": "value", "record": s, "text": src["values"][s], "cell": cell(VALUE_X, y_value), "size": "body"})
        items.append({"id": rec["auxAItem"], "role": "aux", "record": s, "text": src["auxA"][s], "cell": cell(VALUE_X, y_aux_a), "size": "body"})
        items.append({"id": rec["decoyItem"], "role": "decoy", "record": s, "text": src["decoys"][s], "cell": cell(DECOY_X, y_decoy), "size": "body"})
        items.append({"id": rec["auxBItem"], "role": "aux", "record": s, "text": src["auxB"][s], "cell": cell(DECOY_X, y_aux_b), "size": "body"})
        items.append({"id": rec["noteItem"], "role": "note", "record": s, "text": src["notes"][s], "cell": cell(NOTE_X, ya), "size": "body"})
        records.append(rec)
        if form == "table":
            rules.append(hrule(y + BLOCK + GAP // 2 - 1))  # rule in the middle of the spacing below the record block
        else:
            top, bottom = y - 2, y + BLOCK + 2  # card border just outside the record block
            rules += [[FRAME_X[0], top, FRAME_X[1], y], [FRAME_X[0], y + BLOCK, FRAME_X[1], bottom],
                      [FRAME_X[0], y, FRAME_X[0] + 2, y + BLOCK], [FRAME_X[1] - 2, y, FRAME_X[1], y + BLOCK]]
    slot = src["slot"]
    target = records[slot]
    return {
        "id": page_id, "source": src["source"], "doctype": src["doctype"], "form": form, "content": src["content"], "ans": ans, "dec": dec,
        "layout": f"{ans}-{dec}", "file": f"{page_id}.png", "page": dict(PAGE), "slot": slot, "slotPosition": SLOT_NAMES[slot], "qtype": src["qtype"],
        "records": records, "question": QUESTION[src["qtype"]].format(label=src["labels"][slot], field=src["field"]), "answer": src["values"][slot],
        "label": src["labels"][slot], "field": src["field"], "decoyField": src["decoyField"],
        "anchorItem": target["labelItem"], "valueItem": target["valueItem"], "decoyItem": target["decoyItem"], "goldItems": [target["labelItem"], target["valueItem"]],
        "otherValueItems": [r["valueItem"] for r in records if r["slot"] != slot],
        "items": items, "rules": rules,
    }


def build():
    sources, images = [], []
    for d_index, doctype in enumerate(DOCTYPES):
        for form in FORMS:
            for content in CONTENTS:
                src = build_source(d_index, doctype, form, content)
                sources.append(src)
                for ans in ANS_ROWS:
                    for dec in DECOY_ROWS:
                        images.append(build_page(src, ans, dec))
    for i, im in enumerate(images):
        im["serial"] = i
    return sources, images


# ------------------------------------------------------------------ registered design checks (protocol 3.4, design part)
def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def inside(inner, outer):
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def same_row_right(h, j):
    """W3 same-row condition (protocol 4.4) on two [x0, y0, x1, y1] boxes: j right of h, 2 x overlap >= smaller height."""
    ov = max(0, min(j[3], h[3]) - max(j[1], h[1]))
    return j[0] >= h[2] and 2 * ov >= min(j[3] - j[1], h[3] - h[1])


def ref_band(label_ink):
    """Reference padded band (protocol 3.4 item 4): the label ink as one hit word, pad = its height."""
    h = label_ink[3] - label_ink[1]
    return [math.floor(label_ink[1] - h), math.ceil(label_ink[3] + h)]


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


def check(sources, images, font_path=None):
    problems = []
    p = problems.append
    if len(sources) != 12 or len(images) != 48:
        p(f"{len(sources)} sources / {len(images)} pages, not 12 / 48")
    order = [f"{d}-{f}-c{c}-{a}-{e}" for d in DOCTYPES for f in FORMS for c in CONTENTS for a in ANS_ROWS for e in DECOY_ROWS]
    if [im["id"] for im in images] != order:
        p("page ids/order differ from the registered grid")
    slots = [src["slot"] for src in sources]
    if sorted(slots.count(k) for k in range(RECORDS)) != [4, 4, 4]:
        p(f"target slots not balanced 4/4/4: {slots}")
    for form in FORMS:
        fs = [src["slot"] for src in sources if src["form"] == form]
        if sorted(fs.count(k) for k in range(RECORDS)) != [2, 2, 2]:
            p(f"target slots of {form} not 2/2/2: {fs}")
    qt = [src["qtype"] for src in sources]
    if sorted(qt.count(t) for t in QTYPES) != [4, 4, 4]:
        p(f"question types not 4/4/4: {qt}")
    for d in DOCTYPES:
        ds = [src["qtype"] for src in sources if src["doctype"] == d]
        if sorted(ds.count(t) for t in QTYPES) != [1, 1, 2]:
            p(f"question types of {d} not 2/1/1: {ds}")
    for form in FORMS:
        fs = [src["qtype"] for src in sources if src["form"] == form]
        if sorted(fs.count(t) for t in QTYPES) != [2, 2, 2]:
            p(f"question types of {form} not 2/2/2: {fs}")
    for s in range(RECORDS):
        ss = [src["qtype"] for src in sources if src["slot"] == s]
        if sorted(ss.count(t) for t in QTYPES) != [1, 1, 2]:
            p(f"question types of slot {s} not 2/1/1: {ss}")
    qs = [norm_q(im["question"]) for im in images]
    if len(set(qs)) != 12 or any(qs.count(q) != 4 for q in qs):
        p("normalized questions are not 12 distinct questions with 4 pages each")
    fonts = load_fonts(font_path) if font_path else None
    by_source = {}
    for im in images:
        by_source.setdefault(im["source"], []).append(im)
    swapping = {"value", "auxA", "decoy", "auxB"}
    # pairing: the 4 pages of a source differ only in the y of the 4 swapping items of every record
    for sid, pages in by_source.items():
        if len(pages) != 4 or sorted((pg["ans"], pg["dec"]) for pg in pages) != sorted((a, e) for a in ANS_ROWS for e in DECOY_ROWS):
            p(f"{sid}: not exactly the 4 registered layouts")
            continue
        ref = pages[0]
        for pg in pages[1:]:
            for k in ("question", "answer", "label", "field", "decoyField", "slot", "qtype", "doctype", "form", "content", "page", "anchorItem", "valueItem", "decoyItem", "goldItems", "otherValueItems", "rules"):
                if pg[k] != ref[k]:
                    p(f"{pg['id']}: {k} differs from {ref['id']}")
            sig = lambda it: (it["id"], it["role"], it["text"], it["size"], it["cell"][0], it["cell"][2], it["cell"][3] - it["cell"][1])  # noqa: E731
            if [sig(it) for it in pg["items"]] != [sig(it) for it in ref["items"]]:
                p(f"{pg['id']}: items differ from {ref['id']} in more than y")
            for a, b in zip(pg["items"], ref["items"]):
                kind = a["id"].split("-", 1)[1] if a["id"].startswith("r") and "-" in a["id"] else None
                if kind not in swapping and a["cell"][1] != b["cell"][1]:
                    p(f"{pg['id']}: {a['id']} moved although it is not a swapping item")
    for im in images:
        pid = im["id"]
        items = {it["id"]: it for it in im["items"]}
        if len(items) != len(im["items"]):
            p(f"{pid}: item ids not unique")
        if len(im["records"]) != RECORDS:
            p(f"{pid}: {len(im['records'])} records")
        label_it, value_it = items[im["anchorItem"]], items[im["valueItem"]]
        if label_it["text"] != im["label"] or value_it["text"] != im["answer"] or im["anchorItem"] != f"r{im['slot']}-label":
            p(f"{pid}: label/answer/slot")
        if im["question"].count(im["label"]) != 1:
            p(f"{pid}: question does not contain the label exactly once")
        if re.search("[A-Za-z0-9]", im["question"]):
            p(f"{pid}: question has ASCII letters or digits (K0 must stay unmatched)")
        if question_types(im["question"]) != [im["qtype"]]:
            p(f"{pid}: question types {question_types(im['question'])} != [{im['qtype']}]")
        # strict grammar: designated values and decoys match the question type, nothing else matches any type
        for it in im["items"]:
            role = it["role"]
            if role in ("value", "decoy"):
                if not matches(im["qtype"], it["text"]):
                    p(f"{pid}: {it['id']} {it['text']!r} does not match the {im['qtype']} grammar")
            else:
                if any(matches(t, it["text"]) for t in QTYPES) or re.search("[A-Za-z0-9]", it["text"]):
                    p(f"{pid}: {it['id']} {it['text']!r} has ASCII alphanumerics or matches a grammar")
        vals = [items[r["valueItem"]]["text"] for r in im["records"]]
        decs = [items[r["decoyItem"]]["text"] for r in im["records"]]
        if len(set(vals + decs)) != 2 * RECORDS:
            p(f"{pid}: designated values and decoys are not 6 distinct texts")
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
        texts = [it["text"] for it in im["items"]]
        if len(set(texts)) != len(texts):
            p(f"{pid}: item texts not unique")
        for r in im["records"]:
            lc = items[r["labelItem"]]["cell"]
            want = {"valueItem": (VALUE_X, "same" == im["ans"]), "auxAItem": (VALUE_X, "same" != im["ans"]),
                    "decoyItem": (DECOY_X, "same" == im["dec"]), "auxBItem": (DECOY_X, "same" != im["dec"]), "noteItem": (NOTE_X, True)}
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
            for problem in layout_problems(im, ink):
                p(problem)
    return problems


def layout_problems(im, ink):
    """Registered ink layout conditions of protocol 3.2 (also run on the rendered inks by the data check)."""
    out = []
    pid = im["id"]
    for r in im["records"]:
        la = ink[r["labelItem"]]
        for k in ("valueItem", "auxAItem", "decoyItem", "auxBItem", "noteItem"):
            b = ink[r[k]]
            cell_y = next(it["cell"][1] for it in im["items"] if it["id"] == r[k])
            on_a = cell_y == r["lineA"][0]
            if on_a:
                if not (abs(b[1] - la[1]) <= SAME_TOP_DIFF and same_row_right(la, b)):
                    out.append(f"{pid}: {r[k]} not on the label line {la} {b}")
            else:
                if not (b[1] >= la[3] and OTHER_TOP_DIFF[0] <= b[1] - la[1] <= OTHER_TOP_DIFF[1]):
                    out.append(f"{pid}: {r[k]} not one line below the label {la} {b}")
                if same_row_right(la, b):
                    out.append(f"{pid}: {r[k]} counts as the label row although it is on line B")
    outer = []
    for r in im["records"]:
        boxes = [ink[r[k]] for k in ("labelItem", "valueItem", "auxAItem", "decoyItem", "auxBItem", "noteItem")]
        outer.append((min(b[1] for b in boxes), max(b[3] for b in boxes)))
    for a, b in zip(outer, outer[1:]):
        if not RECORD_INK_GAP[0] <= b[0] - a[1] <= RECORD_INK_GAP[1]:
            out.append(f"{pid}: record ink gap {b[0] - a[1]} outside {list(RECORD_INK_GAP)}")
    # ideal-geometry prediction (protocol 3.4 item 4): same-format items right of the target label on its row
    tr = im["records"][im["slot"]]
    la = ink[tr["labelItem"]]
    cands = [k for k in ("valueItem", "decoyItem") if same_row_right(la, ink[tr[k]])]
    want = {"same-same": ["valueItem", "decoyItem"], "same-other": ["valueItem"], "below-same": ["decoyItem"], "below-other": []}[im["layout"]]
    if cands != want:
        out.append(f"{pid}: ideal same-row candidates {cands} != {want}")
    for s, r in enumerate(im["records"]):
        if s == im["slot"]:
            continue
        for k in ("valueItem", "decoyItem"):
            if same_row_right(la, ink[r[k]]):
                out.append(f"{pid}: {r[k]} of another record is on the target label row")
    return out


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
    design = {"version": VERSION, "set": "ko-row-gate", "font": FONT,
              "geometry": {"labelX": list(LABEL_X), "valueX": list(VALUE_X), "decoyX": list(DECOY_X), "noteX": list(NOTE_X), "line": LINE, "block": BLOCK, "gap": GAP, "y0": Y0,
                           "printable": PRINTABLE, "sameTopDiff": SAME_TOP_DIFF, "otherTopDiff": list(OTHER_TOP_DIFF), "recordInkGap": list(RECORD_INK_GAP)},
              "questionTypes": {"assignment": "(2*d + f + c) mod 3 over ['time', 'count', 'pages']", "cues": CUES},
              "sources": sources, "images": images}
    questions = {"version": QVERSION, "questions": [{"id": im["id"], "file": im["file"], "question": im["question"]} for im in images]}
    (out / "design.json").write_bytes(dump(design).encode("utf-8"))
    (out / "questions.json").write_bytes(dump(questions).encode("utf-8"))
    problems = check(sources, images, a.font)
    print(json.dumps({"sources": len(sources), "pages": len(images), "problems": problems}, ensure_ascii=False))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
