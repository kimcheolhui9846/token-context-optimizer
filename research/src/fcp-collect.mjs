// FCP collector (protocol 6.1): one English OCR pass and the frozen selector per image -> caller assignment.
// Usage: node src/fcp-collect.mjs --frozen <frozen dir> --out <new run dir>
// Reads only freeze-manifest.json (hashes) and selector-input/ (questions, index, PNG). Never reads oracle/.
// One OCR worker, images in question order, exactly once each, no retry. An exception, a timeout or an invalid band is
// a technical error kept as a row. Writes caller.jsonl (deterministic), caller-evidence.json and caller-meta.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { cacheDir } from "./env.mjs";
import { SELECTOR_C1, createOcr, selectWindow } from "./selector.mjs";
import { COLLECT_CODE_FILES, OCR_SHA256, PRODUCT_COMMIT, SELECTOR_BLOB, SELECTOR_TIMEOUT_MS, runCodeState, sha256, validBand } from "./fcp-lib.mjs";
import { loadSelectorInput } from "./fcp-inputs.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const frozen = arg("--frozen");
const out = arg("--out");
const nonMeasurement = process.argv.includes("--non-measurement");
if (!frozen || !out) throw new Error("--frozen and --out are required");
if (existsSync(out)) throw new Error(`--out must not exist yet: ${out}`);
if (!/node-netguard\.cjs/.test(process.env.NODE_OPTIONS ?? "") && !nonMeasurement) throw new Error("offline guard missing: set NODE_OPTIONS=--require=<tools/d03/guard/node-netguard.cjs>");

// ---------------------------------------------------------------- code and asset identity before reading inputs
const code = runCodeState(here, COLLECT_CODE_FILES);
if (!code.clean && !nonMeasurement) throw new Error(`collector code differs from HEAD ${code.commit}`);
const git = (args) => execFileSync("git", args, { cwd: here, encoding: "utf8" }).trim();
const selectorBlob = git(["hash-object", join(here, "selector.mjs")]);
if (selectorBlob !== SELECTOR_BLOB) throw new Error(`selector blob ${selectorBlob} is not ${SELECTOR_BLOB}`);
if (git(["rev-parse", `${PRODUCT_COMMIT}:research/src/selector.mjs`]) !== SELECTOR_BLOB) throw new Error("selector differs at the product commit");
const ocrSha = sha256(readFileSync(join(cacheDir, "eng.traineddata")));
if (ocrSha !== OCR_SHA256) throw new Error(`OCR data SHA ${ocrSha} is not ${OCR_SHA256}`);
const input = loadSelectorInput(frozen, { allowUncommitted: nonMeasurement });

// ---------------------------------------------------------------- one pass
const withTimeout = (p, ms) => {
  let timer;
  return Promise.race([p.finally(() => clearTimeout(timer)), new Promise((_, rej) => (timer = setTimeout(() => rej(new Error(`timeout ${ms} ms`)), ms)))]);
};
mkdirSync(out, { recursive: true });
const started = Date.now();
let ocr = await createOcr();
const lines = [];
const timing = [];
for (const im of input.images) {
  const t0 = Date.now();
  const { width, height } = im.page;
  let rec;
  try {
    const bytes = readFileSync(im.path);
    if (sha256(bytes) !== im.sha256) throw new Error("input_sha_changed");
    const ocrLines = await withTimeout(ocr.lines(bytes), SELECTOR_TIMEOUT_MS);
    const sel = selectWindow(ocrLines, im.question, width, height);
    rec = { id: im.id, status: "ok", error: null, width, height, keys: sel.keys, matched: sel.matched, score: sel.score ?? 0, lineText: sel.lineText ?? null, confidence: sel.confidence ?? null, axisRow: sel.axisRow ?? null, band: sel.band ?? null, ocrLineCount: ocrLines.length, ocrLines };
    if (sel.matched && !validBand(sel.band, width, height)) rec = { ...rec, status: "error", error: "invalid_output" };
  } catch (err) {
    rec = { id: im.id, status: "error", error: String(err.message || err).slice(0, 200), width, height, keys: null, matched: null, score: null, lineText: null, confidence: null, axisRow: null, band: null, ocrLineCount: null, ocrLines: null };
    if (/^timeout/.test(rec.error)) {
      await ocr.terminate().catch(() => {});
      ocr = await createOcr();
    }
  }
  lines.push(JSON.stringify(rec));
  timing.push({ id: im.id, ms: Date.now() - t0 });
  console.log(`${im.id}: ${rec.status} ${rec.status === "ok" ? (rec.matched ? `matched ${JSON.stringify(rec.band)}` : "no match") : rec.error}`);
}
await ocr.terminate();
const callerBytes = Buffer.from(`${lines.join("\n")}\n`);
writeFileSync(join(out, "caller.jsonl"), callerBytes);
writeFileSync(join(out, "caller-evidence.json"), `${JSON.stringify({ hashBasis: "SHA-256 of raw file bytes", files: { "caller.jsonl": sha256(callerBytes) }, freezeManifestSha256: input.manifestSha }, null, 1)}\n`);
writeFileSync(join(out, "caller-meta.json"), `${JSON.stringify({
  selector: SELECTOR_C1, selectorBlob, timeoutMs: SELECTOR_TIMEOUT_MS, ocrDataSha256: ocrSha, node: process.version, platform: `${process.platform}-${process.arch}`,
  codeCommit: code.commit, codeCheckedBeforeMeasurement: { clean: code.clean, files: code.files }, freezeManifest: { sha256: input.manifestSha, blob: input.manifestBlob, committed: input.manifestCommitted },
  offlineGuard: /node-netguard\.cjs/.test(process.env.NODE_OPTIONS ?? ""), nonMeasurement, startedAt: new Date(started).toISOString(), totalMs: Date.now() - started, timing,
}, null, 1)}\n`);
