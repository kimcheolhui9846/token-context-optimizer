"""Build an IEIE journal HWPX from the official template (saved as HWPX) and blocks.json.

Usage:
  python build_hwpx.py <template_hwpx_dir> <blocks.json> <repo_root> <out.hwpx> <out_log.json> [pic_sample.xml|-] [layout.json]

The template directory is the unzipped HWPX that HWP itself saved from the official .hwp.
Template styles are reused; only character/paragraph shapes needed for code, superscript
citations, table cells and figures are added. Template sample text, red/blue instruction
notes, author lines, the author footnote box and the author biography page are removed
(anonymous review copy). The header placeholders that the template says not to edit are kept.
"""
import copy
import hashlib
import json
import os
import re
import shutil
import struct
import sys
import zipfile
from xml.sax.saxutils import escape

MM = 7200 / 25.4  # HWPUNIT per mm
FULL_W = 48223    # template body width (header block table width)
COL_W = 22816     # template column text width (lineseg horzsize)


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    assert head[:8] == b"\x89PNG\r\n\x1a\n"
    return struct.unpack(">II", head[16:24])


class Ids:
    def __init__(self, start):
        self.n = start

    def next(self):
        self.n += 1
        return self.n


# ----------------------------------------------------------------- header.xml
def add_header_shapes(h, log):
    """Add a Consolas font and the char/para shapes the body needs. Returns (h, ids)."""
    # font: append Consolas to every fontface list (only latin is referenced)
    def add_font(m):
        block = m.group(0)
        cnt = int(re.search(r'fontCnt="(\d+)"', block).group(1))
        font = ('<hh:font id="%d" face="Consolas" type="TTF" isEmbedded="0"><hh:typeInfo '
                'familyType="FCAT_GOTHIC" weight="5" proportion="9" contrast="0" strokeVariation="0" '
                'armStyle="0" letterform="0" midline="0" xHeight="0"/></hh:font>' % cnt)
        block = block.replace('fontCnt="%d"' % cnt, 'fontCnt="%d"' % (cnt + 1), 1)
        return block.replace("</hh:fontface>", font + "</hh:fontface>")
    h, n = re.subn(r'<hh:fontface lang="LATIN".*?</hh:fontface>', add_font, h, flags=re.S)
    assert n == 1
    latin = re.search(r'<hh:fontface lang="LATIN".*?</hh:fontface>', h, re.S).group(0)
    consolas = int(re.findall(r'<hh:font id="(\d+)" face="Consolas"', latin)[0])

    def charpr(i):
        return re.search(r'<hh:charPr id="%d" .*?</hh:charPr>' % i, h, re.S).group(0)

    def parapr(i):
        return re.search(r'<hh:paraPr id="%d" .*?</hh:paraPr>' % i, h, re.S).group(0)

    ccount = int(re.search(r'<hh:charProperties itemCnt="(\d+)"', h).group(1))
    pcount = int(re.search(r'<hh:paraProperties itemCnt="(\d+)"', h).group(1))
    new_chars, new_paras, ids = [], [], {}

    def new_char(name, base, height=None, latin_font=None, ratio=None, spacing=None, sup=False,
                 bold=False):
        x = charpr(base)
        nid = ccount + len(new_chars)
        x = re.sub(r'<hh:charPr id="\d+"', '<hh:charPr id="%d"' % nid, x, count=1)
        if height:
            x = re.sub(r'height="\d+"', 'height="%d"' % height, x, count=1)
        if latin_font is not None:
            x = re.sub(r'(<hh:fontRef [^>]*?)latin="\d+"', r'\g<1>latin="%d"' % latin_font, x, count=1)
        if ratio is not None:
            x = re.sub(r'<hh:ratio [^>]*/>', '<hh:ratio hangul="{0}" latin="{0}" hanja="{0}" '
                       'japanese="{0}" other="{0}" symbol="{0}" user="{0}"/>'.format(ratio), x, count=1)
        if spacing is not None:
            x = re.sub(r'<hh:spacing [^>]*/>', '<hh:spacing hangul="{0}" latin="{0}" hanja="{0}" '
                       'japanese="{0}" other="{0}" symbol="{0}" user="{0}"/>'.format(spacing), x, count=1)
        if bold and "<hh:bold/>" not in x:
            x = x.replace("<hh:underline", "<hh:bold/><hh:underline", 1)
        if sup:
            x = x.replace("</hh:charPr>", "<hh:supscript/></hh:charPr>")
        new_chars.append(x)
        ids[name] = nid

    new_char("body", 8)
    new_char("code", 8, latin_font=consolas, ratio=90, spacing=0)
    new_char("sup", 8, sup=True)
    new_char("cell", 8, height=850)
    new_char("cell_bold", 8, height=850, bold=True)
    new_char("cell_code", 8, height=850, latin_font=consolas, ratio=90, spacing=0)
    new_char("codebox", 8, height=800, latin_font=consolas, ratio=90, spacing=0)

    def new_para(name, base, align=None, intent=None, spacing=None, prev=None, nxt=None,
                 keep_next=None, keep_lines=None):
        x = parapr(base)
        nid = pcount + len(new_paras)
        x = re.sub(r'<hh:paraPr id="\d+"', '<hh:paraPr id="%d"' % nid, x, count=1)
        if align:
            x = re.sub(r'horizontal="\w+"', 'horizontal="%s"' % align, x, count=1)
        # the HwpUnitChar <hp:case> margin values are half of the <hp:default> values here
        case, rest = x.split("</hp:case>", 1)
        for tag, val in (("intent", intent), ("prev", prev), ("next", nxt)):
            if val is not None:
                case = re.sub(r'(<hc:%s value=")-?\d+"' % tag, r'\g<1>%d"' % val, case, count=1)
                rest = re.sub(r'(<hc:%s value=")-?\d+"' % tag, r'\g<1>%d"' % (2 * val), rest, count=1)
        x = case + "</hp:case>" + rest
        if spacing is not None:
            x = re.sub(r'(<hh:lineSpacing type="PERCENT" value=")\d+', r'\g<1>%d' % spacing, x)
        if keep_next is not None:
            x = re.sub(r'keepWithNext="\d"', 'keepWithNext="%d"' % keep_next, x, count=1)
        if keep_lines is not None:
            x = re.sub(r'keepLines="\d"', 'keepLines="%d"' % keep_lines, x, count=1)
        new_paras.append(x)
        ids["p_" + name] = nid

    new_para("cell_l", 14, align="LEFT", intent=0, spacing=130)
    new_para("cell_c", 14, align="CENTER", intent=0, spacing=130)
    new_para("code", 14, align="LEFT", intent=0, spacing=125)
    new_para("figure", 14, align="CENTER", intent=0, spacing=100, prev=300, nxt=200)
    new_para("anchor", 10, intent=0, spacing=100)
    new_para("ref", 17, align="LEFT")
    new_para("chapter", 7, keep_next=1)
    new_para("section", 15, keep_next=1)
    # inline figures: picture, Korean caption and English caption stay together and are not split
    new_para("figure_keep", 14, align="CENTER", intent=0, spacing=100, prev=300, nxt=200, keep_next=1)
    new_para("figcap_ko", 25, keep_next=1, keep_lines=1)
    new_para("figcap_en", 25, keep_lines=1)

    h = h.replace("</hh:charProperties>", "".join(new_chars) + "</hh:charProperties>")
    h = re.sub(r'<hh:charProperties itemCnt="\d+"', '<hh:charProperties itemCnt="%d"' %
               (ccount + len(new_chars)), h)
    h = h.replace("</hh:paraProperties>", "".join(new_paras) + "</hh:paraProperties>")
    h = re.sub(r'<hh:paraProperties itemCnt="\d+"', '<hh:paraProperties itemCnt="%d"' %
               (pcount + len(new_paras)), h)
    log["header_added"] = {"chars": len(new_chars), "paras": len(new_paras), "consolas_latin_id": consolas}
    return h, ids


