// 6.4b-6 (N-33) public indexArtifact reproduction. Plan PR evidence only; no product change.
// Each case runs in its own hidden child, sequentially, with default heap/stack flags,
// a fresh MemoryArtifactStore and a private mkdtemp folder that the child removes itself.
// Usage: node research/src/6-4b-6-source-map-repro.mjs --output=research/results/<new>.json [--repeats=3]
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { arch, cpus, release, tmpdir, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SELF = 'research/src/6-4b-6-source-map-repro.mjs';
const DIST = 'dist/src/core/artifacts.js';
const LIMIT = 10 * 1024 * 1024; // indexArtifact default maxBytes
const EMOJI = String.fromCodePoint(0x1f600); // 4 UTF-8 bytes, 2 UTF-16 units

// name, builder, expectation written down before running (mathematical, not taken from BASE output)
const CASES = {
  ascii10MiB: { build: () => 'a'.repeat(LIMIT), role: 'control' },
  asciiEmoji10MiB: { build: () => 'a'.repeat(LIMIT - 4) + EMOJI, role: 'red' },
  asciiEmoji1MiB: { build: () => 'a'.repeat(1024 * 1024 - 4) + EMOJI, role: 'control' },
};

const sha = value => createHash('sha256').update(value).digest('hex');
const arg = (name, fallback) => {
  const hit = process.argv.find(value => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function expected(content) {
  const bytes = Buffer.byteLength(content, 'utf8');
  // single line, no newline anywhere: one SourceLine covering all bytes, empty delimiter
  return { lineCount: 1, line: 1, startByte: 0, endByte: bytes, textUtf16Length: content.length, delimiter: '', byteLength: bytes };
}

async function childMain(name) {
  const { indexArtifact, MemoryArtifactStore } = await import(new URL(`../../${DIST}`, import.meta.url));
  const content = CASES[name].build();
  const bytes = Buffer.from(content, 'utf8');
  const exp = expected(content);
  const dir = mkdtempSync(join(tmpdir(), 'n33-repro-'));
  const file = join(dir, `${name}.txt`);
  const out = { name, role: CASES[name].role, fixtureBytes: bytes.length, fixtureSha256: sha(bytes), utf16Length: content.length, withinLimit: bytes.length <= LIMIT, expected: exp };
  try {
    writeFileSync(file, bytes, { flag: 'wx' });
    const store = new MemoryArtifactStore();
    const started = process.hrtime.bigint();
    try {
      const record = await indexArtifact({ path: file, store, allowedRoots: [dir] });
      const first = record.sourceMap[0];
      out.result = 'success';
      out.elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      out.actual = { lineCount: record.lineCount, byteLength: record.byteLength, line: first?.line, startByte: first?.startByte, endByte: first?.endByte, textUtf16Length: first?.text.length, textEqualsContent: first?.text === content, delimiter: first?.delimiter, stored: store.get(record.artifactId) === record };
      out.matchesExpected = out.actual.lineCount === exp.lineCount && out.actual.byteLength === exp.byteLength && out.actual.line === 1 && out.actual.startByte === 0 && out.actual.endByte === exp.endByte && out.actual.textEqualsContent && out.actual.delimiter === '' && out.actual.stored;
    } catch (error) {
      out.result = 'error';
      out.elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
      out.error = { name: error?.name, message: error?.message, frames: String(error?.stack ?? '').split('\n').slice(1, 6).map(line => line.trim().replace(/\(.*[\\/](dist[\\/].*)\)$/u, '($1)')) };
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
    out.tempRemoved = !existsSync(dir);
  }
  process.stdout.write(JSON.stringify(out));
}

function runChild(name) {
  return new Promise(done => {
    const child = spawn(process.execPath, [join(ROOT, SELF), `--child=${name}`], { cwd: ROOT, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill(), 120000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      let parsed = null;
      try { parsed = JSON.parse(stdout); } catch { /* reported below */ }
      done({ exitCode: code, signal, parsed, stderrTail: stderr.slice(-400) });
    });
  });
}

async function main() {
  const output = arg('output');
  if (!output) throw new Error('--output=<new file> is required');
  const outPath = resolve(ROOT, output);
  if (existsSync(outPath)) throw new Error(`refusing to overwrite ${output}`);
  const repeats = Number(arg('repeats', '3'));
  const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true }).trim();
  const env = {
    node: process.version, v8: process.versions.v8, platform: process.platform, osRelease: release(), arch: arch(),
    cpu: cpus()[0]?.model, cpuCount: cpus().length, totalMemBytes: totalmem(), childFlags: [], stackSizeFlag: 'default',
    head: git(['rev-parse', 'HEAD']), artifactsTsBlob: git(['rev-parse', 'HEAD:src/core/artifacts.ts']),
    scriptBlob: git(['hash-object', SELF]), distArtifactsSha256WorkingCopy: sha(readFileSync(join(ROOT, DIST))),
    srcStatus: git(['status', '--short', '--', 'src', 'bin']),
  };
  const runs = [];
  for (let repeat = 1; repeat <= repeats; repeat += 1) {
    for (const name of Object.keys(CASES)) runs.push({ repeat, ...(await runChild(name)) });
  }
  const summary = Object.fromEntries(Object.keys(CASES).map(name => {
    const mine = runs.filter(run => run.parsed?.name === name);
    return [name, { role: CASES[name].role, runs: mine.length, success: mine.filter(run => run.parsed.result === 'success').length, matchesExpected: mine.filter(run => run.parsed.matchesExpected).length, errors: [...new Set(mine.filter(run => run.parsed.result === 'error').map(run => `${run.parsed.error.name}: ${run.parsed.error.message}`))], allTempRemoved: mine.every(run => run.parsed.tempRemoved) }];
  }));
  const report = { task: '6.4b-6 N-33 plan reproduction (public indexArtifact)', generatedAt: new Date().toISOString(), env, limitBytes: LIMIT, repeats, summary, runs, termination: 'fixed repeats; no retry on error; children sequential' };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

const childName = arg('child');
if (childName) await childMain(childName);
else await main();
