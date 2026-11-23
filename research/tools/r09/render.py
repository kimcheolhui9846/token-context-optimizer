"""R09 renderer: draws the design pages with one pinned font and records the actual ink box of every text item.

Usage: python render.py --design <design.json> --font <NotoSansKR-VF.ttf> --out <dir> [--review <pairId> ...]

Writes <out>/images/*.png, <out>/gold.json (gold parts per image, evaluation only), <out>/render.json (ink boxes of
all items, font and library versions) and <out>/render-check.json (overlap, clipping, cell and glyph checks).
Exits 1 when any check fails. The font file is hashed and loaded from the hashed bytes, so the recorded hash is the
file actually used. The font itself is never copied into the output.
"""
import argparse
import hashlib
import io
import json
import sys
from pathlib import Path

import PIL
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont, features

PAD_X = 12


def load_font(font_bytes, size, weight):
    font = ImageFont.truetype(io.BytesIO(font_bytes), size, layout_engine=ImageFont.Layout.BASIC)
    axes = [{k: (v.decode() if isinstance(v, bytes) else v) for k, v in a.items()} for a in font.get_variation_axes()]
    font.set_variation_by_axes([weight])
    return font, axes


def overlaps(a, b):
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def inside(inner, outer):
    return inner[0] >= outer[0] and inner[1] >= outer[1] and inner[2] <= outer[2] and inner[3] <= outer[3]


def render_image(spec, fonts, cmap):
    w, h = spec["page"]["width"], spec["page"]["height"]
    canvas = Image.new("L", (w, h), 255)
    draw = ImageDraw.Draw(canvas)
    for r in spec.get("rules", []):
        draw.rectangle([r[0], r[1], r[2] - 1, r[3] - 1], fill=190)
    problems = []
    inks = {}
    for it in spec["items"]:
        missing = sorted({ch for ch in it["text"] if not ch.isspace() and ord(ch) not in cmap})
        if missing:
            problems.append(f"{it['id']}: no glyph for {missing}")
        x0, y0, x1, y1 = it["cell"]
        layer = Image.new("L", (w, h), 0)
        ImageDraw.Draw(layer).text((x0 + PAD_X, (y0 + y1) / 2), it["text"], font=fonts[it["size"]], fill=255, anchor="lm")
        box = layer.getbbox()
        if box is None:
            problems.append(f"{it['id']}: no ink")
            continue
        ink = list(box)  # Pillow getbbox is half-open: [left, top, right, bottom)
        inks[it["id"]] = ink
        if not inside(ink, it["cell"]):
            problems.append(f"{it['id']}: ink {ink} outside cell {it['cell']}")
        if not inside(ink, [0, 0, w, h]):
            problems.append(f"{it['id']}: ink clipped by page")
        canvas.paste(0, mask=layer)
    ids = list(inks)
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            if overlaps(inks[a], inks[b]):
                problems.append(f"ink overlap {a} {b}")
        for r in spec.get("rules", []):
            if overlaps(inks[a], r):
                problems.append(f"{a}: ink touches rule {r}")
    cells = [it["cell"] for it in spec["items"]]
    for i in range(len(cells)):
        for j in range(i + 1, len(cells)):
            if overlaps(cells[i], cells[j]):
                problems.append(f"cell overlap {spec['items'][i]['id']} {spec['items'][j]['id']}")
    return canvas, inks, problems


def review_sheet(images, gold, out_path):
    """Side-by-side EN | KO page with gold boxes outlined, for the author's visual comparison. Not a selector input."""
    pages = [im.convert("RGB") for im, _ in images]
    w = sum(p.width for p in pages) + 20
    h = max(p.height for p in pages)
    sheet = Image.new("RGB", (w, h), (255, 255, 255))
    x = 0
    for p, (_, spec_id) in zip(pages, images):
        d = ImageDraw.Draw(p)
        for part in gold[spec_id]["parts"]:
            r = part["rect"]
            d.rectangle([r[0] - 2, r[1] - 2, r[2] + 1, r[3] + 1], outline=(220, 0, 0), width=2)
        sheet.paste(p, (x, 0))
        x += p.width + 20
    sheet.save(out_path, format="PNG")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--design", required=True)
    ap.add_argument("--font", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--review", nargs="*", default=[])
    args = ap.parse_args()
    design = json.loads(Path(args.design).read_text(encoding="utf-8"))
    font_bytes = Path(args.font).read_bytes()
    font_sha = hashlib.sha256(font_bytes).hexdigest()
    if font_sha != design["font"]["sha256"]:
        print(f"font sha256 {font_sha} != registered {design['font']['sha256']}", file=sys.stderr)
        return 1
    weight = design["font"]["weight"]
    body, axes = load_font(font_bytes, design["font"]["bodySize"], weight)
    title, _ = load_font(font_bytes, design["font"]["titleSize"], weight)
    fonts = {"body": body, "title": title}
    tt = TTFont(io.BytesIO(font_bytes))
    cmap = tt.getBestCmap()
    name = tt["name"]
    out = Path(args.out)
    (out / "images").mkdir(parents=True, exist_ok=True)
    gold, inks_all, checks, rendered = {}, {}, {}, {}
    failed = 0
    for spec in design["images"]:
        canvas, inks, problems = render_image(spec, fonts, cmap)
        path = out / "images" / spec["file"]
        canvas.save(path, format="PNG", optimize=False, compress_level=9)
        data = path.read_bytes()
        gold[spec["id"]] = {
            "page": spec["page"],
            "answer": spec["answer"],
            "parts": [{"item": i, "role": next(t["role"] for t in spec["items"] if t["id"] == i), "rect": inks[i], "size": [inks[i][2] - inks[i][0], inks[i][3] - inks[i][1]]} for i in spec["goldItems"] if i in inks],
        }
        inks_all[spec["id"]] = {"file": spec["file"], "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), "items": {i: {"role": next(t["role"] for t in spec["items"] if t["id"] == i), "ink": r} for i, r in inks.items()}}
        checks[spec["id"]] = problems
        rendered[spec["id"]] = canvas
        failed += bool(problems)
    meta = {
        "design": design["version"],
        "set": design["set"],
        "font": {"file": design["font"]["file"], "sha256": font_sha, "family": name.getDebugName(1), "version": name.getDebugName(5), "license": name.getDebugName(13)[:60] if name.getDebugName(13) else None, "axes": axes, "weight": weight, "sizes": {"body": design["font"]["bodySize"], "title": design["font"]["titleSize"]}},
        "renderer": {"pillow": PIL.__version__, "freetype": features.version("freetype2"), "raqm": features.check("raqm"), "layout": "BASIC", "python": sys.version.split()[0]},
    }
    (out / "gold.json").write_text(json.dumps({**meta, "gold": gold}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    (out / "render.json").write_text(json.dumps({**meta, "images": inks_all}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    (out / "render-check.json").write_text(json.dumps({**meta, "failedImages": failed, "problems": checks}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")
    for pair in args.review:
        (out / "review").mkdir(exist_ok=True)
        ids = [f"{pair}-en", f"{pair}-ko"]
        review_sheet([(rendered[i], i) for i in ids], gold, out / "review" / f"{pair}.png")
    print(json.dumps({"images": len(design["images"]), "failedImages": failed, "font": meta["font"]["version"]}))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
