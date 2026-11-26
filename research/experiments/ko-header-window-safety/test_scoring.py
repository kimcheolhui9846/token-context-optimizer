import unittest
from scoring import summarize


def example(side=1, new=False, valid=True, applied=True):
    arm = {"displayed": True, "applied": applied, "bothTitlesGoneAndBodyIntact":True,
           "items":{"side-value":{"w5":0,"full":side}}, "fiveComplete":{"two":True},
           "lostCues":[], "numberGains":{"two":{"side-value":1} if new else {}}}
    return {"id":"p","donor":"d","condition":"gap","placement":{"valid":valid},
            "controlMatches":True,"natural":arm}


class VerdictTests(unittest.TestCase):
    def test_covered_risk(self):
        self.assertEqual(summarize([example()],"natural")["verdict"],"bounded_demonstration")

    def test_no_eligible_intersection(self):
        self.assertEqual(summarize([example(applied=False)],"natural")["riskIds"],[])

    def test_invalid_placement_stays_in_denominator(self):
        s=summarize([example(valid=False)],"natural")
        self.assertEqual((s["pages"],s["verdict"],s["riskIds"]),(1,"inconclusive",[]))

    def test_harm_precedes_incomplete(self):
        self.assertEqual(summarize([example(new=True,valid=False)],"natural")["verdict"],"harm_observed")
