"""W6 decision and composition for the Korean fallback-header study."""

from decimal import Decimal
from math import ceil, floor
import re
import unicodedata

from PIL import Image


_WHITE_SPACE = {
    *range(0x09, 0x0E), 0x20, 0x85, 0xA0, 0x1680, *range(0x2000, 0x200B),
    0x2028, 0x2029, 0x202F, 0x205F, 0x3000,
}
_DECIMAL = re.compile(r"-?[0-9]+(?:\.[0-9]+)?")
_SEPARATOR = (224, 224, 224, 128, 128, 224, 224, 224)


def _integers(values):
    return all(type(value) is int for value in values)


def _dims(value):
    if not isinstance(value, dict):
        return None
    width, height = value.get("width"), value.get("height")
    if _integers((width, height)) and width > 0 and height > 0:
        return width, height
    return None


def _crop_rect(value, page):
    if not isinstance(value, dict) or page is None:
        return None
    left, top, width, height = (value.get(key) for key in ("left", "top", "width", "height"))
    if (_integers((left, top, width, height))
            and 0 <= left < left + width <= page[0]
            and 0 <= top < top + height <= page[1]):
        return [left, top, left + width, top + height]
    return None


def _same_rect(value, expected):
    return isinstance(value, list) and _integers(value) and value == expected


def _exact_fallback(pred, coords, body, page):
    if (body is None or _dims(pred) != page or coords.get("w5Kind") != "w1"
            or pred.get("w4Reason") == "applied"):
        return False
    if any(_crop_rect(row.get(key), page) != body
           for row, key in ((coords, "w1"), (coords, "w4"), (pred, "w4"))):
        return False
    if any(coords.get(key) is not None for key in ("B", "H", "t", "b", "p")):
        return False
    left, top, right, bottom = body
    width, height = right - left, bottom - top
    display, pieces = coords.get("display"), coords.get("pieces")
    if (_dims(display) != (width, height) or display.keys() != {"width", "height"}
            or not isinstance(pieces, list) or len(pieces) != 1):
        return False
    piece = pieces[0]
    return (
        isinstance(piece, dict)
        and piece.keys() == {"kind", "sourceRect", "displayRect"}
        and piece["kind"] == "source"
        and _same_rect(piece["sourceRect"], body)
        and _same_rect(piece["displayRect"], [0, 0, width, height])
    )


def _qualified_groups(diag):
    if not isinstance(diag, dict):
        return None
    qualified, header, lines = (diag.get(key) for key in ("qualified", "header", "lines"))
    if (not isinstance(qualified, list) or len(qualified) != 1 or not _integers(qualified)
            or qualified[0] < 0 or not isinstance(header, dict) or not isinstance(lines, list)):
        return None
    line_id = header.get("line")
    if type(line_id) is not int or line_id != qualified[0]:
        return None
    matching_lines = [line for line in lines if isinstance(line, dict) and line.get("line") == line_id]
    if len(matching_lines) != 1:
        return None
    line = matching_lines[0]
    groups = line.get("groups")
    if (type(line["line"]) is not int or line.get("why") != "eligible"
            or line.get("failure") is not None or not isinstance(groups, list) or len(groups) != 3):
        return None
    return groups


def _candidate_band(groups, body, page):
    if groups is None or body is None:
        return None
    left, _, right, _ = body
    tops, bottoms = [], []
    for group in groups:
        box = group.get("box") if isinstance(group, dict) else None
        if (not isinstance(box, list) or len(box) != 4
                or not all(isinstance(part, str) and _DECIMAL.fullmatch(part) for part in box)):
            return None
        x0, y0, x1, y1 = map(Decimal, box)
        if not (left <= x0 < x1 <= right and 0 <= y0 < y1 <= page[1]):
            return None
        tops.append(y0)
        bottoms.append(y1)
    return [left, max(0, floor(min(tops)) - 6), right, min(page[1], ceil(max(bottoms)) + 6)]


def _normalize_label(value):
    if not isinstance(value, str):
        return ""
    return "".join(ch for ch in unicodedata.normalize("NFKC", value) if ord(ch) not in _WHITE_SPACE)


def _matches_field(diag, groups):
    header = diag["header"]
    target, comp, match = (header.get(key) for key in ("target", "comp", "match"))
    if (not _integers((target, comp)) or {target, comp} != {1, 2}
            or not isinstance(match, list) or len(match) != 2
            or not all(type(flag) is bool for flag in match)
            or not match[target - 1] or match[comp - 1]):
        return False
    question = diag.get("question")
    field = _normalize_label(question.get("field")) if isinstance(question, dict) else ""
    target_text = _normalize_label(groups[target].get("text"))
    comp_text = _normalize_label(groups[comp].get("text"))
    return bool(field and comp_text and field == target_text and field != comp_text)


def _decision(reason, band=None, *, applied=False):
    return {
        "applied": applied,
        "reason": reason,
        "headerRect": band.copy() if applied else None,
        "candidateBand": band,
    }


def decide(pred: dict, coords: dict) -> dict:
    """Return the W6 decision and any derivable source-space band."""
    if not isinstance(pred, dict) or not isinstance(coords, dict):
        return _decision("invalid_provenance")
    page = _dims(coords.get("page"))
    body = _crop_rect(pred.get("w1"), page)
    diag = pred.get("w4Diag")
    groups = _qualified_groups(diag)
    band = _candidate_band(groups, body, page)

    if pred.get("state") != "matched":
        return _decision("baseline_not_matched", band)
    if pred.get("w4From") != "w1" or coords.get("w5Reason") != "w4_not_applied":
        return _decision("baseline_not_w1_fallback", band)
    if not _exact_fallback(pred, coords, body, page):
        return _decision("invalid_provenance", band)
    if groups is None:
        return _decision("invalid_qualified_header")
    if band is None:
        return _decision("invalid_group_boxes")
    if not _matches_field(diag, groups):
        return _decision("header_field_mismatch", band)
    if band[3] > body[1]:
        return _decision("header_overlap", band)
    return _decision("applied", band, applied=True)


def compose(source: Image.Image, baseline: Image.Image, decision: dict) -> Image.Image:
    """Prepend the chosen header and separator to an existing grayscale display."""
    if not decision["applied"]:
        return baseline
    if any(image.mode != "L" or "transparency" in image.info for image in (source, baseline)):
        raise ValueError("W6 composition requires opaque L images")

    rect = decision.get("headerRect")
    if not isinstance(rect, list) or len(rect) != 4 or not _integers(rect):
        raise ValueError("W6 composition requires an integer headerRect")
    left, top, right, bottom = rect
    width, height = baseline.size
    if (not (0 <= left < right <= source.width and 0 <= top < bottom <= source.height)
            or right - left != width or height <= 0):
        raise ValueError("W6 headerRect must be in bounds and match the baseline width")

    header_height = bottom - top
    body_top = header_height + len(_SEPARATOR)
    output = Image.new("L", (width, body_top + height))
    output.paste(source.crop((left, top, right, bottom)), (0, 0))
    for y, shade in enumerate(_SEPARATOR, start=header_height):
        output.paste(shade, (0, y, width, y + 1))
    output.paste(baseline, (0, body_top))
    return output
