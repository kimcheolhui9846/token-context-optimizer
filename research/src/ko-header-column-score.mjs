// ko-header-column: scoring of frozen W1-W4 predictions (protocol research/plans/2026-11-25-ko-header-column-protocol.md, 4.3, 5).
// Usage (from research/): node src/ko-header-column-score.mjs --replay <replay dir> --out <new dir>
// Opens scoring/ (design.json, gold.json, render.json) only after the prediction file matches its freeze.json and every
// prediction passed the input validation. Records the scoring start time (UTC) and whether the prediction file is the blob
// committed at HEAD. Exit 3 = task verification failure; writes invalid.json and no score.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadFixedLib, loadFixedW3, researchDir } from "./ko-header-column-fixed.mjs";
import { DATA_COMMIT, MANIFEST_SHA256, PAGES, frozenDataReader, readScoringInputs } from "./ko-header-column-data.mjs";
import { ValidationError, checkIdSet, scorePage, summarizeScores, validatePrediction } from "./ko-header-column-lib.mjs";

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const replay = arg("--replay"), out = arg("--out");
if (!replay || !out) throw new Error("--replay and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
const pretty = (o) => `${JSON.stringify(o, null, 1)}\n`;
const lib = await loadFixedLib();
const w3lib = await loadFixedW3();
const git = (a) => execFileSync("git", a, { cwd: researchDir, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trim();
mkdirSync(out, { recursive: true });

/** Whether the prediction file is the committed blob at HEAD (frozen before scoring). */
function committedAtHead(file) {
  try {
    const root = git(["rev-parse", "--show-toplevel"]);
    const rel = relative(root, resolve(file)).split("\\").join("/");
    if (rel.startsWith("..")) return false;
    return git(["rev-parse", `HEAD:${rel}`]) === git(["hash-object", "--no-filters", file]);
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
  for (const p of preds) validatePrediction(p, w3lib.validatePrediction); // before the scoring side is opened
  const meta = { scoringStartedAt: new Date().toISOString(), predictionsCommittedAtHead: committedAtHead(pfile), head: git(["rev-parse", "HEAD"]) };
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
  if (inv.w4InW1W2 !== inv.checked || inv.nested !== inv.checked || !inv.lost4SubsetLost2 || !inv.events4SubsetEvents2 || !inv.appliedIsW2 || inv.recoveredNotFullPage) {
    throw new ValidationError(`W4 invariant broken: ${JSON.stringify(inv)}`);
  }
  writeFileSync(join(out, "score.jsonl"), lib.jsonl(rows));
  writeFileSync(join(out, "summary.json"), pretty({
    version: "ko-header-column-summary-1", dataCommit: DATA_COMMIT, manifestSha256: MANIFEST_SHA256, predictionsSha256: got, pageArea: area, ...summary,
  }));
  // not deterministic across runs (time, HEAD); kept out of summary.json
  writeFileSync(join(out, "score-meta.json"), pretty(meta));
  const t = summary.groups.total, v = summary.verdict;
  console.log(`done: strict W1 ${t.strict.w1} W2 ${t.strict.w2} W3 ${t.strict.w3} W4 ${t.strict.w4} /${t.n}; L4 ${t.L4.count}/${t.L4.denom}; applied ${t.applied}; J4 ${t.event4.count}; verdict ${v.geometry}/${v.reading.status} -> ${v.final}`);
} catch (err) {
  const verification = err instanceof ValidationError;
  writeFileSync(join(out, "invalid.json"), pretty({ verificationFailure: verification, message: String(err?.message || err).slice(0, 500) }));
  console.error(`${verification ? "verification failure" : "error"}: ${err?.message || err}`);
  process.exitCode = 3;
}
