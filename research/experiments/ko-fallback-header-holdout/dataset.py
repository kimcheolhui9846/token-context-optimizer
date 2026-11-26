"""Build the fixed score-side layout and a separate selector question list."""
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import subprocess
import unicodedata

HERE = Path(__file__).resolve().parent
RESEARCH = HERE.parents[1]
BASE = "8200c01fd2bb14e8b2463bd3e4b2a418c6ed0157"
TYPES = ("time", "count", "pages")
SUFFIX = ("시각", "인원", "분량")
END = ("몇 시인가요?", "몇 명인가요?", "몇 쪽인가요?")
PRIOR = {
    "4320271": "research/results/ko-header-column/data/scoring/design.json",
    "6865828": "research/results/ko-row-gate/data/scoring/design.json",
    "d75f545": "research/results/ko-row-height/data/scoring/design.json",
    "b108e2f": "research/results/ko-row-window/data/design.json",
    BASE: "research/results/ko-blind-reader/mock/gen/plan.json",
}


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x", encoding="utf-8", newline="\n") as f:
        json.dump(value, f, ensure_ascii=False, indent=1)
        f.write("\n")


def git(*args):
    return subprocess.check_output(["git", *map(str, args)], cwd=RESEARCH)


def original_layout():
    script = RESEARCH / "tools/ko-blind-reader/generate.py"
    spec = importlib.util.spec_from_file_location("public_page_layout", script)
    library = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(library)
    return library


def normalized(s):
    return "".join(unicodedata.normalize("NFKC", s).split())


def corpus_text(value):
    if isinstance(value, str):
        yield normalized(value)
    elif isinstance(value, dict):
        for child in value.values():
            yield from corpus_text(child)
    elif isinstance(value, list):
        for child in value:
            yield from corpus_text(child)


def value(kind, index, slot, column):
    n = index * 7 + slot * 2 + column
    if kind == "time":
        minutes = 360 + n * 7
        return f"{minutes // 60:02d}:{minutes % 60:02d}"
    return f"{18 + n}{'명' if kind == 'count' else '쪽'}"


def design():
    layout = original_layout()
    entries = json.loads((HERE / "corpus.json").read_text(encoding="utf-8"))
    if len(entries) != 18:
        raise ValueError("expected eighteen source tables")
    previous = set()
    for rev, path in PRIOR.items():
        previous.update(corpus_text(json.loads(git("show", f"{rev}:{path}"))))
    seen, questions, images, roster = set(), [], [], []
    for index, entry in enumerate(entries):
        tier, k = divmod(index, 6)
        kind, suffix = TYPES[tier], SUFFIX[tier]
        labels = entry["rows"]
        names = [normalized(s) for s in labels]
        if len(labels) != 3 or len(set(names)) != 3 or set(names) & (previous | seen):
            raise ValueError(f"reused record in corpus entry {index + 1}")
        seen.update(names)
        headers = [entry[key] for key in ("field", "comp", "absent")]
        if len(set(headers)) != 3 or not all(re.fullmatch(r"[가-힣]{2} " + suffix, s) for s in headers):
            raise ValueError(f"invalid header vocabulary in entry {index + 1}")
        pos = 1 if k % 2 == 0 else 2
        field, comp, missing = headers
        sidecar = k == 2 or (k == (5 if tier == 1 else 4))
        condition = "unique" if k < 4 else ("duplicate" if k == 4 else "missing")
        source = {
            "side": "L" if k % 2 == 0 else "R", "slot": pos, "labels": labels,
            "field": missing if condition == "missing" else field,
            "compField": field if condition == "duplicate" else comp,
            "targetValues": [value(kind, index, j, 0) for j in range(3)],
            "compValues": [value(kind, index, j, 1) for j in range(3)],
            "targetAux": ["현장 확인", "접수 완료", "개별 안내"],
            "compAux": ["사전 등록", "자료 동봉", "방문 예약"],
            "notes": ["현황 점검", "담당 확인", "기록 보관"],
        }
        page = layout.build_page(source, {"title": entry["title"], "labelHeader": "작업 이름"})
        shift = 112 if k in (1, 2, 4, 5) else 0
        for item in page["items"]:
            cell = item["cell"]
            if "record" in item:
                cell[1] += shift
                cell[3] += shift
            if sidecar and item["id"] == "title":
                cell[2] = 500
            if sidecar and item["id"] in ("h-target", "h-comp") and cell[0] == 360:
                cell[2] = 520
        for line in page["rules"]:
            if line[1] > 150:
                line[1] += shift
                line[3] += shift
        if sidecar:
            # This auxiliary record adds a competing number inside the header strip.
            extra = value(kind, index, 3, 0)
            for iid, role, text, rect in [
                ("extra-label", "label", "별관", [530, 60, 615, 100]),
                ("extra-value", "other_record_value", extra, [530, 104, 615, 144]),
            ]:
                page["items"].append({"id": iid, "role": role, "record": 3, "text": text,
                                      "size": "body", "cell": rect})
        if any(not (0 <= cell[0] < cell[2] <= 1280 and 0 <= cell[1] < cell[3] <= 960)
               for cell in (it["cell"] for it in page["items"])):
            raise ValueError("cell outside source page")
        question = f"{labels[pos]}의 {field}은 {END[tier]}"
        # Use the same particle convention as the pinned question parser.
        if not layout.parse_question(question):
            raise ValueError(f"question rejected by fixed parser at entry {index + 1}")
        sid = "q" + hashlib.sha256(("ko-fallback-holdout-v1:" + str(index)).encode()).hexdigest()[:8]
        filename = sid + ".png"
        if normalized(question) in previous:
            raise ValueError("duplicate prior question")
        images.append({"id": sid, "file": filename, **page})
        questions.append({"id": sid, "file": filename, "question": question})
        roster.append({"id": sid, "serial": index + 1, "kind": kind, "condition": condition,
                       "sidecar": sidecar, "targetRow": pos, "targetSide": source["side"],
                       "requestedField": field, "question": question})
    if len({r["id"] for r in roster}) != len(roster):
        raise ValueError("duplicate page identity")
    reg = layout.REG["fixed"]["font"]
    font = {k: reg[k] for k in ("file", "sha256", "weight", "bodySize", "titleSize")}
    return {"version": "ko-fallback-layout-1", "set": "public-holdout", "font": font,
            "images": sorted(images, key=lambda r: r["id"])}, sorted(questions, key=lambda r: r["id"]), roster


def prepare(out):
    spec, questions, roster = design()
    write_json(out / "design.json", spec)
    write_json(out / "selector/questions.json", {"questions": questions})
    write_json(out / "roster.json", roster)
