"""Retrospective, nonblind visibility audit of one pinned public synthetic mock."""

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import re

from PIL import Image


HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[3] / "research/results/ko-blind-reader/mock"
SELECTION_SHA256 = "2b23c73da1aa2b40bfc1747cc81159548930c24d4ebe84cab0a34f0d62b6241f"
POS = list(range(1, 19))
METHODS = ("w1", "w4", "w5")
ROLE_KEYS = {
    "targetHeader": "targetHeaderItem",
    "compHeader": "compHeaderItem",
    "value": "valueItem",
    "compValue": "compValueItem",
    "anchor": "anchorItem",
}
PACKET_FILE = "packet/start.html"


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verified_bytes(root, relative, expected_hash, expected_size=None):
    # Every path comes from code or verified metadata. Check confinement and
    # bound reads even when the supplied root points at an unrelated dataset.
    path = (root / relative).resolve()
    require(path.is_relative_to(root.resolve()), f"path escapes input root: {relative}")
    limit = expected_size if expected_size is not None else 256 * 1024
    require(0 < limit <= 256 * 1024, f"invalid byte bound: {relative}")
    with path.open("rb") as stream:
        data = stream.read(limit + 1)
    require(len(data) <= limit and (expected_size is None or len(data) == limit),
            f"unexpected file size: {relative}")
    require(sha256(data) == expected_hash, f"SHA-256 mismatch: {relative}")
    return data


def load_selection(path):
    return json.loads(verified_bytes(path.parent, path.name, SELECTION_SHA256, 3773))


def canonical_hash(value):
    # The public packet and response schemas use ASCII keys, integers and text.
    return sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                             separators=(",", ":")).encode("utf-8"))


def extract_packet(html):
    scripts = re.findall(
        rb'<script type="application/json" id="kbr-payload">(.*?)</script>', html, re.DOTALL
    )
    require(len(scripts) == 1, "expected one packet payload")
    return json.loads(scripts[0])


def check_packet_identity(selection, document, label):
    require(document["packetId"] == selection["packetId"], f"{label} packet ID mismatch")
    require(document["packetHash"] == selection["packetHash"], f"{label} packet hash mismatch")


def check_positions(rows, field, label):
    positions = [row[field] for row in rows]
    require(all(type(pos) is int for pos in positions) and positions == POS,
            f"{label} positions must be exactly 1 through 18 in order")


def validate_response(selection, response):
    check_packet_identity(selection, response, "response")
    require((response["format"], response["kind"], response["status"],
             response["adminMaterialSeen"], response["position"])
            == ("kbr-response-1", "final", "completed", "yes", 19), "unexpected response state")
    check_positions(response["items"], "pos", "response")
    unknown = []
    for item in response["items"]:
        require(item["displayed"] is True and item["reached"] is True and item["skipped"] is False,
                "expected each response position to be displayed, reached and unskipped")
        if item["column"] == "unknown":
            require(item["valueUnknown"] is True and item["value"] is None, "invalid unknown response")
            unknown.append(item["pos"])
        else:
            require(item["column"] in {"L", "R"} and item["valueUnknown"] is False
                    and isinstance(item["value"], str) and item["value"], "invalid known response")
    require(unknown == selection["unknownPositions"], "unknown position set mismatch")
    require(canonical_hash({k: v for k, v in response.items() if k != "digest"}) == response["digest"],
            "canonical response digest mismatch")
    return set(unknown)


