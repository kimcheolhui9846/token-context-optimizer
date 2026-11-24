// ko-row-gate: scoring of frozen W1/W2/W3 predictions (protocol research/plans/2026-11-24-ko-row-gate-protocol.md, 5).
// Usage (from research/): node src/ko-row-gate-score.mjs --replay <replay dir> --out <new dir>
// Opens scoring/ (design.json, gold.json, render.json) only after the prediction file matches its freeze.json and every
// prediction passed the input validation. Exit 3 = task verification failure; writes invalid.json and no score.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadFixedLib, researchDir } from "./ko-row-gate-fixed.mjs";
import { DATA_COMMIT, MANIFEST_SHA256, PAGES, frozenDataReader, readScoringInputs } from "./ko-row-gate-data.mjs";
import { ValidationError, checkIdSet, scorePage, summarizeScores, validatePrediction } from "./ko-row-gate-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const replay = arg("--replay"), out = arg("--out");
if (!replay || !out) throw new Error("--replay and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;
const lib = await loadFixedLib();
mkdirSync(out, { recursive: true });

/** Whether the prediction file is the committed blob at HEAD (frozen before scoring). */
function committedAtHead(file) {
  try {
    const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: researchDir, encoding: "utf8", windowsHide: true }).trim();
    const rel = relative(root, resolve(file)).split("\\").join("/");
    if (rel.startsWith("..")) return false;
    const atHead = execFileSync("git", ["rev-parse", `HEAD:${rel}`], { cwd: researchDir, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const mine = execFileSync("git", ["hash-object", "--no-filters", file], { cwd: researchDir, encoding: "utf8", windowsHide: true }).trim();
    return atHead === mine;
  } catch { return false; }
}

try {
  const fz = JSON.parse(readFileSync(join(replay, "freeze.json"), "utf8")).files;
  const pfile = join(replay, "predictions.jsonl");
  const got = lib.sha256(readFileSync(pfile));
  if (fz?.["predictions.jsonl"] !== got) throw new ValidationError(`predictions.jsonl SHA-256 ${got} differs from freeze.json`);
  const text = readFileSync(pfile, "utf8");
  if (text.includes("\r")) throw new ValidationError("predictions.jsonl has CR");
  const preds = lib.parseJsonl(text);
  if (preds.length !== PAGES) throw new ValidationError(`${preds.length} predictions, not ${PAGES}`);
  for (const p of preds) validatePrediction(p); // before the scoring side is opened
  // only now the scoring side is opened
  const pages = readScoringInputs(frozenDataReader());
  checkIdSet(preds, pages.map((p) => p.id));
  const area = pages[0].width * pages[0].height;
  if (!pages.every((p) => p.width * p.height === area)) throw new ValidationError("page areas differ");
  const rows = pages.map((page, i) => {
    const p = preds[i];
    if (p.width !== page.width || p.height !== page.height) throw new ValidationError(`${p.id}: prediction size differs from design`);
    return scorePage(p, page, lib.scoreKey);
  });
  const summary = summarizeScores(rows, { pageArea: area, preds });
  const inv = summary.invariants;
  if (inv.w3InW1W2 !== inv.checked || inv.nested !== inv.checked || !inv.lost3SubsetLost2 || !inv.events3SubsetEvents2 || inv.newlyFullW3 || inv.newEvidenceW3 || inv.recoveredNotFullPage) {
    throw new ValidationError(`W3 invariant broken: ${JSON.stringify(inv)}`);
  }
  writeFileSync(join(out, "score.jsonl"), lib.jsonl(rows));
  writeFileSync(join(out, "summary.json"), pretty({
    version: "ko-row-gate-summary-1", dataCommit: DATA_COMMIT, manifestSha256: MANIFEST_SHA256, predictionsSha256: got, pageArea: area, ...summary,
  }));
  // not deterministic across runs (depends on HEAD); kept out of summary.json
  writeFileSync(join(out, "score-meta.json"), pretty({ predictionsCommittedAtHead: committedAtHead(pfile), head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: researchDir, encoding: "utf8", windowsHide: true }).trim() }));
  const t = summary.groups.total;
  console.log(`done: strict W1 ${t.strict.w1} W2 ${t.strict.w2} W3 ${t.strict.w3} /${t.n}; L2 ${t.L2.count}/${t.L2.denom}; L3 ${t.L3.count}/${t.L3.denom}; prevented ${t.prevented.count}/${t.prevented.of}; cut ${t.cut}, applied ${t.applied}; opportunity ${t.opportunity.count}, events W2 ${t.event2.count} W3 ${t.event3.count}; verdict ${JSON.stringify(t.verdict)}`);
} catch (err) {
  const verification = err instanceof ValidationError;
  writeFileSync(join(out, "invalid.json"), pretty({ verificationFailure: verification, message: String(err?.message || err).slice(0, 500) }));
  console.error(`${verification ? "verification failure" : "error"}: ${err?.message || err}`);
  process.exitCode = 3;
}
