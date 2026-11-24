"""ko-row-height: registered generator of the 48 new Korean pages (protocol research/plans/2026-11-24-ko-row-height-protocol.md, 3).

12 source documents (3 document kinds x 2 forms x 2 contents), each rendered in 4 paired layouts
(label/value on the same line or the value one line below) x (narrow or wide spacing between neighbouring records).
The 4 pages of one source share the question, the answer, every record text, every x coordinate, the font and the page
size; only y coordinates differ.

Usage:
  python design.py --out <dir> [--font <NotoSansKR-VF.ttf>]

Writes <dir>/design.json (scoring side, input format of the fixed renderer research/tools/r09/render.py) and
<dir>/questions.json (selector side: id, file, question only). Standard library only for generation; with --font the
design checks also measure every item's ink box with Pillow (no image is written). Same arguments -> same bytes.
Exits 1 when any registered design check fails (the files are still written so the failure can be inspected).
"""
import argparse
import json
import random
import re
import sys
import unicodedata
from pathlib import Path

VERSION = "ko-row-height-design-1"
QVERSION = "ko-row-height-questions-1"
FONT = {"file": "NotoSansKR-VF.ttf", "sha256": "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0", "weight": 400, "bodySize": 24, "titleSize": 32}
PAGE = {"width": 1280, "height": 960}
PAD_X = 12  # fixed renderer: text starts 12 px right of the cell's left edge, vertically centred in the cell

# ------------------------------------------------------------------ grid (protocol 3.1)
DOCTYPES = ["venue", "proof", "workshop"]
FORMS = ["table", "cards"]
CONTENTS = [0, 1]
VERTS = ["same", "below"]
SPACES = ["narrow", "wide"]
RECORDS = 3
SLOT_NAMES = ["top", "middle", "bottom"]

# ------------------------------------------------------------------ geometry (protocol 3.2), half-open [x0, y0, x1, y1)
LABEL_X = (40, 400)
VALUE_X = (720, 960)
NOTE_X = (1000, 1240)
TITLE_CELL = [40, 28, 1000, 84]
FRAME_X = (24, 1256)
LINE = 40  # body cell height
BLOCK = {"same": 40, "below": 80}  # height of one record block (cells)
SPACE = {"narrow": 4, "wide": 84}  # empty cell rows between two record blocks
Y0 = {"table": 160, "cards": 112}  # top of the first record block
# registered measurement windows on rendered ink (protocol 3.2)
INK_GAP = {"narrow": (12, 30), "wide": (90, 115)}
SAME_TOP_DIFF = 4  # same: |value ink top - label ink top| <= 4 and positive vertical overlap
BELOW_TOP_DIFF = (32, 48)  # below: value ink top >= label ink bottom and value top - label top in [32, 48]

# ------------------------------------------------------------------ content (protocol 3.3)
DOC = {
    "venue": {
        "title": "공연장 대관 일정표",
        "labelHeader": "공연명",
        "field": "입장 시각",
        "question": "{label}의 입장 시각은 언제인가요?",
        "labels": [
            "한여름 재즈 콘서트", "겨울밤 현악 사중주", "청소년 합창 발표회", "봄빛 피아노 독주회",
            "가을 국악 한마당", "어린이 인형극 무대", "새해 맞이 금관 앙상블", "탱고 댄스 경연대회",
            "오페라 갈라 쇼케이스", "록밴드 야외 축제", "판소리 완창 공개 녹화", "실내악 소품 연주",
        ],
        "notes": ["음향 점검 완료", "조명 리허설 예정", "객석 3층 개방", "소품 반입 확인", "주차 안내 필요", "휴식 15분 포함", "녹음 장비 대여", "티켓 현장 판매"],
    },
    "proof": {
        "title": "출판 교정 배정표",
        "labelHeader": "원고명",
        "field": "교정 분량",
        "question": "{label}의 교정 분량은 몇 쪽인가요?",
        "labels": [
            "푸른 바다 건너 편지", "작은 서점 이야기", "도시 정원 가꾸기", "별을 세는 밤길 산책",
            "할머니 부엌 기록", "우주 탐사 연대기", "숲속 야생 동물 도감", "기차 여행 안내서",
            "옛날 골목 시장 풍경", "고양이 철학 노트", "빗소리 수필 모음", "한겨울 산행 일지",
        ],
        "notes": ["표지 시안 확인", "각주 번호 점검", "사진 저작권 확인", "색인 작업 예정", "오탈자 2차 검토", "판권면 수정", "띠지 문구 대기", "인쇄 일정 협의"],
    },
    "workshop": {
        "title": "공방 수업 편성표",
        "labelHeader": "수업명",
        "field": "수강 정원",
        "question": "{label}의 수강 정원은 몇 명인가요?",
        "labels": [
            "도자기 물레 기초", "가죽 지갑 만들기", "천연 향기 비누 공예", "원목 흔들 의자 제작",
            "은반지 세공 입문", "한지 등불 꾸미기", "유리 모자이크 액자", "매듭 팔찌 손으로 엮기",
            "자수 손수건 놓기", "향초 캔들 블렌딩", "라탄 바구니 짜기", "수채 엽서 그리기",
        ],
        "notes": ["재료비 별도", "앞치마 지참", "주차 2시간 무료", "작품 당일 수령", "초보자 환영", "도구 대여 가능", "보조 강사 배치", "재료 사전 준비"],
    },
}
NOTE_HEADER = "비고"
TARGET_POOL = 4  # label indices 0-3 are the target labels of the 4 sources of a kind; 4-11 are the neighbour pool