def bind_cases(selection, packet, record, key, plan):
    for label, document in (("payload", packet), ("record", record), ("key", key)):
        check_packet_identity(selection, document, label)
        check_positions(document["items"], "pos", "packet" if label == "payload" else label)
    require((packet["format"], record["format"], key["format"], record["n"])
            == ("kbr-packet-1", "kbr-packet-record-1", "kbr-key-1", 18),
            "unexpected packet, record or key format")
    require(record["packetFile"]["path"] == PACKET_FILE
            and record["packetFile"]["sha256"] == selection["fileSha256"][PACKET_FILE],
            "packet file hash mismatch in record")
    require(plan["set"] == "mock" and plan["packetId"] == selection["packetId"],
            "not the pinned public mock plan")
    ordered = sorted(plan["sources"], key=lambda row: row["position"])
    check_positions(ordered, "position", "plan")
    check_positions(selection["positions"], "pos", "selection")
    require(plan["order"] == [source["index"] for source in ordered]
            and set(plan["order"]) == set(range(18)), "plan index/order mismatch")
    require(len({row["imageId"] for row in ordered}) == 18
            and len({row["id"] for row in selection["positions"]}) == 18, "invalid source ID set")

    cases = []
    for source, frozen, screen, entry, display in zip(
        ordered, selection["positions"], packet["items"], key["items"], record["items"], strict=True
    ):
        pos = frozen["pos"]
        require(re.fullmatch(r"q[0-9a-f]{8}", source["imageId"]) is not None
                and source["imageId"] == frozen["id"], f"source ID mismatch at position {pos}")
        require(entry["method"] == source["method"] == frozen["method"]
                and entry["method"].lower() in METHODS, f"method mismatch at position {pos}")
        # The reader's normalized integer key drops the displayed Korean unit.
        answer = source["answer"]
        unit = {"count": "\uba85", "pages": "\ucabd"}.get(source["qtype"])
        if unit:
            answer = answer.removesuffix(unit)
        require(entry["side"] == source["side"] and entry["answer"] == answer
                and entry["qtype"] == source["qtype"] == screen["qtype"]
                and screen["question"] == source["question"], f"question/key mismatch at position {pos}")
        require(entry["displayed"] is True and display["displayed"] is True
                and isinstance(screen["image"], str), f"missing displayed image at position {pos}")
        cases.append((source, screen))
    require(canonical_hash({k: packet[k] for k in ("format", "packetId", "practice", "items")})
            == selection["packetHash"], "canonical packet hash mismatch")
    return cases


def decode_gray(data, size, label):
    with Image.open(io.BytesIO(data), formats=["PNG"]) as image:
        # Pillow may expand sub-byte grayscale PNGs to L. The original format
        # must itself be 8-bit grayscale (IHDR bit depth and color type).
        require(data[24:26] == b"\x08\x00" and image.mode == "L" and "transparency" not in image.info,
                f"expected opaque 8-bit L PNG: {label}")
        require(image.size == size, f"unexpected dimensions: {label}")
        image.load()
        return image.copy()


def window_rect(window):
    x, y = window["left"], window["top"]
    return x, y, x + window["width"], y + window["height"]


def checked_rect(rect, size, label, allow_empty=False):
    require(len(rect) == 4 and all(type(v) is int for v in rect), f"invalid rectangle: {label}")
    x0, y0, x1, y1 = rect
    require(0 <= x0 <= x1 <= size[0] and 0 <= y0 <= y1 <= size[1]
            and (allow_empty or (x0 < x1 and y0 < y1)), f"rectangle outside image or empty: {label}")
    return x0, y0, x1, y1


def visibility(source, ink, rects):
    x0, y0, x1, y1 = checked_rect(ink, source.size, "ink bbox", allow_empty=True)
    pixels = source.load()
    kept = total = 0
    for y in range(y0, y1):
        for x in range(x0, x1):
            if pixels[x, y] < 255:
                total += 1
                # Each painted source coordinate contributes at most once.
                kept += any(l <= x < r and t <= y < b for l, t, r, b in rects)
    if total == 0:
        return "no_source_ink", kept, total
    if kept == total:
        return "full", kept, total
    return ("absent" if kept == 0 else "partial"), kept, total


def rebuild_display(source, size, pieces):
    width, height = size
    display = bytearray()
    source_rects = []
    next_y = 0
    for piece in pieces:
        x0, y0, x1, y1 = checked_rect(piece["displayRect"], size, "display piece")
        require((x0, y0, x1) == (0, next_y, width), "display pieces must tile the full crop")
        if piece["kind"] == "source":
            rect = checked_rect(piece["sourceRect"], source.size, "source piece")
            crop = source.crop(rect)
            require(crop.size == (width, y1 - y0), "source piece dimensions differ from display piece")
            display.extend(crop.tobytes())
            source_rects.append(rect)
        else:
            require(piece["kind"] == "separator", "unrecognized display piece")
            require(len(piece["luma"]) == y1 - y0, "separator height mismatch")
            for shade in piece["luma"]:
                display.extend(bytes([shade]) * width)
        next_y = y1
    require(next_y == height and source_rects, "display pieces do not cover the crop")
    return bytes(display), source_rects


def verify_display(image, rebuilt, label):
    require(image.tobytes() == rebuilt, f"decoded crop mismatch: {label}")


def verify_embedded(embedded, build_image, label):
    # The packet and build have distinct PNG encodings of the same pixels.
    image = decode_gray(embedded, build_image.size, label)
    require(image.tobytes() == build_image.tobytes(), f"embedded image pixels mismatch: {label}")
    return sha256(embedded)


def embedded_bytes(uri):
    prefix = "data:image/png;base64,"
    require(uri.startswith(prefix), "expected embedded PNG data URI")
    return base64.b64decode(uri[len(prefix):], validate=True)


