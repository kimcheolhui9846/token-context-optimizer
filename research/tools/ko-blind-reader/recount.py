"""ko-blind-reader: independent recount of the score (protocol research/plans/2026-11-25-ko-blind-reader-protocol.md, 6.3).

Written separately from the JS scorer; it reads the same final response and key and compares every cell of the
per-method table with the JS score.json. Python standard library only.

Usage: python recount.py --response <locked.json> --key <key.json> --score <score.json> [--out <recount.json>]
stdout: one JSON line with ok, counts of compared cells and mismatches, and SHA-256 only (never answers or scores).
"""
import argparse
import hashlib
import json
import re
import sys
import unicodedata
from pathlib import Path

METHODS = ("W1", "W4", "W5")
FIELDS = ("assigned", "answered", "both", "columnOnly", "valueOnly", "neither", "unknownAny", "unknownColumn", "unknownValue", "noDisplay", "skipped", "notReached")
WHITE_SPACE = {0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0x85, 0xA0, 0x1680, *range(0x2000, 0x200B), 0x2028, 0x2029, 0x202F, 0x205F, 0x3000}
TIME = [re.compile(r"([0-9]{1,2}):([0-9]{2})"), re.compile(r"([0-9]{1,2})시([0-9]{1,2})분"), re.compile(r"([0-9]{1,2})시")]
NUMBER = {"count": re.compile(r"([0-9]{1,4})명?"), "pages": re.compile(r"([0-9]{1,4})쪽?")}


def normalize_value(qtype, raw):
    if not isinstance(raw, str):
        return None
    s = "".join(ch for ch in unicodedata.normalize("NFKC", raw) if ord(ch) not in WHITE_SPACE)
    if not s:
        return None
    if qtype == "time":
        for i, rx in enumerate(TIME):
            m = rx.fullmatch(s)
            if m:
                h = int(m.group(1))
                mi = int(m.group(2)) if i < 2 else 0
                return f"{h}:{mi:02d}" if h <= 23 and mi <= 59 else None
        return None
    if qtype in NUMBER:
        m = NUMBER[qtype].fullmatch(s)
        if not m:
            return None
        n = int(m.group(1))
        return str(n) if n >= 1 else None
    return None


def score(resp, key):
    methods = {m: {f: 0 for f in FIELDS} for m in METHODS}
    items = []
    for it, k in zip(resp["items"], key["items"]):
        if it["pos"] != k["pos"]:
            raise ValueError("pos")
        c = methods[k["method"]]
        c["assigned"] += 1
        col_ok = val_ok = False
        if not it["reached"]:
            cat = "notReached"
        elif it["skipped"]:
            cat = "skipped"
        elif not k["displayed"]:
            cat = "noDisplay"
        else:
            col_ok = it["column"] in ("L", "R") and it["column"] == k["side"]
            val_ok = (not it["valueUnknown"]) and normalize_value(k["qtype"], it["value"] if it["value"] is not None else "") == k["answer"]
            cat = {(True, True): "both", (True, False): "columnOnly", (False, True): "valueOnly", (False, False): "neither"}[(col_ok, val_ok)]
            c["answered"] += 1
            unk_col = it["column"] == "unknown"
            c["unknownColumn"] += unk_col
            c["unknownValue"] += bool(it["valueUnknown"])
            c["unknownAny"] += unk_col or bool(it["valueUnknown"])
        c[cat] += 1
        items.append({"pos": it["pos"], "method": k["method"], "category": cat, "columnCorrect": col_ok, "valueCorrect": val_ok})
    return {"status": resp["status"], "blindInvalid": resp["adminMaterialSeen"] == "yes", "methods": methods, "items": items}


def compare(mine, js):
    cells = mism = 0
    for m in METHODS:
        for f in FIELDS:
            cells += 1
            mism += mine["methods"][m][f] != js["methods"][m].get(f)
    for a, b in zip(mine["items"], js["items"]):
        for f in ("pos", "method", "category", "columnCorrect", "valueCorrect"):
            cells += 1
            mism += a[f] != b.get(f)
    for f in ("status", "blindInvalid"):
        cells += 1
        mism += mine[f] != js.get(f)
    if len(mine["items"]) != len(js["items"]):
        mism += 1
    return cells, mism


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--response", required=True)
    ap.add_argument("--key", required=True)
    ap.add_argument("--score", required=True)
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    raw = Path(a.response).read_bytes()
    mine = score(json.loads(raw.decode("utf-8")), json.loads(Path(a.key).read_text(encoding="utf-8")))
    js = json.loads(Path(a.score).read_text(encoding="utf-8"))
    cells, mism = compare(mine, js)
    if a.out:
        Path(a.out).write_text(json.dumps({**mine, "responseSha256": hashlib.sha256(raw).hexdigest(), "comparedCells": cells, "mismatches": mism}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"ok": mism == 0, "checks": cells, "failed": mism, "responseSha256": hashlib.sha256(raw).hexdigest()}))
    return 0 if mism == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
