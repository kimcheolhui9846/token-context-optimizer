"""Convert the D01 manuscript (Markdown) into typesetting blocks for the IEIE template.

Usage:
  python md_to_blocks.py <manuscript.md> <captions_en.json> <out_blocks.json> <out_log.json> [edits.json]

edits.json (optional, typesetting-only length edits; each is logged before/after):
  [{"id": "E1", "step": 1|2|3, "line": <1-based manuscript line>, "old": "...", "new": "..."},
   {"id": "E5", "step": 3, "delete_lines": [a, b]}]

The manuscript is read as raw bytes (UTF-8, LF). Nothing in the manuscript is changed.
Rules (see research/plans/2026-10-21-typesetting-round1.md section 1 and the D02 report):
  R-S  remove internal source memos "[출처: ...]" and "[Sources: ...]"
  R-L  repository links "[text](path)" -> "text" + supplementary citation [S]
  R-R  renumber citations by first appearance in reading order ([S] included)
  R-H  "## I. ..." -> chapter "Ⅰ. ...", "### 6.1 ..." -> section "1. ..."
  R-K  keywords: each keyword's first letter upper case; Korean 주제어 line dropped
  R-B  bold markers removed (text kept)
  R-C  captions: Korean caption from the manuscript, English line from captions_en.json
  R-M  the trailing "남은 작업:" work memo paragraph is dropped (logged)
  W-3  `identifiers` become code runs, W-4 body citations become superscript runs
"""
import hashlib
import json
import re
import sys

ROMAN = {"I": "Ⅰ", "II": "Ⅱ", "III": "Ⅲ", "IV": "Ⅳ", "V": "Ⅴ", "VI": "Ⅵ", "VII": "Ⅶ", "VIII": "Ⅷ"}
SRC_MEMO = re.compile(r"\s*\[(?:출처|Sources):(?:[^\[\]]|\[[^\]]*\])*\]")  # one nesting level, e.g. `turns[].summary`
LINK = re.compile(r"\[([^\]]+)\]\((?:\.{1,2}/)[^)]+\)")
IMG = re.compile(r"^!\[[^\]]*\]\(([^)]+)\)$")
# one citation group: [n] or [S], joined by "–" or ", "
CITE_ONE = r"\[(?:\d+|S)\]"
CITE_GROUP = re.compile(CITE_ONE + r"(?:(?:–|, )" + CITE_ONE + r")*")


def strip_memos(text, log):
    n = len(SRC_MEMO.findall(text))
    log["source_memos_removed"] += n
    return SRC_MEMO.sub("", text)


def convert_links(text, log):
    def rep(m):
        log["repo_links"].append(m.group(0))
        return m.group(1) + " [S]"
    return LINK.sub(rep, text)


def group_ids(group):
    """Expand a citation group into an ordered id list (ranges expanded)."""
    toks = re.findall(r"\[(\d+|S)\]|(–)|(, )", group)
    ids, prev, rng = [], None, False
    for num, dash, _comma in toks:
        if dash:
            rng = True
            continue
        if num:
            if rng and prev is not None and num != "S" and prev != "S":
                ids.extend(str(k) for k in range(int(prev) + 1, int(num) + 1))
            else:
                ids.append(num)
            prev, rng = num, False
    return ids


def format_group(new_ids):
    """Format renumbered ids: consecutive runs of 3+ become a–b, else comma list."""
    nums = sorted(set(new_ids))
    out, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1:
            j += 1
        if j - i >= 2:
            out.append("[%d]–[%d]" % (nums[i], nums[j]))
        else:
            out.extend("[%d]" % n for n in nums[i:j + 1])
        i = j + 1
    return ", ".join(out)


def runs_from(text, cite_mode):
    """Split text into runs: code (`x`), cite groups (sup or plain), bold removed."""
    text = text.replace("**", "")
    runs = []
    pos = 0
    pat = re.compile(r"`([^`]+)`|(" + CITE_GROUP.pattern + ")")
    for m in pat.finditer(text):
        if m.start() > pos:
            runs.append({"k": "t", "t": text[pos:m.start()]})
        if m.group(1) is not None:
            runs.append({"k": "code", "t": m.group(1)})
        else:
            runs.append({"k": "cite", "ids": group_ids(m.group(2)), "sup": cite_mode == "sup"})
        pos = m.end()
    if pos < len(text):
        runs.append({"k": "t", "t": text[pos:]})
    if cite_mode == "sup":
        # superscript citations attach to the preceding word: drop one space before
        for i, r in enumerate(runs):
            if r["k"] == "cite" and i > 0 and runs[i - 1]["k"] == "t" and runs[i - 1]["t"].endswith(" "):
                runs[i - 1]["t"] = runs[i - 1]["t"][:-1]
    return runs


