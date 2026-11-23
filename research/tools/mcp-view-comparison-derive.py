"""Explicit local RGB derivative of the R09 grayscale originals (protocol section 4.3).

Usage: python tools/mcp-view-comparison-derive.py --in <dir of gray PNGs> --out <new dir> --manifest <out.json>

Each gray value g becomes (g, g, g). Saved with Pillow's PNG writer, compress_level=6, optimize=False, and no pnginfo,
dpi, icc_profile or exif, so the file holds only IHDR, IDAT and IEND. Every channel is checked against the gray plane
for every pixel before the manifest is written. Requires Pillow 12.3.0 (pin of tools/d03/requirements.txt).
"""
import argparse
import hashlib
import json
import os
import struct
import sys

import PIL
from PIL import features
from PIL import Image

PILLOW = "12.3.0"
SAVE = {"format": "PNG", "compress_level": 6, "optimize": False}


def chunks(data):
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("png_signature")
    out, at = [], 8
    while at < len(data):
        length, kind = struct.unpack(">I4s", data[at:at + 8])
        out.append((kind.decode("latin1"), data[at + 8:at + 8 + length]))
        at += 12 + length
        if kind == b"IEND":
            break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--manifest", required=True)
    a = ap.parse_args()
    if PIL.__version__ != PILLOW:
        sys.exit(f"Pillow {PIL.__version__} is not the pinned {PILLOW}")
    os.makedirs(a.out)  # must not exist yet
    images = {}
    for name in sorted(os.listdir(a.src)):
        if not name.endswith(".png"):
            sys.exit(f"unexpected file {name}")
        path = os.path.join(a.src, name)
        raw = open(path, "rb").read()
        ihdr = chunks(raw)[0][1]
        width, height, depth, ctype = struct.unpack(">IIBB", ihdr[:10])
        if depth != 8 or ctype != 0:
            sys.exit(f"investigation input changed: {name} bit depth {depth}, color type {ctype}")
        with Image.open(path) as im:
            im.load()
            if im.mode != "L":
                sys.exit(f"{name} decodes as {im.mode}, not L")
            gray = im.copy()
        rgb = Image.merge("RGB", (gray, gray, gray))
        dst = os.path.join(a.out, name)
        rgb.save(dst, **SAVE)
        data = open(dst, "rb").read()
        kinds = [k for k, _ in chunks(data)]
        if sorted(set(kinds)) != ["IDAT", "IEND", "IHDR"] or kinds[0] != "IHDR" or kinds[-1] != "IEND":
            sys.exit(f"{name}: unexpected chunks {kinds}")
        w2, h2, d2, c2 = struct.unpack(">IIBB", chunks(data)[0][1][:10])
        if (w2, h2, d2, c2) != (width, height, 8, 2) or chunks(data)[0][1][12] != 0:
            sys.exit(f"{name}: unexpected IHDR")
        with Image.open(dst) as back:
            back.load()
            r, g, b = back.split()
            plane = gray.tobytes()
            if not (r.tobytes() == plane and g.tobytes() == plane and b.tobytes() == plane):
                sys.exit(f"{name}: channel differs from the gray plane")
        images[name[:-4]] = {
            "originalSha256": hashlib.sha256(raw).hexdigest(),
            "rgbSha256": hashlib.sha256(data).hexdigest(),
            "width": width,
            "height": height,
            "originalBytes": len(raw),
            "rgbBytes": len(data),
            "rgbChunks": sorted(set(kinds)),
            "pixelCheck": "equal",
        }
    manifest = {
        "rule": "gray g -> RGB (g, g, g); no gamma, colour space or alpha change",
        "encoder": {"pillow": PIL.__version__, "pillowZlib": features.version("zlib"), "python": sys.version.split()[0], "save": SAVE, "metadata": "none (no pnginfo, dpi, icc_profile, exif)"},
        "hashBasis": "SHA-256 of raw file bytes",
        "images": images,
    }
    with open(a.manifest, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write("\n")
    print(f"derived {len(images)} RGB PNGs")


if __name__ == "__main__":
    main()
