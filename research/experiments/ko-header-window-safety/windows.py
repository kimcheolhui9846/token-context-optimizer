"""Windowed variant of the #158 fallback-header display."""

from decimal import Decimal
from math import ceil, floor
import re

from PIL import Image


_SEPARATOR_HEIGHT = 8
_PADDING = 4
_DECIMAL = re.compile(r"-?[0-9]+(?:\.[0-9]+)?")


def _integer_rect(rect):
    return (
        isinstance(rect, (list, tuple))
        and len(rect) == 4
        and all(type(edge) is int for edge in rect)
        and 0 <= rect[0] < rect[2]
        and 0 <= rect[1] < rect[3]
    )


def _header_rect(decision):
    if decision["applied"] is not True or not _integer_rect(decision.get("headerRect")):
        raise ValueError("Applied decision requires a valid integer headerRect")
    return decision["headerRect"]


def _title_groups(diag):
    if not isinstance(diag, dict):
        raise ValueError("Applied decision requires header diagnostics")
    qualified, lines, header = (diag.get(key) for key in ("qualified", "lines", "header"))
    if (not isinstance(qualified, list) or len(qualified) != 1
            or type(qualified[0]) is not int or qualified[0] < 0
            or not isinstance(lines, list) or not isinstance(header, dict)):
        raise ValueError("Applied decision requires one qualified header line")

    line_id = qualified[0]
    matching = [line for line in lines if isinstance(line, dict) and line.get("line") == line_id]
    if len(matching) != 1 or type(matching[0]["line"]) is not int:
        raise ValueError("Qualified header line must appear exactly once")
    line = matching[0]
    groups = line.get("groups")
    if (line.get("why") != "eligible" or line.get("failure") is not None
            or not isinstance(groups, list) or len(groups) != 3
            or not all(isinstance(group, dict) for group in groups)):
        raise ValueError("Qualified header line must be eligible and have three groups")

    header_line, target, comp, match = (header.get(key) for key in ("line", "target", "comp", "match"))
    if (type(header_line) is not int or header_line != line_id
            or type(target) is not int or type(comp) is not int or {target, comp} != {1, 2}
            or not isinstance(match, list) or len(match) != 2
            or not all(type(flag) is bool for flag in match)
            or not match[target - 1] or match[comp - 1]):
        raise ValueError("Qualified header line must match exactly one title")
    return groups[1:]


def _coordinate(value):
    if isinstance(value, str) and _DECIMAL.fullmatch(value):
        return Decimal(value)
    if type(value) in (int, float, Decimal):
        number = Decimal(str(value))
        if number.is_finite():
            return number
    raise ValueError("Title box requires finite numeric coordinates")


def window_rects(decision, diag):
    """Return merged, full-height source rectangles for an applied header."""
    if not decision["applied"]:
        return []
    left, top, right, bottom = _header_rect(decision)

    strips = []
    for group in _title_groups(diag):
        box = group.get("box")
        if not isinstance(box, (list, tuple)) or len(box) != 4:
            raise ValueError("Title box requires four source coordinates")
        x0, y0, x1, y1 = map(_coordinate, box)
        if not (left <= x0 < x1 <= right and top <= y0 < y1 <= bottom):
            raise ValueError("Title box must be nonempty and inside headerRect")
        strips.append([max(left, floor(x0) - _PADDING), top,
                       min(right, ceil(x1) + _PADDING), bottom])

    first, second = sorted(strips)
    if second[0] <= first[2]:
        return [[first[0], top, max(first[2], second[2]), bottom]]
    return [first, second]


def compose_windows(full_display, baseline, decision, rects) -> Image.Image:
    """Mask the composed header outside its source-space title windows."""
    if not decision["applied"]:
        return baseline
    left, top, right, bottom = _header_rect(decision)
    header_height = bottom - top
    width, height = right - left, baseline.height
    if any(image.mode != "L" or "transparency" in image.info for image in (full_display, baseline)):
        raise ValueError("Window composition requires opaque L images")
    if (height <= 0 or baseline.width != width
            or full_display.size != (width, header_height + _SEPARATOR_HEIGHT + height)):
        raise ValueError("Display sizes must agree with headerRect and the W5 body")

    if not isinstance(rects, (list, tuple)) or not rects:
        raise ValueError("Applied decision requires at least one window")
    for rect in rects:
        if (not _integer_rect(rect) or not (left <= rect[0] < rect[2] <= right)
                or (rect[1], rect[3]) != (top, bottom)):
            raise ValueError("Window must be inside headerRect and span its full height")

    output = full_display.copy()
    output.paste(255, (0, 0, width, header_height))
    for x0, _, x1, _ in rects:
        display_rect = (x0 - left, 0, x1 - left, header_height)
        output.paste(full_display.crop(display_rect), display_rect)
    return output