def image_digests(raw, image):
    return {"sha256": sha256(raw), "pixelSha256": sha256(image.tobytes()),
            "width": image.width, "height": image.height}


def indexed_rows(rows, field, source_ids, label):
    keyed = {row[field]: row for row in rows}
    require(set(keyed) == source_ids and len(rows) == len(source_ids), f"{label} source ID set mismatch")
    return keyed


def dimension_pair(dim):
    return dim["width"], dim["height"]


def verify_practice(root, entry, packet_practice):
    source_raw = verified_bytes(root, "practice/render/images/practice.png", entry["sourceSha256"])
    # This source has the same pinned page size as the 18 audited pages.
    source = decode_gray(source_raw, (1280, 960), "practice source")
    crop = source.crop(checked_rect(entry["crop"], source.size, "practice crop"))
    raw = verified_bytes(root, "build/practice.png", entry["sha256"])
    image = decode_gray(raw, crop.size, "practice crop")
    require(sha256(image.tobytes()) == entry["pixelSha256"], "practice raw pixel digest mismatch")
    verify_display(image, crop.tobytes(), "practice crop")
    return {
        "source": image_digests(source_raw, source),
        "build": image_digests(raw, image),
        "embeddedPngSha256": verify_embedded(embedded_bytes(packet_practice["image"]), image, "packet practice"),
    }


def measure_case(root, source_row, design, render, gold, coords, prediction, outputs):
    source_id = source_row["imageId"]
    file_name = f"{source_id}.png"
    page_size = dimension_pair(coords["page"])
    require(source_row["file"] == design["file"] == render["file"] == file_name
            and page_size == dimension_pair(design["page"]) == dimension_pair(gold["page"])
            == dimension_pair(prediction), f"page metadata mismatch: {source_id}")
    require(render["sha256"] == coords["pngSha256"] == prediction["pngSha256"],
            f"source PNG digest mismatch: {source_id}")
    require(prediction["w1"] == coords["w1"] and prediction["w4"] == coords["w4"],
            f"prediction crop coordinates mismatch: {source_id}")
    require(source_row["answer"] == design["answer"] == gold["answer"], f"gold answer mismatch: {source_id}")

    source_raw = verified_bytes(root, f"gen/render/images/{file_name}", render["sha256"], render["bytes"])
    source = decode_gray(source_raw, page_size, source_id)
    rects = {"source": [(0, 0, *page_size)]}
    digests = {"source": image_digests(source_raw, source)}
    images = {}
    for method in METHODS:
        output = outputs[method][source_id]
        file = f"{method}/{file_name}"
        require(output["file"] == file, f"manifest crop path mismatch: {file}")
        raw = verified_bytes(root, f"build/{file}", output["sha256"], output["bytes"])
        if method == "w5":
            size = dimension_pair(coords["display"])
            rebuilt, rects[method] = rebuild_display(source, size, coords["pieces"])
        else:
            rect = checked_rect(window_rect(coords[method]), source.size, file)
            cropped = source.crop(rect)
            size, rebuilt = cropped.size, cropped.tobytes()
            rects[method] = [rect]
        require(dimension_pair(output) == size, f"manifest crop dimensions mismatch: {file}")
        image = decode_gray(raw, size, file)
        digests[method] = image_digests(raw, image)
        require(digests[method]["pixelSha256"] == output["pixelSha256"], f"raw pixel digest mismatch: {file}")
        verify_display(image, rebuilt, file)
        images[method] = image

    bboxes = {}
    for role, key in ROLE_KEYS.items():
        item = source_row[key]
        require(item == design[key], f"role item mismatch: {source_id}/{role}")
        bboxes[role] = render["items"][item]["ink"]
    views, ink_counts = {}, {}
    for view, rectangles in rects.items():
        views[view], ink_counts[view] = {}, {}
        for role, bbox in bboxes.items():
            state, visible, total = visibility(source, bbox, rectangles)
            views[view][role] = state
            ink_counts[view][role] = {"visible": visible, "source": total}

    w5_identity = {
        method: images[method].size == images["w5"].size
        and images[method].tobytes() == images["w5"].tobytes()
        for method in ("w1", "w4")
    }
    require(coords["w5Kind"] in {"w1", "two_bands"}
            and w5_identity["w1"] == (coords["w5Kind"] == "w1"),
            f"W5 kind disagrees with W1 pixel identity: {source_id}")
    require(not w5_identity["w4"] or w5_identity["w1"],
            f"W5/W4 pixel identity disagrees with public mock crop metadata: {source_id}")

    assigned = source_row["method"]
    return {
        "pos": source_row["position"],
        "id": source_id,
        "assigned": assigned,
        "question": source_row["question"],
        "views": views,
        "inkCounts": ink_counts,
        "inkBboxes": bboxes,
        "sourceRects": rects,
        "imageDigests": digests,
        "w4Reason": prediction["w4Reason"],
        "w4From": prediction["w4From"],
        "w5Reason": coords["w5Reason"],
        "w5Kind": coords["w5Kind"],
        "w5PixelIdentical": w5_identity,
    }, images[assigned.lower()]


