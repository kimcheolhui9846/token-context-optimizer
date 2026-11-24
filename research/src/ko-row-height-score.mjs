// ko-row-height: scoring of frozen W0/W1/W2 predictions (protocol research/plans/2026-11-24-ko-row-height-protocol.md, 5).
// Usage (from research/): node src/ko-row-height-score.mjs --replay <replay dir> --out <new dir>
// Opens scoring/ (design.json, gold.json, render.json) only after the prediction file matches its freeze.json and every
// prediction passed the input validation. Exit 3 = task verification failure; writes invalid.json and no score.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadFixedLib, researchDir } from "./ko-row-height-fixed.mjs";
import { DATA_COMMIT, MANIFEST_SHA256, PAGES, frozenDataReader, readScoringInputs } from "./ko-row-height-data.mjs";
import { ValidationError, checkIdSet, exposure, scorePage, summarizeScores, validatePrediction } from "./ko-row-height-lib.mjs";

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
  const invariants = { checked: 0, w2InsideW1: 0, sameLeftWidth: 0, hitsInsideW2: 0, newlyFullW2: 0, newEvidenceW2: 0 };
  const rows = pages.map((page, i) => {
    const p = preds[i];
    if (p.width !== page.width || p.height !== page.height) throw new ValidationError(`${p.id}: prediction size differs from design`);
    const row = scorePage(p, page, lib.scoreKey);
    if (p.state === "matched") {
      invariants.checked++;
      invariants.w2InsideW1++; // validatePrediction threw otherwise
      invariants.sameLeftWidth++;
      if (p.w2Reason === "cut" || p.w2Reason === "no_cut") invariants.hitsInsideW2++;
      for (const it of row.others.items) if (it.w2 === "full" && it.w1 !== "full") invariants.newlyFullW2++;
      for (const part of page.parts) if (exposure(part, p.w2) === "full" && exposure(part, p.w1) !== "full") invariants.newEvidenceW2++;
    }
    return row;
  });
  if (invariants.newlyFullW2 || invariants.newEvidenceW2) throw new ValidationError(`W2 newly holds ink that W1 did not: ${JSON.stringify(invariants)}`);
  const summary = summarizeScores(rows, { pageArea: area });
  writeFileSync(join(out, "score.jsonl"), lib.jsonl(rows));
  writeFileSync(join(out, "summary.json"), pretty({
    version: "ko-row-height-summary-1", dataCommit: DATA_COMMIT, manifestSha256: MANIFEST_SHA256, predictionsSha256: got,
    pageArea: area, invariants, ...summary,
  }));
  // not deterministic across runs (depends on HEAD); kept out of summary.json
  writeFileSync(join(out, "score-meta.json"), pretty({ predictionsCommittedAtHead: committedAtHead(pfile), head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: researchDir, encoding: "utf8", windowsHide: true }).trim() }));
  const t = summary.groups.total;
  console.log(`done: strict W0 ${t.strict.w0} W1 ${t.strict.w1} W2 ${t.strict.w2} /${t.n}; L ${t.L.count}/${t.L.denom}; J ${t.J.count}/${t.J.opportunity}; widened ${t.widened}, cut ${t.cut}; verdict ${JSON.stringify(t.verdict)}`);
} catch (err) {
  const verification = err instanceof ValidationError;
  writeFileSync(join(out, "invalid.json"), pretty({ verificationFailure: verification, message: String(err?.message || err).slice(0, 500) }));
  console.error(`${verification ? "verification failure" : "error"}: ${err?.message || err}`);
  process.exitCode = 3;
}
