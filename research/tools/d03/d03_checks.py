"""D03 comparison logic for the seven paper items (T1-T3, F1-F4).

The rules are fixed in RULES.ko.md (docs/research/d03-reproduction-rules.md) before any reproduction run.
Only the standard library is needed for T1-T3. The figure checks need numpy and matplotlib (image decoding).
"""
from __future__ import annotations

import json
import re
import unicodedata
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

MINUS = "−"
TOL = 1e-9
RENDER_MAX_FRACTION = 0.005
RENDER_MAX_MEAN = 2 / 255
VERDICTS = ("MATCH", "MATCH-WITHIN-TOLERANCE", "MISMATCH", "NOT-REPRODUCIBLE")


class InvalidJSON(ValueError):
    def __init__(self, path: Path, reason: str):
        super().__init__(reason)
        self.path = path


def read_json(path: Path) -> dict:
    """Retain the input filename when a JSON document cannot be decoded."""
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise InvalidJSON(path, f"invalid JSON at line {exc.lineno}, column {exc.colno}") from exc
    except UnicodeDecodeError as exc:
        raise InvalidJSON(path, f"invalid UTF-8 at byte {exc.start}") from exc
    if not isinstance(value, dict):
        raise InvalidJSON(path, "expected a JSON object")
    return value


# ---------------------------------------------------------------- formatting (JavaScript semantics)

def normalize_t1(text: str) -> str:
    """T1 normalisation: NFC and line endings only. Cell trimming happens in parse_table."""
    return unicodedata.normalize("NFC", text).replace("\r\n", "\n").replace("\r", "\n")


def js_to_fixed(x: float, digits: int) -> str:
    """Number.prototype.toFixed for finite x: exact binary value, ties away from zero, '-' kept for negatives."""
    if x == 0:
        x = 0.0  # (-0).toFixed() has no sign; tiny negatives keep it ("-0.0"), as in JavaScript
    q = Decimal(x).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP)
    return format(q, "f")


def js_math_round(x: float) -> int:
    """Math.round: nearest integer, ties toward +infinity."""
    d = Decimal(x)
    floor = int(d.to_integral_value(rounding="ROUND_FLOOR"))
    return floor + 1 if d - floor >= Decimal("0.5") else floor


def en_us(n: int) -> str:
    return f"{n:,}"


def tok(x: float) -> str:
    return en_us(js_math_round(x))


def typographic(s: str) -> str:
    return s.replace("-", MINUS)


def pct1(x: float) -> str:
    return typographic(js_to_fixed(x * 100, 1))


def signed_pct1(x: float) -> str:
    return ("+" if x >= 0 else "") + pct1(x)


def cmp_sign(a: float, b: float) -> str:
    return "<" if a < b else (">" if a > b else "=")


# ---------------------------------------------------------------- manuscript tables

def parse_row(line: str) -> list[str]:
    return [c.strip() for c in line.strip().strip("|").split("|")]


def table_after(lines: list[str], caption_prefix: str, which: int = 0) -> dict:
    """Return the which-th Markdown table after the caption line starting with caption_prefix."""
    start = next(i for i, line in enumerate(lines) if line.startswith(caption_prefix))
    tables, cur = [], []
    for line in lines[start + 1:]:
        if line.startswith("|"):
            cur.append(line)
        elif cur:
            tables.append(cur)
            cur = []
            if len(tables) > which:
                break
        elif line.startswith("#") or line.startswith("!["):
            break
    if cur:
        tables.append(cur)
    t = tables[which]
    return {"header": parse_row(t[0]), "sep": t[1], "rows": [parse_row(x) for x in t[2:]], "caption": lines[start]}


def md_table(rows: list[list[str]]) -> list[str]:
    return ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * len(rows[0])] + ["| " + " | ".join(r) + " |" for r in rows[1:]]


def file_tables(path: Path) -> list[dict]:
    """Every Markdown table in a generated table file, in order."""
    lines = normalize_t1(path.read_text(encoding="utf-8")).split("\n")
    tables, cur = [], []
    for line in lines + [""]:
        if line.startswith("|"):
            cur.append(line)
        elif cur:
            tables.append({"header": parse_row(cur[0]), "sep": cur[1], "rows": [parse_row(x) for x in cur[2:]]})
            cur = []
    return tables


TABLE_FILES = {"T1": "tables/table1.md", "T2": "tables/table2.md", "T3": "tables/table3.md"}