def value_text(doctype, rng):
    if doctype == "venue":
        return f"{rng.randint(10, 21)}시 {rng.choice([0, 10, 20, 30, 40, 50]):02d}분"
    if doctype == "proof":
        return f"{rng.randint(120, 480)}쪽"
    return f"{rng.randint(6, 24)}명"


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
    rng = random.Random(f"ko-row-height|{source_id}")
    slot = (d_index + FORMS.index(form) + content) % RECORDS
    t_index = FORMS.index(form) * 2 + content
    others = rng.sample(range(TARGET_POOL, len(doc["labels"])), RECORDS - 1)
    labels, it = [], iter(others)
    for s in range(RECORDS):
        labels.append(doc["labels"][t_index] if s == slot else doc["labels"][next(it)])
    values = []
    while len(values) < RECORDS:
        v = value_text(doctype, rng)
        if v not in values:
            values.append(v)
    notes = rng.sample(doc["notes"], RECORDS)
    return {"source": source_id, "doctype": doctype, "form": form, "content": content, "slot": slot,
            "labels": labels, "values": values, "notes": notes}


# ------------------------------------------------------------------ one page (one layout of a source)
def build_page(src, vert, space):
    doc = DOC[src["doctype"]]
    form = src["form"]
    page_id = f"{src['source']}-{vert}-{space}"
    B, S = BLOCK[vert], SPACE[space]
    items, rules, records = [], [], []
    items.append({"id": "title", "role": "title", "text": doc["title"], "cell": list(TITLE_CELL), "size": "title"})
    if form == "table":
        rules.append(hrule(96))
        items.append({"id": "h-label", "role": "header", "text": doc["labelHeader"], "cell": cell(LABEL_X, 104), "size": "body"})
        items.append({"id": "h-value", "role": "header", "text": doc["field"], "cell": cell(VALUE_X, 104), "size": "body"})
        items.append({"id": "h-note", "role": "header", "text": NOTE_HEADER, "cell": cell(NOTE_X, 104), "size": "body"})
        rules.append(hrule(150))
    for s in range(RECORDS):
        y = Y0[form] + s * (B + S)
        y_value = y if vert == "same" else y + LINE
        rec = {"slot": s, "position": SLOT_NAMES[s], "labelItem": f"r{s}-label", "valueItem": f"r{s}-value", "noteItem": f"r{s}-note", "block": [y, y + B]}
        items.append({"id": rec["labelItem"], "role": "label", "record": s, "text": src["labels"][s], "cell": cell(LABEL_X, y), "size": "body"})
        items.append({"id": rec["valueItem"], "role": "value", "record": s, "text": src["values"][s], "cell": cell(VALUE_X, y_value), "size": "body"})
        items.append({"id": rec["noteItem"], "role": "note", "record": s, "text": src["notes"][s], "cell": cell(NOTE_X, y), "size": "body"})
        records.append(rec)
        if form == "table":
            rules.append(hrule(y + B + S // 2 - 1))  # rule in the middle of the spacing below the record block
        else:
            top, bottom = y - 2, y + B + 2  # card border just outside the record block
            rules += [[FRAME_X[0], top, FRAME_X[1], y], [FRAME_X[0], y + B, FRAME_X[1], bottom],
                      [FRAME_X[0], y, FRAME_X[0] + 2, y + B], [FRAME_X[1] - 2, y, FRAME_X[1], y + B]]
    slot = src["slot"]
    target = records[slot]
    return {
        "id": page_id, "source": src["source"], "doctype": src["doctype"], "form": form, "content": src["content"], "vert": vert, "space": space,
        "file": f"{page_id}.png", "page": dict(PAGE), "slot": slot, "slotPosition": SLOT_NAMES[slot], "records": records,
        "neighbors": {"above": slot - 1 if slot > 0 else None, "below": slot + 1 if slot < RECORDS - 1 else None},
        "question": doc["question"].format(label=src["labels"][slot]), "answer": src["values"][slot], "label": src["labels"][slot], "field": doc["field"],
        "anchorItem": target["labelItem"], "valueItem": target["valueItem"], "goldItems": [target["labelItem"], target["valueItem"]],
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
                for vert in VERTS:
                    for space in SPACES:
                        images.append(build_page(src, vert, space))
    for i, im in enumerate(images):
        im["serial"] = i
    return sources, images


# ------------------------------------------------------------------ registered design checks (protocol 3.4, design part)
def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def inside(inner, outer):
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


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
    order = [f"{d}-{f}-c{c}-{v}-{s}" for d in DOCTYPES for f in FORMS for c in CONTENTS for v in VERTS for s in SPACES]
    if [im["id"] for im in images] != order:
        p("page ids/order differ from the registered grid")
    slots = [src["slot"] for src in sources]
    if sorted(slots.count(k) for k in range(RECORDS)) != [4, 4, 4]:
        p(f"target slots not balanced 4/4/4: {slots}")
    for form in FORMS:
        fs = [src["slot"] for src in sources if src["form"] == form]
        if sorted(fs.count(k) for k in range(RECORDS)) != [2, 2, 2]:
            p(f"target slots of {form} not 2/2/2: {fs}")
    qs = [norm_q(im["question"]) for im in images]
    if len(set(qs)) != 12 or any(qs.count(q) != 4 for q in qs):
        p("normalized questions are not 12 distinct questions with 4 pages each")
    fonts = load_fonts(font_path) if font_path else None
    by_source = {}
    for im in images:
        by_source.setdefault(im["source"], []).append(im)
    # pairing: the 4 pages of a source differ only in y coordinates
    for sid, pages in by_source.items():
        if len(pages) != 4 or sorted((pg["vert"], pg["space"]) for pg in pages) != sorted((v, s) for v in VERTS for s in SPACES):
            p(f"{sid}: not exactly the 4 registered layouts")
            continue
        ref = pages[0]
        for pg in pages[1:]:
            for k in ("question", "answer", "label", "field", "slot", "doctype", "form", "content", "page", "anchorItem", "valueItem", "goldItems", "otherValueItems", "neighbors"):
                if pg[k] != ref[k]:
                    p(f"{pg['id']}: {k} differs from {ref['id']}")
            if [(it["id"], it["role"], it["text"], it["size"], it["cell"][0], it["cell"][2], it["cell"][3] - it["cell"][1]) for it in pg["items"]] != \
               [(it["id"], it["role"], it["text"], it["size"], it["cell"][0], it["cell"][2], it["cell"][3] - it["cell"][1]) for it in ref["items"]]:
                p(f"{pg['id']}: items differ from {ref['id']} in more than y")
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
        for role in ("labelItem", "valueItem", "noteItem"):
            if len({items[r[role]]["text"] for r in im["records"]}) != RECORDS:
                p(f"{pid}: {role} texts not unique")
        if {items[r["valueItem"]]["text"] for r in im["records"]} & {items[r["noteItem"]]["text"] for r in im["records"]}:
            p(f"{pid}: a value text equals a note text")
        for r in im["records"]:
            lc, vc, nc = items[r["labelItem"]]["cell"], items[r["valueItem"]]["cell"], items[r["noteItem"]]["cell"]
            if im["vert"] == "same" and vc[1] != lc[1]:
                p(f"{pid}: same record {r['slot']} label/value rows differ")
            if im["vert"] == "below" and vc[1] != lc[3]:
                p(f"{pid}: below record {r['slot']} value is not exactly one line below the label")
            if not (nc[0] > vc[2] and nc[1] == lc[1]):
                p(f"{pid}: record {r['slot']} note is not right of the value on the label line")
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
            la, va = ink[im["anchorItem"]], ink[im["valueItem"]]
            if im["vert"] == "same" and not (min(la[3], va[3]) - max(la[1], va[1]) > 0 and abs(va[1] - la[1]) <= SAME_TOP_DIFF):
                p(f"{pid}: same: label/value ink rows {la} {va}")
            if im["vert"] == "below" and not (va[1] >= la[3] and BELOW_TOP_DIFF[0] <= va[1] - la[1] <= BELOW_TOP_DIFF[1]):
                p(f"{pid}: below: label/value ink {la} {va}")
            outer = []
            for r in im["records"]:
                boxes = [ink[r[k]] for k in ("labelItem", "valueItem", "noteItem")]
                outer.append((min(b[1] for b in boxes), max(b[3] for b in boxes)))
            lo, hi = INK_GAP[im["space"]]
            for a, b in zip(outer, outer[1:]):
                if not lo <= b[0] - a[1] <= hi:
                    p(f"{pid}: neighbour ink gap {b[0] - a[1]} outside {im['space']} window [{lo}, {hi}]")
    return problems


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
    design = {"version": VERSION, "set": "ko-row-height", "font": FONT,
              "geometry": {"labelX": list(LABEL_X), "valueX": list(VALUE_X), "noteX": list(NOTE_X), "line": LINE, "block": BLOCK, "space": SPACE, "y0": Y0,
                           "inkGap": {k: list(v) for k, v in INK_GAP.items()}, "sameTopDiff": SAME_TOP_DIFF, "belowTopDiff": list(BELOW_TOP_DIFF)},
              "sources": sources, "images": images}
    questions = {"version": QVERSION, "questions": [{"id": im["id"], "file": im["file"], "question": im["question"]} for im in images]}
    (out / "design.json").write_bytes(dump(design).encode("utf-8"))
    (out / "questions.json").write_bytes(dump(questions).encode("utf-8"))
    problems = check(sources, images, a.font)
    print(json.dumps({"sources": len(sources), "pages": len(images), "problems": problems}, ensure_ascii=False))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
