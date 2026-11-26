"""Score an already frozen display decision against separate renderer annotations."""
from collections import Counter
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops

from candidate import compose, decide

ROLES = {"targetHeader": "targetHeaderItem", "otherHeader": "compHeaderItem",
         "anchor": "anchorItem", "value": "valueItem", "otherValue": "compValueItem"}
SEP = [224, 224, 224, 128, 128, 224, 224, 224]


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read(path):
    return json.loads(path.read_bytes())


def indexed(path):
    rows = [json.loads(line) for line in path.read_text("utf-8").splitlines()]
    result = {row["id"]: row for row in rows}
    if len(rows) != len(result):
        raise ValueError("duplicate source identity")
    return result


def mask_of(size, rects):
    mask = Image.new("L", size, 0)
    for rect in rects:
        x0, y0, x1, y1 = rect
        if not (0 <= x0 < x1 <= size[0] and 0 <= y0 < y1 <= size[1]):
            raise ValueError("source rectangle outside image")
        mask.paste(255, (x0, y0, x1, y1))
    return mask


def count(image, box, mask=None):
    tile = image.crop(tuple(box))
    return sum(tile.histogram(mask.crop(tuple(box)) if mask is not None else None)[:-1])


def paint(parts, src, size):
    output = Image.new("L", size, 255)
    for part in parts:
        bounds = part["displayRect"]
        if part["kind"] == "source":
            tile = src.crop(tuple(part["sourceRect"]))
            if tile.size != (bounds[2] - bounds[0], bounds[3] - bounds[1]):
                raise ValueError("invalid pixel map")
            output.paste(tile, tuple(bounds[:2]))
        else:
            if part["kind"] != "separator" or len(part["luma"]) != bounds[3] - bounds[1]:
                raise ValueError("invalid separator")
            for i, g in enumerate(part["luma"], bounds[1]):
                output.paste(g, (bounds[0], i, bounds[2], i + 1))
    return output


def measure(output):
    data, build, pred_dir = output / "set", output / "build", output / "pred"
    spec = {d["id"]: d for d in read(data / "design.json")["images"]}
    ink = read(data / "render/render.json")["images"]
    roster = read(data / "roster.json")
    coords, preds = indexed(build / "coords.jsonl"), indexed(pred_dir / "predictions.jsonl")
    manifest = read(build / "manifest.json")["outputs"]
    keys = {r["id"] for r in roster}
    if len(roster) != 18 or len(keys) != 18 or not all(set(m) == keys for m in [spec, ink, coords, preds, manifest["w5"]]):
        raise ValueError("incomplete 18-source join")
    newdir = output / "w6"
    newdir.mkdir()
    results = []
    for record in roster:
        sid = record["id"]
        page = spec[sid]
        geometry, prediction = coords[sid], preds[sid]
        srcp = data / "render/images" / page["file"]
        if sha(srcp.read_bytes()) != ink[sid]["sha256"] or geometry["pngSha256"] != ink[sid]["sha256"] or prediction["pngSha256"] != ink[sid]["sha256"]:
            raise ValueError("source hash mismatch")
        with Image.open(srcp) as handle:
            source = handle.copy()
        if source.mode != "L":
            raise ValueError("source must use opaque grayscale pixels")
        # Decision takes the upstream selector outputs only, before scoring metadata is consulted.
        decision = decide({k: v for k, v in prediction.items() if k != "id"},
                          {k: v for k, v in geometry.items() if k != "id"})
        if decision["reason"] == "invalid_provenance":
            raise ValueError("invalid fallback provenance")
        row = {**record, "baselineReason": geometry["w5Reason"], "state": prediction["state"],
               "applied": decision["applied"], "reason": decision["reason"],
               "candidateBand": decision["candidateBand"], "headerRect": decision["headerRect"]}
        row["ocrQualifiedLines"] = (prediction.get("w4Diag") or {}).get("qualified")
        boxes = ink[sid]["items"]
        if record["sidecar"]:
            diag = prediction.get("w4Diag") or {}
            row["sideLabelDiagnosticLines"] = [line["line"] for line in diag.get("lines") or []
                                                if any("별관" in str(g["text"]).replace(" ", "") for g in line.get("groups") or [])]
            row["sidecarInk"] = boxes["extra-value"]["ink"]
        if geometry["display"] is None:
            if decision["applied"] or manifest["w5"][sid] is not None:
                raise ValueError("upstream no-display must be preserved")
            row.update({"displayed": False, "opportunity": False, "recovered": False,
                        "unsafeApplication": False, "lostFullCues": [], "incrementalOther": [],
                        "newOtherPixels": 0, "areaDeltaPixels": 0, "stressIntersectsApplied": False,
                        "sidecarInW1X": None, "sidecarBandInk": None})
            results.append(row)
            continue
        info = manifest["w5"][sid]
        bp = build / info["file"]
        if sha(bp.read_bytes()) != info["sha256"]:
            raise ValueError("W5 PNG hash mismatch")
        with Image.open(bp) as handle:
            old = handle.copy()
        if old.mode != "L" or old.size != (info["width"], info["height"]) or sha(old.tobytes()) != info["pixelSha256"]:
            raise ValueError("unexpected baseline decode")
        if paint(geometry["pieces"], source, old.size).tobytes() != old.tobytes():
            raise ValueError("W5 source-map replay mismatch")
        image = compose(source, old, decision)
        extra = decision["headerRect"]
        old_rects = [p["sourceRect"] for p in geometry["pieces"] if p["kind"] == "source"]
        new_rects = old_rects + ([extra] if decision["applied"] else [])
        if decision["applied"]:
            h = extra[3] - extra[1]
            expected = Image.new("L", (old.width, h + 8 + old.height))
            expected.paste(source.crop(tuple(extra)), (0, 0))
            for off, g in enumerate(SEP, h):
                expected.paste(g, (0, off, old.width, off+1))
            expected.paste(old, (0, h+8))
        else:
            expected = old
        if image.mode != "L" or image.size != expected.size or image.tobytes() != expected.tobytes():
            raise ValueError("W6 pixel reconstruction failed")
        wp = newdir / (sid + ".png")
        if decision["applied"]:
            image.save(wp, format="PNG", compress_level=9)
        else:
            wp.write_bytes(bp.read_bytes())
        m0, m1 = mask_of(source.size, old_rects), mask_of(source.size, new_rects)
        delta = ImageChops.subtract(m1, m0)
        marks = {}
        for role, key in ROLES.items():
            bbox = boxes[page[key]]["ink"]
            total = count(source, bbox)
            if total == 0:
                raise ValueError("renderer published an empty ink box")
            marks[role] = {"total": total, "w5": count(source, bbox, m0), "w6": count(source, bbox, m1)}
        def full(role, view):
            return marks[role][view] == marks[role]["total"]
        row_items = [it for it in page["items"] if it.get("record") != record["targetRow"]
                     and it["role"] in ("target_value", "comp_value", "other_record_value")]
        inc = []
        for it in row_items:
            box = boxes[it["id"]]["ink"]
            add = count(source, box, delta)
            if add:
                total = count(source, box)
                inc.append({"item": it["id"], "newInk": add,
                            "becameFull": count(source, box, m1) == total and count(source, box, m0) < total})
        opportunity = (record["condition"] == "unique" and geometry["w5Reason"] == "w4_not_applied"
                       and prediction["state"] == "matched" and prediction["w4From"] == "w1"
                       and all(marks[role]["w5"] == 0 for role in ("targetHeader","otherHeader"))
                       and all(full(role,"w5") for role in ("anchor","value","otherValue")))
        # A full correct match requires original semantic identity and same horizontal column alignment.
        items = {it["id"]: it for it in page["items"]}
        hids = [page["targetHeaderItem"], page["compHeaderItem"]]
        aligned = all(items[hi]["cell"][0] == items[vi]["cell"][0] for hi, vi in
                      zip(hids, [page["valueItem"], page["compValueItem"]]))
        correct = (record["condition"] == "unique" and items[hids[0]]["text"] == record["requestedField"]
                   and items[hids[1]]["text"] != record["requestedField"] and aligned
                   and all(full(role, "w6") for role in ROLES))
        candidate_band = decision["candidateBand"]
        side_box = row.get("sidecarInk")
        wx = geometry["w1"]
        side_x = count(source, side_box, mask_of(source.size, [[wx["left"], 0, wx["left"]+wx["width"], source.height]])) if side_box else None
        side_band = count(source, side_box, mask_of(source.size,[candidate_band])) if side_box and candidate_band else None
        row.update({"displayed": True, "marks": marks, "opportunity": opportunity, "recovered": opportunity and correct,
                    "unsafeApplication": decision["applied"] and not correct,
                    "lostFullCues": [r for r in ROLES if full(r,"w5") and not full(r,"w6")],
                    "incrementalOther": inc, "newOtherPixels": sum(it["newInk"] for it in inc),
                    "areaDeltaPixels": image.width*image.height-old.width*old.height,
                    "w5PixelSha256": info["pixelSha256"], "w6PixelSha256": sha(image.tobytes()),
                    "w6PngSha256": sha(wp.read_bytes()), "sidecarInW1X": side_x,
                    "sidecarBandInk": side_band,
                    "stressIntersectsApplied": bool(decision["applied"] and side_band)})
        results.append(row)
    return results