def write_tables(spec_path: Path, gen: Path) -> dict[str, Path]:
    """Write the regenerated Tables 1-3 (Table 3 with both panels) as readable Markdown under gen/tables."""
    spec = read_json(spec_path)
    (gen / "tables").mkdir(parents=True, exist_ok=True)
    t1 = [spec["header"]] + [r["cells"] for r in spec["rows"]]
    a2 = {m: read_json(gen / f"exp2-heldout/{m}/exp2-analysis.json") for m, _ in MODELS}
    a3 = {m: read_json(gen / f"s3-heldout/{m}/analysis.json") for m, _ in MODELS}
    s3 = {m: read_json(gen / f"s3-heldout/{m}/summary.json") for m, _ in MODELS}
    h3, c3 = build_t3(a3, s3)
    docs = {
        "T1": ["# 표 1 (재생성: expected/table1-spec.json)", "", spec["source"]["caption"], ""] + md_table(t1),
        "T2": ["# 표 2 (재생성: generated/exp2-heldout/*/exp2-analysis.json)", ""] + md_table(build_t2(a2)),
        "T3": ["# 표 3 (재생성: generated/s3-heldout/*/analysis.json, summary.json)", "", "## 가설 판정", ""] + md_table(h3)
              + ["", "## 비용 패널", ""] + md_table(c3),
    }
    out = {}
    for item, lines in docs.items():
        f = gen / TABLE_FILES[item]
        f.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
        out[item] = f
    return out


def manuscript_lines(path: Path) -> list[str]:
    return normalize_t1(path.read_text(encoding="utf-8")).split("\n")


def references(lines: list[str]) -> dict[int, str]:
    out = {}
    for line in lines:
        m = re.match(r"^\[(\d+)\] (.+)$", line)
        if m:
            out[int(m.group(1))] = m.group(2)
    return out


def cell_diff(expected: list[list[str]], actual: list[list[str]]) -> list[dict]:
    diffs = []
    if len(expected) != len(actual):
        diffs.append({"where": "row-count", "expected": len(expected), "actual": len(actual)})
    for r, (er, ar) in enumerate(zip(expected, actual)):
        if len(er) != len(ar):
            diffs.append({"where": f"row{r}-cols", "expected": len(er), "actual": len(ar)})
        for c, (e, a) in enumerate(zip(er, ar)):
            if e != a:
                diffs.append({"where": f"r{r}c{c}", "expected": e, "actual": a})
    return diffs


# ---------------------------------------------------------------- T1

def check_t1(manuscript: Path, spec_path: Path, provenance_table: Path, reference_log: Path, gen: Path) -> dict:
    lines = manuscript_lines(manuscript)
    spec = read_json(spec_path)
    t = table_after(lines, "표 1.")
    gfile = gen / TABLE_FILES["T1"]
    gt = file_tables(gfile)
    checks = {}
    checks["caption"] = t["caption"] == spec["source"]["caption"] and spec["source"]["caption"] in normalize_t1(gfile.read_text(encoding="utf-8"))
    expected = [spec["header"]] + [r["cells"] for r in spec["rows"]]
    generated = [gt[0]["header"]] + gt[0]["rows"] if len(gt) == 1 else []
    checks["fileFromSpec"] = generated == expected
    diffs = cell_diff(generated, [t["header"]] + t["rows"])
    checks["cells"] = not diffs
    checks["columns5"] = bool(generated) and all(len(r) == 5 for r in generated)
    checks["separator"] = t["sep"].strip() == "|---|---|---|---|---|"
    refs = references(lines)
    cite_problems = []
    for row in spec["rows"]:
        found = [int(x) for x in re.findall(r"\[(\d+)\]", row["cells"][0])]
        if found != row["citations"]:
            cite_problems.append({"row": row["cells"][0], "problem": "citation list"})
        for n in row["citations"]:
            key = spec["titleKeys"][str(n)]
            if n not in refs or key not in refs[n]:
                cite_problems.append({"ref": n, "problem": "reference entry missing title key"})
    checks["citations"] = not cite_problems
    log_lines = normalize_t1(reference_log.read_text(encoding="utf-8")).split("\n")
    log_refs: dict[int, str] = {}
    for line in log_lines:  # the last listing in the log is the final list
        m = re.match(r"^\[(\d+)\] (.+)$", line)
        if m:
            log_refs[int(m.group(1))] = m.group(2)
    ref_mismatch = [n for row in spec["rows"] for n in row["citations"] if log_refs.get(n) != refs.get(n)]
    checks["referenceLog"] = not ref_mismatch
    prov = [parse_row(x) for x in normalize_t1(provenance_table.read_text(encoding="utf-8")).split("\n") if x.startswith("|")]
    prov_sep = [x for x in normalize_t1(provenance_table.read_text(encoding="utf-8")).split("\n") if x.startswith("|")][1]
    prov = [prov[0]] + prov[2:]
    checks["provenance"] = prov == expected and prov_sep.strip() == t["sep"].strip()
    ok = all(checks.values())
    return {"item": "T1", "verdict": "MATCH" if ok else "MISMATCH", "file": TABLE_FILES["T1"], "checks": checks, "cellDiffs": diffs,
            "citationProblems": cite_problems, "referenceLogMismatch": ref_mismatch,
            "cells": len(expected) * 5, "citationsChecked": sum(len(r["citations"]) for r in spec["rows"])}


# ---------------------------------------------------------------- T2 / T3

T2_LABELS = ["H1: D−A, 하한 > −5%p이고 D 토큰 < A", "H2: D−C", "H3: C−B"]
T3_LABELS = ["H1: S2−S0 정확도 하한 > −5%p, 토큰 S2 < S0", "H2: S1−S0 늦은 회상 상한 < 0",
             "H3: S3−S1 늦은 회상 하한 > 0", "H4: S2 캐시 절감률 < 정가 절감률(기술 통계)"]
