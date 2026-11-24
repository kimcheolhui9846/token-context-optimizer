// FCP: compare independent runs A and B (protocol section 10). A stays the primary result whatever this finds.
// Usage: node src/fcp-compare.mjs --a <run-a> --b <run-b> --score-a <score-a> --score-b <score-b> --out <comparison.json>
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RUN_EVIDENCE_FILES, sha256 } from "./fcp-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const [a, b, sa, sb, out] = ["--a", "--b", "--score-a", "--score-b", "--out"].map(arg);
if (!a || !b || !sa || !sb || !out) throw new Error("--a, --b, --score-a, --score-b and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const jsonl = (d, f) => readFileSync(join(d, f), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);

const bytes = {};
for (const f of RUN_EVIDENCE_FILES) bytes[f] = sha256(readFileSync(join(a, f))) === sha256(readFileSync(join(b, f)));
for (const f of ["score.json", "summary.md"]) bytes[`score/${f}`] = sha256(readFileSync(join(sa, f))) === sha256(readFileSync(join(sb, f)));

// guard-summary.json names its steps after the run (fcp-a-*, fcp-b-*), so its bytes always differ between runs.
// Post-measurement addition (protocol section 13): compare it with the run label removed; the byte result stays reported.
const guardNorm = (d) => JSON.stringify(JSON.parse(readFileSync(join(d, "guard-summary.json"), "utf8")), (k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).map(([kk, vv]) => [kk.replace(/^fcp-[a-z]+-/, "fcp-*-"), vv])) : Array.isArray(v) ? v.map((s) => (typeof s === "string" ? s.replace(/^fcp-[a-z]+-/, "fcp-*-") : s)) : v));
const guardSameWithoutRunLabel = guardNorm(a) === guardNorm(b);
// score.json embeds the evidence hashes, so it carries the guard-summary hash: compare it without that one entry.
const scoreWithoutGuardHash = (d) => { const s = JSON.parse(readFileSync(join(d, "score.json"), "utf8")); delete s.evidence["guard-summary.json"]; return JSON.stringify(s); };
const scoreSameWithoutGuardHash = scoreWithoutGuardHash(sa) === scoreWithoutGuardHash(sb);
const field = {};
const diff = (name, id, x, y) => { if (!same(x, y)) (field[name] ||= []).push(id); };
const ca = new Map(jsonl(a, "caller.jsonl").map((r) => [r.id, r]));
const cb = new Map(jsonl(b, "caller.jsonl").map((r) => [r.id, r]));
for (const [id, x] of ca) {
  const y = cb.get(id);
  diff("caller.status", id, x.status, y?.status);
  diff("caller.ocrLines", id, x.ocrLines, y?.ocrLines);
  diff("caller.matched", id, x.matched, y?.matched);
  diff("caller.band", id, x.band, y?.band);
}
const ra = new Map(jsonl(a, "raw.jsonl").map((r) => [r.key, r]));
const rb = new Map(jsonl(b, "raw.jsonl").map((r) => [r.key, r]));
for (const [k, x] of ra) {
  const y = rb.get(k);
  diff("raw.request", k, x.requestRect, y?.requestRect);
  diff("raw.returned", k, x.returned, y?.returned);
  diff("raw.jpeg", k, [x.crop.jpegSha256, x.crop.jpegBytes, x.crop.decodedWidth, x.crop.decodedHeight], y && [y.crop.jpegSha256, y.crop.jpegBytes, y.crop.decodedWidth, y.crop.decodedHeight]);
  diff("raw.failure", k, [x.outcome, x.failStage, x.failCode], y && [y.outcome, y.failStage, y.failCode]);
  diff("raw.row", k, x, y);
}
const xa = JSON.parse(readFileSync(join(sa, "score.json"), "utf8"));
const xb = JSON.parse(readFileSync(join(sb, "score.json"), "utf8"));
const pb = new Map(xb.perRow.map((r) => [r.key, r]));
for (const r of xa.perRow) diff("score.row", r.key, r, pb.get(r.key));
const aggregateSame = same(xa.aggregate, xb.aggregate);
const meta = (d, f) => { try { return JSON.parse(readFileSync(join(d, f), "utf8")); } catch { return null; } };
const nondeterministic = Object.fromEntries([["a", a], ["b", b]].map(([n, d]) => [n, {
  collectStartedAt: meta(d, "caller-meta.json")?.startedAt, collectTotalMs: meta(d, "caller-meta.json")?.totalMs,
  runStartedAt: meta(d, "run-meta.json")?.startedAt, runTotalMs: meta(d, "run-meta.json")?.totalMs,
}]));
const keysCompared = { callerIds: ca.size, rawKeys: ra.size, scoreRows: xa.perRow.length };
const identical = Object.entries(bytes).every(([f, v]) => v || (f === "guard-summary.json" && guardSameWithoutRunLabel) || (f === "score/score.json" && scoreSameWithoutGuardHash)) && Object.keys(field).length === 0 && aggregateSame && cb.size === ca.size && rb.size === ra.size;
const result = { primary: "A", identical, keysCompared, bytesEqual: bytes, guardSameWithoutRunLabel, scoreSameWithoutGuardHash, fieldDifferences: field, aggregateSame, excluded: "times, paths and durations (listed under nondeterministic, never compared)", nondeterministic };
writeFileSync(out, `${JSON.stringify(result, null, 1)}\n`);
console.log(JSON.stringify({ identical, differences: Object.fromEntries(Object.entries(field).map(([k, v]) => [k, v.length])), aggregateSame }));
