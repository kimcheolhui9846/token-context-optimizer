import hashlib
import io
import json
import os
from pathlib import Path
import tempfile
import unittest

from PIL import Image

import audit


HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parents[3] / "research/results/ko-blind-reader/mock"


class VisibilityTests(unittest.TestCase):
    def setUp(self):
        self.image = Image.new("L", (5, 5), 255)
        for xy in ((1, 1), (2, 2), (3, 3)):
            self.image.putpixel(xy, 254)
        self.ink = (1, 1, 4, 4)

    def test_half_open_touch_in_either_axis_has_no_ink(self):
        for rect in ((0, 0, 1, 5), (0, 0, 5, 1), (4, 0, 5, 5), (0, 4, 5, 5)):
            with self.subTest(rect=rect):
                self.assertEqual(audit.visibility(self.image, self.ink, [rect]), ("absent", 0, 3))

    def test_one_pixel_intersection_counts_gray_254(self):
        result = audit.visibility(self.image, self.ink, [(1, 1, 2, 2)])
        self.assertEqual(result, ("partial", 1, 3))

    def test_partial_keeps_two_of_three(self):
        result = audit.visibility(self.image, self.ink, [(1, 1, 3, 3)])
        self.assertEqual(result, ("partial", 2, 3))

    def test_missing_source_ink_is_its_own_state(self):
        self.image.putpixel((0, 0), 0)
        self.assertEqual(audit.visibility(self.image, (1, 0, 4, 1), []), ("no_source_ink", 0, 0))

    def test_overlapping_rects_count_shared_ink_once(self):
        result = audit.visibility(self.image, self.ink, [(0, 0, 3, 3), (1, 1, 3, 4)])
        self.assertEqual(result, ("partial", 2, 3))

    def test_split_strips_can_keep_all_ink_without_covering_the_bbox(self):
        self.image.putpixel((2, 2), 255)
        result = audit.visibility(self.image, self.ink, [(0, 1, 5, 2), (0, 3, 5, 4)])
        self.assertEqual(result, ("full", 2, 2))

    def test_one_pixel_of_ink_can_be_full(self):
        result = audit.visibility(self.image, (1, 1, 2, 2), [(1, 1, 2, 2)])
        self.assertEqual(result, ("full", 1, 1))


def png(image, **kwargs):
    output = io.BytesIO()
    image.save(output, format="PNG", **kwargs)
    return output.getvalue()


class ImageTests(unittest.TestCase):
    def test_transparent_or_non_l_images_are_rejected(self):
        for raw in (
            png(Image.new("LA", (1, 1), (255, 255))),
            png(Image.new("RGBA", (1, 1), (255, 255, 255, 255))),
            png(Image.new("RGB", (1, 1), (255, 255, 255))),
            png(Image.new("L", (1, 1), 255), transparency=255),
        ):
            with self.assertRaisesRegex(ValueError, "opaque"):
                audit.decode_gray(raw, (1, 1), "test")

    def test_wrong_crop_png_bytes_with_identical_pixels_are_rejected(self):
        image = Image.new("L", (2, 2), 128)
        approved = png(image)
        reencoded = png(image, dpi=(25.4, 25.4))
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "crop.png").write_bytes(reencoded)
            with self.assertRaisesRegex(ValueError, "SHA-256"):
                audit.verified_bytes(root, "crop.png", hashlib.sha256(approved).hexdigest())

    def test_rebuilt_split_crop_covers_source_pieces_and_separator(self):
        source = Image.new("L", (2, 4))
        source.putdata([0, 1, 2, 3, 4, 5, 6, 7])
        pieces = [
            {"kind": "source", "sourceRect": [0, 0, 2, 1], "displayRect": [0, 0, 2, 1]},
            {"kind": "separator", "luma": [128], "displayRect": [0, 1, 2, 2]},
            {"kind": "source", "sourceRect": [0, 3, 2, 4], "displayRect": [0, 2, 2, 3]},
        ]
        raw, visible = audit.rebuild_display(source, (2, 3), pieces)
        self.assertEqual(raw, bytes([0, 1, 128, 128, 6, 7]))
        self.assertEqual(visible, [(0, 0, 2, 1), (0, 3, 2, 4)])
        expected = Image.frombytes("L", (2, 3), raw)
        audit.verify_display(expected, raw, "test")
        expected.putpixel((1, 1), 129)
        with self.assertRaisesRegex(ValueError, "decoded crop"):
            audit.verify_display(expected, raw, "test")

    def test_embedded_assignment_accepts_different_encodings_of_exact_pixels(self):
        image = Image.new("L", (8, 8), 128)
        approved = png(image)
        build = png(image, dpi=(25.4, 25.4))
        self.assertNotEqual(approved, build)
        decoded_build = audit.decode_gray(build, image.size, "test build")
        self.assertEqual(
            audit.verify_embedded(approved, decoded_build, "test"), hashlib.sha256(approved).hexdigest()
        )
        image.putpixel((7, 7), 129)
        with self.assertRaisesRegex(ValueError, "embedded"):
            audit.verify_embedded(png(image), decoded_build, "test")
        with self.assertRaisesRegex(ValueError, "dimensions"):
            audit.verify_embedded(png(image.crop((0, 0, 7, 8))), decoded_build, "test")