COST_LABELS = {"S0": "S0 전체 유지", "S1": "S1 compact 모사 (기술 통계)", "S2": "S2 원본 보존 발췌", "S3": "S3 발췌+compact (기술 통계)"}
MODELS = [("gpt4o", "GPT-4o"), ("haiku", "Haiku 4.5")]


def exp2_cell(h: dict, tokens: bool) -> str:
    s = f"{signed_pct1(h['diff'])}%p [{pct1(h['lo'])}, {pct1(h['hi'])}]"
    if tokens:
        s += f", {tok(h['tokensD'])} {cmp_sign(h['tokensD'], h['tokensA'])} {tok(h['tokensA'])}"
    return s


def verdict_text(passes: list, holds_word: str = "지지", fails_word: str = "지지 안 됨") -> str:
    if all(p is None for p in passes):
        return "기술 통계"
    if all(p is True for p in passes):
        return holds_word
    if all(p is False for p in passes):
        return fails_word
    return ", ".join(f"{name.split()[0] if name != 'GPT-4o' else name} {holds_word if p else fails_word}"
                     for (_, name), p in zip(MODELS, passes))


MARGIN = -0.05


def derived_pass(key: str, h: dict):
    """Re-derive each verdict from the numbers (rules section 3), independently of the stored flag."""
    if key == "H1" and "tokensD" in h:
        return h["lo"] > MARGIN and h["tokensD"] < h["tokensA"]
    if key == "H1":
        return h["lo"] > MARGIN and h["tokensS2"] < h["tokensS0"]
    if key == "H2":
        return h["hi"] < 0
    if key == "H3":
        return h["lo"] > 0
    if key == "H4":
        return h["cacheSaving"] < h["listSaving"]
    return None


def verdict_flags_agree(rows: list) -> list[dict]:
    """rows: (hypothesis, numbers, stored flag). A stored None means descriptive (no verdict)."""
    bad = []
    for key, h, stored in rows:
        if stored is None:
            continue
        if derived_pass(key, h) != stored:
            bad.append({"hypothesis": key, "stored": stored, "derived": derived_pass(key, h)})
    return bad


def build_t2(analysis: dict[str, dict]) -> list[list[str]]:
    rows = [["가설", "GPT-4o", "Haiku 4.5", "판정"]]
    for label, key in zip(T2_LABELS, ["H1", "H2", "H3"]):
        hs = [analysis[m]["verdicts"][key] for m, _ in MODELS]
        rows.append([label] + [exp2_cell(h, key == "H1") for h in hs] + [verdict_text([h["pass"] for h in hs])])
    return rows


def s3_cell(h: dict, tokens: bool) -> str:
    s = f"{signed_pct1(h['diff'])}%p [{signed_pct1(h['lo'])}, {signed_pct1(h['hi'])}]"
    if tokens:
        s += f", {tok(h['tokensS2'])} {cmp_sign(h['tokensS2'], h['tokensS0'])} {tok(h['tokensS0'])}"
    return s


def build_t3(analysis: dict[str, dict], summary: dict[str, dict]) -> tuple[list[list[str]], list[list[str]]]:
    rows = [["가설", "GPT-4o", "Haiku 4.5", "판정"]]
    for label, key in zip(T3_LABELS[:3], ["H1", "H2", "H3"]):
        hs = [analysis[m]["all"][key] for m, _ in MODELS]
        rows.append([label] + [s3_cell(h, key == "H1") for h in hs] + [verdict_text([h["pass"] for h in hs])])
    h4 = [analysis[m]["H4"] for m, _ in MODELS]
    holds = [h["holds"] for h in h4]
    rows.append([T3_LABELS[3]] + [f"{pct1(h['listSaving'])}% → {pct1(h['cacheSaving'])}%" for h in h4]
                + ["두 공급자 모두 성립" if all(holds) else verdict_text(holds, "성립", "성립 안 함")])
    cost = [["조건", "GPT-4o 정가 / 캐시", "GPT-4o 캐시 S0 대비 절감", "Haiku 정가 / 캐시", "Haiku 캐시 S0 대비 절감"]]
    for c, label in COST_LABELS.items():
        row = [label]
        for m, _ in MODELS:
            t = summary[m]["table"]
            row.append(f"${js_to_fixed(t[c]['meanListCostUsd'], 4)} / ${js_to_fixed(t[c]['meanCacheViewCostUsd'], 4)}")
            if c == "S0":
                row.append("기준")
            else:
                row.append(f"{pct1(1 - t[c]['meanCacheViewCostUsd'] / t['S0']['meanCacheViewCostUsd'])}%")
        cost.append(row)
    return rows, cost