def run_audit(mock_work):
    selection = load_selection(HERE / "selection.json")
    response_raw = verified_bytes(HERE, "mock-ai-response.json", selection["responseSha256"], 3015)
    pins = selection["fileSha256"]
    files = {}
    # Check both trees against small identifying metadata before the HTML, and
    # verify every pinned file before following references to PNG payloads.
    for relative in sorted(pins, key=lambda path: path == PACKET_FILE):
        files[relative] = verified_bytes(PUBLIC, relative, pins[relative])
        verified_bytes(mock_work, relative, pins[relative], len(files[relative]))

    packet = extract_packet(files[PACKET_FILE])
    plan = json.loads(files["gen/plan.json"])
    bindings = bind_cases(selection, packet, json.loads(files["admin/packet-record.json"]),
                          json.loads(files["admin/key.json"]), plan)
    source_ids = {row["imageId"] for row, _ in bindings}
    manifest = json.loads(files["build/manifest.json"])
    require(manifest["version"] == "ko-blind-reader-build-1"
            and manifest["coordsSha256"] == pins["build/coords.jsonl"]
            and manifest["predictionsSha256"] == pins["pred/predictions.jsonl"], "manifest input digest mismatch")
    outputs = manifest["outputs"]
    require(set(outputs) == set(METHODS)
            and all(set(rows) == source_ids and all(rows.values()) for rows in outputs.values()),
            "manifest output source ID or method set mismatch")

    design = indexed_rows(json.loads(files["gen/design.json"])["images"], "id", source_ids, "design")
    render = json.loads(files["gen/render/render.json"])["images"]
    gold = json.loads(files["gen/render/gold.json"])["gold"]
    require(set(render) == set(gold) == source_ids, "render or gold source ID set mismatch")
    coords = indexed_rows([json.loads(line) for line in files["build/coords.jsonl"].splitlines()],
                          "id", source_ids, "coords")
    pred = indexed_rows([json.loads(line) for line in files["pred/predictions.jsonl"].splitlines()],
                        "id", source_ids, "predictions")

    practice = verify_practice(mock_work, manifest["practice"], packet["practice"])
    cases = []
    for source, screen in bindings:
        source_id = source["imageId"]
        case, assigned_image = measure_case(
            mock_work, source, design[source_id], render[source_id], gold[source_id],
            coords[source_id], pred[source_id], outputs,
        )
        case["embeddedPngSha256"] = verify_embedded(
            embedded_bytes(screen["image"]), assigned_image, f"packet position {case['pos']}"
        )
        cases.append(case)

    # Only the pinned response bytes were checked earlier. Join its labels
    # after computing the complete 18-position visibility matrix.
    unknown = validate_response(selection, json.loads(response_raw))
    for case in cases:
        case["unknown"] = case["pos"] in unknown
    return {
        "provenance": {
            "scope": selection["scope"],
            "sourceCommit": selection["sourceCommit"],
            "selectionSha256": SELECTION_SHA256,
            "packetId": selection["packetId"],
            "packetHash": selection["packetHash"],
            "responseSha256": selection["responseSha256"],
            "fileSha256": pins,
            "exposure": selection["provenance"],
            "measurement": selection["measurement"],
            "packetImageEncoding": (
                "Embedded PNG byte SHA-256 is bound to pinned packet HTML and its "
                "canonical payload. Build PNG byte SHA-256 is bound to the manifest. "
                "The build PNG includes a pHYs chunk omitted from the embedded PNG. "
                "Dimensions and decoded opaque L pixels agree exactly."
            ),
            "practice": practice,
        },
        "cases": cases,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mock-work", type=Path, required=True, help="regenerated public mock root")
    parser.add_argument("--output", type=Path, required=True, help="new audit JSON file")
    args = parser.parse_args()
    try:
        result = run_audit(args.mock_work)
        with args.output.open("x", encoding="utf-8", newline="\n") as stream:
            json.dump(result, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
    except (OSError, ValueError, KeyError, TypeError) as error:
        parser.exit(1, f"audit failed: {error}\n")


if __name__ == "__main__":
    main()
