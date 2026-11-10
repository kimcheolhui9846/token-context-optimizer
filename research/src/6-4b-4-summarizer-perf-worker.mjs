import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , snapshotArg, fixtureArg] = process.argv;
if (!snapshotArg || !fixtureArg) throw new Error('usage: worker.mjs <snapshotRoot> <fixtureRoot>');
const snapshotRoot = resolve(snapshotArg);
const fixtureRoot = resolve(fixtureArg);
const inside = (child, parent) => { const r = relative(parent, child); return r === '' || (!isAbsolute(r) && r !== '..' && !r.startsWith(`..${sep}`)); };
const snapshotModule = file => { const path = resolve(snapshotRoot, file); if (!inside(path, snapshotRoot)) throw new Error(`snapshot path escapes root: ${path}`); return pathToFileURL(path).href; };
const [artifacts, policy, estimator] = await Promise.all([
  import(snapshotModule('dist/src/core/artifacts.js')),
  import(snapshotModule('dist/src/core/policy.js')),
  import(snapshotModule('dist/src/core/token-estimator.js')),
]);
const store = new artifacts.MemoryArtifactStore();
const indexed = new Map();
const sha256 = value => createHash('sha256').update(value).digest('hex');
function fixturePath(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('invalid fixture name');
  const path = resolve(fixtureRoot, name); if (!inside(path, fixtureRoot)) throw new Error(`fixture path escapes root: ${path}`); return path;
}
function normalizeSourceMap(sourceMap) {
  if (!sourceMap) return null;
  return { ...sourceMap, path: relative(fixtureRoot, resolve(sourceMap.path)).replaceAll('\\', '/') };
}
async function indexFixture(name) {
  if (!indexed.has(name)) {
    const artifact = await artifacts.indexArtifact({ path: fixturePath(name), store, allowedRoots: [fixtureRoot] });
    indexed.set(name, artifact);
  }
  return indexed.get(name);
}
function expectedWarnings(artifact, summary) {
  if (summary.fallbackReason !== null || !summary.sourceMap) return [];
  const omitted = artifact.sourceMap.slice(summary.sourceMap.endLine);
  return omitted.some(line => /\S/u.test(line.text)) ? ['summary_truncated'] : [];
}
async function handle(request) {
  if (typeof request?.id !== 'string' || !request.id) throw new Error('request id is required');
  if (request.op === 'index') {
    const started = performance.now(); const artifact = await indexFixture(request.name);
    return { id: request.id, type: 'index-ready', indexMs: performance.now() - started, inputSha256: artifact.sha256, indexLines: artifact.lineCount, classificationMode: policy.classifyContext(artifact.content).mode };
  }
  const artifact = await indexFixture(request.name);
  if (request.op === 'classify') {
    const started = performance.now(); const classification = policy.classifyContext(artifact.content);
    const elapsedMs = performance.now() - started;
    return { id: request.id, type: 'result', op: 'classify', elapsedMs, mode: classification.mode };
  }
  if (request.op !== 'summary') throw new Error(`unknown operation: ${request.op}`);
  if (!Number.isInteger(request.budget) || request.budget < 0) throw new Error('budget must be a non-negative integer');
  const started = performance.now();
  const summary = artifacts.summarizeArtifact({ artifactId: artifact.artifactId, maxTokens: request.budget, store });
  const elapsedMs = performance.now() - started;
  const selectedLineCount = summary.sourceMap ? summary.sourceMap.endLine - summary.sourceMap.startLine + 1 : 0;
  return { id: request.id, type: 'result', op: 'summary', elapsedMs,
    summarySha256: sha256(summary.summary), sourceMap: normalizeSourceMap(summary.sourceMap), estimatedTokens: summary.estimatedTokens,
    fallbackReason: summary.fallbackReason, warnings: summary.warnings, expectedWarnings: expectedWarnings(artifact, summary),
    selectedLineCount, inputLines: artifact.lineCount, inputSha256: artifact.sha256,
  };
}
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
send({ type: 'ready', node: process.version });
let buffer = ''; let queue = Promise.resolve();
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk; const lines = buffer.split(/\r?\n/); buffer = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    let request; try { request = JSON.parse(line); } catch (error) { send({ type: 'error', message: `invalid JSON: ${error.message}` }); continue; }
    queue = queue.then(async () => { try { send(await handle(request)); } catch (error) { send({ id: request?.id ?? null, type: 'error', message: error?.message || String(error) }); } });
  }
});
