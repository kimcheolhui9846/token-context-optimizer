#!/usr/bin/env python3
"""ko-anchor-diagnostic 독립 검산기 (표준 라이브러리만).

고정 Git blob 원본에서 결과를 다시 계산해 결과 폴더와 대조한다.
다르면 종료 코드 1. JS 분석기 코드는 읽지 않고 프로토콜 명세만으로 작성했다.
"""
import argparse
import copy
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata

SELECTOR = {"path": "research/src/selector.mjs", "blob": "b3b4965b2d330907c0143fe178013aace1be8372"}

R09_COMMIT = "0fb30531aabaa9f55b8c9fdc34ee9d03042936c1"
FCP_COMMIT = "708d9946ae091180a1b716baadfdd73fcfe5a19b"

PINS = {
    "r09": {
        "commit": R09_COMMIT,
        "files": {
            "questions": ("research/results/r09-bilingual/heldout/questions.json", "605ff760cc1c12de0a0d21076ac0b8eecb79032a"),
            "ocr": ("research/results/r09-bilingual/heldout/run-a/raw.jsonl", "876cdbb90aab9f0bf8ac3f3e9a520ed72e7b3318"),
            "design": ("research/results/r09-bilingual/heldout/design.json", "dc3307818cba423b3fc2eade8ed7f2116593f788"),
        },
    },
    "fcp": {
        "commit": FCP_COMMIT,
        "files": {
            "questions": ("research/results/fresh-crop-padding/frozen/selector-input/questions.json", "ae578b7267ff124ecf4a0a5157f7067925b177ca"),
            "ocr": ("research/results/fresh-crop-padding/run-a/caller.jsonl", "d657d59d7124f68743a1e54a7eb7c62f521dbc21"),
            "design": ("research/results/fresh-crop-padding/frozen/oracle/design.json", "3149501a51bebbc79d77b7021a61241d32950ba5"),
        },
    },
}
DATASETS = ["r09", "fcp"]
CATEGORIES = ["inside", "outside_only", "absent", "no_question_signal", "not_applicable", "technical_error"]
LANG_ANCHORS = ["en/code", "en/nl", "ko/code", "ko/nl"]

# 한글 음절 [가-힣] = U+AC00..U+D7A3 (리터럴 대신 chr로 만들어 이스케이프 변형을 피한다)
_SYL = "[" + chr(0xAC00) + "-" + chr(0xD7A3) + "]"
SYLLABLE_RUN = re.compile(_SYL + "+")
SYLLABLE_ANY = re.compile(_SYL)
_ANY_RANGES = [(0x1100, 0x11FF), (0x3130, 0x318F), (0xA960, 0xA97F), (0xAC00, 0xD7A3), (0xD7B0, 0xD7FF)]
ANY_HANGUL = re.compile("[" + "".join(chr(a) + "-" + chr(b) for a, b in _ANY_RANGES) + "]")
WS = re.compile(r"\s+")


# ---------------------------------------------------------------- 표현

def bigrams(s):
    """NFC -> 한글 음절 구간마다 겹치는 인접 두 음절 -> 정렬 목록."""
    s = unicodedata.normalize("NFC", s)
    out = set()
    for m in SYLLABLE_RUN.finditer(s):
        run = m.group(0)
        for i in range(len(run) - 1):
            out.add(run[i:i + 2])
    return sorted(out)


# ---------------------------------------------------------------- 원본 읽기/검증

def blob_id(data):
    return hashlib.sha1(b"blob %d\0" % len(data) + data).hexdigest()


def git(repo, *args):
    return subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True).stdout


def read_pinned(repo, commit, path, blob):
    """(bytes, errors). blob 바이트, 커밋 경로 대응, 바이트 해시를 모두 확인."""
    errs = []
    data = b""
    try:
        data = git(repo, "cat-file", "blob", blob)
    except subprocess.CalledProcessError as e:
        return b"", ["cat-file 실패 %s: %s" % (blob, e.stderr.decode("utf-8", "replace").strip())]
    try:
        rp = git(repo, "rev-parse", "%s:%s" % (commit, path)).decode().strip()
        if rp != blob:
            errs.append("rev-parse %s:%s = %s != %s" % (commit[:7], path, rp, blob))
    except subprocess.CalledProcessError as e:
        errs.append("rev-parse 실패 %s:%s: %s" % (commit[:7], path, e.stderr.decode("utf-8", "replace").strip()))
    if blob_id(data) != blob:
        errs.append("바이트의 blob id %s != %s" % (blob_id(data), blob))
    return data, errs


