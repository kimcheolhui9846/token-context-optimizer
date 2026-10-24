import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, release as osRelease, tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_NODE = "v22.23.2";
const EXPECTED_SHARP = "0.35.4";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ACCOUNTING = 134217728;
const MAX_PIXELS = 16777216;
const MAX_AXIS = 8192;
const CHILD_TIMEOUT_MS = 30_000;
const SAMPLE_COUNT = 5;
const SEED = 0x1a2b3c4d;
const QUALITY = 100;
const SHARP = "4:4:4";
const SCRATCH_PREFIX = "wbs65-jpeg-";

const root = process.cwd();
const scratchParent = resolve(tmpdir());
const node22 = resolve(root, process.argv[2] ?? ".artifacts/node22/node-v22.23.2-win-x64/node.exe");
const sharpModule = resolve(root, process.argv[3] ?? ".artifacts/task22-fixture-encoder/node_modules/sharp/dist/index.mjs");
const validator = resolve(root, process.argv[4] ?? "dist/src/core/jpeg-validation.js");
const outputDir = resolve(root, "docs/research/evidence/task-22");

if (process.version !== EXPECTED_NODE) {
  throw new Error(`WBS65 requires ${EXPECTED_NODE}; parent is ${process.version}`);
}
if (resolve(process.execPath) !== node22) {
  throw new Error(`WBS65 must run with ${node22}; parent is ${process.execPath}`);
}

const { default: sharp } = await import(pathToFileURL(sharpModule).href);
const sharpVersion = sharp?.versions?.sharp;
if (sharpVersion !== EXPECTED_SHARP) {
  throw new Error(`WBS65 requires sharp ${EXPECTED_SHARP}; found ${sharpVersion ?? "unknown"}`);
}

const jfif = Buffer.from([
  0xff, 0xe0, 0x00, 0x10,
  0x4a, 0x46, 0x49, 0x46, 0x00,
  0x01, 0x02, 0x00,
  0x00, 0x01, 0x00, 0x01,
  0x00, 0x00,
]);

const scratch = await mkdtemp(join(scratchParent, SCRATCH_PREFIX));
assertSafeScratchDirectory(scratch);
const history = [];
const cache = new Map();

