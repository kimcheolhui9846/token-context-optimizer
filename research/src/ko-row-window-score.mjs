// ko-row-window: scoring of frozen W0/W1 predictions (protocol research/plans/2026-11-24-ko-row-window-protocol.md, 5).
// Usage (from research/): node src/ko-row-window-score.mjs --replay <replay dir> --out <new dir>
// Opens design.json, gold.json and render.json only after the prediction file matches its freeze.json.
// Exit 3 = task verification failure (hashes, ids, invariants); writes invalid.json and no score.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { loadFixedLib, researchDir } from "./ko-row-window-fixed.mjs";
import { DATA_COMMIT, MANIFEST_SHA256, PAGES, frozenDataReader, readScoringInputs } from "./ko-row-window-data.mjs";
import { ValidationError, checkIdSet, scorePage, summarizeScores } from "./ko-row-window-lib.mjs";

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
  const preds = lib.parseJsonl(readFileSync(pfile, "utf8"));
  // only now the scoring side is opened
  const pages = readScoringInputs(frozenDataReader());
  checkIdSet(preds, pages.map((p) => p.id));
  const area = PAGES && pages[0].width * pages[0].height;
  if (!pages.every((p) => p.width * p.height === area)) throw new ValidationError("page areas differ");
  const invariants = { w1ContainsW0: 0, sameLeftTopHeight: 0, sameMatchState: 0, checked: 0 };
  const rows = pages.map((page, i) => {
    const p = preds[i];
    if (p.width !== page.width || p.height !== page.height) throw new ValidationError(`${p.id}: prediction size differs from design`);
    if (p.state === "matched") {
      invariants.checked++;
      const a = p.w0, b = p.w1;
      if (!(b.left <= a.left && b.top <= a.top && b.left + b.width >= a.left + a.width && b.top + b.height >= a.top + a.height)) throw new ValidationError(`${p.id}: W1 does not contain W0`);
      invariants.w1ContainsW0++;
      if (b.left !== a.left || b.top !== a.top || b.height !== a.height) throw new ValidationError(`${p.id}: W1 changed left/top/height`);
      invariants.sameLeftTopHeight++;
    } else if (p.w0 !== null || p.w1 !== null) throw new ValidationError(`${p.id}: unmatched/error row carries a window`);
    invariants.sameMatchState++;
    return scorePage(p, page, lib.scoreKey);
  });
  const summary = summarizeScores(rows, { pageArea: area });
  writeFileSync(join(out, "score.jsonl"), lib.jsonl(rows));
  writeFileSync(join(out, "summary.json"), pretty({
    version: "ko-row-window-summary-1", dataCommit: DATA_COMMIT, manifestSha256: MANIFEST_SHA256, predictionsSha256: got,
    pageArea: area, invariants, ...summary,
  }));
  // not deterministic across runs (depends on HEAD); kept out of summary.json
  writeFileSync(join(out, "score-meta.json"), pretty({ predictionsCommittedAtHead: committedAtHead(pfile), head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: researchDir, encoding: "utf8", windowsHide: true }).trim() }));
  const t = summary.groups.total;
  console.log(`done: W0 strict ${t.w0.strict}/${t.n}, W1 strict ${t.w1.strict}/${t.n}, recovered ${t.transition.recovered}, lost ${t.transition.lost}, widened ${t.widened}`);
} catch (err) {
  const verification = err instanceof ValidationError;
  writeFileSync(join(out, "invalid.json"), pretty({ verificationFailure: verification, message: String(err?.message || err).slice(0, 500) }));
  console.error(`${verification ? "verification failure" : "error"}: ${err?.message || err}`);
  process.exitCode = 3;
}
