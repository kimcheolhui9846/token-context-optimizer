// FCP product runner (protocol 6.2-6.4). Usage:
//   node src/fcp-run.mjs --frozen <frozen dir> --run <run dir made by fcp-collect.mjs> [--bundle <mjs>] [--tmp <dir>]
// Reads freeze-manifest.json (hashes), selector-input/, the run's caller.jsonl (hash checked against
// caller-evidence.json) and the bundle. Never reads oracle/. For each padding a fresh stdio bundle process over a
// fresh, empty allowed root. Writes raw.jsonl, conditions.jsonl, input-check.json (deterministic), run-meta.json.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { BUNDLE_BLOB, IMAGE_COUNT, PADDINGS, PRODUCT_COMMIT, RUN_CODE_FILES, SELECTOR_BLOB, initFailedRow, keyOf, padRequest, runCodeState, runCropRow, sha256 } from "./fcp-lib.mjs";
import { loadSelectorInput } from "./fcp-inputs.mjs";
import { minimalEnv, startServer } from "./fcp-client.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : undefined);
const frozen = arg("--frozen");
const run = arg("--run");
const bundle = resolve(arg("--bundle") ?? join(here, "..", "..", "bin", "token-context-optimizer.mjs"));
const tmpBase = arg("--tmp") ?? tmpdir();
const nonMeasurement = process.argv.includes("--non-measurement");
if (!frozen || !run) throw new Error("--frozen and --run are required");
if (!/node-netguard\.cjs/.test(process.env.NODE_OPTIONS ?? "") && !nonMeasurement) throw new Error("offline guard missing: set NODE_OPTIONS=--require=<tools/d03/guard/node-netguard.cjs>");
for (const f of ["raw.jsonl", "conditions.jsonl", "input-check.json", "run-meta.json"]) if (existsSync(join(run, f))) throw new Error(`${f} already exists in ${run}`);

// ---------------------------------------------------------------- code identity before reading inputs
const code = runCodeState(here, RUN_CODE_FILES);
if (!code.clean && !nonMeasurement) throw new Error(`run code differs from HEAD ${code.commit}`);
const git = (args) => execFileSync("git", args, { cwd: here, encoding: "utf8" }).trim();
const bundleBlob = git(["hash-object", bundle]);
if (bundleBlob !== BUNDLE_BLOB) throw new Error(`bundle blob ${bundleBlob} is not ${BUNDLE_BLOB}`);
if (git(["rev-parse", `${PRODUCT_COMMIT}:bin/token-context-optimizer.mjs`]) !== BUNDLE_BLOB) throw new Error("bundle differs at the product commit");