def check_t2(manuscript: Path, gen: Path) -> dict:
    lines = manuscript_lines(manuscript)
    t = table_after(lines, "표 2.")
    analysis = {m: read_json(gen / f"exp2-heldout/{m}/exp2-analysis.json") for m, _ in MODELS}
    built = build_t2(analysis)
    gt = file_tables(gen / TABLE_FILES["T2"])
    generated = [gt[0]["header"]] + gt[0]["rows"] if len(gt) == 1 else []
    file_ok = generated == built
    diffs = cell_diff(generated, [t["header"]] + t["rows"])
    denominators = {m: {"families": analysis[m]["all"]["families"], "requery": analysis[m]["all"]["requery"],
                        "seed": analysis[m]["bootstrap"]["seed"], "B": analysis[m]["bootstrap"]["B"],
                        "margin": analysis[m]["margin"]} for m, _ in MODELS}
    flags = verdict_flags_agree([(k, analysis[m]["verdicts"][k], analysis[m]["verdicts"][k]["pass"]) for m, _ in MODELS for k in ["H1", "H2", "H3"]])
    ok = file_ok and not diffs and not flags and all(d["seed"] == 20261016 and d["B"] == 10000 and d["families"] == 36
                                         and d["requery"]["assigned"] == 144 and d["margin"] == MARGIN for d in denominators.values())
    return {"item": "T2", "verdict": "MATCH" if ok else "MISMATCH", "file": TABLE_FILES["T2"], "fileMatchesAnalysis": file_ok,
            "cells": sum(len(r) for r in generated), "cellDiffs": diffs,
            "verdictFlagDisagreements": flags, "denominators": denominators}


def check_t3(manuscript: Path, gen: Path) -> dict:
    lines = manuscript_lines(manuscript)
    t_h = table_after(lines, "표 3.", 0)
    t_c = table_after(lines, "표 3.", 1)
    analysis = {m: read_json(gen / f"s3-heldout/{m}/analysis.json") for m, _ in MODELS}
    summary = {m: read_json(gen / f"s3-heldout/{m}/summary.json") for m, _ in MODELS}
    built_h, built_c = build_t3(analysis, summary)
    gt = file_tables(gen / TABLE_FILES["T3"])
    gen_h = [gt[0]["header"]] + gt[0]["rows"] if len(gt) == 2 else []
    gen_c = [gt[1]["header"]] + gt[1]["rows"] if len(gt) == 2 else []
    file_ok = gen_h == built_h and gen_c == built_c
    diffs = cell_diff(gen_h, [t_h["header"]] + t_h["rows"]) + [dict(d, table="cost") for d in cell_diff(gen_c, [t_c["header"]] + t_c["rows"])]
    units = {m: {"sessions": analysis[m]["all"]["sessions"], "seed": analysis[m]["bootstrap"]["seed"],
                 "B": analysis[m]["bootstrap"]["B"], "price": summary[m]["config"].get("price"),
                 "cache": summary[m]["config"].get("cache")} for m, _ in MODELS}
    flags = verdict_flags_agree([(k, analysis[m]["all"][k], analysis[m]["all"][k]["pass"]) for m, _ in MODELS for k in ["H1", "H2", "H3"]]
                                + [("H4", analysis[m]["H4"], analysis[m]["H4"]["holds"]) for m, _ in MODELS])
    ok = (file_ok and not diffs and not flags and all(u["seed"] == 20261015 and u["B"] == 10000 and u["sessions"] == 24 for u in units.values())
          and all(analysis[m]["margin"] == MARGIN for m, _ in MODELS))
    return {"item": "T3", "verdict": "MATCH" if ok else "MISMATCH", "file": TABLE_FILES["T3"], "fileMatchesAnalysis": file_ok,
            "cells": sum(len(r) for r in gen_h + gen_c),
            "cellDiffs": diffs, "verdictFlagDisagreements": flags, "units": units}


# ---------------------------------------------------------------- figures

GPT, HAIKU = "#0072b2", "#d55e00"


def boot_ci(values, seed: int, n: int = 10_000):
    import numpy as np

    v = np.asarray(values, dtype=float)
    rng = np.random.default_rng(seed)
    means = v[rng.integers(0, len(v), size=(n, len(v)))].mean(axis=1)
    return float(v.mean()), float(np.percentile(means, 2.5)), float(np.percentile(means, 97.5))


def close(a, b) -> bool:
    return abs(float(a) - float(b)) <= TOL


def match_points(expected: list[tuple], actual: list[tuple]) -> list:
    """Every expected tuple must be matched (within TOL) by a distinct actual tuple; counts must agree."""
    left = list(actual)
    missing = []
    for e in expected:
        hit = next((a for a in left if len(a) == len(e) and all(close(x, y) for x, y in zip(e, a))), None)
        if hit is None:
            missing.append(e)
        else:
            left.remove(hit)
    return missing + ([{"extra": len(left)}] if left else [])


def errorbars(ax: dict) -> list[tuple]:
    """(x, y, lo, hi) for marker error bars."""
    out = []
    for eb in ax["errorbars"]:
        if eb["data"] is None:
            continue
        for (x, y), seg in zip(eb["data"], eb["segments"]):
            out.append((x, y, seg[0][1], seg[1][1]))
    return out