# ----------------------------------------------------------------- XML helpers
def t(text):
    return escape(text)


def run(char, text):
    if text == "":
        return ""
    return '<hp:run charPrIDRef="%d"><hp:t>%s</hp:t></hp:run>' % (char, t(text))


def para(style, ppr, inner, pid=0):
    if not inner:
        inner = '<hp:run charPrIDRef="8"/>'
    return ('<hp:p id="%d" paraPrIDRef="%d" styleIDRef="%d" pageBreak="0" columnBreak="0" '
            'merged="0">%s</hp:p>' % (pid, ppr, style, inner))


def runs_xml(runs, ids, plain_char, code_char):
    out = []
    for r in runs:
        if r["k"] == "t":
            out.append(run(plain_char, r["t"]))
        elif r["k"] == "code":
            out.append(run(code_char, r["t"]))
        elif r["k"] == "cite":
            out.append(run(ids["sup"] if r["sup"] else plain_char, r["t"]))
        elif r["k"] == "i":
            out.append(run(54, r["t"]))
    return "".join(out)


def sublist(paras_xml, valign="CENTER"):
    return ('<hp:subList id="" textDirection="HORIZONTAL" lineWrap="BREAK" vertAlign="%s" '
            'linkListIDRef="0" linkListNextIDRef="0" textWidth="0" textHeight="0" hasTextRef="0" '
            'hasNumRef="0">%s</hp:subList>' % (valign, paras_xml))