def table_rows(lines):
    rows = []
    for ln in lines:
        cells = [c.strip() for c in ln.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-+:?", c) for c in cells):
            continue
        rows.append(cells)
    return rows


def caption_ko(text):
    """Caption body without the "그림 n. " / "표 n. " label (the template adds the label)."""
    text = re.sub(r"^(?:그림|표) \d+\. ", "", text.strip())
    if text.endswith("."):
        text = text[:-1]
    return text


def main():
    md_path, cap_path, out_path, log_path = sys.argv[1:5]
    raw = open(md_path, "rb").read()
    md = raw.decode("utf-8")
    caps_en = json.load(open(cap_path, encoding="utf-8"))
    log = {"input_sha256": hashlib.sha256(raw).hexdigest(), "input_bytes": len(raw),
           "source_memos_removed": 0, "repo_links": [], "dropped": [], "caption_edits": [],
           "code_runs": 0}
    lines = md.split("\n")
    log["edits"] = []
    if len(sys.argv) > 5:
        for e in json.load(open(sys.argv[5], encoding="utf-8")):
            if "delete_lines" in e:
                a, b = e["delete_lines"]
                before = "\n".join(lines[a - 1:b])
                for k in range(a - 1, b):
                    lines[k] = ""
                log["edits"].append(dict(e, before=before, after=""))
                continue
            ln = lines[e["line"] - 1]
            assert ln.count(e["old"]) == 1, (e["id"], ln.count(e["old"]))
            lines[e["line"] - 1] = ln.replace(e["old"], e["new"])
            log["edits"].append(dict(e, before=e["old"], after=e["new"]))
    blocks = {"title_ko": None, "title_en": None, "abstract_ko": None, "abstract_en": None,
              "keywords_en": None, "body": [], "references": []}
    i, section, chap = 0, None, None
    pending_caption = None
    while i < len(lines):
        ln = lines[i]
        s = ln.strip()
        if not s:
            i += 1
            continue
        if ln.startswith("# "):
            blocks["title_ko"] = s[2:]
        elif s.startswith("**Source-preserving"):
            blocks["title_en"] = s.strip("*")
        elif s == "## 국문요약":
            section = "abs_ko"
        elif s == "## English Abstract":
            section = "abs_en"
        elif s.startswith("**주제어:**"):
            log["dropped"].append({"line": i + 1, "what": "Korean keyword line (no slot in template)"})
        elif s.startswith("**Keywords:**"):
            kws = [k.strip() for k in s.split(":**", 1)[1].split(",")]
            blocks["keywords_en"] = ", ".join(k[0].upper() + k[1:] for k in kws)
        elif section == "abs_ko" and not s.startswith("#"):
            blocks["abstract_ko"] = strip_memos(s, log)
        elif section == "abs_en" and not s.startswith("#"):
            blocks["abstract_en"] = strip_memos(s, log)
        elif s == "## 참고문헌":
            section = "refs"
        elif section == "refs":
            m = re.match(r"\[(\d+)\] (.*)", s)
            parts = re.split(r"(\*[^*]+\*)", m.group(2))
            runs = [{"k": "i", "t": p[1:-1]} if p.startswith("*") else {"k": "t", "t": p}
                    for p in parts if p]
            blocks["references"].append({"old": m.group(1), "runs": runs})
        elif ln.startswith("## "):
            m = re.match(r"## ([IVX]+)\. (.*)", ln)
            chap = m.group(1)
            section = "body"
            blocks["body"].append({"type": "chapter", "text": ROMAN[chap] + ". " + m.group(2),
                                   "src_line": i + 1})
        elif ln.startswith("### "):
            m = re.match(r"### \d+\.(\d+) (.*)", ln)
            blocks["body"].append({"type": "section", "text": m.group(1) + ". " + m.group(2),
                                   "src_line": i + 1})
        elif s.startswith("```"):
            j = i + 1
            code = []
            while not lines[j].strip().startswith("```"):
                code.append(lines[j])
                j += 1
            blocks["body"].append({"type": "code", "lines": code, "src_line": i + 1})
            i = j
        elif s.startswith("|"):
            j = i
            tl = []
            while j < len(lines) and lines[j].strip().startswith("|"):
                tl.append(lines[j])
                j += 1
            rows = table_rows(tl)
            cells = [[runs_from(strip_memos(c, log), "plain") for c in r] for r in rows]
            if pending_caption is not None:
                tid = pending_caption["id"]
                blocks["body"].append({"type": "table", "id": tid, "caption_ko": pending_caption["ko"],
                                       "caption_en": caps_en[tid], "parts": [cells],
                                       "src_line": i + 1})
                pending_caption = None
            else:
                # second Markdown table right after a captioned one = cost panel of the same table
                prev = blocks["body"][-1]
                assert prev["type"] == "table", "uncaptioned table must follow a table"
                prev["parts"].append(cells)
            i = j - 1
        elif IMG.match(s):
            src = IMG.match(s).group(1)
            # caption paragraph follows
            j = i + 1
            while not lines[j].strip():
                j += 1
            cap = strip_memos(lines[j].strip(), log)
            m = re.match(r"그림 (\d+)\. (.*)", cap)
            fid = "F" + m.group(1)
            ko = caption_ko(cap)
            if fid == "F2":
                gloss = " (Mean total input tokens per query (including re-requests))"
                if gloss in ko:
                    ko = ko.replace(gloss, "")
                    log["caption_edits"].append({"id": fid, "before": gloss.strip(),
                                                 "after": "(removed; the English caption line carries it)"})
            blocks["body"].append({"type": "figure", "id": fid, "src": src, "caption_ko": ko,
                                   "caption_en": caps_en[fid], "src_line": i + 1})
            i = j
        elif re.match(r"표 \d+\. ", s):
            cap = strip_memos(s, log)
            m = re.match(r"표 (\d+)\. ", cap)
            pending_caption = {"id": "T" + m.group(1), "ko": caption_ko(cap)}
        elif s.startswith("남은 작업:"):
            log["dropped"].append({"line": i + 1, "what": "work memo paragraph '남은 작업:'",
                                   "text": s})
        else:
            text = convert_links(strip_memos(s, log), log)
            blocks["body"].append({"type": "para", "runs": runs_from(text, "sup"), "src_line": i + 1})
        i += 1

    # citation order by first appearance in reading order (body incl. tables/captions)
    order = []

    def visit(runs):
        for r in runs:
            if r["k"] == "cite":
                for c in r["ids"]:
                    if c not in order:
                        order.append(c)
            if r["k"] == "code":
                log["code_runs"] += 1
    for b in blocks["body"]:
        if b["type"] == "para":
            visit(b["runs"])
        elif b["type"] == "table":
            for part in b["parts"]:
                for row in part:
                    for cell in row:
                        visit(cell)
    old_refs = [r["old"] for r in blocks["references"]]
    uncited = [o for o in old_refs if o not in order]
    orphan = [o for o in order if o != "S" and o not in old_refs]
    mapping = {old: n + 1 for n, old in enumerate(order)}
    for o in uncited:  # keep uncited ones at the end (reported as an error)
        mapping[o] = len(mapping) + 1

    def renum(runs):
        for r in runs:
            if r["k"] == "cite":
                r["new"] = [mapping[c] for c in r["ids"]]
                r["t"] = format_group(r["new"])
    for b in blocks["body"]:
        if b["type"] == "para":
            renum(b["runs"])
        elif b["type"] == "table":
            for part in b["parts"]:
                for row in part:
                    for cell in row:
                        renum(cell)
    refs = {r["old"]: r for r in blocks["references"]}
    refs["S"] = {"old": "S", "runs": [{"k": "t", "t": caps_en["S_ref"]}]}
    blocks["references"] = [dict(refs[o], new=mapping[o]) for o in sorted(mapping, key=mapping.get)]
    log["citation_order"] = order
    log["mapping_old_to_new"] = mapping
    log["uncited_refs"] = uncited
    log["orphan_citations"] = orphan
    log["reference_count_manuscript"] = len(old_refs)
    log["reference_count_typeset"] = len(blocks["references"])
    log["repo_link_count"] = len(log["repo_links"])
    json.dump(blocks, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    json.dump(log, open(log_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: log[k] for k in ["source_memos_removed", "repo_link_count",
                                           "reference_count_manuscript", "reference_count_typeset",
                                           "uncited_refs", "orphan_citations", "code_runs"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()
