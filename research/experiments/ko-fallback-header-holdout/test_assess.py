import unittest

from PIL import Image, ImageChops

from assess import count, mask_of, summarize


def neutral():
    return dict(applied=False, condition="unique", displayed=True, opportunity=False,
                recovered=False, unsafeApplication=False, lostFullCues=[], incrementalOther=[],
                newOtherPixels=0, areaDeltaPixels=0, sidecar=False, stressIntersectsApplied=False,
                reason="unchanged")


class ScoringTests(unittest.TestCase):
    def test_incremental_ink_with_partial_existing_visibility(self):
        page = Image.new("L", (5, 1), 0)
        page.putpixel((4, 0), 255)
        old = mask_of(page.size, [[0, 0, 2, 1]])
        new = mask_of(page.size, [[0, 0, 2, 1], [1, 0, 5, 1]])
        box = [1, 0, 5, 1]
        self.assertEqual((count(page, box, old), count(page, box, new)), (1, 3))
        self.assertEqual(count(page, box, ImageChops.subtract(new, old)), 2)

    def test_metrics_separate_rescue_and_stress(self):
        rows = [neutral() for _ in range(18)]
        self.assertEqual(summarize(rows)["verdict"], "no_opportunity")
        rows[0]["opportunity"] = True
        self.assertEqual(summarize(rows)["verdict"], "missed_recovery")
        rows[0].update(applied=True, recovered=True)
        self.assertEqual(summarize(rows)["verdict"], "inconclusive")
        rows[0].update(newOtherPixels=2, stressIntersectsApplied=True)
        self.assertEqual(summarize(rows)["verdict"], "safety_failure")

    def test_negative_application_is_visible(self):
        rows = [neutral() for _ in range(18)]
        rows[0].update(applied=True, condition="duplicate", unsafeApplication=True)
        self.assertEqual(summarize(rows)["negativeApplications"], 1)
        self.assertEqual(summarize(rows)["verdict"], "safety_failure")