def expected_f1(rows_path: Path) -> dict:
    rows = [json.loads(x) for x in rows_path.read_text(encoding="utf-8").splitlines() if x]
    rows = [r for r in rows if r["format"] == "png" and r["group"].startswith("grid")]
    longs = [256, 512, 768, 1024, 1536, 2048, 3072]
    series = {}
    for key in ["openaiHigh", "anthropic"]:
        for ratio in ["1:1", "4:3", "16:9", "3:1"]:
            pts = {max(r["width"], r["height"]): r[key]["measured"] for r in rows if r["group"] == f"grid {ratio}"}
            series[(key, ratio)] = [pts[L] for L in longs]
    return {"longs": longs, "series": series}


def linear_axes(probe: dict) -> bool:
    return all(ax["xscale"] == "linear" and ax["yscale"] == "linear" for ax in probe["axes"])


F1_STYLE = {"1:1": ("#000000", "o"), "4:3": ("#0072b2", "s"), "16:9": ("#009e73", "^"), "3:1": ("#d55e00", "D")}
F2_MARKER = {"A": "o", "B": "v", "C": "s", "D": "D", "E": "^", "Dp": "P"}
F3_MARKER = {"S0": "o", "S1": "v", "S2": "s", "S3": "D", "S4": "^"}


def point_style_misses(want: list, ax: dict) -> list:
    """want: (x, y, colour, marker) per expected point. Each must sit on a series of that colour and marker."""
    have = [(x, y, eb["color"], eb["marker"]) for eb in ax["errorbars"] if eb["data"] is not None for x, y in eb["data"]]
    return [w for w in want if not any(close(w[0], h[0]) and close(w[1], h[1]) and (w[2], w[3]) == (h[2], h[3]) for h in have)]


def errorbar_styles(ax: dict) -> list:
    return sorted((eb["color"], eb["marker"]) for eb in ax["errorbars"] if eb["data"] is not None)


def check_f1(probe: dict, rows_path: Path) -> dict:
    exp = expected_f1(rows_path)
    axes = probe["axes"]
    problems = []
    if len(axes) != 2:
        problems.append("axes count")
    data = []
    for ax, key, title in zip(axes, ["openaiHigh", "anthropic"], ["GPT-4o (detail high)", "Claude Haiku 4.5"]):
        if ax["title"] != title or ax["xlabel"] != "Long side (px)":
            problems.append(f"labels {key}")
        if ax["xticklabels"] != [str(x) for x in exp["longs"]]:
            problems.append(f"xticks {key}")
        lines = {ln["label"]: ln for ln in ax["lines"] if not ln["label"].startswith("_")}
        if sorted(lines) != sorted(["1:1", "4:3", "16:9", "3:1"]):
            problems.append(f"series {key}")
        for ratio in ["1:1", "4:3", "16:9", "3:1"]:
            ln = lines.get(ratio)
            want = exp["series"][(key, ratio)]
            ok = ln is not None and len(ln["y"]) == 7 and all(close(a, b) for a, b in zip(ln["y"], want)) \
                and all(close(a, b) for a, b in zip(ln["x"], range(7)))
            if ln is not None and (ln["color"], ln["marker"]) != F1_STYLE[ratio]:
                problems.append(f"style {key} {ratio}")
            data.append({"provider": key, "ratio": ratio, "ok": ok})
            if not ok:
                problems.append(f"values {key} {ratio}")
    if axes and axes[0]["ylabel"] != "Billed image tokens":
        problems.append("ylabel")
    caps = [ln for ln in axes[1]["lines"] if ln["label"].startswith("_") and ln["y"] == [1568, 1568]] if len(axes) > 1 else []
    if not caps:
        problems.append("patch cap line")
    if axes and (axes[0]["legend"] or {}).get("title") != "Aspect ratio":
        problems.append("legend title")
    if not linear_axes(probe):
        problems.append("scale")
    return {"values": len(data) * 7, "problems": problems}


F2_ARM_LABELS = {a: "D′" if a == "Dp" else a for a in F2_MARKER}
F2_CAPTION_PAIR = r"\((0|[1-9][0-9]{0,2}(?:,[0-9]{3})*),\s+([0-9]{1,3}\.[0-9])%\)"