def cell(col, row, colspan, rowspan, width, paras_xml, border, valign="CENTER", height=300):
    return ('<hp:tc name="" header="0" hasMargin="0" protect="0" editable="0" dirty="0" '
            'borderFillIDRef="%d">%s<hp:cellAddr colAddr="%d" rowAddr="%d"/><hp:cellSpan '
            'colSpan="%d" rowSpan="%d"/><hp:cellSz width="%d" height="%d"/><hp:cellMargin '
            'left="283" right="283" top="85" bottom="85"/></hp:tc>'
            % (border, sublist(paras_xml, valign), col, row, colspan, rowspan, width, height))


def pos_xml(floating):
    if floating:
        return ('<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="0" '
                'holdAnchorAndSO="0" vertRelTo="PAPER" horzRelTo="PAPER" vertAlign="TOP" '
                'horzAlign="CENTER" vertOffset="%d" horzOffset="0"/>' % 0)
    return ('<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" '
            'holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" '
            'horzAlign="LEFT" vertOffset="0" horzOffset="0"/>')


def table_xml(tid, grid_w, rows, floating, border_out=2, zorder=1):
    """rows: list of list of (col, colspan, paras_xml, border, valign)."""
    total_w = sum(grid_w)
    trs = []
    for r, cells in enumerate(rows):
        tcs = [cell(c, r, span, 1, sum(grid_w[c:c + span]), px, b, va) for c, span, px, b, va in cells]
        trs.append("<hp:tr>%s</hp:tr>" % "".join(tcs))
    wrap = 'textWrap="TOP_AND_BOTTOM"'
    if floating:
        pos = ('<hp:pos treatAsChar="0" affectLSpacing="0" flowWithText="0" allowOverlap="0" '
               'holdAnchorAndSO="0" vertRelTo="PAGE" horzRelTo="PAGE" vertAlign="%s" '
               'horzAlign="CENTER" vertOffset="0" horzOffset="0"/>' % floating)
    else:
        pos = pos_xml(False)
    return ('<hp:tbl id="%d" zOrder="%d" numberingType="TABLE" %s textFlow="BOTH_SIDES" lock="0" '
            'dropcapstyle="None" pageBreak="NONE" repeatHeader="0" rowCnt="%d" colCnt="%d" '
            'cellSpacing="0" borderFillIDRef="%d" noAdjust="0"><hp:sz width="%d" widthRelTo="ABSOLUTE" '
            'height="%d" heightRelTo="ABSOLUTE" protect="0"/>%s<hp:outMargin left="0" right="0" '
            'top="0" bottom="%d"/><hp:inMargin left="141" right="141" top="141" bottom="141"/>%s</hp:tbl>'
            % (tid, zorder, wrap, len(rows), len(grid_w), border_out, total_w, 1000 * len(rows), pos,
               567 if floating else 0, "".join(trs)))