try {
  const childPath = join(scratch, "validate-child.mjs");
  await writeFile(childPath, childSource(pathToFileURL(validator).href), "utf8");

  const evaluate = async (dimension, phase) => {
    if (!Number.isInteger(dimension) || dimension < 1 || dimension > MAX_AXIS) {
      throw new Error(`invalid probe dimension ${dimension}`);
    }
    let result = cache.get(dimension);
    if (!result) {
      result = await measureDimension(dimension, childPath);
      cache.set(dimension, result);
    }
    const entry = { phase, ...summarize(result) };
    history.push(entry);
    return entry;
  };

  const first = await evaluate(1, "binary-search");
  assert(first.accepted, "dimension 1 must be accepted");

  let low = 1;
  const accountingOnlyUpperBound = Math.floor(Math.sqrt(MAX_ACCOUNTING / 21));
  let high = Math.min(Math.floor(Math.sqrt(MAX_PIXELS)), MAX_AXIS, accountingOnlyUpperBound + 1);
  while (high - low > 1) {
    const midpoint = Math.floor((low + high) / 2);
    const result = await evaluate(midpoint, "binary-search");
    if (result.accepted) low = midpoint;
    else high = midpoint;
  }

  const localStart = Math.max(1, low - 8);
  const localEnd = Math.min(MAX_AXIS, low + 8);
  for (let dimension = localStart; dimension <= localEnd; dimension += 1) {
    await evaluate(dimension, "local-boundary-probe");
  }

  const acceptedAfterLocalProbes = [...cache.values()].filter((entry) => entry.accepted);
  assert(acceptedAfterLocalProbes.length > 0, "no accepted candidate was found");
  const currentLargest = Math.max(...acceptedAfterLocalProbes.map((entry) => entry.dimension));
  const exhaustiveTailStart = currentLargest + 1;
  let exhaustiveTailProbes = 0;
  for (let dimension = exhaustiveTailStart; dimension <= accountingOnlyUpperBound; dimension += 1) {
    await evaluate(dimension, "exhaustive-tail");
    exhaustiveTailProbes += 1;
    if (exhaustiveTailProbes % 64 === 0 || dimension === accountingOnlyUpperBound) {
      console.error(`[wbs65] exhaustive tail ${exhaustiveTailProbes} probes; through dimension ${dimension}`);
    }
  }

  const accepted = [...cache.values()].filter((entry) => entry.accepted);
  assert(accepted.length > 0, "no accepted candidate was found");
  const selected = accepted.reduce((best, entry) => entry.dimension > best.dimension ? entry : best);
  const rejectedNeighbor = await evaluate(selected.dimension + 1, "rejected-neighbor");
  assert(!rejectedNeighbor.accepted, "selected max candidate must have a rejected neighbor");

  const samples = [];
  const finalFixture = await writeFixture(selected.dimension);
  try {
    for (let sample = 1; sample <= SAMPLE_COUNT; sample += 1) {
      const measured = await runValidator(childPath, finalFixture.filePath);
      assert(measured.node === EXPECTED_NODE, `sample ${sample} Node version mismatch`);
      assert(measured.status === "accepted", `sample ${sample} validator rejection`);
      samples.push({ sample, ...measured });
    }
  } finally {
    await rm(finalFixture.filePath, { force: true });
  }
  assert(samples.length === SAMPLE_COUNT, "exactly five samples are required");
  assert(new Set(samples.map((sample) => sample.sha256)).size === 1, "sample SHA-256 values differ");
  assert(samples.every((sample) => sample.sha256 === selected.sha256), "final sample SHA-256 differs from selected search fixture");
  assert(samples.every((sample) => sample.byteLength === selected.byteLength), "sample byte lengths differ");

  const generatedAt = new Date().toISOString();
  await mkdir(outputDir, { recursive: true });
  const filename = `wbs65-jpeg-measure-${generatedAt.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}.json`;
  const result = {
    schemaVersion: 1,
    generatedAt,
    task: "WBS 6.5 seeded high-entropy JPEG boundary measurement",
    command: [relativeCommandPath(node22), relativeCommandPath(process.argv[1]), ...process.argv.slice(2).map(relativeCommandPath)].join(" "),
    environment: {
      node: process.version,
      nodeExecutable: node22,
      sharp: sharpVersion,
      vips: sharp?.versions?.vips ?? "unknown",
      cpuModel: cpus()[0]?.model ?? "unknown",
      osRelease: osRelease(),
      sharpModule,
      platform: process.platform,
      arch: process.arch,
    },
    provenance: {
      nodeExecutableSha256: await sha256File(node22),
      sharpModuleSha256: await sha256File(sharpModule),
      compiledValidatorSha256: await sha256File(validator),
      validatorSourceSha256: await sha256File(join(root, "src/core/jpeg-validation.ts")),
      packageLockSha256: await sha256File(join(root, "package-lock.json")),
      measurementScriptSha256: await sha256File(join(root, "scripts/measure-jpeg-wbs65.mjs")),
    },
    fixture: {
      input: "seeded RGB square",
      seed: `0x${SEED.toString(16)}`,
      lcg: "state = (Math.imul(state, 1664525) + 1013904223) >>> 0; byte = state >>> 24",
      channels: 3,
      quality: QUALITY,
      chromaSubsampling: SHARP,
      jfifHex: jfif.toString("hex"),
      jfifDescription: "exact APP0 JFIF 1.02 fixture inserted immediately after SOI",
    },
    constraints: {
      encodedBytesMax: MAX_BYTES,
      accountingMax: MAX_ACCOUNTING,
      maxAxis: MAX_AXIS,
      maxPixels: MAX_PIXELS,
      childTimeoutMs: CHILD_TIMEOUT_MS,
      validatorNote: "validateJpeg acceptance is separate from the upstream encoded-byte MAX_BYTES gate",
    },
    search: {
      algorithm: "binary search, +/-8 local probes, then exhaustive sequential tail through the accounting-only upper bound",
      binarySearchCandidate: low,
      accountingOnlyUpperBound,
      accountingOnlyUpperBoundProof: "accounting >= 960*d^2/64 + 6*d^2 = 21*d^2, so d > floor(sqrt(134217728/21)) cannot fit the accounting limit; table cost and ceil-block effects only lower the practical bound.",
      selectedMaxAccepted: summarize(selected),
      rejectedNeighbor: summarize(rejectedNeighbor),
      history,
      fullTailVerification: {
        startDimension: exhaustiveTailStart,
        endDimension: accountingOnlyUpperBound,
        probes: exhaustiveTailProbes,
        complete: exhaustiveTailProbes === Math.max(0, accountingOnlyUpperBound - exhaustiveTailStart + 1),
      },
      monotonicityLimitation: "Binary search is only a starting heuristic; exhaustive tail verification establishes the finite seeded square-family maximum without assuming byte monotonicity.",
      finiteFamilyMaxStatement: "selectedMaxAccepted is the largest accepted dimension in the searched seeded square family from 1 through the accounting-only upper bound, subject to the recorded validator and encoded-size constraints.",
      cpuScopeLimitation: "This square-family measurement does not establish an all-JPEG CPU maximum.",
    },
    samples: {
      count: samples.length,
      scope: "fresh sequential child processes; wallMs measures validateJpeg only",
      selectedDimension: selected.dimension,
      all: samples,
      medians: {
        wallMs: median(samples.map((sample) => sample.wallMs)),
        rssBefore: median(samples.map((sample) => sample.rssBefore)),
        rssAfter: median(samples.map((sample) => sample.rssAfter)),
        maxRSSKiB: median(samples.map((sample) => sample.maxRSS)),
        maxObservedSampleMaxRSSKiB: Math.max(...samples.map((sample) => sample.maxRSS)),
      },
      caveat: "These are host observations, not a portable maximum CPU or memory bound.",
    },
  };
  await writeFile(join(outputDir, filename), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ output: join(outputDir, filename), selectedDimension: selected.dimension }));
} finally {
  await rm(scratch, { recursive: true, force: true });
}