def read_f2_caption(manuscript: Path, problems: list) -> dict:
    try:
        captions = [line for line in manuscript_lines(manuscript) if line.lstrip().startswith("그림 2.")]
    except (OSError, UnicodeError) as exc:
        problems.append(f"Figure 2 caption: could not read {manuscript}: {exc}")
        return {}
    if len(captions) != 1:
        problems.append(f"Figure 2 caption: expected one '그림 2.' caption, found {len(captions)}")
        return {}

    # The published caption puts both coordinate lists between these prose phrases.
    intro, start, rest = captions[0].partition("탐색 결과다.")
    section, end, outro = rest.partition("오차 막대는")
    if not (start and end):
        problems.append("Figure 2 caption: could not locate the two coordinate lists")
        return {}
    if re.search(F2_CAPTION_PAIR, intro) or re.search(F2_CAPTION_PAIR, outro):
        problems.append("Figure 2 caption: extra coordinate outside the model lists")

    providers = {name: model for model, name in MODELS}
    model_names = "|".join(map(re.escape, providers))
    blocks = re.split(rf"(?<!\S)({model_names})(?=\s)", section.strip())
    if blocks[0] or blocks[1::2] != list(providers):
        problems.append(f"Figure 2 caption model order: expected {list(providers)}, found {blocks[1::2]}")

    observed = {}
    for name, block in zip(blocks[1::2], blocks[2::2]):
        body = block.strip()
        if not body.endswith("."):
            problems.append(f"Figure 2 caption {name}: expected a period after the coordinates")
        arms = []
        for entry in re.split(r",\s+(?=[A-Z])", body.removesuffix(".")):
            arm, _, pair = entry.strip().partition(" ")
            arms.append(arm)
            match = re.fullmatch(F2_CAPTION_PAIR, pair.strip())
            if not match:
                problems.append(f"Figure 2 caption {name} {arm}: malformed coordinate {entry!r}")
                continue
            key = (providers[name], arm)
            if key in observed:
                problems.append(f"Figure 2 caption {name} {arm}: duplicate coordinate")
                continue
            observed[key] = {"x": int(match[1].replace(",", "")), "y": float(match[2])}
        if arms != list(F2_ARM_LABELS.values()):
            problems.append(f"Figure 2 caption {name} arm order: expected {list(F2_ARM_LABELS.values())}, found {arms}")
    return observed


def compare_f2_caption(manuscript: Path, expected: dict, problems: list) -> dict:
    observed = read_f2_caption(manuscript, problems)
    points = []
    matched = 0
    for model, name in MODELS:
        for arm in F2_ARM_LABELS.values():
            key = (model, arm)
            want, got = expected.get(key), observed.get(key)
            points.append({"model": model, "arm": arm, "expected": want, "observed": got})
            if got is None:
                problems.append(f"Figure 2 caption {name} {arm}: missing coordinate")
            elif want is not None:
                for axis in ("x", "y"):
                    if want[axis] == got[axis]:
                        matched += 1
                    else:
                        problems.append(
                            f"Figure 2 caption {name} {arm} {axis}: expected {want[axis]}, observed {got[axis]}"
                        )
    return {"matchedValues": matched, "totalValues": 2 * len(points), "points": points}


F2_QUESTION_MANIFEST = "research/results/exp2-heldout/families-exp2-heldout.json"


def f2_expected_slots(path: Path) -> set[tuple[str, str, str]]:
    families = read_json(path)["families"]
    questions = {(family["id"], question["id"]) for family in families for question in family["questions"]}
    if len(questions) != 36:
        raise ValueError(f"expected 36 questions in the held-out manifest, found {len(questions)}")
    conditions = ("clean", "combined", "downscale-only", "jpeg-only")
    return {(family, question, condition) for family, question in questions for condition in conditions}


def f2_valid_arm(rows: list[dict], expected_slots: set[tuple[str, str, str]], arm: str,
                 context: str, problems: list) -> bool:
    if len(rows) != len(expected_slots):
        problems.append(f"{context}: expected {len(expected_slots)} started rows, found {len(rows)}")
        return False

    problem_count = len(problems)
    seen = set()
    for row in rows:
        slot = (row.get("family"), row.get("question"), row.get("condition"))
        if any(not isinstance(part, str) for part in slot):
            problems.append(f"{context}: invalid family/question/condition {slot!r}")
            continue
        key = "/".join((*slot, arm))  # Use the raw arm ID (Dp for the display label D-prime).
        if row.get("key") != key:
            problems.append(f"{context}: expected query key {key!r}, found {row.get('key')!r}")
        if slot in seen:
            problems.append(f"{context}: duplicate question condition for query {key!r}")
        if slot not in expected_slots:
            problems.append(f"{context}: unknown family/question/condition for query {key!r}")
        seen.add(slot)
    return len(problems) == problem_count


