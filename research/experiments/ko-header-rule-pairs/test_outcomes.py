import unittest

from outcomes import summarize


def examples():
    rows = []
    for donor in ("a", "b", "c"):
        for rule in ("original", "moved"):
            for plant in ("none", "gap", "outer"):
                natural = {
                    "displayed": True,
                    "applied": rule == "moved",
                    "bothTitlesGoneAndBodyIntact": True,
                    "fiveComplete": {"full": True, "two": True},
                    "lostCues": [],
                    "numberGains": {"full": {}, "two": {}},
                    "items": {},
                }
                if plant != "none":
                    natural["items"]["side-value"] = {"w5": 0, "full": 7, "two": 0}
                    natural["numberGains"]["full"]["side-value"] = 7
                rows.append({
                    "id": f"{donor}-{rule}-{plant}",
                    "donor": donor,
                    "rule": rule,
                    "plant": plant,
                    "validPlacement": rule == "moved" or plant == "none",
                    "natural": natural,
                })
    return rows


class OutcomeTests(unittest.TestCase):
    def test_protection_is_bounded_to_moved_planted_opportunities(self):
        rows = examples()
        for row in rows[:3]:
            row["natural"]["applied"] = True
        summary = summarize(rows)
        expected = [
            "a-moved-gap", "a-moved-outer", "b-moved-gap", "b-moved-outer",
            "c-moved-gap", "c-moved-outer",
        ]
        self.assertCountEqual(summary["opportunityIds"], expected)
        self.assertCountEqual(summary["protectedIds"], expected)
        self.assertEqual(summary["verdict"], "bounded_demonstration")
        self.assertEqual(summary["harmIds"], [])
        self.assertEqual(summary["identities"]["c-moved-outer"],
                         {"donor": "c", "rule": "moved", "plant": "outer"})

    def test_requires_the_registered_natural_opportunity_conditions(self):
        rows = examples()
        rows[4]["natural"]["applied"] = False
        rows[5]["natural"]["bothTitlesGoneAndBodyIntact"] = False
        rows[10]["natural"]["items"]["side-value"]["w5"] = 1
        rows[11]["natural"]["items"]["side-value"]["full"] = 0
        self.assertCountEqual(summarize(rows)["opportunityIds"],
                              ["c-moved-gap", "c-moved-outer"])

    def test_invalid_moved_placement_is_inconclusive(self):
        rows = examples()
        rows[3]["validPlacement"] = False
        rows[4]["validPlacement"] = False
        summary = summarize(rows)
        self.assertEqual(summary["verdict"], "inconclusive")
        self.assertNotIn("a-moved-gap", summary["opportunityIds"])

    def test_missing_display_is_inconclusive(self):
        for index in (1, 4):
            with self.subTest(index=index):
                rows = examples()
                rows[index]["natural"] = {"displayed": False, "applied": False}
                summary = summarize(rows)
                self.assertEqual(summary["verdict"], "inconclusive")
                self.assertNotIn(rows[index]["id"], summary["opportunityIds"])

    def test_no_opportunities_is_inconclusive(self):
        rows = examples()
        for row in rows:
            row["natural"]["applied"] = False
        summary = summarize(rows)
        self.assertEqual(summary["opportunityIds"], [])
        self.assertEqual(summary["verdict"], "inconclusive")

    def test_all_opportunities_require_complete_cues_and_zero_plant_ink(self):
        rows = examples()
        rows[4]["natural"]["fiveComplete"]["two"] = False
        rows[5]["natural"]["items"]["side-value"]["two"] = 1
        summary = summarize(rows)
        self.assertEqual(len(summary["opportunityIds"]), 6)
        self.assertCountEqual(summary["protectedIds"],
                              ["b-moved-gap", "b-moved-outer", "c-moved-gap", "c-moved-outer"])
        self.assertEqual(summary["verdict"], "inconclusive")

    def test_harm_precedes_incomplete_evidence_and_includes_bare_controls(self):
        rows = examples()
        rows[0]["natural"] = {"displayed": False, "applied": False}
        rows[3]["validPlacement"] = False
        rows[3]["natural"]["lostCues"] = ["targetHeader"]
        rows[4]["natural"]["numberGains"]["two"] = {"other": 1}
        rows[5]["natural"]["numberGains"]["two"] = {"side-value": 1}
        rows[9]["natural"]["lostCues"] = ["otherHeader"]
        rows[9]["natural"]["applied"] = False
        summary = summarize(rows)
        self.assertCountEqual(summary["harmIds"], ["a-moved-none", "a-moved-gap", "a-moved-outer"])
        self.assertNotIn("a-moved-gap", summary["protectedIds"])
        self.assertNotIn("a-moved-outer", summary["protectedIds"])
        self.assertEqual(summary["verdict"], "harm_observed")

    def test_original_harms_are_historical(self):
        rows = examples()
        rows[1]["natural"]["applied"] = True
        rows[1]["natural"]["lostCues"] = ["targetHeader"]
        summary = summarize(rows)
        self.assertEqual(summary["historicalHarmIds"], ["a-original-gap"])
        self.assertEqual(summary["harmIds"], [])
        self.assertEqual(summary["verdict"], "bounded_demonstration")

    def test_pairs_by_donor_and_plant_independently_of_row_order(self):
        rows = examples()
        rows[0]["natural"]["applied"] = True
        rows[1]["natural"]["applied"] = True
        rows[4]["natural"]["applied"] = False
        rows[5]["natural"]["applied"] = False
        rows[9]["natural"]["applied"] = False
        self.assertEqual(summarize(reversed(rows))["transitions"], {
            "apply_to_apply": 1,
            "apply_to_decline": 1,
            "decline_to_apply": 5,
            "decline_to_decline": 2,
        })

    def test_rejects_incomplete_or_duplicate_designs(self):
        rows = examples()
        for invalid in (
            rows[:-1],
            rows[:-1] + [{**rows[-1], "id": rows[0]["id"]}],
            rows[:-1] + [{**rows[-1], "plant": "gap"}],
            rows[:-1] + [{**rows[-1], "plant": "elsewhere"}],
            rows[:-1] + [{**rows[-1], "donor": "fourth"}],
        ):
            with self.subTest(last=invalid[-1]["id"]):
                with self.assertRaises(ValueError):
                    summarize(invalid)

    def test_rejects_missing_natural_decision(self):
        rows = examples()
        del rows[0]["natural"]["applied"]
        with self.assertRaises(ValueError):
            summarize(rows)
