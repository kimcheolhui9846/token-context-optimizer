"""ko-row-window: registered generator of the 48 new Korean pages (protocol research/plans/2026-11-24-ko-row-window-protocol.md, 3).

Usage:
  python design.py --out <dir> [--font <NotoSansKR-VF.ttf>]

Writes <dir>/design.json (scoring side, fixed renderer input format of research/tools/r09/render.py) and
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

VERSION = "ko-row-window-design-1"
QVERSION = "ko-row-window-questions-1"
FONT = {"file": "NotoSansKR-VF.ttf", "sha256": "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0", "weight": 400, "bodySize": 24, "titleSize": 32}
PAGE = {"width": 1280, "height": 960}
PAD_X = 12  # fixed renderer: text starts 12 px right of the cell's left edge, vertically centred

# ------------------------------------------------------------------ grid (protocol 3.1)
DOCTYPES = ["exhibit", "costume", "lostfound"]
FORMS = ["table", "cards"]
VERTS = ["inline", "stacked"]
GAPS = ["near", "far"]
CASES = [0, 1]
RECORDS = {"table": 4, "cards": 2}

# ------------------------------------------------------------------ geometry (protocol 3.2), half-open [x0, y0, x1, y1)
LABEL_X = (40, 330)
VALUE_X = {"near": (330, 570), "far": (720, 960)}
NOTE_X = (1000, 1240)
TITLE_CELL = [40, 28, 1000, 84]
FRAME_X = (24, 1256)
ROW_H = 40  # body cell height

# ------------------------------------------------------------------ content (protocol 3.3)
DOC = {
    "exhibit": {
        "title": "전시 작품 설치표",
        "labelHeader": "작품명",
        "field": "설치 높이",
        "question": "{label}의 설치 높이는 얼마인가요?",
        "labels": [
            "은빛 파도 조각", "붉은 노을 연작", "고요한 숲길 판화", "겨울 항구 풍경", "새벽 안개 습작",
            "황금 들판 유화", "푸른 달빛 소묘", "바람 언덕 목판", "하얀 구름 도자", "작은 정원 모형",
            "여름 소나기 수채", "오래된 등대 사진", "빛나는 유리 화병", "잠든 고양이 석고", "깊은 계곡 동판",
            "흐린 강변 스케치", "둥근 시계 부조", "가을 단풍 병풍", "밤하늘 별자리 지도", "조용한 호수 목각",
        ],
        "notes": ["조명 각도 점검", "액자 고정 확인", "운반 상자 3번", "보험 증서 첨부", "전원 연결 필요", "먼지 제거 예정", "작가 서명 확인", "점검 2회 완료"],
    },
    "costume": {
        "title": "무대 의상 배정표",
        "labelHeader": "의상명",
        "field": "수선 마감일",
        "question": "{label}의 수선 마감일은 언제인가요?",
        "labels": [
            "왕비 연회 드레스", "기사 은색 갑옷", "광대 줄무늬 바지", "마법사 보라 망토", "어부 낡은 조끼",
            "공주 분홍 치마", "병사 초록 군복", "상인 갈색 외투", "요정 날개 장식", "시녀 하늘 앞치마",
            "해적 검정 모자", "농부 삼베 저고리", "귀족 금빛 연미복", "수도사 회색 로브", "사냥꾼 가죽 장화",
            "무희 비단 스카프", "악사 비취 셔츠", "노인 털실 목도리", "소년 체크 멜빵", "마녀 자줏빛 두건",
        ],
        "notes": ["세탁 후 반납", "단추 2개 교체", "소매 길이 조정", "보풀 제거 필요", "예비 의상 있음", "안감 얼룩 확인", "허리끈 3개 동봉", "대여 기록 없음"],
    },
    "lostfound": {
        "title": "분실물 보관 대장",
        "labelHeader": "물품명",
        "field": "보관 위치",
        "question": "{label}의 보관 위치는 어디인가요?",
        "labels": [
            "검정 가죽 지갑", "노란 비닐 우비", "은색 손목 시계", "파란 뜨개 장갑", "갈색 서류 가방",
            "하얀 무선 이어폰", "빨간 보온 물병", "초록 학생 수첩", "분홍 머리 집게", "남색 야구 모자",
            "금색 열쇠 꾸러미", "줄무늬 면 목도리", "투명 안경 케이스", "주황 플라스틱 필통", "베이지 니트 조끼",
            "보라 손수건 묶음", "하늘색 실내 슬리퍼", "검은 카메라 렌즈캡", "연두 도시락 주머니", "회색 접이식 방석",
        ],
        "notes": ["연락처 없음", "주인 문의 1건", "습득 장소 로비", "외관 손상 없음", "현금 미포함", "이름표 부착", "충전 상태 양호", "습득자 연락 2회"],
    },
}
NOTE_HEADER = "비고"


def value_text(doctype, rng):
    if doctype == "exhibit":
        return f"{rng.randint(110, 260)} cm"
    if doctype == "costume":
        return f"{rng.randint(1, 12)}월 {rng.randint(1, 28)}일"
    return f"{rng.choice('ABCDEF')}열 {rng.randint(1, 40)}번"


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
    return [x[0], y0, x[1], y0 + ROW_H]


def frame_rule(y):
    return [FRAME_X[0], y, FRAME_X[1], y + 2]


# ------------------------------------------------------------------ one page
def build_page(doctype, form, vert, gap, case, d_index, j_index, t_index):
    doc = DOC[doctype]
    page_id = f"{doctype}-{form}-{vert}-{gap}-c{case}"
    rng = random.Random(f"ko-row-window|{page_id}")
    n_rec = RECORDS[form]
    slot = (j_index + d_index) % n_rec
    target_label = doc["labels"][t_index]
    others = rng.sample([i for i in range(len(doc["labels"])) if i != t_index], n_rec - 1)
    labels, other_i = [], iter(others)
    for s in range(n_rec):
        labels.append(target_label if s == slot else doc["labels"][next(other_i)])
    values = []
    while len(values) < n_rec:
        v = value_text(doctype, rng)
        if v not in values:
            values.append(v)
    notes = rng.sample(doc["notes"], n_rec)
    vx = VALUE_X[gap]
    items, rules, records = [], [], []
    items.append({"id": "title", "role": "title", "text": doc["title"], "cell": list(TITLE_CELL), "size": "title"})

    def record_items(s, y_label):
        y_value = y_label if vert == "inline" else y_label + ROW_H
        rec = {"slot": s, "labelItem": f"r{s}-label", "valueItem": f"r{s}-value", "noteItem": f"r{s}-note"}
        items.append({"id": rec["labelItem"], "role": "label", "record": s, "text": labels[s], "cell": cell(LABEL_X, y_label), "size": "body"})
        items.append({"id": rec["valueItem"], "role": "value", "record": s, "text": values[s], "cell": cell(vx, y_value), "size": "body"})
        items.append({"id": rec["noteItem"], "role": "note", "record": s, "text": notes[s], "cell": cell(NOTE_X, y_label), "size": "body"})
        records.append(rec)

    if form == "table":
        rules.append(frame_rule(96))
        items.append({"id": "h-label", "role": "header", "text": doc["labelHeader"], "cell": cell(LABEL_X, 104), "size": "body"})
        items.append({"id": "h-value", "role": "header", "text": doc["field"], "cell": cell(vx, 104), "size": "body"})
        items.append({"id": "h-note", "role": "header", "text": NOTE_HEADER, "cell": cell(NOTE_X, 104), "size": "body"})
        rules.append(frame_rule(150))
        row_h = 56 if vert == "inline" else 96
        for s in range(n_rec):
            y0 = 152 + s * row_h
            record_items(s, y0 + 8)
            rules.append(frame_rule(y0 + row_h - 2))
    else:
        card_h = 156 if vert == "inline" else 196
        footers = rng.sample(range(1000, 10000), n_rec)
        for s in range(n_rec):
            y = 104 + s * (card_h + 32)
            rules += [[FRAME_X[0], y, FRAME_X[1], y + 2], [FRAME_X[0], y + card_h - 2, FRAME_X[1], y + card_h],
                      [FRAME_X[0], y + 2, FRAME_X[0] + 2, y + card_h - 2], [FRAME_X[1] - 2, y + 2, FRAME_X[1], y + card_h - 2]]
            items.append({"id": f"c{s}-cap", "role": "other", "record": s, "text": f"카드 {s + 1}", "cell": cell(LABEL_X, y + 10), "size": "body"})
            items.append({"id": f"c{s}-field", "role": "header", "record": s, "text": doc["field"], "cell": cell(vx, y + 10), "size": "body"})
            record_items(s, y + 58)
            y_foot = y + 106 if vert == "inline" else y + 146
            items.append({"id": f"c{s}-foot", "role": "other", "record": s, "text": f"기록 번호 {footers[s]}", "cell": cell(LABEL_X, y_foot), "size": "body"})

    question = doc["question"].format(label=target_label)
    target = records[slot]
    return {
        "id": page_id, "doctype": doctype, "form": form, "vert": vert, "gap": gap, "case": case,
        "file": f"{page_id}.png", "page": dict(PAGE), "slot": slot, "records": records,
        "question": question, "answer": values[slot], "label": target_label, "field": doc["field"],
        "anchorItem": target["labelItem"], "valueItem": target["valueItem"], "goldItems": [target["labelItem"], target["valueItem"]],
        "items": items, "rules": rules,
    }


def build():
    images = []
    for d_index, doctype in enumerate(DOCTYPES):
        t_index = 0
        for form in FORMS:
            j_index = 0
            for vert in VERTS:
                for gap in GAPS:
                    for case in CASES:
                        images.append(build_page(doctype, form, vert, gap, case, d_index, j_index, t_index))
                        j_index += 1
                        t_index += 1
    for i, im in enumerate(images):
        im["serial"] = i
    return images


# ------------------------------------------------------------------ registered design checks (protocol 3.4, design part)
def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def inside(inner, outer):
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def check(images, font_path=None):
    problems = []
    p = problems.append
    if len(images) != 48:
        p(f"{len(images)} pages, not 48")
    ids = [im["id"] for im in images]
    if len(set(ids)) != len(ids):
        p("page ids not unique")
    grid = {}
    for im in images:
        grid.setdefault((im["doctype"], im["form"], im["vert"], im["gap"]), []).append(im["case"])
    for dt in DOCTYPES:
        for f in FORMS:
            for v in VERTS:
                for g in GAPS:
                    if sorted(grid.get((dt, f, v, g), [])) != CASES:
                        p(f"grid cell {dt}/{f}/{v}/{g} cases {grid.get((dt, f, v, g))}")
    qs = [norm_q(im["question"]) for im in images]
    if len(set(qs)) != len(qs):
        p("normalized questions not unique")
    fonts = None
    if font_path:
        import io
        from PIL import ImageFont
        raw = Path(font_path).read_bytes()
        fonts = {}
        for size_name, size in (("body", FONT["bodySize"]), ("title", FONT["titleSize"])):
            ft = ImageFont.truetype(io.BytesIO(raw), size, layout_engine=ImageFont.Layout.BASIC)
            ft.set_variation_by_axes([FONT["weight"]])
            fonts[size_name] = ft
    for im in images:
        pid = im["id"]
        items = {it["id"]: it for it in im["items"]}
        if len(items) != len(im["items"]):
            p(f"{pid}: item ids not unique")
        n_rec = RECORDS[im["form"]]
        if len(im["records"]) != n_rec:
            p(f"{pid}: {len(im['records'])} records")
        if im["slot"] != im["records"].index(next(r for r in im["records"] if r["labelItem"] == im["anchorItem"])):
            p(f"{pid}: slot does not match anchor record")
        label_it, value_it = items[im["anchorItem"]], items[im["valueItem"]]
        if label_it["text"] != im["label"] or value_it["text"] != im["answer"]:
            p(f"{pid}: label/answer text")
        if im["question"].count(im["label"]) != 1:
            p(f"{pid}: question does not contain the label exactly once")
        if re.search("[A-Za-z0-9]", im["question"]):
            p(f"{pid}: question has ASCII letters or digits (K0 must stay unmatched)")
        lab_bg = bigrams(im["label"])
        if len(lab_bg) < 3:
            p(f"{pid}: label has {len(lab_bg)} Hangul bigrams, fewer than 3")
        for it in im["items"]:
            if it["id"] != im["anchorItem"] and bigrams(it["text"]) & lab_bg:
                p(f"{pid}: item {it['id']} shares a bigram with the target label")
        texts = lambda role: [items[r[role]]["text"] for r in im["records"]]
        for role in ("labelItem", "valueItem", "noteItem"):
            if len(set(texts(role))) != n_rec:
                p(f"{pid}: {role} texts not unique")
        for r in im["records"]:
            lc, vc, nc = items[r["labelItem"]]["cell"], items[r["valueItem"]]["cell"], items[r["noteItem"]]["cell"]
            if im["vert"] == "inline" and (lc[1], lc[3]) != (vc[1], vc[3]):
                p(f"{pid}: inline record {r['slot']} label/value rows differ")
            if im["vert"] == "stacked" and not vc[1] >= lc[3]:
                p(f"{pid}: stacked record {r['slot']} value not on a separate line below the label")
            gap = vc[0] - lc[2]
            if gap != {"near": 0, "far": 390}[im["gap"]]:
                p(f"{pid}: record {r['slot']} cell gap {gap}")
            if not (nc[0] > vc[2] and (nc[1], nc[3]) == (lc[1], lc[3])):
                p(f"{pid}: record {r['slot']} note is not right of the value on the label row")
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
            for it in im["items"]:
                x0, y0, x1, y1 = it["cell"]
                bb = fonts[it["size"]].getbbox(it["text"], anchor="lm")
                ink = [x0 + PAD_X + bb[0], (y0 + y1) / 2 + bb[1], x0 + PAD_X + bb[2], (y0 + y1) / 2 + bb[3]]
                if not inside(ink, it["cell"]):
                    p(f"{pid}: {it['id']} text box {ink} not inside cell {it['cell']}")
    return problems


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, indent=1) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--font")
    a = ap.parse_args(argv)
    images = build()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    design = {"version": VERSION, "set": "ko-row-window", "font": FONT, "images": images}
    questions = {"version": QVERSION, "questions": [{"id": im["id"], "file": im["file"], "question": im["question"]} for im in images]}
    (out / "design.json").write_bytes(dump(design).encode("utf-8"))
    (out / "questions.json").write_bytes(dump(questions).encode("utf-8"))
    problems = check(images, a.font)
    print(json.dumps({"pages": len(images), "problems": problems}, ensure_ascii=False))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
