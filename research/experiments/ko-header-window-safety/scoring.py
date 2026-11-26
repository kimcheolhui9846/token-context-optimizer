"""Pixel scoring and geometry checks for the three paired donor families."""
import hashlib
from pathlib import Path
import sys

from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "ko-fallback-header-holdout"))
from assess import ROLES, count, mask_of, paint
from candidate import compose, decide
from windows import compose_windows, window_rects


def digest(data):
    return hashlib.sha256(data).hexdigest()


def read_image(path):
    with Image.open(path) as image:
        if image.mode != "L":
            raise ValueError("An input is not opaque grayscale")
        return image.copy()


def geometry(image, original, sheet, marks, layer, planted, prior_pred, prior_coord):
    """Checks use preregistered donor geometry before running OCR on new sources."""
    if not planted:
        return {"valid": image.tobytes() == original.tobytes(), "issues": []}
    issues = []
    diff = ImageChops.difference(image, original)
    cells = {it["id"]: it["cell"] for it in sheet["items"] if it["id"].startswith("side-")}
    if ImageChops.subtract(diff, mask_of(image.size, list(cells.values()))).getbbox():
        issues.append("change_outside_planted_cells")
    for key, rect in cells.items():
        box = marks[key]["ink"]
        if not (0 <= rect[0] <= box[0] < box[2] <= rect[2] <= image.width
                and 0 <= rect[1] <= box[1] < box[3] <= rect[3] <= image.height):
            issues.append("outside_cell_or_page")
    glyph = ImageChops.invert(layer).point(lambda p: 255 if p else 0)
    overlap = count(original, (0, 0, *image.size), glyph)
    if overlap:
        issues.append("original_ink_under_new_glyph")
    decision = decide(prior_pred, prior_coord)
    band = decision["headerRect"]
    windows = window_rects(decision, prior_pred["w4Diag"])
    old = [p["sourceRect"] for p in prior_coord["pieces"] if p["kind"] == "source"]
    def visible(rects):
        return count(layer, marks["side-value"]["ink"], mask_of(image.size, rects))
    in_old, in_band, in_windows = visible(old), visible([band]), visible(windows)
    if in_old or not in_band or in_windows:
        issues.append("outside_registered_stress_geometry")
    return {"valid": not issues, "issues": issues, "originalInkUnderGlyph": overlap,
            "valueInRegisteredW5": in_old, "valueInRegisteredBand": in_band,
            "valueInRegisteredWindows": in_windows}


def compare(src, donor, plant_layer, sheet, inks, pred, coords, outdir, expected_old=None):
    decision = decide(pred, coords)
    result = {"w5Reason": coords["w5Reason"], "decision": decision["reason"],
              "displayed": coords["display"] is not None, "applied": decision["applied"]}
    if not result["displayed"]:
        return result
    dim = coords["display"]
    old = paint(coords["pieces"], src, (dim["width"], dim["height"]))
    if expected_old is not None and read_image(expected_old).tobytes() != old.tobytes():
        raise ValueError("Stored W5 differs from the original-coordinate reconstruction")
    band = decision["headerRect"]
    windows = window_rects(decision, pred.get("w4Diag"))
    full = compose(src, old, decision)
    two = compose_windows(full, old, decision, windows)
    if full.size != two.size:
        raise ValueError("Display size changed")
    body_top = full.height - old.height
    for image in (two, full):
        if image.crop((0, body_top, old.width, image.height)).tobytes() != old.tobytes():
            raise ValueError("Body changed")
    if band:
        h = band[3] - band[1]
        if full.crop((0,h,old.width,body_top)).tobytes() != two.crop((0,h,old.width,body_top)).tobytes():
            raise ValueError("Separator changed")
    outdir.mkdir(parents=True, exist_ok=True)
    for label, image in (("w5", old), ("full", full), ("two", two)):
        image.save(outdir / (label + ".png"), compress_level=9)
    body = [p["sourceRect"] for p in coords["pieces"] if p["kind"] == "source"]
    masks = [mask_of(src.size, rs) for rs in (body, body + ([band] if band else []), body + windows)]
    target_row = next(i["record"] for i in sheet["items"] if i["id"] == sheet["anchorItem"])
    roles = {sheet[ref]: role for role,ref in ROLES.items()}
    facts = {}
    for item in sheet["items"]:
        iid = item["id"]
        unrelated = item.get("record") != target_row and item["role"] in ("comp_value", "target_value", "other_record_value")
        if iid not in roles and not unrelated and iid != "side-name":
            continue
        box = inks[iid]["ink"]
        original = plant_layer if iid.startswith("side-") else donor
        total = count(original, box)
        if not total:
            raise ValueError("empty glyph")
        facts[iid] = {"role": roles.get(iid, "sideName" if iid == "side-name" else "otherNumber"),
                      "total": total, **{key: count(original,box,mask) for key,mask in zip(("w5","full","two"),masks)}}
    cues = [v for v in facts.values() if v["role"] in ROLES]
    result.update(band=band, windows=windows, items=facts, bodyTop=body_top,
                  bothTitlesGoneAndBodyIntact=all(v["w5"] == (0 if v["role"] in ("targetHeader","otherHeader") else v["total"]) for v in cues),
                  fiveComplete={arm:all(v[arm]==v["total"] for v in cues) for arm in ("full","two")},
                  lostCues=[v["role"] for v in cues if v["two"]<v["total"] and (v["w5"]==v["total"] or v["full"]==v["total"])],
                  numberGains={arm:{k:v[arm]-v["w5"] for k,v in facts.items() if v["role"]=="otherNumber" and v[arm]>v["w5"]}
                               for arm in ("full","two")})
    return result


def summarize(rows, mode):
    records = [(r,r[mode]) for r in rows]
    useful = [(r,a) for r,a in records if a["displayed"] and a["applied"]]
    risk = [(r,a) for r,a in useful if r["placement"]["valid"] and r["controlMatches"] and r["condition"]!="control"
            and a["bothTitlesGoneAndBodyIntact"] and a["items"]["side-value"]["w5"]==0 and a["items"]["side-value"]["full"]>0]
    safer = [r["id"] for r,a in risk if a["fiveComplete"]["two"] and not a["numberGains"]["two"]]
    harm = [r["id"] for r,a in useful if a["lostCues"] or a["numberGains"]["two"]]
    incomplete = any(not r["placement"]["valid"] or not r["controlMatches"] or not a["displayed"] for r,a in records)
    verdict = ("harm_observed" if harm else "inconclusive" if not risk or incomplete else
               "bounded_demonstration" if len(safer)==len(risk) else "inconclusive")
    return {"pages":len(rows), "donors":len({r["donor"] for r in rows}), "applied":len(useful),
            "riskIds":[r["id"] for r,a in risk], "protectedIds":safer, "harmIds":harm,
            "invalidPlacementIds":[r["id"] for r in rows if not r["placement"]["valid"]],
            "verdict":verdict}
