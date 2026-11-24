"""ko-ocr-holdout design generator: 96 synthetic business-document pages (3 doctypes x 2 layouts x 2 anchors x 4 seeds x en/ko).

Usage: python design.py --out <dir> [--seed-map <json file>]

Writes <dir>/design.json (renderer input) and <dir>/questions.json. Standard library only; the same arguments always give
the same bytes. All vocabulary below is invented for this set.
"""
import argparse
import datetime
import json
import random
import sys
import unicodedata
from pathlib import Path

VERSION_DESIGN = "ko-ocr-holdout-design-1"
VERSION_QUESTIONS = "ko-ocr-holdout-questions-1"
FONT = {
    "file": "NotoSansKR-VF.ttf",
    "sha256": "018174e8cdd366aff67c8d366c7dc806a7babbe7f2819fc23b00d59f7b8353d0",
    "weight": 400,
    "bodySize": 24,
    "titleSize": 32,
}
PAGE = {"width": 1280, "height": 960}
DOCTYPES = ["repair", "greenhouse", "rental"]
LAYOUTS = ["slip", "intake"]
ANCHORS = ["code", "nl"]
LANGS = ["en", "ko"]
DEFAULT_SEEDS = [101, 211, 307, 401]
SPARE_SEEDS = [503, 601, 701, 809]  # documented only; they enter through --seed-map

STAFF = [("Mira", "미라"), ("Tavin", "타빈"), ("Selu", "셀루"), ("Orren", "오렌"), ("Pell", "펠"),
         ("Jorin", "조린"), ("Kesa", "케사"), ("Dunya", "두냐"), ("Bram", "브람"), ("Ilka", "일카")]