PIC_FALLBACK = (
    '<hp:pic id="0" zOrder="0" numberingType="PICTURE" textWrap="TOP_AND_BOTTOM" textFlow="BOTH_SIDES" '
    'lock="0" dropcapstyle="None" href="" groupLevel="0" instid="0" reverse="0"><hp:offset x="0" y="0"/>'
    '<hp:orgSz width="1" height="1"/><hp:curSz width="1" height="1"/><hp:flip horizontal="0" vertical="0"/>'
    '<hp:rotationInfo angle="0" centerX="0" centerY="0" rotateimage="1"/><hp:renderingInfo>'
    '<hc:transMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
    '<hc:scaMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/>'
    '<hc:rotMatrix e1="1" e2="0" e3="0" e4="0" e5="1" e6="0"/></hp:renderingInfo>'
    '<hc:img binaryItemIDRef="image0" bright="0" contrast="0" effect="REAL_PIC" alpha="0"/>'
    '<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="1" y="0"/><hc:pt2 x="1" y="1"/><hc:pt3 x="0" y="1"/></hp:imgRect>'
    '<hp:imgClip left="0" right="1" top="0" bottom="1"/><hp:inMargin left="0" right="0" top="0" bottom="0"/>'
    '<hp:imgDim dimwidth="1" dimheight="1"/><hp:effects/>'
    '<hp:sz width="1" widthRelTo="ABSOLUTE" height="1" heightRelTo="ABSOLUTE" protect="0"/>'
    '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" '
    'vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>'
    '<hp:outMargin left="0" right="0" top="0" bottom="0"/></hp:pic>')


def png_dpi(path):
    """Return the PNG pHYs density in dots per inch (96 if absent)."""
    data = open(path, "rb").read()
    i = data.find(b"pHYs")
    if i < 0:
        return 96.0, 96.0
    xd, yd, unit = struct.unpack(">IIB", data[i + 4:i + 13])
    if unit != 1:
        return 96.0, 96.0
    return xd * 0.0254, yd * 0.0254


