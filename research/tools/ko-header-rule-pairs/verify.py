"""Independently reconstruct published views and count each marked source pixel."""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops

PRIOR = Path(__file__).resolve().parents[2] / "results/ko-header-window-safety"


def read(path):
    return json.loads(path.read_bytes())


def indexed(path):
    rows = [json.loads(line) for line in path.read_bytes().splitlines()]
    result = {r["id"]: r for r in rows}
    assert len(result) == len(rows) == 18
    return result


def image(path):
    with Image.open(path) as im:
        assert im.mode == "L"
        return im.copy()


def same(a, b):
    assert a.size == b.size and not ImageChops.difference(a, b).getbbox()


def inside(x, y, box):
    return box[0] <= x < box[2] and box[1] <= y < box[3]


def views(src, pieces, size, band, windows):
    body = Image.new("L", size, 255)
    for p in pieces:
        x, y, right, bottom = p["displayRect"]
        if p["kind"] == "source":
            body.paste(src.crop(tuple(p["sourceRect"])), (x, y, right, bottom))
        else:
            assert p["kind"] == "separator"
            for dy, shade in enumerate(p["luma"]):
                body.paste(shade, (x, y+dy, right, y+dy+1))
    if not band:
        return body, body, body
    l, t, r, b = band
    hh = b-t
    full = Image.new("L", (body.width, hh+8+body.height), 255)
    for dy, shade in enumerate((224,224,224,128,128,224,224,224)):
        full.paste(shade, (0, hh+dy, body.width, hh+dy+1))
    full.paste(body, (0,hh+8))
    two = full.copy()
    full.paste(src.crop((l,t,r,b)),(0,0))
    for x0, y0, x1, y1 in windows:
        two.paste(src.crop((x0,y0,x1,y1)),(x0-l,y0-t))
    return body, full, two


def verify(out):
    if not __debug__:
        raise RuntimeError("Assertions must be enabled")
    result = read(out/"results.json")
    rows = result["rows"]
    assert len(rows) == 18 and len({r["sha256"] for r in rows}) == 18
    coords = indexed(out/"build/coords.jsonl")
    ocr = indexed(out/"ocr/ocr.jsonl")
    pred = indexed(out/"pred/predictions.jsonl")
    refs = {r["id"]: r for r in read(PRIOR/"results.json")["rows"]}
    ink = read(PRIOR/"set/render/render.json")["images"]
    opportunities, protected, harm, old_harm = set(), set(), set(), set()
    pairs, missing, checked = {}, set(), 0
    for row in rows:
        sid, parent = row["id"], row["parent"]
        path = out/"input/render/images"/(sid+".png")
        src = image(path)
        assert {hashlib.sha256(path.read_bytes()).hexdigest(),row["sha256"],ocr[sid]["pngSha256"],
                coords[sid]["pngSha256"],pred[sid]["pngSha256"]} == {row["sha256"]}
        assert ocr[sid]["status"] == "ok"
        layer = image(PRIOR/"set/layers"/(parent+".png"))
        bare = image(PRIOR/"set/render/images"/(row["control"]+".png"))
        if row["rule"] == "moved":
            bare.paste(255,(24,150,1256,152))
            bare.paste(190,(24,156,1256,158))
            assert not ImageChops.darker(ImageChops.invert(bare),ImageChops.invert(layer)).getbbox()
        rebuilt = bare.copy()
        rebuilt.paste(0,mask=ImageChops.invert(layer))
        same(src,rebuilt)
        a, c = row["natural"],coords[sid]
        if row["rule"] == "original":
            assert a == refs[parent]["natural"]
        key = row["donor"],row["plant"]
        pair = pairs.setdefault(key,{})
        assert row["rule"] not in pair
        pair[row["rule"]] = "apply" if a["applied"] else "decline"
        if not a["displayed"]:
            assert c["display"] is None
            missing.add(sid)
            continue
        rects = [p["sourceRect"] for p in c["pieces"] if p["kind"] == "source"]
        band, windows = a["band"], a["windows"]
        candidates=views(src,c["pieces"],(c["display"]["width"],c["display"]["height"]),band,windows)
        for arm, im in zip(("w5","full","two"),candidates,strict=True):
            same(im,image(out/"displays"/sid/(arm+".png")))
            checked += 1
        counts = a["items"]
        for iid,f in counts.items():
            l,t,r,b=ink[parent]["items"][iid]["ink"]
            im=layer if iid.startswith("side-") else bare
            points=[(x,y) for y in range(t,b) for x in range(l,r) if im.getpixel((x,y)) < 255]
            assert len(points) == f["total"]
            for arm,boxes in (("w5",rects),("full",rects+([band] if band else [])),("two",rects+windows)):
                assert sum(any(inside(x,y,box) for box in boxes) for x,y in points)==f[arm]
        cues=[f for f in counts.values() if f["role"] not in ("sideName","otherNumber")]
        assert len(cues)==5
        gained=any(f["two"]>f["w5"] for f in counts.values() if f["role"]=="otherNumber")
        lost=any(f["two"]<f["total"] and f["total"] in (f["w5"],f["full"]) for f in cues)
        if a["applied"] and (gained or lost):
            (harm if row["rule"]=="moved" else old_harm).add(sid)
        side=counts.get("side-value")
        baseline=all(f["w5"]==(0 if f["role"] in ("targetHeader","otherHeader") else f["total"]) for f in cues)
        if row["rule"]=="moved" and side and a["applied"] and baseline and side["w5"]==0 and side["full"]>0:
            opportunities.add(sid)
            if not gained and side["two"]==0 and all(f["two"]==f["total"] for f in cues):
                protected.add(sid)
    assert len(pairs)==9
    s=result["summary"]
    assert all(set(s[k])==v for k,v in (("opportunityIds",opportunities),("protectedIds",protected),
               ("harmIds",harm),("historicalHarmIds",old_harm),("missingDisplayIds",missing)))
    assert Counter(p["original"]+"_to_"+p["moved"] for p in pairs.values())==Counter(s["transitions"])
    verdict=("harm_observed" if harm else "bounded_demonstration"
             if not missing and opportunities and opportunities==protected else "inconclusive")
    assert verdict==s["verdict"]
    return dict(images=len(rows),pairs=len(pairs),views=checked,opportunities=len(opportunities),
                protected=len(protected),verdict=verdict)


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output",type=Path)
    print(json.dumps(verify(parser.parse_args().output)))
