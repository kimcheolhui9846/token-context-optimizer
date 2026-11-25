"""ko-header-column: pre-OCR checks on the rendered inks (protocol 3.5 items 4 and 5).

Usage: python render_check.py --data <data dir>
Reads scoring/design.json and scoring/render.json, reruns the registered text rules (design.check without a font) and the
registered layout conditions and ideal-geometry predictions (design.layout_problems) with the rendered ink boxes instead of the
font-measured ones, and prints one JSON object: { problems, measured, ideal }. Exit 1 when a problem is found.
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import design as D  # noqa: E402  (the registered generator: same rules, no copy)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    a = ap.parse_args(argv)
    data = Path(a.data)
    design = json.loads((data / "scoring" / "design.json").read_text(encoding="utf-8"))
    render = json.loads((data / "scoring" / "render.json").read_text(encoding="utf-8"))["images"]
    problems = list(D.check(design["sources"], design["images"]))
    measured, ideal = {}, {}
    for im in design["images"]:
        ri = render.get(im["id"])
        if ri is None:
            problems.append(f"{im['id']}: no render row")
            continue
        ink = {k: v["ink"] for k, v in ri["items"].items()}
        missing = [it["id"] for it in im["items"] if it["id"] not in ink]
        if missing:
            problems.append(f"{im['id']}: no ink for {missing}")
            continue
        for it in im["items"]:
            if not D.inside(ink[it["id"]], D.PRINTABLE):
                problems.append(f"{im['id']}: {it['id']} ink outside the printable area")
        res = D.layout_problems(im, ink)
        problems.extend(f"{im['id']} {x}" for x in res["problems"])
        for k, v in res["measured"].items():
            measured.setdefault(k, []).extend(v)
        ideal[im["id"]] = res["ideal"]
    rng = {k: ([round(min(v), 4), round(max(v), 4)] if v else None) for k, v in measured.items()}
    print(json.dumps({"problems": problems, "measured": rng, "ideal": ideal}, ensure_ascii=False))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
