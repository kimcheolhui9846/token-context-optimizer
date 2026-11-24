// Korean anchor signal diagnostic CLI (protocol research/plans/2026-11-24-ko-anchor-diagnostic-protocol.md).
//   node src/ko-anchor-diagnostic.mjs --out <new dir>      measure: verify sources, replay 96, collect, pin, score
//   node src/ko-anchor-diagnostic.mjs --verify <dir>       recompute everything and compare every output file byte for byte
// Both modes refuse to run without the D03 offline guard (NODE_OPTIONS=--require=<tools/d03/guard/node-netguard.cjs>).
// Inputs are the six fixed Git blobs only. The selector is imported unchanged; no OCR is initialised or rerun.
// Exit 0 = done, 1 = verify mismatch or error, 2 = stop rule hit (stop.json written, no scoring).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  DATASETS, FILE_KINDS, SELECTOR_BLOB, SOURCES, checkSelectorFile, collect, gitBlobId, jsonl, parseDataset, pretty,
  projectForCollector, readSources, replayRow, scoreRow, sha256, sourceControl, summarize, validateDataset,
} from "./ko-anchor-diagnostic-lib.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const out = arg("--out");
const verifyDir = arg("--verify");
if (!out === !verifyDir) throw new Error("give exactly one of --out <new dir> or --verify <dir>");
if (!/node-netguard\.cjs/.test(process.env.NODE_OPTIONS ?? "")) throw new Error("offline guard missing: set NODE_OPTIONS=--require=<research/tools/d03/guard/node-netguard.cjs>");
if (out && existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);

const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: here, encoding: "utf8", windowsHide: true }).trim();
const selectorPath = join(here, "selector.mjs");
checkSelectorFile(repo, selectorPath);
const { selectWindow } = await import(pathToFileURL(selectorPath).href);

const files = {};
const stop = (stage, problems, extra = {}) => {
  files["stop.json"] = pretty({ stoppedAt: stage, problems, ...extra });
  return 2;
};

function run() {
  // ---------------------------------------------------------------- 4.1 sources
  const bytes = readSources(repo);
  files["sources.json"] = pretty({
    selector: { path: "research/src/selector.mjs", blob: SELECTOR_BLOB },
    datasets: Object.fromEntries(DATASETS.map((ds) => [ds, {
      commit: SOURCES[ds].commit,
      files: Object.fromEntries(FILE_KINDS.map((k) => [k, { path: SOURCES[ds][k].path, blob: gitBlobId(bytes[ds][k]), sha256: sha256(bytes[ds][k]), bytes: bytes[ds][k].length }])),
    }])),
  });
  const data = Object.fromEntries(DATASETS.map((ds) => [ds, parseDataset(bytes[ds])]));
  const problems = DATASETS.flatMap((ds) => validateDataset(ds, data[ds]));
  if (problems.length) return stop("source_validation", problems, { denominators: Object.fromEntries(DATASETS.map((ds) => [ds, { questions: data[ds].questions?.length ?? null, ocrRows: data[ds].ocr?.length ?? null }])) });

  // ---------------------------------------------------------------- 4.2 baseline replay (96)
  const replay = [];
  for (const ds of DATASETS) {
    const byId = new Map(data[ds].ocr.map((r) => [r.id, r]));
    for (const q of data[ds].questions) replay.push(replayRow(selectWindow, ds, q, byId.get(q.id)));
  }
  const bad = replay.filter((r) => !r.ok);
  if (bad.length) return stop("baseline_replay", bad.map((r) => `${r.dataset}/${r.id}: ${r.mismatches.join(",")}`), { denominator: replay.length, disagree: bad.length, rows: bad });

  // ---------------------------------------------------------------- 6.1 blind collection (96), then pin hashes
  const collected = [];
  for (const ds of DATASETS) {
    const byId = new Map(data[ds].ocr.map((r) => [r.id, r]));
    for (const q of data[ds].questions) collected.push(collect(projectForCollector(ds, q, byId.get(q.id))));
  }
  files["replay.jsonl"] = jsonl(replay);
  files["collect.jsonl"] = jsonl(collected);
  files["pinned.json"] = pretty({ hashBasis: "SHA-256 of the UTF-8 file bytes, pinned before scoring", "replay.jsonl": sha256(files["replay.jsonl"]), "collect.jsonl": sha256(files["collect.jsonl"]) });
  return 0;
}

function score() {
  // Scoring reads the pinned collection back, not the in-memory rows.
  const pinned = JSON.parse(files["pinned.json"]);
  const colText = out ? readFileSync(join(out, "collect.jsonl"), "utf8") : files["collect.jsonl"];
  const repText = out ? readFileSync(join(out, "replay.jsonl"), "utf8") : files["replay.jsonl"];
  if (sha256(colText) !== pinned["collect.jsonl"] || sha256(repText) !== pinned["replay.jsonl"]) throw new Error("pinned hash changed before scoring");
  const col = colText.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const rep = repText.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const bytes = readSources(repo);
  const designs = Object.fromEntries(DATASETS.map((ds) => [ds, new Map(parseDataset(bytes[ds]).design.images.map((im) => [im.id, im]))]));
  const repKey = new Map(rep.map((r) => [`${r.dataset}\u0000${r.id}`, r]));
  const rows = [];
  for (const c of col) {
    const im = designs[c.dataset].get(c.id);
    if (!(im.lang === "ko" && im.anchor === "nl")) continue;
    const s = scoreRow(c, im, repKey.get(`${c.dataset}\u0000${c.id}`));
    rows.push({ ...s, control: sourceControl(c.dataset, im) });
  }
  files["score.jsonl"] = jsonl(rows);
  files["summary.json"] = pretty(summarize(rep, col, rows, designs));
}

const ORDER = ["sources.json", "replay.jsonl", "collect.jsonl", "pinned.json", "score.jsonl", "summary.json", "stop.json"];
const write = (names) => { for (const n of names) if (files[n] !== undefined) writeFileSync(join(out, n), files[n]); };

let code = run();
if (out) {
  mkdirSync(out, { recursive: true });
  write(ORDER.filter((n) => files[n] !== undefined));
}
if (code === 0) {
  score();
  if (out) write(["score.jsonl", "summary.json"]);
}
if (verifyDir) {
  const diffs = [];
  for (const n of ORDER) {
    const p = join(verifyDir, n);
    const have = existsSync(p) ? readFileSync(p, "utf8") : undefined;
    if (have !== files[n]) diffs.push(n);
  }
  console.log(JSON.stringify({ verify: verifyDir, files: ORDER.filter((n) => files[n] !== undefined), differ: diffs }));
  if (diffs.length) code = 1;
} else {
  console.log(JSON.stringify({ out, status: code === 0 ? "scored" : "stopped", files: ORDER.filter((n) => files[n] !== undefined) }));
}
process.exitCode = code;
