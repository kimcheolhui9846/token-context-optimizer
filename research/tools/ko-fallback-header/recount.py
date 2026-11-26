"""Independently reconstruct paired displays from the published source and count ink."""
import argparse
from collections import Counter
from decimal import Decimal
import hashlib
import json
import math
from pathlib import Path
import unicodedata

from PIL import Image


def load(path):
    return json.loads(path.read_bytes())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inside(x, y, rect):
    return rect[0] <= x < rect[2] and rect[1] <= y < rect[3]


def ink_points(image, rect):
    x0, y0, x1, y1 = rect
    tile = image.crop(tuple(rect))
    return [(x0+x, y0+y) for y in range(tile.height) for x in range(tile.width)
            if tile.getpixel((x,y)) < 255]


def restore_baseline(src, coords):
    if coords["display"] is None:
        return None
    size = coords["display"]["width"], coords["display"]["height"]
    img = Image.new("L", size, 255)
    for piece in coords["pieces"]:
        x0, y0, x1, y1 = piece["displayRect"]
        if piece["kind"] == "source":
            img.paste(src.crop(tuple(piece["sourceRect"])), (x0,y0))
        else:
            for y, gray in enumerate(piece["luma"], start=y0):
                img.paste(gray, (x0,y,x1,y+1))
    return img


def squash(s):
    # All corpus labels are Korean strings. Unicode White_Space agrees with split() on this input.
    return "".join(unicodedata.normalize("NFKC", s).split())


def independent_band(pred, coord):
    if pred["state"] != "matched" or pred["w4From"] != "w1" or coord["w5Reason"] != "w4_not_applied":
        return None
    diag = pred.get("w4Diag") or {}
    good = [line for line in diag.get("lines") or [] if line["why"] == "eligible" and line["failure"] is None]
    if len(good) != 1:
        return None
    groups = good[0]["groups"]
    if len(groups) != 3:
        return None
    requested = squash(diag["question"]["field"])
    hits = [squash(g["text"]) == requested for g in groups[1:]]
    if sum(hits) != 1:
        return None
    w = coord["w1"]
    left,right = w["left"], w["left"] + w["width"]
    boxes = [list(map(Decimal,g["box"])) for g in groups]
    if any(b[0] < left or b[2] > right for b in boxes):
        return None
    top = max(0, math.floor(min(b[1] for b in boxes))-6)
    bottom = min(coord["page"]["height"], math.ceil(max(b[3] for b in boxes))+6)
    return [left,top,right,bottom] if bottom <= w["top"] else None