def parse_dataset(raw):
    """raw: {'questions','ocr','design'} 바이트 -> 파싱본."""
    q = json.loads(raw["questions"].decode("utf-8"))["questions"]
    ocr = [json.loads(l) for l in raw["ocr"].decode("utf-8").split("\n") if l.strip()]
    design = json.loads(raw["design"].decode("utf-8"))
    return {"questions": q, "ocr": ocr, "design": design}


def load_datasets(repo):
    """원본 blob을 읽어 (raw, parsed, sources, errors) 반환."""
    raws, parsed, sources, errors = {}, {}, {}, []
    for name in DATASETS:
        pin = PINS[name]
        raw, files = {}, {}
        for kind, (path, blob) in pin["files"].items():
            data, errs = read_pinned(repo, pin["commit"], path, blob)
            errors += ["%s.%s: %s" % (name, kind, e) for e in errs]
            raw[kind] = data
            files[kind] = {"path": path, "blob": blob, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)}
        raws[name] = raw
        sources[name] = {"commit": pin["commit"], "files": files}
        try:
            parsed[name] = parse_dataset(raw)
        except Exception as e:  # noqa: BLE001
            errors.append("%s 파싱 실패: %s" % (name, e))
    return raws, parsed, {"selector": SELECTOR, "datasets": sources}, errors


def is_int(v):
    return isinstance(v, int) and not isinstance(v, bool)


def validate_dataset(name, ds):
    """원본 검증(§4.1). 어긋난 사실의 목록을 반환(빈 목록이면 통과)."""
    errs = []
    qs, ocr, design = ds["questions"], ds["ocr"], ds["design"]
    images, pairs = design.get("images", []), design.get("pairs", [])
    if len(qs) != 48:
        errs.append("%s: 질문 %d != 48" % (name, len(qs)))
    if len(ocr) != 48:
        errs.append("%s: OCR 행 %d != 48" % (name, len(ocr)))
    if len(images) != 48:
        errs.append("%s: 설계 이미지 %d != 48" % (name, len(images)))
    if len(pairs) != 24:
        errs.append("%s: pairs %d != 24" % (name, len(pairs)))
    qids = [q.get("id") for q in qs]
    oids = [r.get("id") for r in ocr]
    iids = [i.get("id") for i in images]
    for label, ids in (("질문", qids), ("OCR", oids), ("설계", iids)):
        if len(set(ids)) != len(ids):
            errs.append("%s: %s ID 중복" % (name, label))
    if qids != oids:
        errs.append("%s: OCR 행 ID 순서 != 질문 ID 순서" % name)
    if set(qids) != set(iids):
        errs.append("%s: 질문 ID 집합 != 설계 ID 집합" % name)
    img = {i.get("id"): i for i in images}
    # 쌍
    by_pair = {}
    for i in images:
        by_pair.setdefault(i.get("pairId"), []).append(i.get("lang"))
    for pid, langs in by_pair.items():
        if sorted(langs) != ["en", "ko"]:
            errs.append("%s: pair %s 언어 구성 %s" % (name, pid, sorted(map(str, langs))))
    cells = {}
    for i in images:
        cells[(i.get("lang"), i.get("anchor"))] = cells.get((i.get("lang"), i.get("anchor")), 0) + 1
    for la in LANG_ANCHORS:
        l, a = la.split("/")
        if cells.get((l, a), 0) != 12:
            errs.append("%s: (%s,%s) %d장 != 12" % (name, l, a, cells.get((l, a), 0)))
    if len(cells) != 4:
        errs.append("%s: (lang,anchor) 칸 %d != 4" % (name, len(cells)))
    qmap = {q.get("id"): q.get("question") for q in qs}
    for r in ocr:
        rid = r.get("id")
        im = img.get(rid)
        if im is None:
            continue
        if qmap.get(rid) != im.get("question"):
            errs.append("%s/%s: 질문 문자열 != 설계 question" % (name, rid))
        pg = im.get("page", {})
        if r.get("width") != pg.get("width") or r.get("height") != pg.get("height"):
            errs.append("%s/%s: OCR 치수 %sx%s != 설계 %sx%s" % (name, rid, r.get("width"), r.get("height"), pg.get("width"), pg.get("height")))
        targets = [t for t in im.get("items", []) if t.get("id") == im.get("anchorItem")]
        if len(targets) != 1:
            errs.append("%s/%s: 앵커 항목 %d개" % (name, rid, len(targets)))
            continue
        t = targets[0]
        c = t.get("cell")
        W, H = pg.get("width"), pg.get("height")
        ok = isinstance(c, list) and len(c) == 4 and all(is_int(v) for v in c)
        if ok:
            l, tp, rr, b = c
            ok = isinstance(W, (int, float)) and isinstance(H, (int, float)) and 0 <= l < rr <= W and 0 <= tp < b <= H
        if not ok:
            errs.append("%s/%s: 대상 cell 비정상 %r" % (name, rid, c))
        if im.get("lang") == "ko" and im.get("anchor") == "nl" and t.get("role") != "label":
            errs.append("%s/%s: KO/nl 대상 role %r != label" % (name, rid, t.get("role")))
        if r.get("status") == "ok":
            lines = r.get("ocrLines")
            if not isinstance(lines, list):
                errs.append("%s/%s: ocrLines 배열 없음" % (name, rid))
            else:
                for ln in lines:
                    for w in ln.get("words", []):
                        bx = w.get("box")
                        if not isinstance(w.get("text"), str) or not (isinstance(bx, list) and len(bx) == 4 and all(
                                isinstance(v, (int, float)) and not isinstance(v, bool) and v == v and abs(v) != float("inf") for v in bx)):
                            errs.append("%s/%s: 단어 text/box 비정상" % (name, rid))
    return errs


