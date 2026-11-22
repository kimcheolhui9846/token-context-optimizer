// R08: build the compact committed evidence (results/r08-parity/*.json*) from a scratch folder (no model calls).
// Usage (from research/): node src/r08-evidence.mjs --scratch <S> --out <new empty dir>
// Reads the fixed layout of docs/research/r08-research-product-parity.md §5: <S>/runs/*, <S>/parity-report.json,
// <S>/jpeg/{p612-latest.json,entry.jsonl,jpeg-report.json}. Compare the output with results/r08-parity/ byte for byte.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hashOf, normalizeResponse } from "./r08-excerpt-parity.mjs";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
const S = resolve(opt("--scratch"));
const outDir = resolve(opt("--out"));
if (existsSync(outDir) && readdirSync(outDir).length) throw new Error(`${outDir} is not empty`);
mkdirSync(outDir, { recursive: true });
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const jsonl = (p) => readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const keyOf = (x) => `${x.split}/${x.session}/${x.turn}/${x.variant}`;
const roles = ["exp3", "pre002", "post002", "latest"];

// Per-key rows from repetition 1 (the comparator checked that repetition 2 has the same normalized hash for every key).
const caps = Object.fromEntries(roles.map((r) => [r, new Map(jsonl(join(S, "runs", `capture-${r}-1.jsonl`)).filter((x) => x.kind === "query").map((x) => [keyOf(x), x]))]));
const bench = Object.fromEntries(roles.map((r) => [r, new Map(jsonl(join(S, "runs", `bench-${r}-1`, "rows.jsonl")).map((x) => [keyOf(x), x]))]));
const rows = [...caps.latest.keys()].sort().map((k) => {
  const c = caps.latest.get(k);
  const o = { key: k, type: c.type, applicable: c.applicable, goldLine: c.goldLine };
  for (const r of roles) {
    const n = normalizeResponse(caps[r].get(k));
    const b = bench[r].get(k);
    o[r] = { h: hashOf(n).slice(0, 16), ranges: n.excerpts?.map((e) => [e.startLine, e.endLine]) ?? null,
      hit: b.applicable ? Boolean(b.goldCovered && (b.type.startsWith("cross") || b.answerInExcerpt)) : null,
      hitAny: b.applicable ? Boolean(b.anyCovered && (b.type.startsWith("cross") || b.anyAnswer)) : null };
  }
  return o;
});
writeFileSync(join(outDir, "excerpt-keys.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");

const rep = JSON.parse(readFileSync(join(S, "parity-report.json"), "utf8"));
const totals2 = (t) => Object.fromEntries(Object.entries(t).filter(([k]) => k.split("/").length === 2));
const excerpt = {
  schema: "r08-excerpt-parity/v3", failures: rep.failures, attention: rep.attention, expectedKeys: rep.expectedKeys, roles: rep.roles, runtime: rep.runtime,
  unstableKeys: Object.fromEntries(Object.entries(rep.unstable).map(([k, v]) => [k, v.length])),
  manifestCheck: rep.manifestCheck,
  pairs: rep.pairs,
  roleSummaries: Object.fromEntries(Object.entries(rep.roleSummaries).map(([k, v]) => [k, { ...v, totals: totals2(v.totals), totalsByType: Object.fromEntries(Object.entries(v.totals).filter(([x]) => x.split("/").length === 3)) }])),
  storedComparisons: Object.fromEntries(Object.entries(rep.storedComparisons).map(([k, v]) => [k, { role: v.role, storedRows: v.storedRows, joinedRows: v.joinedRows, structural: v.structural, comparedFields: v.comparedFields, differingRows: v.differing.length, rerunOnlyFields: v.rerunOnlyFields, storedTotals: totals2(v.storedTotals), rerunTotals: totals2(v.rerunTotals) }])),
  rawSha256: Object.fromEntries(roles.flatMap((r) => [1, 2].flatMap((n) => [[`capture-${r}-${n}.jsonl`, sha(join(S, "runs", `capture-${r}-${n}.jsonl`))], [`bench-${r}-${n}/rows.jsonl`, sha(join(S, "runs", `bench-${r}-${n}`, "rows.jsonl"))]]))),
  excerptKeysSha256: sha(join(outDir, "excerpt-keys.jsonl")),
};
writeFileSync(join(outDir, "excerpt-summary.json"), JSON.stringify(excerpt, null, 2) + "\n");

const j = JSON.parse(readFileSync(join(S, "jpeg", "jpeg-report.json"), "utf8"));
const entry = jsonl(join(S, "jpeg", "entry.jsonl"));
const lab = (x) => (x === undefined ? "n/a" : x.ok ? `pass:${x.validationProfile}` : `reject:${x.code ?? x.text}`);
const jpeg = {
  schema: "r08-jpeg-parity/v3", failures: j.failures, attention: j.attention, expectedBundles: j.expectedBundles, fixtureFileCount: j.fixtureFileCount,
  probe: j.probe, entry: { ...j.entry }, otherRoles: j.otherRoles.map(({ disagreements, ...o }) => ({ ...o, disagreementCount: disagreements.length })),
  rq1SettingsOnly: j.rq1SettingsOnly, fixtures: { ...j.fixtures }, meta: j.meta,
  tools: entry.filter((r) => r.kind === "tools"),
  rawSha256: { "p612-latest.json": sha(join(S, "jpeg", "p612-latest.json")), "entry.jsonl": sha(join(S, "jpeg", "entry.jsonl")) },
  fixtureCalls: entry.filter((r) => r.kind === "call" && r.set.startsWith("fixture:")).map((r) => [r.role, `${r.set.slice(8)}/${r.id}`, lab(r.default), lab(r.tolerant)]),
};
writeFileSync(join(outDir, "jpeg-summary.json"), JSON.stringify(jpeg, null, 2) + "\n");
console.log(JSON.stringify(Object.fromEntries(readdirSync(outDir).map((f) => [f, sha(join(outDir, f))]))));