DOCS = {
    "repair": {
        "prefix": "RP-",
        "title": {"en": "Book Repair Request", "ko": "도서 수선 의뢰서"},
        "head_label": {"en": "Code / Title", "ko": "코드 / 제목"},
        "head_value": {"en": "Due date", "ko": "완료 예정일"},
        "head_staff": {"en": "Handler", "ko": "담당자"},
        "head_status": {"en": "Status", "ko": "상태"},
        "A": [("Quiet", "조용한"), ("Amber", "호박빛"), ("Northern", "북쪽"), ("Hidden", "숨은"), ("Silver", "은빛"),
              ("Winter", "겨울"), ("Copper", "구리빛"), ("Pale", "옅은"), ("Gentle", "온화한"), ("Ancient", "오래된")],
        "B": [("Harbor", "항구"), ("Orchard", "과수원"), ("Lantern", "등불"), ("Meadow", "초원"), ("Compass", "나침반"),
              ("Garden", "정원"), ("River", "강"), ("Lighthouse", "등대"), ("Valley", "골짜기"), ("Bridge", "다리")],
        "C": [("Almanac", "연감"), ("Atlas", "지도첩"), ("Chronicle", "연대기"), ("Handbook", "편람"), ("Poems", "시집"),
              ("Tales", "이야기"), ("Notebook", "수첩"), ("Guide", "안내서"), ("Letters", "서한집"), ("Songbook", "노래책")],
        "status": [("Mending", "수선 중"), ("Queued", "접수"), ("Pressing", "압착 중"), ("Drying", "건조 중"),
                   ("Ready", "완료"), ("On hold", "자재 대기")],
        "question": {
            "en": "What is the due date for {a}?",
            "ko": "{a}의 완료 예정일은 언제인가요?",
        },
    },
    "greenhouse": {
        "prefix": "GH-",
        "title": {"en": "Greenhouse Work Log", "ko": "온실 작업 일지"},
        "head_label": {"en": "Code / Bed", "ko": "코드 / 구역"},
        "head_value": {"en": "Water volume", "ko": "관수량"},
        "head_staff": {"en": "Worker", "ko": "작업자"},
        "head_status": {"en": "Status", "ko": "상태"},
        "A": [("North", "북쪽"), ("South", "남쪽"), ("East", "동쪽"), ("West", "서쪽"), ("Front", "앞쪽"),
              ("Rear", "뒤쪽"), ("Shaded", "그늘진"), ("Sunny", "볕 드는"), ("Upper", "위쪽"), ("Lower", "아래쪽")],
        "B": [("Tomato", "토마토"), ("Pepper", "고추"), ("Basil", "바질"), ("Lettuce", "상추"), ("Cucumber", "오이"),
              ("Strawberry", "딸기"), ("Mint", "민트"), ("Spinach", "시금치"), ("Eggplant", "가지"), ("Melon", "참외")],
        "C": [("Bench", "작업대"), ("Tray", "육묘판"), ("Bed", "재배대"), ("Row", "이랑"), ("Rack", "거치대"),
              ("Planter", "식재함"), ("Frame", "프레임"), ("Table", "재배 테이블"), ("Tunnel", "터널"), ("Shelf", "선반")],
        "status": [("Done", "완료"), ("Partial", "일부"), ("Waiting", "대기"), ("Skipped", "생략"),
                   ("Checked", "확인"), ("Late", "지연")],
        "question": {
            "en": "How much water was given to {a}?",
            "ko": "{a}에 준 관수량은 얼마인가요?",
        },
    },
    "rental": {
        "prefix": "RT-",
        "title": {"en": "Rental Return Record", "ko": "대여 물품 반납 기록"},
        "head_label": {"en": "Code / Item", "ko": "코드 / 물품"},
        "head_value": {"en": "Late fee", "ko": "연체료"},
        "head_staff": {"en": "Clerk", "ko": "담당자"},
        "head_status": {"en": "Status", "ko": "상태"},
        "A": [("Folding", "접이식"), ("Portable", "휴대용"), ("Compact", "소형"), ("Large", "대형"), ("Spare", "예비"),
              ("Outdoor", "야외용"), ("Studio", "스튜디오"), ("Cordless", "무선"), ("Adjustable", "조절식"), ("Waterproof", "방수")],
        "B": [("Lantern", "랜턴"), ("Tripod", "삼각대"), ("Projector", "프로젝터"), ("Tent", "텐트"), ("Speaker", "스피커"),
              ("Heater", "히터"), ("Cooler", "아이스박스"), ("Drill", "드릴"), ("Ladder", "사다리"), ("Microphone", "마이크")],
        "C": [("Set", "세트"), ("Kit", "키트"), ("Pack", "묶음"), ("Case", "케이스"), ("Bundle", "꾸러미"),
              ("Box", "상자"), ("Bag", "가방"), ("Crate", "운반함"), ("Pair", "한 쌍"), ("Group", "모음")],
        "status": [("Returned", "반납"), ("Inspecting", "점검 중"), ("Cleaning", "세척 중"), ("Damaged", "파손"),
                   ("Late", "연체"), ("Shelved", "보관")],
        "question": {
            "en": "What late fee is recorded for {a}?",
            "ko": "{a}의 연체료는 얼마로 기록되어 있나요?",
        },
    },
}


def draw_values(doctype, rng):
    """Four distinct target values, identical text in both languages except the unit."""
    if doctype == "repair":
        base = datetime.date(2026, 11, 1)
        days = rng.sample(range(0, 120), 4)
        v = [(base + datetime.timedelta(days=d)).isoformat() for d in days]
        return [{"en": x, "ko": x} for x in v]
    if doctype == "greenhouse":
        halves = rng.sample(range(8, 100), 4)
        return [{"en": f"{h / 2:.1f} L", "ko": f"{h / 2:.1f}리터"} for h in halves]
    fees = rng.sample(range(5, 300), 4)
    return [{"en": f"{f * 100:,} KRW", "ko": f"{f * 100:,}원"} for f in fees]


def draw_content(doctype, layout, anchor, seed):
    """Shared (en/ko) record draw, retried deterministically until both language pages are valid."""
    doc = DOCS[doctype]
    rng = random.Random(f"{doctype}|{layout}|{anchor}|{seed}")
    while True:
        bs = rng.sample(range(len(doc["B"])), 4)
        codes = rng.sample(range(1000, 10000), 4)
        values = draw_values(doctype, rng)
        recs = []
        for i in range(4):
            a = rng.randrange(len(doc["A"]))
            c = rng.randrange(len(doc["C"]))
            staff = rng.randrange(len(STAFF))
            status = rng.randrange(len(doc["status"]))
            recs.append({
                "code": f"{doc['prefix']}{codes[i]}",
                "label": {l: " ".join([doc["A"][a][k], doc["B"][bs[i]][k], doc["C"][c][k]]) for k, l in enumerate(LANGS)},
                "value": values[i],
                "staff": {l: STAFF[staff][k] for k, l in enumerate(LANGS)},
                "status": {l: doc["status"][status][k] for k, l in enumerate(LANGS)},
            })
        if all(not problems_of(build_page(doctype, layout, recs, l)[0]) for l in LANGS):
            return recs