async function measureDimension(dimension, childPath) {
  const fixture = await writeFixture(dimension);
  const { bytes, filePath } = fixture;
  try {
    const tables = tableCost(bytes);
    const accounting = 960 * Math.ceil(dimension / 8) ** 2 + 6 * dimension * dimension + tables.tableCost;
    const encodedWithinLimit = bytes.length <= MAX_BYTES;
    const accountingWithinLimit = accounting <= MAX_ACCOUNTING;
    let validation;
    if (encodedWithinLimit) {
      validation = await runValidator(childPath, filePath);
      if (validation.status === "rejected" && validation.error !== "jpeg_resource_limit") {
        throw new Error(`unexpected validator rejection at dimension ${dimension}: ${validation.error ?? "unknown"}`);
      }
    } else {
      validation = {
        status: "not_run_encoded_size_limit",
        reason: "encoded bytes exceed upstream MAX_BYTES; never passed to validateJpeg",
      };
    }
    const validatorAccepted = validation.status === "accepted";
    return {
      dimension,
      width: dimension,
      height: dimension,
      byteLength: bytes.length,
      sha256: await sha256(bytes),
      ...tables,
      accounting,
      encodedWithinLimit,
      accountingWithinLimit,
      validator: validation,
      validatorAcceptance: validatorAccepted ? "accepted" : validation.status,
      accepted: encodedWithinLimit && accountingWithinLimit && validatorAccepted,
    };
  } finally {
    await rm(filePath, { force: true });
  }
}

async function writeFixture(dimension) {
  const raw = seededRgb(dimension);
  const encoded = await sharp(raw, { raw: { width: dimension, height: dimension, channels: 3 } })
    .jpeg({ quality: QUALITY, chromaSubsampling: SHARP, force: true })
    .toBuffer();
  const bytes = Buffer.concat([encoded.subarray(0, 2), jfif, encoded.subarray(2)]);
  const filePath = join(scratch, "candidate.jpg");
  await writeFile(filePath, bytes);
  return { bytes, filePath };
}

function seededRgb(dimension) {
  const raw = Buffer.alloc(dimension * dimension * 3);
  let state = SEED;
  for (let index = 0; index < raw.length; index += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    raw[index] = state >>> 24;
  }
  return raw;
}