# ---------------------------------------------------------------- 재계산

def js_num(v):
    """JS JSON.stringify의 숫자 표기에 맞춤(정수값 float -> 정수)."""
    if isinstance(v, float) and v.is_integer():
        return int(v)
    return v


def js_dumps(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def input_sha256(name, rid, question, width, height, status, ocr_lines):
    lines = None
    if status == "ok":
        lines = [{"text": ln["text"], "words": [{"text": w["text"], "box": [js_num(x) for x in w["box"]]} for w in ln["words"]]}
                 for ln in ocr_lines]
    proj = {"dataset": name, "id": rid, "question": question, "width": width, "height": height, "status": status, "ocrLines": lines}
    return hashlib.sha256(js_dumps(proj).encode("utf-8")).hexdigest()


def collect_row(name, rid, question, width, height, status, ocr_lines):
    q = bigrams(question)
    row = {"dataset": name, "id": rid, "status": status, "Q": q,
           "inputSha256": input_sha256(name, rid, question, width, height, status, ocr_lines)}
    if status != "ok":
        row.update({"wordCount": None, "syllableWords": None, "anyHangulWords": None, "signalWords": None})
        return row
    wc = sy = anyh = 0
    sig = []
    for li, ln in enumerate(ocr_lines):
        for wi, w in enumerate(ln["words"]):
            wc += 1
            t = unicodedata.normalize("NFC", w["text"])
            if SYLLABLE_ANY.search(t):
                sy += 1
            if ANY_HANGUL.search(t):
                anyh += 1
            o = bigrams(t)
            if o:
                x, y, bw, bh = w["box"]
                sig.append({"line": li, "word": wi, "O": o, "box": w["box"], "center": [x + bw / 2, y + bh / 2]})
    row.update({"wordCount": wc, "syllableWords": sy, "anyHangulWords": anyh, "signalWords": sig})
    return row


def classify(status, T, S, signal_words, cell):
    """-> (category, inside, outside, alsoOutside). 반개방 사각형."""
    if status != "ok":
        return "technical_error", 0, 0, None
    if not T:
        return "not_applicable", 0, 0, None
    if not S:
        return "no_question_signal", 0, 0, None
    sset = set(S)
    l, t, r, b = cell
    inside = outside = 0
    for sw in signal_words:
        if sset & set(sw["O"]):
            cx, cy = sw["center"]
            if l <= cx < r and t <= cy < b:
                inside += 1
            else:
                outside += 1
    if inside + outside == 0:
        return "absent", 0, 0, None
    if inside == 0:
        return "outside_only", 0, outside, None
    return "inside", inside, outside, outside > 0


def fake_ocr_lines(items):
    """원문 대조용 가짜 OCR: 텍스트 항목마다 한 줄, 공백 분리 단어를 항목 셀 box에 둠."""
    lines = []
    for it in items:
        tx = it.get("text")
        if isinstance(tx, str) and tx != "":
            l, t, r, b = it["cell"]
            words = [{"text": w, "box": [l, t, r - l, b - t]} for w in WS.split(tx) if w != ""]
            lines.append({"text": tx, "words": words})
    return lines


def score_row(name, rid, im, question, status, crow, replay_row):
    """crow: 해당 행의 collect 재계산 결과. im: 설계 이미지. replay_row: 재계산 기대 replay 행."""
    target = [t for t in im["items"] if t["id"] == im["anchorItem"]][0]
    Q = crow["Q"]
    T = bigrams(target["text"])
    tset = set(T)
    S = [x for x in Q if x in tset]
    generic = [x for x in Q if x not in tset]
    cell = target["cell"]
    row = {"dataset": name, "id": rid, "targetItem": target["id"], "targetRole": target["role"], "cell": cell, "Q": Q, "T": T, "S": S,
           "baselineKeyCount": len(replay_row["keys"]) if replay_row.get("keys") is not None else None,
           "baselineMatched": replay_row.get("matched")}
    cat, ins, outs, also = classify(status, T, S, crow["signalWords"] or [], cell)
    union = set()
    for sw in (crow["signalWords"] or []):
        union.update(sw["O"])
    row.update({"category": cat, "insideWords": ins, "outsideWords": outs, "alsoOutside": also,
                "genericOverlap": [g for g in generic if g in union]})
    # 원문 대조
    items = im["items"]
    fl = fake_ocr_lines(items)
    fcrow = collect_row(name, rid, question, 0, 0, "ok", fl)
    ccat = classify("ok", T, S, fcrow["signalWords"], cell)[0] if status == "ok" else "technical_error"
    gset = set(generic)
    other_t = other_g = ncells = 0
    for it in items:
        tx = it.get("text")
        if isinstance(tx, str) and tx != "":
            ncells += 1
            if it["id"] != target["id"]:
                o = set(bigrams(tx))
                if o & set(S):
                    other_t += 1
                if o & gset:
                    other_g += 1
    row["control"] = {"category": ccat, "otherCellsWithTargetSignal": other_t, "otherCellsWithGeneric": other_g, "textCells": ncells}
    return row


def expected_replay_row(name, ocr_row):
    rid, status = ocr_row["id"], ocr_row.get("status")
    if status != "ok":
        return {"dataset": name, "id": rid, "status": status, "kind": "technical_error", "ok": None, "stored": {"error": ocr_row.get("error")}}
    matched = ocr_row.get("matched")
    return {"dataset": name, "id": rid, "status": "ok", "kind": "matched" if matched else "unmatched", "ok": True, "mismatches": [],
            "keys": ocr_row.get("keys"), "matched": matched, "axisRow": ocr_row.get("axisRow"), "band": ocr_row.get("band")}


def recompute(parsed):
    """파싱된 원본 -> {'replay':[], 'collect':[], 'score':[]} 기대 행."""
    replay, collect, score = [], [], []
    for name in DATASETS:
        ds = parsed[name]
        qmap = {q["id"]: q["question"] for q in ds["questions"]}
        img = {i["id"]: i for i in ds["design"]["images"]}
        for r in ds["ocr"]:
            rep = expected_replay_row(name, r)
            c = collect_row(name, r["id"], qmap[r["id"]], r.get("width"), r.get("height"), r.get("status"), r.get("ocrLines"))
            replay.append(rep)
            collect.append(c)
        for r, rep, c in zip(ds["ocr"], replay[-48:], collect[-48:]):
            im = img[r["id"]]
            if im["lang"] == "ko" and im["anchor"] == "nl":
                score.append(score_row(name, r["id"], im, qmap[r["id"]], r.get("status"), c, rep))
    return {"replay": replay, "collect": collect, "score": score}


def _add(a, b):
    if isinstance(a, dict):
        return {k: _add(a[k], b[k]) for k in a}
    return a + b


def summarize(parsed, replay_rows, collect_rows, score_rows):
    """결과 파일 행(또는 기대 행)에서 요약을 만든다."""
    out = {}
    for name in DATASETS:
        img = {i["id"]: i for i in parsed[name]["design"]["images"]}
        rr = [r for r in replay_rows if r["dataset"] == name]
        cr = [r for r in collect_rows if r["dataset"] == name]
        sr = [r for r in score_rows if r["dataset"] == name]
        kinds = lambda rows, k: sum(1 for r in rows if r["kind"] == k)  # noqa: E731
        by = {}
        for la in sorted(LANG_ANCHORS):
            rows = [r for r in rr if "%s/%s" % (img[r["id"]]["lang"], img[r["id"]]["anchor"]) == la]
            by[la] = {"total": len(rows), "matched": kinds(rows, "matched"), "unmatched": kinds(rows, "unmatched"),
                      "technicalError": kinds(rows, "technical_error"), "replayError": kinds(rows, "replay_error")}
        replay = {"denominator": len(rr), "agree": sum(1 for r in rr if r.get("ok") is True), "disagree": sum(1 for r in rr if r.get("ok") is False),
                  "matched": kinds(rr, "matched"), "unmatched": kinds(rr, "unmatched"), "technicalError": kinds(rr, "technical_error"),
                  "replayError": kinds(rr, "replay_error"), "byLangAnchor": by}
        ko_nl = [r for r in cr if "%s/%s" % (img[r["id"]]["lang"], img[r["id"]]["anchor"]) == "ko/nl"]
        coll = {"rows": len(cr), "okRows": sum(1 for r in cr if r["status"] == "ok"),
                "ocrWords": sum(r["wordCount"] or 0 for r in cr), "wordsWithHangulSyllable": sum(r["syllableWords"] or 0 for r in cr),
                "wordsWithAnyHangul": sum(r["anyHangulWords"] or 0 for r in cr),
                "wordsWithBigram": sum(len(r["signalWords"] or []) for r in cr),
                "koNlRows": len(ko_nl), "koNlRowsWithNonEmptyQ": sum(1 for r in ko_nl if r["Q"])}
        cats = {c: sum(1 for r in sr if r["category"] == c) for c in CATEGORIES}
        diag = {"denominator": len(sr), "applicable": sum(1 for r in sr if r["category"] not in ("not_applicable", "technical_error")),
                "categories": cats, "insideAlsoOutside": sum(1 for r in sr if r["alsoOutside"] is True),
                "rowsWithGenericOverlap": sum(1 for r in sr if r["genericOverlap"]),
                "baselineKeysEmpty": sum(1 for r in sr if r["baselineKeyCount"] == 0),
                "baselineMatched": sum(1 for r in sr if r["baselineMatched"] is True),
                "control": {"inside": sum(1 for r in sr if r["control"]["category"] == "inside"),
                            "rowsWithOtherCellTargetSignal": sum(1 for r in sr if r["control"]["otherCellsWithTargetSignal"] > 0),
                            "rowsWithOtherCellGeneric": sum(1 for r in sr if r["control"]["otherCellsWithGeneric"] > 0)}}
        out[name] = {"replay": replay, "collection": coll, "diagnostic": diag}
    out["total"] = _add(out["r09"], out["fcp"])
    return out


# ---------------------------------------------------------------- 결과 폴더 읽기와 비교

def read_jsonl_bytes(b):
    return [json.loads(l) for l in b.decode("utf-8").split("\n") if l.strip()]


def load_results(results_dir):
    res, errs = {}, []
    for fn in ("sources.json", "pinned.json", "summary.json"):
        try:
            with open(os.path.join(results_dir, fn), "rb") as f:
                b = f.read()
            res[fn] = {"bytes": b, "json": json.loads(b.decode("utf-8"))}
        except Exception as e:  # noqa: BLE001
            errs.append("%s 읽기 실패: %s" % (fn, e))
    for fn in ("replay.jsonl", "collect.jsonl", "score.jsonl"):
        try:
            with open(os.path.join(results_dir, fn), "rb") as f:
                b = f.read()
            res[fn] = {"bytes": b, "json": read_jsonl_bytes(b)}
        except Exception as e:  # noqa: BLE001
            errs.append("%s 읽기 실패: %s" % (fn, e))
    if os.path.exists(os.path.join(results_dir, "stop.json")):
        errs.append("stop.json 존재(비정상 중단 표지)")
    return res, errs


def diff_rows(label, expected, actual, limit=5):
    """행 목록 비교. 다른 행 수와 앞쪽 몇 개의 차이를 반환."""
    diffs = []
    if len(expected) != len(actual):
        diffs.append("%s: 행 수 기대 %d != 실제 %d" % (label, len(expected), len(actual)))
    for i, (e, a) in enumerate(zip(expected, actual)):
        if e != a:
            keys = sorted(k for k in set(e) | set(a) if e.get(k, "<없음>") != a.get(k, "<없음>"))
            diffs.append("%s[%d] %s/%s 필드 불일치: %s" % (label, i, e.get("dataset"), e.get("id"), ",".join(keys)))
    return diffs


def compare(parsed, raws, sources, exp, res):
    """모든 비교. (diffs, notation_diffs) 반환."""
    diffs, notation = [], []
    if res["sources.json"]["json"] != sources:
        diffs.append("sources.json 불일치")
    for fn in ("replay.jsonl", "collect.jsonl"):
        want = hashlib.sha256(res[fn]["bytes"]).hexdigest()
        got = res["pinned.json"]["json"].get(fn)
        if got != want:
            diffs.append("pinned.json[%s] %s != 실제 파일 해시 %s" % (fn, got, want))
    # replay: 기대와 파일 행 대조(필드, 순서 포함)
    diffs += diff_rows("replay", exp["replay"], res["replay.jsonl"]["json"])
    # collect: inputSha256은 표기 차이 가능성 때문에 분리
    ec, ac = exp["collect"], res["collect.jsonl"]["json"]
    ec_nohash = [{k: v for k, v in r.items() if k != "inputSha256"} for r in ec]
    ac_nohash = [{k: v for k, v in r.items() if k != "inputSha256"} if isinstance(r, dict) else r for r in ac]
    diffs += diff_rows("collect", ec_nohash, ac_nohash)
    for i, (e, a) in enumerate(zip(ec, ac)):
        if e["inputSha256"] != a.get("inputSha256"):
            notation.append("collect[%d] %s/%s inputSha256 불일치" % (i, e["dataset"], e["id"]))
    diffs += diff_rows("score", exp["score"], res["score.jsonl"]["json"])
    want_sum = summarize(parsed, res["replay.jsonl"]["json"], res["collect.jsonl"]["json"], res["score.jsonl"]["json"])
    exp_sum = summarize(parsed, exp["replay"], exp["collect"], exp["score"])
    if res["summary.json"]["json"] != exp_sum:
        for k in ("r09", "fcp", "total"):
            if res["summary.json"]["json"].get(k) != exp_sum[k]:
                diffs.append("summary.json[%s] 불일치" % k)
        if set(res["summary.json"]["json"]) != set(exp_sum):
            diffs.append("summary.json 키 집합 불일치")
    if want_sum != exp_sum:
        diffs.append("결과 파일 행에서 만든 집계 != 재계산 집계")
    return diffs, notation


def run(results_dir, repo):
    report = {"ok": False, "sourceErrors": [], "diffs": [], "inputSha256Diffs": [], "resultErrors": []}
    raws, parsed, sources, errs = load_datasets(repo)
    report["sourceErrors"] = errs
    if not errs and all(n in parsed for n in DATASETS):
        for n in DATASETS:
            report["sourceErrors"] += validate_dataset(n, parsed[n])
    res, rerrs = load_results(results_dir)
    report["resultErrors"] = rerrs
    if report["sourceErrors"] or any(f not in res for f in ("sources.json", "pinned.json", "summary.json", "replay.jsonl", "collect.jsonl", "score.jsonl")):
        return report
    exp = recompute(parsed)
    report["diffs"], report["inputSha256Diffs"] = compare(parsed, raws, sources, exp, res)
    report["counts"] = {"replay": len(exp["replay"]), "collect": len(exp["collect"]), "score": len(exp["score"])}
    report["ok"] = not (report["diffs"] or report["inputSha256Diffs"] or report["resultErrors"])
    return report


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--results", required=True)
    ap.add_argument("--repo", default=os.getcwd())
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    rep = run(a.results, a.repo)
    line = json.dumps(rep, ensure_ascii=False, separators=(",", ":"))
    print(line)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as f:
            f.write(json.dumps(rep, ensure_ascii=False, indent=1) + "\n")
    return 0 if rep["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