def item(iid, role, text, cell, size="body", record=None):
    d = {"id": iid, "role": role}
    if record is not None:
        d["record"] = record
    d["text"] = text
    d["cell"] = list(cell)
    d["size"] = size
    return d


def build_page(doctype, layout, recs, lang):
    """Returns (items, rules, records) for one language, items in reading order."""
    doc = DOCS[doctype]
    items = [item("title", "title", doc["title"][lang], [40, 20, 1240, 80], "title")]
    rules, records = [], []
    if layout == "slip":
        items += [
            item("hdr-label", "header", doc["head_label"][lang], [40, 90, 500, 130]),
            item("hdr-value", "header", doc["head_value"][lang], [540, 90, 800, 130]),
            item("hdr-staff", "header", doc["head_staff"][lang], [820, 90, 1030, 130]),
            item("hdr-status", "header", doc["head_status"][lang], [1040, 90, 1240, 130]),
        ]
        for i in range(5):
            rules.append([40, 140 + 190 * i, 1240, 142 + 190 * i])
        for s in range(4):
            t = 140 + 190 * s
            r = recs[s]
            rules.append([520, t + 8, 522, t + 182])
            items += [
                item(f"r{s}-code", "code", r["code"], [40, t + 14, 500, t + 84], record=s),
                item(f"r{s}-label", "label", r["label"][lang], [40, t + 100, 500, t + 170], record=s),
                item(f"r{s}-value", "value", r["value"][lang], [540, t + 60, 800, t + 130], record=s),
                item(f"r{s}-staff", "other", r["staff"][lang], [820, t + 60, 1030, t + 130], record=s),
                item(f"r{s}-status", "other", r["status"][lang], [1040, t + 60, 1240, t + 130], record=s),
            ]
    else:
        rules += [[638, 100, 640, 880], [40, 490, 620, 492], [660, 490, 1240, 492]]
        for z in range(2):
            zx = 40 if z == 0 else 660
            for b in range(2):
                s = z * 2 + b
                y = 130 if b == 0 else 520
                r = recs[s]
                items += [
                    item(f"r{s}-code", "code", r["code"], [zx, y, zx + 580, y + 60], record=s),
                    item(f"r{s}-label", "label", r["label"][lang], [zx, y + 80, zx + 580, y + 140], record=s),
                    item(f"r{s}-vname", "header", doc["head_value"][lang], [zx, y + 160, zx + 260, y + 220]),
                    item(f"r{s}-value", "value", r["value"][lang], [zx + 270, y + 160, zx + 580, y + 220], record=s),
                    item(f"r{s}-oname", "header", doc["head_staff"][lang], [zx, y + 240, zx + 260, y + 300]),
                    item(f"r{s}-staff", "other", r["staff"][lang], [zx + 270, y + 240, zx + 580, y + 300], record=s),
                ]
    for s in range(4):
        records.append({"slot": s, "codeItem": f"r{s}-code", "labelItem": f"r{s}-label", "valueItem": f"r{s}-value"})
    return items, rules, records


def problems_of(items):
    """Uniqueness rules: unique ids, and every code/label/value text is not a substring of any other item's text."""
    out = []
    ids = [it["id"] for it in items]
    if len(set(ids)) != len(ids):
        out.append("duplicate item id")
    for it in items:
        if it["role"] not in ("code", "label", "value"):
            continue
        for other in items:
            if other is not it and it["text"] in other["text"]:
                out.append(f"{it['id']} text {it['text']!r} is inside {other['id']}")
    return out


def norm(s):
    return " ".join(unicodedata.normalize("NFC", s).split())


