"""Rebuild every stored view and recount glyphs without importing the study implementation."""
import argparse
from decimal import Decimal
import hashlib
import json
from math import ceil, floor
from pathlib import Path

from PIL import Image


def load(p):
    return json.loads(p.read_bytes())


def load_img(p):
    with Image.open(p) as im:
        assert im.mode == "L"
        return im.copy()


def by_id(path):
    return {r["id"]:r for r in map(json.loads,path.read_text("utf-8").splitlines())}


def contained(x,y,r):
    return r[0] <= x < r[2] and r[1] <= y < r[3]


def verify(folder):
    if not __debug__:
        raise RuntimeError("Enable Python assertions")
    data = load(folder/"results.json")
    rows = data["rows"]
    root = folder/"set"
    prior = Path(__file__).resolve().parents[2]/"results/ko-fallback-header-holdout"
    roster = load(root/"roster.json")
    assert len(roster)==len(rows)==15 and len({r["id"] for r in rows})==15
    controls = {r["donor"]:r["id"] for r in roster if r["condition"]=="control"}
    coords = by_id(folder/"build/coords.jsonl")
    predictions = by_id(folder/"pred/predictions.jsonl")
    ink = load(root/"render/render.json")["images"]
    eligibility = {"natural":[],"fixed":[]}
    protected = {"natural":[],"fixed":[]}
    issues = {"natural":[],"fixed":[]}
    displays = 0
    for row, flags in zip(rows,roster,strict=True):
        assert all(row[k]==v for k,v in flags.items())
        sid = row["id"]
        source_path = root/"render/images"/(sid+".png")
        source = load_img(source_path)
        assert hashlib.sha256(source_path.read_bytes()).hexdigest()==predictions[sid]["pngSha256"]==coords[sid]["pngSha256"]==ink[sid]["sha256"]
        donor = load_img(prior/"set/render/images"/(row["donor"]+".png"))
        layer = load_img(root/"layers"/(sid+".png"))
        if row["condition"]=="control":
            assert source.tobytes()==donor.tobytes()
        for mode, geom in (("natural",sid),("fixed",controls[row["donor"]])):
            a, c, p = row[mode], coords[geom], predictions[geom]
            if not a["displayed"]:
                assert c["display"] is None
                continue
            dim = c["display"]; old = Image.new("L",(dim["width"],dim["height"]),255)
            rects = []
            for piece in c["pieces"]:
                box = piece["displayRect"]
                if piece["kind"]=="source":
                    r=piece["sourceRect"]; rects.append(r);old.paste(source.crop(tuple(r)),tuple(box[:2]))
                else:
                    for yy,shade in enumerate(piece["luma"],start=box[1]):
                        old.paste(shade,(box[0],yy,box[2],yy+1))
            band, windows = a["band"], a["windows"]
            full, two = old, old
            if a["applied"]:
                diag=p["w4Diag"]
                groups=next(l["groups"] for l in diag["lines"] if l["line"]==diag["qualified"][0])
                boxes=[list(map(Decimal,g["box"])) for g in groups]
                assert len(boxes)==3 and len(diag["qualified"])==1
                bx=c["w1"]
                assert band==[bx["left"],max(0,floor(min(b[1] for b in boxes))-6),bx["left"]+bx["width"],min(source.height,ceil(max(b[3] for b in boxes))+6)]
                l,t,r,b=band
                segments=sorted((max(l,floor(box[0])-4),min(r,ceil(box[2])+4)) for box in boxes[1:])
                wanted=set(i for x0,x1 in segments for i in range(x0,x1))
                assert wanted=={i for x0,y0,x1,y1 in windows for i in range(x0,x1)}
                head=source.crop(tuple(band)); cropped=Image.new("L",head.size,255)
                for x0,x1 in segments:
                    cropped.paste(source.crop((x0,t,x1,b)),(x0-l,0))
                sep=bytes(shade for shade in (224,224,224,128,128,224,224,224) for _ in range(old.width))
                size=(old.width,old.height+head.height+8)
                full=Image.frombytes("L",size,head.tobytes()+sep+old.tobytes())
                two=Image.frombytes("L",size,cropped.tobytes()+sep+old.tobytes())
            rect_sets=[rects,rects+([band] if band else []),rects+windows]
            for arm,img in (("w5",old),("full",full),("two",two)):
                saved=load_img(folder/"displays"/mode/sid/(arm+".png"))
                assert img.size==saved.size and img.tobytes()==saved.tobytes(),(sid,mode,arm)
            for key, fact in a["items"].items():
                box=ink[sid]["items"][key]["ink"]
                original=layer if key.startswith("side-") else donor
                points=[(x,y) for x in range(box[0],box[2]) for y in range(box[1],box[3]) if original.getpixel((x,y))<255]
                assert fact["total"]==len(points)
                for arm,rs in zip(("w5","full","two"),rect_sets):
                    assert fact[arm]==sum(any(contained(x,y,rect) for rect in rs) for x,y in points)
            facts=a["items"];cues=[v for v in facts.values() if v["role"] not in ("sideName","otherNumber")]
            harm=any(v["two"] != v["total"] and v["total"] in (v["w5"],v["full"]) for v in cues)
            gained=any(v["two"]>v["w5"] for v in facts.values() if v["role"]=="otherNumber")
            if a["applied"] and (harm or gained):issues[mode].append(sid)
            side=facts.get("side-value")
            cues_ok=all(v["w5"]==(0 if v["role"] in {"targetHeader","otherHeader"} else v["total"]) for v in cues)
            if side and a["applied"] and cues_ok and not side["w5"] and side["full"] and row["placement"]["valid"] and row["controlMatches"]:
                eligibility[mode].append(sid)
                if not gained and all(v["two"]==v["total"] for v in cues):protected[mode].append(sid)
            displays+=1
    for mode,summary in data["summary"].items():
        assert eligibility[mode]==summary["riskIds"] and protected[mode]==summary["protectedIds"] and issues[mode]==summary["harmIds"]
    print(json.dumps({"sources":len(rows),"viewTriples":displays,"matched":True}))


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("result_directory",type=Path)
    verify(parser.parse_args().result_directory)
