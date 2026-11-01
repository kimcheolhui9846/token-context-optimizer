import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const [relativeInput, expectedSha256, expectedStatus] = process.argv.slice(2);
const root = process.cwd();
const inputRoot = resolve(root, ".artifacts/jpeg-tolerant-impl/measurement/attempt2-scancap");
const inputPath = resolve(root, relativeInput ?? "");
if (!relativeInput || !expectedSha256 || !["accepted", "jpeg_resource_limit"].includes(expectedStatus) ||
    !inputPath.startsWith(inputRoot + sep)) {
  throw new Error("invalid child invocation");
}
const bytes = readFileSync(inputPath);
const actualSha256 = createHash("sha256").update(bytes).digest("hex");
if (actualSha256 !== expectedSha256) throw new Error("input hash mismatch");
const api = await import(pathToFileURL(resolve(root, "dist/src/core/image-artifacts.js")).href);
const store = new api.MemoryImageArtifactStore();
const index = () => api.indexImageArtifact({ path: inputPath, allowedRoots: [inputRoot], profile: "tolerant", store });
const capture = async () => {
  try {
    const record = await index();
    return { status: "accepted", code: null, width: record.width, height: record.height,
      coding: record.coding, sampling: record.sampling, validationProfile: record.validationProfile };
  } catch (error) {
    return { status: "rejected", code: typeof error?.code === "string" ? error.code : "unexpected_error",
      width: null, height: null, coding: null, sampling: null, validationProfile: null };
  }
};
const expectedOutcome = (result) => expectedStatus === "accepted"
  ? result.status === "accepted" && result.validationProfile === "jpeg-ycbcr8-tolerant-v1"
  : result.status === "rejected" && result.code === expectedStatus;

if (typeof process.send !== "function") throw new Error("IPC is required");
process.send({ kind: "ready", pid: process.pid });
process.on("message", async (message) => {
  if (message?.kind !== "start") return;
  try {
    for (let i = 0; i < 3; i += 1) {
      const warmup = await capture();
      if (!expectedOutcome(warmup)) throw new Error("unexpected warmup outcome");
    }
    const rows = [];
    for (let sample = 0; sample < 9; sample += 1) {
      const startedAtMs = Date.now();
      const startedNs = process.hrtime.bigint();
      const result = await capture();
      const elapsedNs = Number(process.hrtime.bigint() - startedNs);
      const endedAtMs = Date.now();
      rows.push({ sample, startedAtMs, endedAtMs, elapsedNs,
        rssAfterBytes: process.memoryUsage().rss, ...result });
      if (!expectedOutcome(result)) throw new Error("unexpected measured outcome");
    }
    process.send({ kind: "complete", rows, byteLength: bytes.length, sha256: actualSha256 },
      () => process.disconnect());
  } catch {
    process.send({ kind: "error", code: "unexpected_tolerant_outcome" }, () => process.disconnect());
  }
});
