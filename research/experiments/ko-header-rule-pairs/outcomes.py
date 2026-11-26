"""Summarize the registered donor, rule, and plant pairs."""
from itertools import product


RULES = ("original", "moved")
PLANTS = ("none", "gap", "outer")


def _index_rows(rows):
    pairs = {}
    ids = set()
    for row in rows:
        try:
            row_id, donor, rule, plant = (row[key] for key in ("id", "donor", "rule", "plant"))
            natural = row["natural"]
            flags = row["validPlacement"], natural["displayed"], natural["applied"]
        except (KeyError, TypeError) as exc:
            raise ValueError("Missing row identity, placement, or natural decision") from exc
        if (not isinstance(row_id, str) or not row_id
                or not isinstance(donor, str) or not donor
                or rule not in RULES or plant not in PLANTS):
            raise ValueError("Invalid row identity")
        if any(type(flag) is not bool for flag in flags):
            raise ValueError("Placement and natural decision flags must be boolean")
        key = (donor, rule, plant)
        if row_id in ids or key in pairs:
            raise ValueError(f"Duplicate row ID or design cell: {row_id!r}")
        ids.add(row_id)
        pairs[key] = row

    donors = sorted({donor for donor, _, _ in pairs})
    if len(donors) != 3 or pairs.keys() != set(product(donors, RULES, PLANTS)):
        raise ValueError("Expected every rule and plant combination for exactly three donors")
    return donors, pairs


def summarize(rows):
    """Return evidence and the verdict for the complete 18-row design."""
    donors, pairs = _index_rows(rows)
    transitions = {
        f"{original}_to_{moved}": 0
        for original, moved in product(("apply", "decline"), repeat=2)
    }
    for donor, plant in product(donors, PLANTS):
        original, moved = (
            "apply" if pairs[donor, rule, plant]["natural"]["applied"] else "decline"
            for rule in RULES
        )
        transitions[f"{original}_to_{moved}"] += 1

    identities = {}
    opportunities, protected = [], []
    harm, historical_harm = [], []
    missing_display, invalid_moved = [], []
    for (donor, rule, plant), row in pairs.items():
        row_id = row["id"]
        identities[row_id] = {"donor": donor, "rule": rule, "plant": plant}
        natural = row["natural"]
        if rule == "moved" and not row["validPlacement"]:
            invalid_moved.append(row_id)
        if not natural["displayed"]:
            missing_display.append(row_id)
            continue
        if not natural["applied"]:
            continue

        two_gains = natural["numberGains"]["two"]
        if natural["lostCues"] or two_gains:
            (harm if rule == "moved" else historical_harm).append(row_id)
        if (rule != "moved" or plant == "none" or not row["validPlacement"]
                or not natural["bothTitlesGoneAndBodyIntact"]):
            continue
        side = natural["items"]["side-value"]
        if side["w5"] == 0 and side["full"] > 0:
            opportunities.append(row_id)
            if natural["fiveComplete"]["two"] and not two_gains and side["two"] == 0:
                protected.append(row_id)

    if harm:
        verdict = "harm_observed"
    elif missing_display or invalid_moved or not opportunities or protected != opportunities:
        verdict = "inconclusive"
    else:
        verdict = "bounded_demonstration"

    return {
        "verdict": verdict,
        "opportunityIds": opportunities,
        "protectedIds": protected,
        "harmIds": harm,
        "historicalHarmIds": historical_harm,
        "missingDisplayIds": missing_display,
        "invalidMovedPlacementIds": invalid_moved,
        "transitions": transitions,
        "identities": identities,
    }