def recount(root):
    if not __debug__:
        raise RuntimeError("Run the verifier with Python assertions enabled")
    report = load(root/"measures.json")
    rows = report["rows"]
    roster = load(root/"set/roster.json")
    designs = {pg["id"]: pg for pg in load(root/"set/design.json")["images"]}
    ink = load(root/"set/render/render.json")["images"]
    byid = lambda p: {r["id"]:r for r in map(json.loads, (root/p).read_text("utf-8").splitlines())}
    coords, preds = byid("build/coords.jsonl"), byid("pred/predictions.jsonl")
    if len(rows) != 18 or len(roster) != 18 or len(set(r["id"] for r in rows)) != 18:
        raise ValueError("incomplete data")
    facts = Counter()
    reason_counts = Counter()
    for row, rec in zip(rows, roster, strict=True):
        sid = rec["id"]
        spec, co = designs[sid], coords[sid]
        assert all(row[k] == v for k,v in rec.items())
        assert row["baselineReason"] == co["w5Reason"] and row["state"] == preds[sid]["state"]
        reason_counts[row["reason"]] += 1
        raw_src = (root/"set/render/images"/spec["file"]).read_bytes()
        assert digest(raw_src) == ink[sid]["sha256"] == preds[sid]["pngSha256"] == co["pngSha256"]
        with Image.open(root/"set/render/images"/spec["file"]) as opened:
            src = opened.copy()
        old = restore_baseline(src,co)
        band = independent_band(preds[sid],co)
        assert band == row["headerRect"] and bool(band) == row["applied"]
        facts["pages"] += 1
        facts["unique"] += int(rec["condition"]=="unique")
        facts["sidecarPages"] += int(rec["sidecar"])
        if old is None:
            assert not row["displayed"]
            continue
        facts["displayed"] += 1
        old_rects = [p["sourceRect"] for p in co["pieces"] if p["kind"]=="source"]
        old_path = root/"build/w5"/spec["file"]
        with Image.open(old_path) as stored:
            assert stored.mode == old.mode and stored.size == old.size and stored.tobytes() == old.tobytes()
        assert digest(old.tobytes()) == row["w5PixelSha256"]
        if band:
            strip=src.crop(tuple(band))
            boundary=bytes(gray for gray in [224,224,224,128,128,224,224,224] for _ in range(old.width))
            expect=strip.tobytes()+boundary+old.tobytes()
            size=(old.width, old.height+8+strip.height)
        else:
            expect,size=old.tobytes(),old.size
        candidate=root/"w6"/spec["file"]
        if not band:
            assert candidate.read_bytes() == old_path.read_bytes()
        with Image.open(candidate) as actual:
            assert actual.mode=="L" and actual.size==size and actual.tobytes()==expect
        assert digest(expect)==row["w6PixelSha256"] and digest(candidate.read_bytes())==row["w6PngSha256"]
        new_rects = old_rects + ([band] if band else [])
        m = {}
        n_other, n_items, n_full = 0,0,0
        extra_points = []
        gained_items = []
        roles={spec[key]:role for key,role in [("targetHeaderItem","targetHeader"),("compHeaderItem","otherHeader"),
               ("valueItem","value"),("compValueItem","otherValue"),("anchorItem","anchor")]}
        for it in spec["items"]:
            iid=it["id"]
            other = it.get("record")!=rec["targetRow"] and it["role"] in ("target_value","comp_value","other_record_value")
            if iid not in roles and not other:
                continue
            pts=ink_points(src,ink[sid]["items"][iid]["ink"])
            n0=sum(any(inside(x,y,b) for b in old_rects) for x,y in pts)
            n1=sum(any(inside(x,y,b) for b in new_rects) for x,y in pts)
            if iid in roles:
                m[roles[iid]]={"total":len(pts),"w5":n0,"w6":n1}
            if other and n1>n0:
                gained_items.append({"item": iid, "newInk": n1-n0, "becameFull": n1 == len(pts)})
                n_other+=n1-n0
                n_items+=1
                n_full+=int(n1==len(pts))
            if iid=="extra-value":
                extra_points=pts
        assert m == row["marks"] and n_other == row["newOtherPixels"]
        assert gained_items == row["incrementalOther"]
        lost = {k for k, v in m.items() if v["w5"] == v["total"] and v["w6"] < v["total"]}
        assert lost == set(row["lostFullCues"])
        w1 = co["w1"]
        x_ink = sum(w1["left"] <= x < w1["left"] + w1["width"] for x, _ in extra_points)
        assert row["sidecarInW1X"] == (x_ink if rec["sidecar"] else None)
        area_delta = size[0] * size[1] - old.width * old.height
        assert area_delta == row["areaDeltaPixels"]
        intersects = bool(band) and any(inside(x,y,band) for x,y in extra_points)
        assert intersects == row["stressIntersectsApplied"]
        counts_full=lambda k: all(d[k]==d["total"] for d in m.values())
        opportunity=(rec["condition"]=="unique" and co["w5Reason"]=="w4_not_applied"
                     and preds[sid]["state"] == "matched" and preds[sid]["w4From"] == "w1"
                     and all(m[s]["w5"]==0 for s in ("targetHeader","otherHeader"))
                     and all(m[s]["w5"]==m[s]["total"] for s in ("anchor","value","otherValue")))
        items = {it["id"]: it for it in spec["items"]}
        headers = [items[spec[k]] for k in ("targetHeaderItem", "compHeaderItem")]
        values = [items[spec[k]] for k in ("valueItem", "compValueItem")]
        aligned = all(h["cell"][0] == v["cell"][0] for h, v in zip(headers, values))
        correct = (rec["condition"] == "unique" and counts_full("w6") and aligned
                   and headers[0]["text"] == rec["requestedField"] != headers[1]["text"])
        assert row["unsafeApplication"] == (bool(band) and not correct)
        assert opportunity==row["opportunity"] and (opportunity and correct)==row["recovered"]
        facts.update({"applied":int(bool(band)),"eligibleOpportunities":int(opportunity),
                      "recovered":int(opportunity and correct),"unsafeApplications":int(bool(band) and not correct),
                      "negativeApplications":int(bool(band) and rec["condition"]!="unique"),
                      "otherRecordsExposedPages":int(n_other>0),"otherValueItemsGainedInk":n_items,
                      "otherValueItemsNewlyFull":n_full,"otherValueNewInkPixels":n_other,
                      "lostFullCues":sum(v["w5"]==v["total"] and v["w6"]!=v["total"] for v in m.values()),
                      "stressRealized":int(intersects),
                      "area":area_delta})
    summary=report["summary"]
    for k in summary:
        if k in ("reasons","verdict","meanAreaDeltaPp","appliedMeanAreaDeltaPp"):
            continue
        assert facts[k]==summary[k],k
    assert dict(reason_counts)==summary["reasons"]
    area=facts["area"]*100/(1280*960)
    assert math.isclose(area/facts["pages"],summary["meanAreaDeltaPp"])
    assert (math.isclose(area/facts["applied"],summary["appliedMeanAreaDeltaPp"])
            if facts["applied"] else summary["appliedMeanAreaDeltaPp"] is None)
    if facts["unsafeApplications"] or facts["lostFullCues"] or facts["otherValueNewInkPixels"]:
        verdict="safety_failure"
    elif not facts["eligibleOpportunities"]:
        verdict="no_opportunity"
    elif facts["eligibleOpportunities"]!=facts["recovered"]:
        verdict="missed_recovery"
    elif not facts["stressRealized"] or facts["displayed"]!=facts["pages"]:
        verdict="inconclusive"
    else:
        verdict="bounded_positive"
    assert verdict==summary["verdict"]
    print(json.dumps({"rows":len(rows),"displayPairs":facts["displayed"],"verdict":verdict,"passed":True}))


if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("result_directory",type=Path)
    recount(parser.parse_args().result_directory)
