"""Verify an IEIE review-copy PDF against the typesetting blocks.

Usage:
  python verify_pdf.py <paper.pdf> <blocks.json> <claims.json> <out_dir>

Writes to <out_dir>:
  page-XX.png          every page rendered at 110 dpi
  pages.csv            per page: size, A4 check, header, columns, objects, captions, fonts
  citations.csv        per reference: first page/position, count in body, entry text match
  claims.csv           key claims: found page(s), value, condition, verdict
  numbers.csv          numeric-token multiset comparison (blocks vs PDF body text)
  summary.json         machine-readable totals
Requires PyMuPDF (pip install pymupdf).
"""
import collections
import csv
import json
import os
import re
import sys
import unicodedata

import fitz  # PyMuPDF

A4 = (595.28, 841.89)


def norm(s):
    """Normalize for matching: NFC, drop whitespace and soft/hard hyphen breaks."""
    s = unicodedata.normalize("NFC", s)
    s = s.replace(chr(0xAD), "").replace(chr(0x200B), "")
    s = s.translate(str.maketrans({"“": '"', "”": '"', "″": '"', "‘": "'", "’": "'"}))
    return re.sub(r"\s+", "", s)


def block_text(runs):
    return "".join(r.get("t", "") for r in runs)


def main():
    pdf_path, blocks_path, claims_path, out = sys.argv[1:5]
    os.makedirs(out, exist_ok=True)
    blocks = json.load(open(blocks_path, encoding="utf-8"))
    claims = json.load(open(claims_path, encoding="utf-8"))
    doc = fitz.open(pdf_path)
    summary = {"pdf": os.path.basename(pdf_path), "pages": doc.page_count,
               "metadata": {k: v for k, v in (doc.metadata or {}).items() if v}}
    rows = []
    page_text = []
    col_text = []
    col_text_nofull = []
    overlaps = []
    col_parts = []
    fonts_all = {}
    caps = []
    heads = []
    for pno in range(doc.page_count):
        page = doc[pno]
        w, h = page.rect.width, page.rect.height
        pix = page.get_pixmap(dpi=110)
        pix.save(os.path.join(out, "page-%02d.png" % (pno + 1)))
        d = page.get_text("dict")
        lines = []
        for b in d["blocks"]:
            if b.get("type") != 0:
                continue
            for ln in b["lines"]:
                txt = "".join(sp["text"] for sp in ln["spans"])
                if txt.strip():
                    lines.append((ln["bbox"], txt, ln["spans"]))
        # page text without the running header (journal line, page number) and footer
        text = chr(10).join(l[1] for l in lines if l[0][3] >= 75 and l[0][1] <= h - 40 and "**" not in l[1]
                           and not (l[0][3] < 100 and l[1].strip().isdigit()))
        page_text.append(text)
        # reading order for claims: full-width lines, then left column, then right column (each top to bottom)
        keep = [l for l in lines if l[0][3] >= 75 and l[0][1] <= h - 40 and "**" not in l[1]
                and not (l[0][3] < 100 and l[1].strip().isdigit())]
        mid0 = w / 2
        def _col(l):
            return 1 if l[0][2] <= mid0 + 2 else (2 if l[0][0] >= mid0 - 2 else 0)
        col_text.append(chr(10).join(l[1] for l in sorted(keep, key=lambda l: (_col(l), l[0][1]))))
        # the same without full-width lines (a page-top table can sit between a sentence and its continuation)
        # table areas: vertical extent of ruling lines wider than 60% of the page
        rules = [d["rect"] for d in page.get_drawings() if d["rect"].width > 0.6 * w]
        tbl = (min(r.y0 for r in rules) - 2, max(r.y1 for r in rules) + 2) if rules else None
        if tbl and tbl[0] < 0.4 * h:  # page-top float: its caption sits above the rules, drop from the page top
            tbl = (0, tbl[1])

        def _in_table(l):
            return tbl is not None and l[0][1] >= tbl[0] and l[0][3] <= tbl[1]
        col_text_nofull.append(chr(10).join(l[1] for l in sorted(keep, key=lambda l: (_col(l), l[0][1]))
                                            if _col(l) and not _in_table(l)))
        for cno in (0, 1, 2):
            col_parts.append((pno + 1, cno, norm("".join(l[1] for l in sorted(keep, key=lambda l: l[0][1]) if _col(l) == cno))))
        # full-width captions may end in a short line that falls inside the left half
        col_parts.append((pno + 1, 3, norm("".join(l[1] for l in sorted(keep, key=lambda l: l[0][1]) if _col(l) in (0, 1)))))
        imgs = [tuple(round(v, 1) for v in page.get_image_bbox(im)) for im in page.get_images(full=True)]
        # figures are raster images without text, so any text line inside an image box is an overlap;
        # two image boxes must not intersect either
        def _inter(a, b):
            return min(a[2], b[2]) - max(a[0], b[0]) > 2 and min(a[3], b[3]) - max(a[1], b[1]) > 2
        for ib in imgs:
            for bb, txt, _sp in lines:
                if _inter(ib, bb):
                    overlaps.append({"page": pno + 1, "image": ib, "text": txt[:40]})
        for i1 in range(len(imgs)):
            for i2 in range(i1 + 1, len(imgs)):
                if _inter(imgs[i1], imgs[i2]):
                    overlaps.append({"page": pno + 1, "image": imgs[i1], "text": "image %s" % (imgs[i2],)})
        fonts = page.get_fonts(full=True)
        for f in fonts:
            fonts_all[f[3]] = {"type": f[2], "embedded": f[1] != "n/a", "ext": f[1]}
        mid = w / 2
        left = [l for l in lines if l[0][2] <= mid + 2]
        right = [l for l in lines if l[0][0] >= mid - 2]
        span = [l for l in lines if l[0][0] < mid - 2 and l[0][2] > mid + 2]
        header = [l[1].strip() for l in lines if l[0][3] < 75]
        footer = [l[1] for l in lines if l[0][1] > h - 40]
        for bb, txt, _sp in lines:
            m = re.match(r"^(그림|Fig\.|표|Table)\s*(\d+)\.", txt.strip())
            if m:
                caps.append({"page": pno + 1, "kind": m.group(1), "num": int(m.group(2)),
                             "x0": round(bb[0], 1), "y0": round(bb[1], 1), "y1": round(bb[3], 1)})
            m = re.match(r"^([ⅠⅡⅢⅣⅤⅥⅦⅧ])\.\s*(.*)|^(REFERENCES)$", txt.strip())
            if m:
                heads.append({"page": pno + 1, "head": m.group(1) or m.group(3),
                              "col": "L" if bb[2] <= mid + 2 else ("R" if bb[0] >= mid - 2 else "S"),
                              "y": round(bb[1], 1)})
        low_l = max((l[0][3] for l in left if l[0][3] < h - 40), default=0)
        low_r = max((l[0][3] for l in right if l[0][3] < h - 40), default=0)
        rows.append({
            "page": pno + 1, "w_pt": round(w, 2), "h_pt": round(h, 2),
            "a4": abs(w - A4[0]) < 1 and abs(h - A4[1]) < 1,
            "header": " / ".join(header)[:120], "footer": " / ".join(footer)[:80],
            "lines_left": len(left), "lines_right": len(right), "lines_spanning": len(span),
            "lowest_left_pt": round(low_l, 1), "lowest_right_pt": round(low_r, 1),
            "images": len(imgs), "image_bboxes": json.dumps(imgs),
            "fonts": ";".join(sorted({f[3] for f in fonts})),
            "fonts_not_embedded": ";".join(sorted({f[3] for f in fonts if f[1] == "n/a"})),
        })
    with open(os.path.join(out, "pages.csv"), "w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        wr.writeheader()
        wr.writerows(rows)
    summary["a4_all"] = all(r["a4"] for r in rows)
    summary["fonts"] = fonts_all
    summary["fonts_not_embedded"] = sorted(k for k, v in fonts_all.items() if not v["embedded"])
    summary["captions"] = caps
    summary["headings"] = heads
    last = rows[-1]
    summary["last_page_lowest_pt"] = {"left": last["lowest_left_pt"], "right": last["lowest_right_pt"]}

    # ---------------- citations ----------------
    full = "\n".join(page_text)
    ref_start_page = next((hh["page"] for hh in heads if hh["head"] == "REFERENCES"), None)
    ref_pos = full.rfind("REFERENCES")
    body, refs_txt = full[:ref_pos], full[ref_pos:]
    nbody = norm(body)
    # expand groups like [3]–[6], [8], [9]
    order, counts = [], collections.Counter()
    for m in re.finditer(r"\[(\d+)\](?:\s*[–-]\s*\[(\d+)\])?", body):
        a = int(m.group(1))
        b = int(m.group(2)) if m.group(2) else a
        for k in range(a, b + 1):
            counts[k] += 1
            if k not in order:
                order.append(k)
    nrefs = norm(refs_txt)
    cit_rows = []
    for r in blocks["references"]:
        n = r["new"]
        entry = "[%d]" % n + "".join(x["t"] for x in r["runs"])
        ok = norm(entry) in nrefs
        first_page = None
        for pno, tx in enumerate(page_text):
            if pno + 1 > (ref_start_page or 99):
                break
            if re.search(r"\[%d\]" % n, tx) or any(
                    a <= n <= b for a, b in ((int(x), int(y)) for x, y in re.findall(r"\[(\d+)\]\s*[–-]\s*\[(\d+)\]", tx))):
                first_page = pno + 1
                break
        cit_rows.append({"new": n, "old": r["old"], "first_order": order.index(n) + 1 if n in order else "",
                         "first_page": first_page, "body_count": counts.get(n, 0),
                         "entry_text_match": ok})
    with open(os.path.join(out, "citations.csv"), "w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(cit_rows[0].keys()))
        wr.writeheader()
        wr.writerows(cit_rows)
    nref = len(blocks["references"])
    summary["citations"] = {
        "references": nref,
        "first_appearance_order": order,
        "order_is_sequential": order == list(range(1, len(order) + 1)),
        "orphans": sorted(k for k in counts if k > nref),
        "uncited": sorted(k for k in range(1, nref + 1) if counts.get(k, 0) == 0),
        "entry_text_mismatch": [c["new"] for c in cit_rows if not c["entry_text_match"]],
    }

    # internal memo / repository path leaks (anonymous review copy must not carry them)
    leak_pat = re.compile(r"출처:|Sources:|research/|docs/research|plans/|codex_review|\.mjs|\.jsonl?\b|README\.md|github\.com|[A-Z]:\\|/Users/")
    leaks = [{"page": pno + 1, "text": m.group(0)} for pno, tx in enumerate(page_text) for m in leak_pat.finditer(tx)]
    summary["internal_leaks"] = leaks
    summary["overlaps"] = overlaps
    # every caption (Korean and English) must sit whole in one column of one page
    cap_rows = []
    for b in blocks["body"]:
        if b["type"] not in ("table", "figure"):
            continue
        for lang in ("caption_ko", "caption_en"):
            needle = norm(b[lang])[-60:]
            head = norm(b[lang])[:30]
            full_width = b["type"] == "table" or b["id"] == "F1"
            where = [(pg, cn) for pg, cn, tx in col_parts
                     if (cn in (0, 3) if full_width else cn in (1, 2)) and needle in tx and head in tx]
            cap_rows.append({"id": b["id"], "lang": lang, "page_col": where, "whole": bool(where)})
    summary["captions_split"] = [(c["id"], c["lang"]) for c in cap_rows if not c["whole"]]

    # ---------------- claims ----------------
    cl_rows = []
    for c in claims:
        pages = [pno + 1 for pno, tx in enumerate(page_text) if all(norm(x) in norm(tx) for x in c["all_of"])]
        anywhere = any(all(norm(x) in norm(chr(10).join(ct)) for x in c["all_of"]) for ct in (col_text, col_text_nofull))
        cl_rows.append({"id": c["id"], "manuscript": c["where"], "value": " | ".join(c["all_of"]),
                        "condition": c.get("condition", ""), "pdf_pages": ";".join(map(str, pages)),
                        "found_same_page": bool(pages), "found_anywhere": anywhere,
                        "verdict": "일치" if pages else ("분산 일치" if anywhere else "미대응")})
    with open(os.path.join(out, "claims.csv"), "w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=list(cl_rows[0].keys()))
        wr.writeheader()
        wr.writerows(cl_rows)
    summary["claims"] = {"total": len(cl_rows), "unmatched": [c["id"] for c in cl_rows if c["verdict"] == "미대응"],
                         "split_pages": [c["id"] for c in cl_rows if c["verdict"] == "분산 일치"]}

    # ---------------- numeric tokens ----------------
    def numbers(s):
        s = re.sub(r"\s+", "", unicodedata.normalize("NFC", s))
        return collections.Counter(re.findall(r"[−\-+]?\$?\d[\d,]*(?:\.\d+)?(?:%p|%)?", s))
    src = [blocks["abstract_ko"], blocks["abstract_en"]]
    for b in blocks["body"]:
        if b["type"] == "para":
            src.append(block_text(b["runs"]))
        elif b["type"] == "table":
            n = b["id"][1:]
            src.append("표 %s. Table %s." % (n, n))
            src.append(b["caption_ko"])
            src.append(b["caption_en"])
            for part in b["parts"]:
                for row in part:
                    src.extend(block_text(c) for c in row)
        elif b["type"] == "figure":
            n = b["id"][1:]
            src.append("그림 %s. Fig. %s." % (n, n))
            src.append(b["caption_ko"])
            src.append(b["caption_en"])
        elif b["type"] == "code":
            src.extend(b["lines"])
        elif b["type"] in ("chapter", "section"):
            src.append(b["text"])
    # citation runs carry "[n]" text; drop bracketed numbers from both sides
    src_txt = re.sub(r"\[\d+\]", " ", "\n".join(src))
    pdf_txt = re.sub(r"\[\d+\]", " ", body)
    a, b = numbers(src_txt), numbers(pdf_txt)
    num_rows = []
    for k in sorted(set(a) | set(b)):
        if a[k] != b[k]:
            num_rows.append({"token": k, "blocks": a[k], "pdf": b[k]})
    with open(os.path.join(out, "numbers.csv"), "w", encoding="utf-8", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=["token", "blocks", "pdf"])
        wr.writeheader()
        wr.writerows(num_rows)
    summary["numbers"] = {"distinct_tokens_blocks": len(a), "total_tokens_blocks": sum(a.values()),
                          "total_tokens_pdf_body": sum(b.values()), "mismatched_tokens": len(num_rows)}
    json.dump(summary, open(os.path.join(out, "summary.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: summary[k] for k in ("pages", "a4_all", "fonts_not_embedded", "citations",
                                              "claims", "numbers", "internal_leaks", "overlaps", "captions_split", "last_page_lowest_pt")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
