import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { policyCorpus } from "./policy-corpus.js";

type Classification = { mode: string; reasons: string[]; warnings: string[] };
type Overlay = { id: string; content: string; classification: Classification; oldClassification?: Classification };
const fixture = JSON.parse(readFileSync(resolve("tests/fixtures/policy/f21-uri-expectations.json"), "utf8")) as { entries: Overlay[] };
const frozen = JSON.parse(readFileSync(resolve("tests/fixtures/policy/characterization.json"), "utf8")) as { entries: Overlay[] };
const byId = new Map(fixture.entries.map((entry) => [entry.id, entry]));
const frozenById = new Map(frozen.entries.map((entry) => [entry.id, entry]));
const consumed = new Set<string>();
if (byId.size !== fixture.entries.length) throw new Error("duplicate F-21 overlay ID");

export function classifyF21Expectation(id: string, content: string): Classification {
  const overlay = byId.get(id);
  if (overlay) {
    if (overlay.content !== content) throw new Error(`F-21 content drift for ${id}`);
    consumed.add(id);
    return overlay.classification;
  }
  const frozenEntry = frozenById.get(id);
  if (!frozenEntry || frozenEntry.content !== content) throw new Error(`unknown F-21 fixture ${id}`);
  return frozenEntry.classification;
}

export function assertF21OverlayComplete(): void {
  for (const entry of fixture.entries) {
    const frozenEntry = frozenById.get(entry.id);
    if (!policyCorpus.some((candidate) => candidate.id === entry.id && candidate.content === entry.content)) throw new Error(`unused F-21 overlay ${entry.id}`);
    if (!frozenEntry || frozenEntry.content !== entry.content) throw new Error(`unknown or drifted F-21 overlay ${entry.id}`);
    if (entry.oldClassification && JSON.stringify(entry.oldClassification) !== JSON.stringify(frozenEntry.classification)) throw new Error(`old-result drift for ${entry.id}`);
    if (!entry.oldClassification || JSON.stringify(entry.oldClassification) === JSON.stringify(entry.classification)) throw new Error(`non-changing F-21 overlay ${entry.id}`);
    if (!consumed.has(entry.id)) throw new Error(`unused F-21 overlay ${entry.id}`);
  }
}