function childSource(validatorUrl) {
  return `
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { validateJpeg } from ${JSON.stringify(validatorUrl)};

if (process.version !== ${JSON.stringify(EXPECTED_NODE)}) throw new Error("child Node version mismatch");
const bytes = await readFile(process.argv[2]);
const rssBefore = process.memoryUsage().rss;
const start = performance.now();
let metadata = null;
let status = "accepted";
let error = null;
try { metadata = validateJpeg(bytes); } catch (caught) {
  status = "rejected";
  error = caught?.code ?? caught?.message ?? String(caught);
}
const wallMs = performance.now() - start;
console.log(JSON.stringify({
  node: process.version,
  status,
  error,
  metadata,
  byteLength: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  wallMs: Number(wallMs.toFixed(2)),
  wallMsScope: "validateJpeg only; excludes SHA-256 calculation",
  rssBefore,
  rssAfter: process.memoryUsage().rss,
  maxRSS: process.resourceUsage().maxRSS,
}));
`;
}

function runValidator(childPath, filePath) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(node22, [childPath, filePath], {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timedOut = false;
    let childError = null;
    const timer = setTimeout(() => {
      if (settled) return;
      timedOut = true;
      settled = true;
      child.kill();
    }, CHILD_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      childError = error;
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        rejectResult(new Error(`validator child timed out after ${CHILD_TIMEOUT_MS}ms`));
        return;
      }
      if (settled) return;
      settled = true;
      if (childError) {
        rejectResult(childError);
        return;
      }
      if (code !== 0 || signal) {
        rejectResult(new Error(`validator child failed code=${code} signal=${signal ?? "none"} stderr=${stderr.trim()}`));
        return;
      }
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length !== 1) {
        rejectResult(new Error(`validator child produced ${lines.length} JSON lines`));
        return;
      }
      try {
        const parsed = JSON.parse(lines[0]);
        if (
          parsed.node !== EXPECTED_NODE
          || !["accepted", "rejected"].includes(parsed.status)
          || !Number.isFinite(parsed.wallMs)
          || !Number.isFinite(parsed.byteLength)
          || !Number.isFinite(parsed.rssBefore)
          || !Number.isFinite(parsed.rssAfter)
          || !Number.isFinite(parsed.maxRSS)
          || !/^[0-9a-f]{64}$/.test(parsed.sha256)
        ) {
          throw new Error("invalid child result or version");
        }
        resolveResult(parsed);
      } catch (error) {
        rejectResult(new Error(`invalid validator child output: ${error.message}`));
      }
    });
  });
}

function tableCost(bytes) {
  let offset = 2;
  let quantizationTables = 0;
  let huffmanCost = 0;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) throw new Error("truncated JPEG marker");
    const length = bytes.readUInt16BE(offset);
    const end = offset + length;
    if (end > bytes.length || length < 2) throw new Error("invalid JPEG segment length");
    if (marker === 0xdb) {
      let cursor = offset + 2;
      while (cursor < end) {
        const info = bytes[cursor++];
        cursor += (info >> 4) === 0 ? 64 : 128;
        quantizationTables += 1;
      }
    }
    if (marker === 0xc4) {
      let cursor = offset + 2;
      while (cursor < end) {
        cursor += 1;
        const counts = bytes.subarray(cursor, cursor + 16);
        cursor += 16;
        const symbols = counts.reduce((sum, value) => sum + value, 0);
        huffmanCost += 16 + symbols;
        cursor += symbols;
      }
    }
    offset = end;
  }
  return { quantizationTables, huffmanCost, tableCost: quantizationTables * 256 + huffmanCost };
}

function summarize(entry) {
  const { filePath, ...summary } = entry;
  return summary;
}

function relativeCommandPath(value) {
  const path = resolve(root, value);
  const candidate = relative(root, path).replaceAll("\\", "/");
  return candidate.startsWith(".") ? candidate : `./${candidate}`;
}

function assertSafeScratchDirectory(scratchPath) {
  const resolvedScratch = resolve(scratchPath);
  const relativeScratch = relative(scratchParent, resolvedScratch);
  assert(
    relativeScratch.length > 0
      && !relativeScratch.startsWith("..")
      && !relativeScratch.includes("/")
      && !relativeScratch.includes("\\")
      && relativeScratch.startsWith(SCRATCH_PREFIX),
    `unsafe scratch cleanup target: ${resolvedScratch}`,
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(filePath) {
  return sha256(await readFile(filePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(`WBS65 assertion failed: ${message}`);
}