def load_seed_map(path):
    if not path:
        return {}
    raw = json.loads(Path(path).read_text(encoding="utf-8"))
    valid = {f"{d}|{l}|{a}|{p}" for d in DOCTYPES for l in LAYOUTS for a in ANCHORS for p in range(4)}
    for k, v in raw.items():
        if k not in valid:
            raise SystemExit(f"seed-map key not in grid: {k}")
        if not isinstance(v, int) or isinstance(v, bool):
            raise SystemExit(f"seed-map value must be an int: {k}")
    return raw


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--seed-map")
    args = ap.parse_args()
    seed_map = load_seed_map(args.seed_map)
    images, questions = [], []
    combo = 0
    for doctype in DOCTYPES:
        for layout in LAYOUTS:
            for anchor in ANCHORS:
                for pos in range(4):
                    seed = seed_map.get(f"{doctype}|{layout}|{anchor}|{pos}", DEFAULT_SEEDS[pos])
                    slot = (pos + combo) % 4
                    recs = draw_content(doctype, layout, anchor, seed)
                    pair = f"{doctype}-{layout}-{anchor}-s{seed}"
                    for lang in LANGS:
                        items, rules, records = build_page(doctype, layout, recs, lang)
                        target = recs[slot]
                        anchor_text = target["code"] if anchor == "code" else target["label"][lang]
                        question = DOCS[doctype]["question"][lang].format(a=anchor_text)
                        iid = f"{pair}-{lang}"
                        images.append({
                            "id": iid, "pairId": pair, "lang": lang, "doctype": doctype, "layout": layout,
                            "anchor": anchor, "seed": seed, "seedPosition": pos, "combo": combo, "slot": slot,
                            "file": f"{iid}.png", "page": dict(PAGE), "question": question,
                            "answer": target["value"][lang], "code": target["code"], "label": target["label"][lang],
                            "anchorItem": f"r{slot}-{'code' if anchor == 'code' else 'label'}",
                            "valueItem": f"r{slot}-value",
                            "goldItems": [f"r{slot}-{'code' if anchor == 'code' else 'label'}", f"r{slot}-value"],
                            "records": records, "items": items, "rules": rules,
                        })
                        questions.append({"id": iid, "file": f"{iid}.png", "question": question})
                combo += 1
    check(images, questions)
    design = {"version": VERSION_DESIGN, "set": "holdout", "font": FONT, "images": images}
    qdoc = {"version": VERSION_QUESTIONS, "questions": questions}
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    for name, obj in (("design.json", design), ("questions.json", qdoc)):
        with open(out / name, "w", encoding="utf-8", newline="\n") as f:
            f.write(json.dumps(obj, ensure_ascii=False, indent=1) + "\n")
    print(json.dumps({"images": len(images), "questions": len(questions)}))
    return 0


def check(images, questions):
    assert len(images) == 96 and len(questions) == 96, "must be 96 pages"
    assert len({i["id"] for i in images}) == 96, "duplicate image id"
    assert len({i["file"] for i in images}) == 96, "duplicate file"
    assert len({norm(q["question"]) for q in questions}) == 96, "duplicate normalized question"
    for im in images:
        by_id = {it["id"]: it for it in im["items"]}
        assert len(by_id) == len(im["items"]), im["id"]
        assert len(im["records"]) == 4, im["id"]
        assert im["slot"] == (im["seedPosition"] + im["combo"]) % 4, im["id"]
        anchor_text = by_id[im["anchorItem"]]["text"]
        assert anchor_text in im["question"], im["id"]
        assert by_id[im["valueItem"]]["text"] == im["answer"], im["id"]
        assert sum(anchor_text in it["text"] for it in im["items"]) == 1, im["id"]
        assert im["goldItems"] == [im["anchorItem"], im["valueItem"]], im["id"]
        vals = [by_id[r["valueItem"]]["text"] for r in im["records"]]
        assert len(set(vals)) == 4, im["id"]
        assert not problems_of(im["items"]), im["id"]
    # different seeds of the same combination must really differ
    seen = {}
    for im in images:
        key = (im["doctype"], im["layout"], im["anchor"], im["lang"])
        sig = tuple(it["text"] for it in im["items"] if it["role"] in ("code", "label", "value"))
        assert sig not in seen.setdefault(key, set()), f"same content for two seeds: {im['id']}"
        seen[key].add(sig)


if __name__ == "__main__":
    sys.exit(main())