def check_f2(probe: dict, graded: dict[str, Path], *, manuscript: Path | None = None,
             question_manifest: Path | None = None) -> dict:
    import numpy as np

    problems = []
    try:
        if question_manifest is None:
            tools = Path(__file__).resolve().parent
            root = tools.parent if tools.name == "tools" else tools.parents[2]
            question_manifest = root / F2_QUESTION_MANIFEST
        expected_slots = f2_expected_slots(question_manifest)
    except (KeyError, OSError, TypeError, ValueError) as exc:
        problems.append(f"Figure 2 held-out question manifest: {exc}")
        data = {"values": 0, "problems": problems}
        if manuscript is not None:
            data["caption"] = compare_f2_caption(manuscript, {}, problems)
        return data

    expected = []
    caption_expected = {}
    styled = []
    labels = []
    for m, colour in [("gpt4o", GPT), ("haiku", HAIKU)]:
        try:
            rows = [json.loads(x) for x in graded[m].read_text(encoding="utf-8").splitlines() if x]
        except (KeyError, OSError, ValueError) as exc:
            if manuscript is None:
                raise
            problems.append(f"Figure 2 graded data {m}: could not read rows: {exc}")
            continue
        by_arm = {a: [] for a in F2_ARM_LABELS}
        for row in rows:
            arm = row.get("arm")
            if not isinstance(arm, str) or arm not in by_arm:
                problems.append(f"Figure 2 graded data {m}: unexpected arm {arm!r}")
            elif row.get("outcome") == "not_started":
                problems.append(f"Figure 2 graded data {m} {arm}: unstarted query {row.get('key')!r}")
            else:
                by_arm[arm].append(row)
        for a, label in F2_ARM_LABELS.items():
            arm_rows = by_arm[a]
            context = f"Figure 2 graded data {m} {label}"
            if not f2_valid_arm(arm_rows, expected_slots, a, context, problems):
                continue
            # promptTokens already includes D's re-request. Each graded row is one query.
            tokens = [r["promptTokens"] for r in arm_rows if r.get("promptTokens") is not None]
            if len(tokens) != len(expected_slots):
                problems.append(f"{context}: expected {len(expected_slots)} query token totals, found {len(tokens)}")
                continue
            grouped = {}
            for row in arm_rows:
                grouped.setdefault(row["family"], []).append(row)
            by_family = [grouped[family] for family in sorted(grouped)]
            scores = [float(np.mean([1.0 if r["contentCorrect"] else 0.0 for r in family])) for family in by_family]
            mean, lo, hi = boot_ci(scores, 20261016)
            x = float(np.mean(tokens))
            if manuscript is not None:
                # Each family score is an exact multiple of 1/4. Round the percentage
                # from that exact sum so ties such as 81.25 round to 81.3.
                percent = Decimal(sum(scores)) * 100 / len(scores)
                caption_expected[m, label] = {
                    "x": js_math_round(x),
                    "y": float(percent.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)),
                }
            expected.append((x, mean * 100, lo * 100, hi * 100))
            styled.append((x, mean * 100, colour, F2_MARKER[a]))
            labels.append((label, colour))
    ax = probe["axes"][0]
    missing = match_points(expected, errorbars(ax))
    if missing:
        problems.append({"errorbars": missing[:4]})
    if ax["xlabel"] != "Mean total input tokens per query\n(including re-requests)" or ax["ylabel"] != "Accuracy (%, family mean)":
        problems.append("axis labels")
    if ax["ylim"] != [40.0, 100.0]:
        problems.append("ylim")
    if sorted((t["text"], t["color"]) for t in ax["texts"]) != sorted(labels):
        problems.append("point labels")
    if (ax["legend"] or {}).get("texts") != ["GPT-4o", "Claude Haiku 4.5"]:
        problems.append("legend")
    if errorbar_styles(ax) != sorted((col, F2_MARKER[a]) for col in (GPT, HAIKU) for a in F2_MARKER):
        problems.append("series colour/marker")
    if point_style_misses(styled, ax):
        problems.append("point colour/marker")
    if not linear_axes(probe):
        problems.append("scale")
    data = {"values": len(expected) * 4, "problems": problems}
    if manuscript is not None:
        data["caption"] = compare_f2_caption(manuscript, caption_expected, problems)
    return data


def session_rows(path: Path) -> list[dict]:
    rows = read_json(path).get("rows")
    if not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows):
        raise InvalidJSON(path, "expected rows to be an array of objects")
    return rows


def check_f3(probe: dict, sessions: Path, analysis: dict[str, dict]) -> dict:
    rows = session_rows(sessions)
    problems, expected, labels, styled = [], [], [], []
    for m, colour in [("gpt4o", GPT), ("haiku", HAIKU)]:
        for c in ["S0", "S1", "S2", "S3", "S4"]:
            rs = [r for r in rows if r["provider"] == m and r["condition"] == c]
            mean, lo, hi = boot_ci([r["accuracy"] for r in rs], 20261015)
            a = analysis[m]["all"]
            if len(rs) != 24:
                problems.append(f"session count {m} {c}")
            if not close(mean, a["accuracy"][c]):
                problems.append(f"session mean differs from analysis {m} {c}")
            if not close(sum(r["promptTokens"] for r in rs) / len(rs), a["promptTokens"][c]):
                problems.append(f"session tokens differ from analysis {m} {c}")
            expected.append((a["promptTokens"][c] / 1000, a["accuracy"][c] * 100, lo * 100, hi * 100))
            styled.append((a["promptTokens"][c] / 1000, a["accuracy"][c] * 100, colour, F3_MARKER[c]))
            labels.append((c, colour))
    ax = probe["axes"][0]
    missing = match_points(expected, errorbars(ax))
    if missing:
        problems.append({"errorbars": missing[:4]})
    if ax["xlabel"] != "Mean input tokens per session (×1,000)" or ax["ylabel"] != "Session accuracy (%)":
        problems.append("axis labels")
    if ax["ylim"] != [30.0, 100.0]:
        problems.append("ylim")
    if sorted((t["text"], t["color"]) for t in ax["texts"]) != sorted(labels):
        problems.append("point labels")
    if (ax["legend"] or {}).get("texts") != ["GPT-4o", "Claude Haiku 4.5"]:
        problems.append("legend")
    if errorbar_styles(ax) != sorted((col, F3_MARKER[c]) for col in (GPT, HAIKU) for c in F3_MARKER):
        problems.append("series colour/marker")
    if point_style_misses(styled, ax):
        problems.append("point colour/marker")
    if not linear_axes(probe):
        problems.append("scale")
    return {"values": len(expected) * 4, "problems": problems}


