import { deepStrictEqual } from "node:assert";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(readFileSync(join(here, name), "utf8"));
const baselineFiles = ["baseline.json", ...readdirSync(here).filter((name) => /^baseline-supplement-classifier-.*\.json$/u.test(name)).sort()];
const baseline = new Map();
const median = (samples) => samples.map((sample) => sample.elapsedNs).sort((a, b) => a - b)[Math.floor(samples.length / 2)] / 1e6;
for (const file of baselineFiles) {
  const report = read(file);
  for (const group of report.groups) for (const entry of group.sizes) {
    if (entry.classifier.status !== "complete") continue;
    const key = `${group.family}/${entry.size}`;
    const value = entry.classifier.value;
    if (baseline.has(key)) deepStrictEqual(baseline.get(key).classification, value.classification);
    baseline.set(key, { file, classification: value.classification, medianMs: median(value.samples) });
  }
}
const after = read("after.json");
const comparisons = [];
for (const group of after.groups) for (const entry of group.sizes) {
  const key = `${group.family}/${entry.size}`;
  const before = baseline.get(key);
  if (!before || entry.classifier.status !== "complete") throw new Error(`missing completed comparison: ${key}`);
  deepStrictEqual(entry.classifier.value.classification, before.classification, `classification drift: ${key}`);
  comparisons.push({ family: group.family, size: entry.size, baselineFile: before.file, beforeMedianMs: before.medianMs, afterMedianMs: median(entry.classifier.value.samples), classificationEqual: true });
}
if (comparisons.length !== 36 || new Set(comparisons.map((item) => `${item.family}/${item.size}`)).size !== 36) throw new Error("expected 36 unique comparisons");
writeFileSync(join(here, "comparison.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), node: process.version, afterSource: after.source, baselineFiles, comparisons }, null, 2)}\n`);
console.log(`PASS: ${comparisons.length} full classification objects unchanged; comparison.json written`);