class BindingTests(unittest.TestCase):
    def setUp(self):
        self.selection = audit.load_selection(HERE / "selection.json")
        self.response = json.loads((HERE / "mock-ai-response.json").read_bytes())
        self.packet = audit.extract_packet((PUBLIC / "packet/start.html").read_bytes())
        self.record = json.loads((PUBLIC / "admin/packet-record.json").read_bytes())
        self.key = json.loads((PUBLIC / "admin/key.json").read_bytes())
        self.plan = json.loads((PUBLIC / "gen/plan.json").read_bytes())

    def bind(self):
        unknown = audit.validate_response(self.selection, self.response)
        rows = audit.bind_cases(self.selection, self.packet, self.record, self.key, self.plan)
        return rows, unknown

    def test_selection_cannot_change_its_own_pins(self):
        original = (HERE / "selection.json").read_bytes()
        digest = self.selection["fileSha256"]["build/coords.jsonl"].encode("ascii")
        changed = original.replace(digest, b"f" * 64, 1)
        self.assertNotEqual(changed, original)
        self.assertEqual(len(changed), len(original))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "selection.json"
            path.write_bytes(changed)
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch: selection.json"):
                audit.load_selection(path)

    def test_response_packet_hash_must_match_pin(self):
        self.response["packetHash"] = "f" * 64
        with self.assertRaisesRegex(ValueError, "packet hash"):
            self.bind()

    def test_response_packet_id_must_match_pin(self):
        self.response["packetId"] = "wrong"
        with self.assertRaisesRegex(ValueError, "packet ID"):
            self.bind()

    def test_wrong_packet_item_position_is_rejected(self):
        self.packet["items"][0]["pos"] = 2
        with self.assertRaisesRegex(ValueError, "packet positions"):
            self.bind()

    def test_wrong_key_method_is_rejected(self):
        self.key["items"][0]["method"] = "W1"
        with self.assertRaisesRegex(ValueError, "method"):
            self.bind()

    def test_wrong_source_id_is_rejected(self):
        self.plan["sources"][0]["imageId"] = "q00000000"
        with self.assertRaisesRegex(ValueError, "source ID"):
            self.bind()

    def test_duplicate_plan_source_id_is_rejected(self):
        self.plan["sources"][1]["imageId"] = self.plan["sources"][0]["imageId"]
        with self.assertRaisesRegex(ValueError, "source ID set"):
            self.bind()

    def test_missing_response_position_is_rejected(self):
        self.response["items"].pop()
        with self.assertRaisesRegex(ValueError, "response positions"):
            self.bind()

    def test_balanced_swap_between_unknown_and_known_is_rejected(self):
        self.response["items"][0].update(column="L", value="11:50", valueUnknown=False)
        self.response["items"][2].update(column="unknown", value=None, valueUnknown=True)
        with self.assertRaisesRegex(ValueError, "unknown position set"):
            self.bind()

    def test_public_joins_have_all_18_frozen_positions(self):
        rows, _ = self.bind()
        self.assertEqual(len(rows), 18)
        self.assertEqual(rows[0][0]["imageId"], "qff9eae91")
        self.assertEqual(rows[-1][0]["imageId"], "q7b15b37e")

    def test_wrong_packet_file_bytes_are_rejected_before_loading_images(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in self.selection["fileSha256"]:
                target = root / relative
                target.parent.mkdir(exist_ok=True, parents=True)
                data = (PUBLIC / relative).read_bytes()
                if relative == "packet/start.html":
                    data = b"X" + data[1:]
                target.write_bytes(data)
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch: packet/start.html"):
                audit.run_audit(root)

    def test_wrong_manifest_rejects_root_before_packet_or_images_are_needed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for relative in self.selection["fileSha256"]:
                if relative == "packet/start.html":
                    continue
                target = root / relative
                target.parent.mkdir(exist_ok=True, parents=True)
                data = (PUBLIC / relative).read_bytes()
                if relative == "build/manifest.json":
                    data = b" " + data[1:]
                target.write_bytes(data)
            with self.assertRaisesRegex(ValueError, "SHA-256 mismatch: build/manifest.json"):
                audit.run_audit(root)


@unittest.skipUnless(os.environ.get("KO_AUDIT_PUBLIC_MOCK"), "set KO_AUDIT_PUBLIC_MOCK to the regenerated public mock root")
class ReplayTests(unittest.TestCase):
    def test_full_replay_computes_all_360_visibility_cells(self):
        result = audit.run_audit(Path(os.environ["KO_AUDIT_PUBLIC_MOCK"]))
        cases = result["cases"]
        self.assertEqual([case["pos"] for case in cases], list(range(1, 19)))
        self.assertEqual([case["pos"] for case in cases if case["unknown"]], [1, 2, 7, 8, 10, 14, 17])
        for case in cases:
            self.assertEqual(set(case["views"]), {"source", "w1", "w4", "w5"})
            for roles in case["views"].values():
                self.assertEqual(set(roles), {"targetHeader", "compHeader", "value", "compValue", "anchor"})


if __name__ == "__main__":
    unittest.main()