def check_f4(probe: dict, sessions: Path, analysis: dict[str, dict]) -> dict:
    rows = session_rows(sessions)
    problems = []
    ax = probe["axes"][0]
    bars = ax["bars"]
    if len(bars) != 2:
        problems.append("bar groups")
    n = 0
    for i, (m, colour) in enumerate([("gpt4o", GPT), ("haiku", HAIKU)]):
        if i >= len(bars):
            break
        grp = bars[i]
        if grp["label"] != ("GPT-4o" if m == "gpt4o" else "Claude Haiku 4.5") or grp["edgecolor"] != colour:
            problems.append(f"bar style {m}")
        fills = {(p["face"], p["hatch"]) for p in grp["patches"]}
        if fills != ({(GPT, None)} if m == "gpt4o" else {("#ffffff", "////")}):
            problems.append(f"bar fill {m}")
        for j, c in enumerate(["S0", "S1", "S2", "S3", "S4"]):
            rs = [r for r in rows if r["provider"] == m and r["condition"] == c]
            if len(rs) != 24:
                problems.append(f"session count {m} {c}")
            mean, lo, hi = boot_ci([r["lateRecall"] for r in rs], 20261015)
            want_h = analysis[m]["all"]["lateRecall"][c] * 100
            p = grp["patches"][j]
            seg = grp["segments"][j]
            n += 4
            if not (close(p["height"], want_h) and close(mean * 100, want_h) and close(seg[0][1], lo * 100) and close(seg[1][1], hi * 100)):
                problems.append(f"values {m} {c}")
            if not close(p["x"] + p["width"] / 2, j + (i - 0.5) * 0.38):
                problems.append(f"bar position {m} {c}")
    if ax["ylabel"] != "Late-recall accuracy (%)" or ax["ylim"] != [0.0, 105.0]:
        problems.append("axis")
    if ax["xticklabels"] != ["S0", "S1", "S2", "S3", "S4"]:
        problems.append("xticks")
    if not linear_axes(probe):
        problems.append("scale")
    if [lg.get("texts") for lg in probe["figlegends"]] != [["GPT-4o", "Claude Haiku 4.5"]]:
        problems.append("legend")
    return {"values": n, "problems": problems}


def render_compare(generated: Path, baseline: Path, *, f2_tiles: bool = False) -> dict:
    import numpy as np
    from matplotlib import image

    if generated.read_bytes() == baseline.read_bytes():
        return {"bytesEqual": True, "pixelsEqual": True, "shapeEqual": True, "fraction": 0.0, "meanAbs": 0.0, "within": True}
    g, b = image.imread(str(generated)), image.imread(str(baseline))
    if g.shape != b.shape:
        return {"bytesEqual": False, "pixelsEqual": False, "shapeEqual": False, "within": False,
                "shape": [list(g.shape), list(b.shape)]}
    delta = np.abs(g - b)
    different = delta if delta.ndim == 2 else delta.max(axis=-1)
    fraction, mean = float((different > 0).mean()), float(delta.mean(dtype=np.float64))
    result = {"bytesEqual": False, "pixelsEqual": fraction == 0.0, "shapeEqual": True, "fraction": fraction,
              "meanAbs": mean, "within": fraction <= RENDER_MAX_FRACTION and mean <= RENDER_MAX_MEAN}
    if f2_tiles and fraction:
        # imread normalizes PNG samples to [0, 1] and expands palettes/transparency.
        # Count visible changes after compositing on the white manuscript background.
        def visible_levels(pixels):
            if pixels.ndim == 3 and pixels.shape[-1] == 4:
                alpha = pixels[..., 3:4]
                pixels = pixels[..., :3] * alpha + (1 - alpha)
            return np.rint(pixels * 255).astype(np.int16)

        visible_delta = np.abs(visible_levels(g) - visible_levels(b))
        significant = (visible_delta if visible_delta.ndim == 2 else visible_delta.max(axis=-1)) >= 32
        height, width = significant.shape
        tile = 32
        padded = np.pad(significant, ((0, -height % tile), (0, -width % tile)))
        counts = padded.reshape(padded.shape[0] // tile, tile, padded.shape[1] // tile, tile).sum(axis=(1, 3))
        row, col = np.unravel_index(counts.argmax(), counts.shape)
        peak = int(counts[row, col])
        result["worstTile"] = {"x": int(col) * tile, "y": int(row) * tile, "changedPixels": peak}
        result["within"] = result["within"] and peak < 52
    return result


def figure_verdict(item: str, data: dict, render: dict) -> dict:
    if data["problems"] or not render.get("within"):
        v = "MISMATCH"
    elif render["bytesEqual"] or render["pixelsEqual"]:
        v = "MATCH"
    else:
        v = "MATCH-WITHIN-TOLERANCE"
    return {"item": item, "verdict": v, "data": data, "render": render, "visual": "pending-reviewer"}