// ---------------------------------------------------------------- inputs and the run's caller assignment
const input = loadSelectorInput(frozen, { allowUncommitted: nonMeasurement });
const callerBytes = readFileSync(join(run, "caller.jsonl"));
const callerEvidence = JSON.parse(readFileSync(join(run, "caller-evidence.json"), "utf8"));
if (sha256(callerBytes) !== callerEvidence.files["caller.jsonl"]) throw new Error("caller.jsonl changed after its hash was fixed");
if (callerEvidence.freezeManifestSha256 !== input.manifestSha) throw new Error("caller assignment was made from another freeze manifest");
const callers = callerBytes.toString("utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
if (callers.map((c) => c.id).join() !== input.images.map((im) => im.id).join()) throw new Error("caller ids differ from the selector input order");
const caller = new Map(callers.map((c) => [c.id, c]));
const inputCheck = {
  product: PRODUCT_COMMIT, bundleBlob, selectorBlob: SELECTOR_BLOB, freezeManifestSha256: input.manifestSha, callerSha256: callerEvidence.files["caller.jsonl"],
  ...input.check, intents: { matched: 0, unmatched: 0, caller_error: 0 }, images: {},
};
for (const im of input.images) {
  const c = caller.get(im.id);
  const r = padRequest(c, im.page, 0); // throws on an illegal band or a band without match
  inputCheck.intents[r.intent]++;
  inputCheck.images[im.id] = { sha256: im.sha256, width: im.page.width, height: im.page.height, ihdr: "bd8 ct0 il0", intent: r.intent };
}

// ---------------------------------------------------------------- conditions
const started = Date.now();
const rows = [];
const condLines = [];
const timing = [];
const guardOptions = process.env.NODE_OPTIONS ?? "";
for (const p of PADDINGS) {
  const t0 = Date.now();
  const root = mkdtempSync(join(tmpBase, "fcp-root-"));
  try {
    if (readdirSync(root).length) throw new Error("allowed root not empty");
    for (const im of input.images) copyFileSync(im.path, join(root, im.file));
    const env = { ...minimalEnv(), TCO_ALLOWED_ROOTS: root };
    if (guardOptions) env.NODE_OPTIONS = guardOptions;
    if (process.env.D03_NET_LOG) env.D03_NET_LOG = process.env.D03_NET_LOG;
    if (process.env.D03_STEP !== undefined) env.D03_STEP = `${process.env.D03_STEP}:p${p}`;
    const client = await startServer({ command: process.execPath, args: [bundle], env });
    const tools = client.initOk ? await client.listTools() : null;
    for (const im of input.images) {
      const c = caller.get(im.id);
      const base = { key: keyOf(p, im.id), p, id: im.id, pairId: im.pairId, lang: im.lang, anchor: im.anchor, doctype: im.doctype, layout: im.layout, variant: im.variant, band: c.band ?? null, page: im.page };
      const row = client.initOk
        ? await runCropRow({ client, p, image: { id: im.id, file: join(root, im.file), page: im.page, expectedSha: im.sha256 }, caller: c, allowedRoot: root })
        : initFailedRow({ caller: c, page: im.page, p });
      rows.push({ ...base, ...row });
    }
    const counts = client.counts();
    const exit = await client.close();
    condLines.push({ p, initialize: client.initOk ? "ok" : "failed", serverInfo: client.serverInfo, toolsList: tools, mcpRequests: counts.requests, mcpResponses: counts.responses, notifications: counts.notifications, initializeRequests: counts.initialize, toolsListRequests: counts.toolsList, toolCalls: counts.toolCalls, exit: { code: exit.code, signal: exit.signal }, stderrBytes: exit.stderrBytes, stderrSha256: exit.stderrSha256 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  timing.push({ p, ms: Date.now() - t0 });
  console.log(`p${p}: ${rows.filter((r) => r.p === p && r.outcome === "ok").length}/${input.images.length} ok`);
}
const keys = rows.map((r) => r.key);
const want = PADDINGS.length * IMAGE_COUNT;
if (keys.length !== want || new Set(keys).size !== want) throw new Error(`expected ${want} distinct keys, got ${keys.length}`);

writeFileSync(join(run, "raw.jsonl"), `${rows.map((r) => JSON.stringify(r)).join("\n")}\n`);
writeFileSync(join(run, "conditions.jsonl"), `${condLines.map((c) => JSON.stringify(c)).join("\n")}\n`);
writeFileSync(join(run, "input-check.json"), `${JSON.stringify(inputCheck, null, 1)}\n`);
writeFileSync(join(run, "run-meta.json"), `${JSON.stringify({
  node: process.version, platform: `${process.platform}-${process.arch}`, sharp: sharp.versions.sharp, vips: sharp.versions.vips,
  codeCommit: code.commit, codeCheckedBeforeMeasurement: { clean: code.clean, files: code.files },
  bundleBlob, bundleWorkingCopySha256: sha256(readFileSync(bundle)), bundleWorkingCopyBytes: statSync(bundle).size,
  freezeManifest: { sha256: input.manifestSha, blob: input.manifestBlob, committed: input.manifestCommitted },
  offlineGuard: /node-netguard\.cjs/.test(guardOptions), nonMeasurement, startedAt: new Date(started).toISOString(), totalMs: Date.now() - started, timing,
}, null, 1)}\n`);