def pic_xml(sample, pid, bin_id, src, width, height):
    """Instantiate an <hp:pic> (HWP-generated sample if given) for an image at a display size."""
    x = sample or PIC_FALLBACK
    w_px, h_px = png_size(src)
    dx, dy = png_dpi(src)
    ow, oh = round(w_px * 7200 / dx), round(h_px * 7200 / dy)  # original size in HWPUNIT
    x = re.sub(r'(<hp:pic [^>]*?)\bid="\d+"', r'\g<1>id="%d"' % pid, x, count=1)
    x = re.sub(r'(<hp:pic [^>]*?)\binstid="\d+"', r'\g<1>instid="%d"' % (pid + 1), x, count=1)
    x = re.sub(r'binaryItemIDRef="[^"]+"', 'binaryItemIDRef="%s"' % bin_id, x)
    x = re.sub(r'<hp:orgSz width="\d+" height="\d+"/>', '<hp:orgSz width="%d" height="%d"/>' % (ow, oh), x)
    x = re.sub(r'<hp:curSz width="\d+" height="\d+"/>', '<hp:curSz width="%d" height="%d"/>' % (width, height), x)
    x = re.sub(r'<hp:sz width="\d+" (widthRelTo="\w+") height="\d+"', r'<hp:sz width="%d" \1 height="%d"' % (width, height), x)
    x = re.sub(r'<hp:imgDim dimwidth="\d+" dimheight="\d+"/>', '<hp:imgDim dimwidth="%d" dimheight="%d"/>' % (ow, oh), x)
    x = re.sub(r'<hp:imgClip [^>]*/>', '<hp:imgClip left="0" right="%d" top="0" bottom="%d"/>' % (ow, oh), x)
    x = re.sub(r'<hp:imgRect>.*?</hp:imgRect>', '<hp:imgRect><hc:pt0 x="0" y="0"/><hc:pt1 x="%d" y="0"/><hc:pt2 x="%d" y="%d"/><hc:pt3 x="0" y="%d"/></hp:imgRect>' % (ow, ow, oh, oh), x, flags=re.S)
    x = re.sub(r'(<hp:rotationInfo [^>]*?)centerX="\d+" centerY="\d+"', r'\g<1>centerX="%d" centerY="%d"' % (width // 2, height // 2), x)
    x = re.sub(r'<hc:scaMatrix [^>]*/>', '<hc:scaMatrix e1="%.6f" e2="0" e3="0" e4="0" e5="%.6f" e6="0"/>' % (width / ow, height / oh), x)
    # inline (treat as character) inside the figure paragraph
    x = re.sub(r'<hp:pos [^>]*/>', '<hp:pos treatAsChar="1" affectLSpacing="0" flowWithText="1" allowOverlap="0" holdAnchorAndSO="0" vertRelTo="PARA" horzRelTo="PARA" vertAlign="TOP" horzAlign="LEFT" vertOffset="0" horzOffset="0"/>', x, count=1)
    return x




# ----------------------------------------------------------------- body
def caption_paras(kind, num, ko, en, ids, keep=False):
    if kind == "fig":
        k = '그림<hp:tab width="328" leader="0" type="1"/>%d.<hp:tab width="756" leader="0" type="1"/>%s' % (num, t(ko))
        e = 'Fig.<hp:tab width="712" leader="0" type="1"/>%d.<hp:tab width="756" leader="0" type="1"/>%s' % (num, t(en))
        ppr = 25
    else:
        k = '표<hp:tab width="1475" leader="0" type="1"/>%d.<hp:fwSpace/><hp:fwSpace/>%s' % (num, t(ko))
        e = 'Table<hp:tab width="315" leader="0" type="1"/>%d.<hp:fwSpace/><hp:fwSpace/>%s' % (num, t(en))
        ppr = 26
    p_ko, p_en = (ids["p_figcap_ko"], ids["p_figcap_en"]) if keep else (ppr, ppr)
    return (para(5, p_ko, '<hp:run charPrIDRef="16"><hp:t>%s</hp:t></hp:run>' % k) +
            para(5, p_en, '<hp:run charPrIDRef="16"><hp:t>%s</hp:t></hp:run>' % e))


LAYOUT = {}  # optional: {"anchor": {"T1": "prev"|"next"|k}, "valign": {"F1": "TOP"|"BOTTOM"},
#             "url_break_hints": bool, "keep_figure_captions": ["F2"], "inline_before": {"F2": k}};
#             k = k-th latest body paragraph

TABLE_FRACS = {
    "T1": [[0.20, 0.12, 0.17, 0.17, 0.34]],
    "T2": [[0.30, 0.27, 0.27, 0.16]],
    "T3": [[0.31, 0.24, 0.24, 0.21], [0.24, 0.20, 0.16, 0.20, 0.20]],
}


def build_table(b, ids, tid):
    fracs = TABLE_FRACS[b["id"]]
    assert len(fracs) == len(b["parts"])
    for f, part in zip(fracs, b["parts"]):
        assert all(len(r) == len(f) for r in part), (b["id"], [len(r) for r in part])
    W = FULL_W
    bounds = sorted({round(sum(f[:k]) * W) for f in fracs for k in range(len(f) + 1)})
    grid = [bounds[k + 1] - bounds[k] for k in range(len(bounds) - 1)]
    rows = []
    num = int(b["id"][1:])
    rows.append([(0, len(grid), caption_paras("tbl", num, b["caption_ko"], b["caption_en"], ids), 1, "BOTTOM")])
    for f, part in zip(fracs, b["parts"]):
        edges = [round(sum(f[:k]) * W) for k in range(len(f) + 1)]
        for ri, row in enumerate(part):
            cells = []
            for ci, runs in enumerate(row):
                c0, c1 = bounds.index(edges[ci]), bounds.index(edges[ci + 1])
                head = ri == 0
                align = ids["p_cell_c"] if (head or ci > 0) and b["id"] != "T1" else ids["p_cell_l"]
                if b["id"] == "T1" and head:
                    align = ids["p_cell_c"]
                char = ids["cell_bold"] if head else ids["cell"]
                px = para(0, align, runs_xml(runs, ids, char, ids["cell_code"]))
                cells.append((c0, c1 - c0, px, 2, "CENTER"))
            rows.append(cells)
    return table_xml(tid, grid, rows, floating=LAYOUT.get("valign", {}).get(b["id"], "TOP"))


def build_code(b, ids, tid):
    ps = "".join(para(0, ids["p_code"], run(ids["codebox"], ln.replace(" ", " ") if ln else " "))
                 for ln in b["lines"])
    return table_xml(tid, [COL_W], [[(0, 1, ps, 2, "TOP")]], floating=None)


def main():
    tpl_dir, blocks_path, repo, out_path, log_path = sys.argv[1:6]
    sample_path = sys.argv[6] if len(sys.argv) > 6 and sys.argv[6] != "-" else None
    blocks = json.load(open(blocks_path, encoding="utf-8"))
    log = {"blocks_sha256": hashlib.sha256(open(blocks_path, "rb").read()).hexdigest()}
    if len(sys.argv) > 7:
        LAYOUT.update(json.load(open(sys.argv[7], encoding="utf-8")))
        log["layout"] = LAYOUT
    work = out_path + ".dir"
    if os.path.exists(work):
        def _unlock(func, path, _exc):
            os.chmod(path, 0o666)
            func(path)
        shutil.rmtree(work, onexc=_unlock)
    shutil.copytree(tpl_dir, work, copy_function=shutil.copyfile)
    hp = os.path.join(work, "Contents", "header.xml")
    sp = os.path.join(work, "Contents", "section0.xml")
    h = open(hp, encoding="utf-8").read()
    s = open(sp, encoding="utf-8").read()
    h, ids = add_header_shapes(h, log)

    # --- header block (inside the floating head table) ---
    def sub1(old, new):
        nonlocal s
        assert s.count(old) == 1, (old, s.count(old))
        s = s.replace(old, new)

    s, n = re.subn(r'<hp:run charPrIDRef="(?:5|45)"><hp:t>\(수정할 필요 없음\)</hp:t></hp:run>', "", s)
    log["removed_keep_notes"] = n
    sub1("<hp:t>여기에 제목을 입력하세요</hp:t>", "<hp:t>%s</hp:t>" % t(blocks["title_ko"]))
    sub1("<hp:t>(Put English Title Here)</hp:t>", "<hp:t>(%s)</hp:t>" % t(blocks["title_en"]))
    # author lines (review copy): drop the two paragraphs with styles 8 and 9 in the head table
    s, n = re.subn(r'<hp:p [^>]*styleIDRef="8"[^>]*>(?:(?!</hp:p>).)*한글저자명(?:(?!</hp:p>).)*</hp:p>', "", s, count=1, flags=re.S)
    s, n2 = re.subn(r'<hp:p [^>]*styleIDRef="9"[^>]*>(?:(?!</hp:p>).)*Author Name(?:(?!</hp:p>).)*</hp:p>', "", s, count=1, flags=re.S)
    log["removed_author_lines"] = n + n2
    sub1("<hp:t>이곳에 한글 요약문을 작성하여 주십시오. </hp:t>", "<hp:t>%s</hp:t>" % t(blocks["abstract_ko"]))
    sub1("<hp:t>Please put the abstract of paper here.</hp:t>", "<hp:t>%s</hp:t>" % t(blocks["abstract_en"]))
    sub1(">5개 이하의 영문 키워드를 콤마로 구분하고 각 keyword의 첫 문자만 대문자 표기 </hp:t>",
         ">%s</hp:t>" % t(blocks["keywords_en"]))
    s, n = re.subn(r'<hp:run charPrIDRef="(?:56|57)"><hp:t[^>]*>\s*\(스타일:[^<]*\)</hp:t></hp:run>', "", s)
    log["removed_style_notes_head"] = n
    sub1("<hp:t>. 서  론</hp:t>", "<hp:t>%s</hp:t>" % t(blocks["body"][0]["text"][1:]))

    # --- cut everything after the chapter I heading paragraph ---
    i = s.index("<hp:t>%s</hp:t>" % t(blocks["body"][0]["text"][1:]))
    i = s.index("</hp:p>", i) + len("</hp:p>")
    tail = s[i:]
    # keep the template's even-page running header (title + page number); it sits on the
    # removed biography page, so move it into the first body paragraph with the real title
    hm = re.search(r'<hp:ctrl><hp:header id="\d+" applyPageType="EVEN">.*?</hp:header></hp:ctrl>', tail, re.S)
    even_header = hm.group(0).replace(">여기에 제목을 입력하세요.<", ">%s<" % t(blocks["title_ko"]))
    assert t(blocks["title_ko"]) in even_header
    log["even_header_kept"] = True
    log["removed_tail_chars"] = len(tail)
    log["removed_tail_has_bio"] = "저자약력" in tail
    s = s[:i]

    # --- pictures ---
    sample = open(sample_path, encoding="utf-8").read() if sample_path else None
    hpf_p = os.path.join(work, "Contents", "content.hpf")
    hpf = open(hpf_p, encoding="utf-8").read()
    # review copy: clear the template's document summary (other people's names, dates, last saver)
    def _blank(m):
        return m.group(1) + m.group(3)
    hpf, nm = re.subn(r'(<opf:title>)(.*?)(</opf:title>)', _blank, hpf, flags=re.S)
    for key in ("creator", "subject", "description", "lastsaveby", "date", "keyword"):
        hpf, k = re.subn(r'(<opf:meta name="%s" content="text"[^>]*>)(.*?)(</opf:meta>)' % key, _blank, hpf, flags=re.S)
        nm += k
    log["metadata_fields_cleared"] = nm
    # the template's sample equation/figure OLE objects are removed with the sample body
    for ole in re.findall(r'<opf:item id="(ole\d+)" href="BinData/[^"]+"[^>]*/>', hpf):
        hpf = re.sub(r'<opf:item id="%s" [^>]*/>' % ole, "", hpf)
        os.remove(os.path.join(work, "BinData", ole + ".ole"))
        log.setdefault("removed_bindata", []).append(ole)
    os.makedirs(os.path.join(work, "BinData"), exist_ok=True)
    oid = Ids(1900000000)
    out = []
    pending_float = []  # float objects waiting for the next body paragraph as anchor
    figs = []
    body_paras = []    # indexes in out of body paragraphs, in order

    def place_float(fid, xml):
        """Anchor a page-relative float: 'prev' = the body paragraph before it, 'next' = after it."""
        mode = LAYOUT.get("anchor", {}).get(fid, "prev")
        log.setdefault("float_anchor", {})[fid] = mode
        back = 1 if mode == "prev" else (mode if isinstance(mode, int) else None)
        if back is not None and len(body_paras) >= back:
            target = body_paras[-back]  # k-th latest body paragraph
            ctrl = '<hp:run charPrIDRef="8">%s<hp:t/></hp:run>' % xml
            k = out[target].index(">") + 1
            out[target] = out[target][:k] + ctrl + out[target][k:]
        else:
            pending_float.append(xml)
    for b in blocks["body"][1:]:
        if b["type"] == "chapter":
            out.append(para(2, ids["p_chapter"], run(31, b["text"])))
        elif b["type"] == "section":
            out.append(para(3, ids["p_section"], run(27, b["text"])))
        elif b["type"] == "para":
            inner = runs_xml(b["runs"], ids, 8, ids["code"])
            if pending_float:
                ctrl = '<hp:run charPrIDRef="8">%s<hp:t/></hp:run>' % "".join(pending_float)
                inner = ctrl + inner
                pending_float = []
            if even_header:
                inner = '<hp:run charPrIDRef="8">%s<hp:t/></hp:run>' % even_header + inner
                even_header = None
            out.append(para(1, 10, inner))
            body_paras.append(len(out) - 1)
        elif b["type"] == "code":
            out.append(para(0, ids["p_figure"], '<hp:run charPrIDRef="8">%s<hp:t/></hp:run>' % build_code(b, ids, oid.next())))
        elif b["type"] == "table":
            place_float(b["id"], build_table(b, ids, oid.next()))
        elif b["type"] == "figure":
            src = os.path.normpath(os.path.join(repo, "docs", "research", b["src"]))
            num = int(b["id"][1:])
            bin_id = "image%d" % num
            ext = os.path.splitext(src)[1].lstrip(".").lower()
            shutil.copyfile(src, os.path.join(work, "BinData", "%s.%s" % (bin_id, ext)))
            w_px, h_px = png_size(src)
            width = round((140 if num == 1 else 70) * MM)
            height = round(width * h_px / w_px)
            figs.append({"id": b["id"], "src": os.path.relpath(src, repo).replace(os.sep, "/"),
                         "px": [w_px, h_px], "mm": [round(width / MM, 1), round(height / MM, 1)],
                         "sha256": hashlib.sha256(open(src, "rb").read()).hexdigest()})
            hpf = hpf.replace("</opf:manifest>", '<opf:item id="%s" href="BinData/%s.%s" media-type="image/%s" isEmbeded="1"/></opf:manifest>' % (bin_id, bin_id, ext, ext))
            pic = pic_xml(sample, oid.next(), bin_id, src, width, height)
            caps = caption_paras("fig", num, b["caption_ko"], b["caption_en"], ids)
            pic_para = para(0, ids["p_figure"], '<hp:run charPrIDRef="8">%s<hp:t/></hp:run>' % pic)
            if num == 1:
                # full-width figure at the page bottom so it cannot collide with a page-top table
                place_float(b["id"], table_xml(oid.next(), [FULL_W], [[(0, 1, pic_para + caps, 1, "TOP")]],
                                                floating=LAYOUT.get("valign", {}).get("F1", "BOTTOM"), border_out=1))
            elif b["id"] in LAYOUT.get("keep_figure_captions", []):
                caps = caption_paras("fig", num, b["caption_ko"], b["caption_en"], ids, keep=True)
                pic_para = para(0, ids["p_figure_keep"], '<hp:run charPrIDRef="8">%s<hp:t/></hp:run>' % pic)
                back = LAYOUT.get("inline_before", {}).get(b["id"])
                if back:
                    # place the figure block before the k-th latest body paragraph of the same section
                    k = body_paras[-back]
                    out.insert(k, pic_para + caps)
                    for j in range(len(body_paras)):
                        if body_paras[j] >= k:
                            body_paras[j] += 1
                    log.setdefault("inline_before", {})[b["id"]] = back
                else:
                    out.append(pic_para + caps)
                log["kept_figure_captions"] = log.get("kept_figure_captions", 0) + 1
            else:
                out.append(pic_para + caps)
    assert not pending_float, "float without following paragraph"
    # references
    out.append(para(2, 4, run(31, "REFERENCES")))
    for r in blocks["references"]:
        inner = run(33, "[%d]" % r["new"])
        first = True
        for x in r["runs"]:
            txt = x["t"]
            # typographic quotes as in the template and guideline examples
            nq = txt.count('"')
            if nq:
                log["ref_quotes_curled"] = log.get("ref_quotes_curled", 0) + nq
                parts = txt.split('"')
                txt = parts[0] + "".join(("“" if k % 2 == 0 else "”") + seg for k, seg in enumerate(parts[1:]))
            if LAYOUT.get("url_break_hints"):
                # allow line breaks after "/" in URLs (U+200B, invisible) so "Available:" is not stranded
                def _hint(m):
                    u = m.group(0)
                    return u[:8] + u[8:].replace("/", "/" + chr(0x200B))
                txt, nu = re.subn(r"https?://\S+", _hint, txt)
                log["url_break_hints"] = log.get("url_break_hints", 0) + nu
            if first:
                txt = " " + txt.lstrip()
                first = False
            inner += run(54 if x["k"] == "i" else 8, txt)
        out.append(para(21, ids["p_ref"], inner))
    s = s + "".join(out) + "</hs:sec>"
    # drop cached line layouts so HWP reflows the replaced head-block text
    s, n = re.subn(r"<hp:linesegarray>.*?</hp:linesegarray>", "", s, flags=re.S)
    log["linesegarrays_dropped"] = n
    log["figures"] = figs
    log["paragraphs_generated"] = len(out)
    open(hp, "w", encoding="utf-8").write(h)
    open(sp, "w", encoding="utf-8").write(s)
    open(hpf_p, "w", encoding="utf-8").write(hpf)
    # strip the template preview (it shows the template's sample text)
    for pv in ("Preview/PrvText.txt",):
        p = os.path.join(work, pv)
        if os.path.exists(p):
            open(p, "w", encoding="utf-8").write("")
    # zip: mimetype first, stored
    if os.path.exists(out_path):
        os.remove(out_path)
    with zipfile.ZipFile(out_path, "w") as z:
        z.write(os.path.join(work, "mimetype"), "mimetype", compress_type=zipfile.ZIP_STORED)
        for root, _d, files in os.walk(work):
            for fn in sorted(files):
                full = os.path.join(root, fn)
                arc = os.path.relpath(full, work).replace(os.sep, "/")
                if arc == "mimetype":
                    continue
                z.write(full, arc, compress_type=zipfile.ZIP_DEFLATED)
    log["out_sha256"] = hashlib.sha256(open(out_path, "rb").read()).hexdigest()
    json.dump(log, open(log_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(json.dumps({k: log[k] for k in ("header_added", "removed_author_lines", "removed_tail_has_bio",
                                          "paragraphs_generated")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
