import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const [compiledRoot, pngPath, mode] = process.argv.slice(2);
if (!compiledRoot || !pngPath) throw new Error("usage: measure-png-tolerant-child.mjs <compiled-root> <png>");
const require = createRequire(import.meta.url);
const api = require(resolve(compiledRoot, "core", "image-artifacts.js"));
const bytes = readFileSync(pngPath);
const store = new api.MemoryImageArtifactStore();
const started = mode === "--prepare-only" ? null : process.hrtime.bigint();
const record = await api.indexImageArtifact({ path: pngPath, allowedRoots: [resolve(pngPath, "..")], store, profile: "tolerant" });
const elapsedNs = started === null ? undefined : Number(process.hrtime.bigint() - started);
const ignoredChunkTypes = [...new Set((record.ignoredChunks ?? []).map((chunk) => typeof chunk === "string" ? chunk : chunk.type).filter(Boolean))];
const result = { type: "tolerant-index-child", bytes: bytes.length, validationProfile: record.validationProfile, record: { width: record.width, height: record.height, alpha: record.alpha, ignoredChunks: record.ignoredChunks?.length ?? 0, ignoredChunkTypeCount: ignoredChunkTypes.length }, sha256: createHash("sha256").update(bytes).digest("hex") };
if (mode !== "--prepare-only") Object.assign(result, { elapsedNs, rssBytes: process.memoryUsage().rss, maxRssBytes: process.resourceUsage().maxRSS * 1024, rssUnits: "bytes", maxRssSourceUnits: "KiB" });
process.stdout.write(`${JSON.stringify(result)}\n`);