def summarize(rows):
    n = len(rows)
    applied = [r for r in rows if r["applied"]]
    s = {"pages": n, "unique": sum(r["condition"] == "unique" for r in rows),
         "displayed": sum(r["displayed"] for r in rows), "applied": len(applied),
         "eligibleOpportunities": sum(r["opportunity"] for r in rows), "recovered": sum(r["recovered"] for r in rows),
         "negativeApplications": sum(r["condition"] != "unique" for r in applied),
         "unsafeApplications": sum(r["unsafeApplication"] for r in rows),
         "lostFullCues": sum(len(r["lostFullCues"]) for r in rows),
         "otherRecordsExposedPages": sum(r["newOtherPixels"] > 0 for r in rows),
         "otherValueItemsGainedInk": sum(len(r["incrementalOther"]) for r in rows),
         "otherValueItemsNewlyFull": sum(it["becameFull"] for r in rows for it in r["incrementalOther"]),
         "otherValueNewInkPixels": sum(r["newOtherPixels"] for r in rows),
         "sidecarPages": sum(r["sidecar"] for r in rows),
         "stressRealized": sum(r["stressIntersectsApplied"] for r in rows),
         "reasons": dict(Counter(r["reason"] for r in rows))}
    area = sum(r["areaDeltaPixels"] for r in rows)*100/(1280*960)
    s["meanAreaDeltaPp"] = area/n
    s["appliedMeanAreaDeltaPp"] = area/len(applied) if applied else None
    if s["unsafeApplications"] or s["lostFullCues"] or s["otherValueNewInkPixels"]:
        s["verdict"] = "safety_failure"
    elif not s["eligibleOpportunities"]:
        s["verdict"] = "no_opportunity"
    elif s["eligibleOpportunities"] != s["recovered"]:
        s["verdict"] = "missed_recovery"
    elif not s["stressRealized"] or n != s["displayed"]:
        s["verdict"] = "inconclusive"
    else:
        s["verdict"] = "bounded_positive"
    return s
