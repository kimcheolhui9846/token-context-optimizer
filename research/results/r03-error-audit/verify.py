"""Rebuild this audit from pinned inputs and the first valid response from each rater."""
from collections import Counter, defaultdict
from pathlib import Path
import argparse
import csv
import hashlib
import io
import json

from prepare import build
from rating import BATCH_SIZE, CUT, LABELS, digest, initial_rows, make_prompt, ordered

HERE = Path(__file__).resolve().parent
RATERS = ("claude", "openai")
FREEZE = "7296f649e0626c8f7fad31e2bd0c150ddd78aa12"

def read_json(name):
    return json.loads((HERE / name).read_bytes())

def accepted_by_id(name, cases):
    evidence = read_json(name + ".json")
    if evidence["rater"] != name or evidence["protocol_commit"] != FREEZE or len(evidence["batches"]) != 6:
        raise ValueError(f"Invalid rater record: {name}")
    order = ordered(cases, name)
    accepted = {}
    for i, batch in enumerate(evidence["batches"]):
        requested = order[i * BATCH_SIZE:(i + 1) * BATCH_SIZE]
        attempts = batch["attempts"]
        if batch["batch"] != i + 1 or not 1 <= len(attempts) <= 2:
            raise ValueError(f"Invalid batch or retry count: {name}/{i+1}")
        for number, attempt in enumerate(attempts, 1):
            ids = [row["id"] for row in requested]
            if not ids or attempt["number"] != number or attempt["ids"] != ids:
                raise ValueError(f"Invalid attempt membership: {name}/{i+1}/{number}")
            if digest(make_prompt(requested)) != attempt["prompt_sha256"] or digest(attempt["raw"]) != attempt["response_sha256"]:
                raise ValueError("Prompt or response SHA-256 mismatch")
            valid = {}
            if not attempt["failure"] and not attempt["runtime"]["tool_events"]:
                provider, model = {"claude": ("Anthropic", "claude-sonnet-5-5"), "openai": ("OpenAI", "gpt-6.2-sol")}[name]
                runtime = attempt["runtime"]
                if runtime["provider"] != provider or model not in runtime["models"] or not runtime["client"]:
                    raise ValueError("Unexpected provider, model or client metadata")
                valid, _ = initial_rows(attempt["raw"], requested)
            if set(attempt["accepted"]) != set(valid) or accepted.keys() & valid.keys():
                raise ValueError("Accepted row differs from original or was overwritten")
            accepted.update(valid)
            requested = [row for row in requested if row["id"] not in valid]
        if batch["missing"] != [row["id"] for row in requested] or batch["valid"] != BATCH_SIZE - len(requested):
            raise ValueError("Mismatched missing/valid counts")
    return accepted

def reconcile():
    cases, population = build()
    first = {name: accepted_by_id(name, cases) for name in RATERS}
    resolutions = read_json("adjudication.json")
    overrides = {row["id"]: row for row in resolutions}
    if len(overrides) != len(resolutions):
        raise ValueError("Duplicate adjudication")
    disagreements = set()
    labels, cuts, tables = defaultdict(Counter), defaultdict(Counter), defaultdict(Counter)
    strata, stop_cut = defaultdict(Counter), defaultdict(Counter)
    result = []
    for case in cases:
        ident, kind = case["id"], case["kind"]
        a, b = [first[r].get(ident) for r in RATERS]
        if not a or not b:
            raise ValueError(f"Missing paired rating for {ident}; report unavailable pairs separately")
        for field in ("label", "cut"):
            tables[kind + "_" + field][(a[field], b[field])] += 1
        differs = any(a[field] != b[field] for field in ("label", "cut"))
        if differs:
            disagreements.add(ident)
            if ident not in overrides:
                raise ValueError(f"Missing adjudication: {ident}")
            decision = overrides[ident]
            if not decision["reason"].strip() or decision["label"] not in LABELS[kind] | {"unresolved"} or decision["cut"] not in CUT | {"unresolved"}:
                raise ValueError(f"Invalid adjudication: {ident}")
            for field in ("label", "cut"):
                if a[field] == b[field] and decision[field] != a[field]:
                    raise ValueError(f"Adjudication changed an agreed field: {ident}")
        else:
            decision = a
        label, cut = decision["label"], decision["cut"]
        labels[kind][label] += 1
        cuts[kind][cut] += 1
        if kind == "summary":
            key = (case["provider"], case["condition"], case["template"], case["turn"])
            strata[key][label] += 1
            stop_cut[case["stop"]][cut] += 1
        result.append({
            "id": ident, "kind": kind, "provider": case["provider"], "condition": case["condition"],
            "template": case["template"], "session": case["session"], "turn": case["turn"], "source": case["path"],
            "compact_stop": case["stop"], "claude_label": a["label"], "openai_label": b["label"],
            "claude_cut": a["cut"], "openai_cut": b["cut"], "final_label": label, "final_cut": cut,
            "adjudicated": int(differs),
        })
    if disagreements != set(overrides):
        raise ValueError("Unrequested adjudications")
    return result, population, labels, cuts, tables, strata, stop_cut

def csv_bytes(rows):
    stream = io.StringIO(newline="")
    writer = csv.DictWriter(stream, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return stream.getvalue().encode("utf-8")

def compact_summary(data):
    rows, pop, labels, cuts, tables, strata, stop_cut = data
    return {
        "population": pop, "selected": len(rows), "labels": dict(labels), "visible_cut": dict(cuts),
        "agreement": {key: [sum(n for (a, b), n in table.items() if a == b), sum(table.values())] for key, table in tables.items()},
        "cross_tabs": {key: [[a, b, n] for (a, b), n in sorted(table.items())] for key, table in tables.items()},
        "adjudicated": sum(r["adjudicated"] for r in rows),
        "summary_strata": [[*key, sum(values.values()), values["unassessable"], values["unresolved"], sum(values.values()) - values["unassessable"] - values["unresolved"]] for key, values in sorted(strata.items())],
        "summary_stop_by_visible_cut": dict(stop_cut),
    }

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="include cross-tabs and strata")
    options = parser.parse_args()
    data = reconcile()
    export = csv_bytes(data[0])
    if export != (HERE / "audit.csv").read_bytes().replace(b"\r\n", b"\n"):
        raise SystemExit("audit.csv differs from reconstructed rows")
    summary = compact_summary(data)
    print(json.dumps(summary if options.json else {"rows": len(data[0]), "agreement": summary["agreement"], "csv_sha256": hashlib.sha256(export).hexdigest()}, ensure_ascii=False, indent=2))
